import assert from "node:assert/strict"
import test from "node:test"

import { fallback, primary, sessionStore, setupPlugin } from "./helpers/plugin.js"

test("terminal communication failures explain the threshold and how the parent can preserve the count", async (t) => {
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
  })
  const harness = await setupPlugin(t, { session })
  for (let count = 1; count <= 2; count += 1) {
    const retry = await harness.retry({ sessionID: "child", attempt: 2 })
    assert.deepEqual(retry.decision, { retry: false })
    const error = Object.assign(new Error("Subagent failed (sessionID: child): connection timed out"), {
      metadata: { trace: "preserved" },
    })
    const result = await harness.afterTool({ error })
    assert.equal(result.error, error)
    assert.deepEqual(error.metadata, { trace: "preserved" })
    assert.ok(error.message.startsWith("Subagent failed (sessionID: child): connection timed out"))
    assert.ok(error.message.includes(`Communication failure ${count}/3 on ${primary}`))
    assert.ok(error.message.includes(`${3 - count} more consecutive failure(s) before switching to ${fallback}`))
    assert.ok(error.message.includes('agent="spec" and sessionID="child"'))
    assert.ok(error.message.includes("preserve its failure count"))
    assert.ok(error.message.includes("no automatic retry is still running"))
  }
  const switched = await harness.retry({ sessionID: "child", attempt: 2 })
  assert.deepEqual(switched.decision, { retry: true, delay: 0 })
  const messages = harness.logs.mock.calls.map((call) => call.arguments[0])
  assert.equal(messages.length, 4)
  assert.ok(messages[0].includes("session=child agent=spec"))
  assert.ok(messages[0].includes("Communication failure 1/3"))
  assert.ok(messages[1].includes("Communication failure 2/3"))
  assert.ok(messages[2].includes("communication failure 3/3"))
  assert.ok(messages[3].includes(`Switched from ${primary} to ${fallback}; retrying immediately`))
})

test("automatic retries are logged and a later terminal tool result does not claim they are still running", async (t) => {
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
  })
  const harness = await setupPlugin(t, { session })
  await harness.retry({ sessionID: "child", decision: { retry: true, delay: 1000 } })
  assert.ok(harness.logs.mock.calls[0].arguments[0].includes("OpenCode will retry automatically"))
  const result = await harness.afterTool()
  assert.ok(result.error.message.includes("Last recorded fallback status"))
  assert.ok(result.error.message.includes("no automatic retry is still running"))
  assert.ok(!result.error.message.includes("Resume this child"))
})

test("context lookup and model switch failures explain why fallback did not progress", async (t) => {
  t.mock.method(console, "warn", () => {})
  const harness = await setupPlugin(t, {
    session: {
      get: async () => ({ model: primary, parentID: undefined }),
      context: async () => {
        throw new Error("context unavailable")
      },
      switchModel: t.mock.fn(async () => {
        throw new Error("switch unavailable")
      }),
    },
  })
  const uncounted = await harness.retry()
  assert.deepEqual(uncounted.decision, { retry: false })
  assert.ok(harness.logs.mock.calls[0].arguments[0].includes("not counted because context lookup failed; count remains 0/3"))
  const failed = await harness.retry({ error: { type: "provider.quota" } })
  assert.deepEqual(failed.decision, { retry: false })
  const latest = harness.logs.mock.calls.at(-1).arguments[0]
  assert.ok(latest.includes(`Switch to ${fallback} failed; model remains ${primary}`))
  assert.ok(latest.includes("retry decision is to stop"))
})

test("an exhausted chain explains the stop to the parent without requesting more launches", async (t) => {
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: fallback },
  })
  const harness = await setupPlugin(t, { model: fallback, session })
  await harness.retry({ sessionID: "child", error: { type: "provider.quota" } })
  const result = await harness.afterTool()
  assert.ok(result.error.message.includes("fallback chain exhausted, no further model is configured"))
  assert.ok(!result.error.message.includes("Resume this child"))
  assert.equal(harness.switchModel.mock.callCount(), 0)
})

test("progress messages start a new threshold interval after a failed communication switch", async (t) => {
  t.mock.method(console, "warn", () => {})
  const harness = await setupPlugin(t, {
    session: {
      switchModel: t.mock.fn(async () => {
        throw new Error("switch unavailable")
      }),
    },
  })
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await harness.retry({ attempt })
  }
  const latest = harness.logs.mock.calls.at(-1).arguments[0]
  assert.ok(latest.includes("Communication failure 1/3"))
  assert.ok(latest.includes("2 more consecutive failure(s)"))
})

test("diagnostics do not alter unrelated tool results or reuse a stale provider failure", async (t) => {
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
  })
  const harness = await setupPlugin(t, { session })
  await harness.retry({ sessionID: "child" })
  for (const overrides of [
    { tool: "shell" },
    { status: "completed" },
    { sessionID: "other-root" },
    { input: { agent: "other" } },
    { error: new Error("Subagent denied: spec") },
    { error: new Error("Subagent failed (sessionID: another-child): connection timed out") },
  ]) {
    const error = overrides.error ?? new Error("Subagent failed (sessionID: child): connection timed out")
    const original = error.message
    await harness.afterTool({ ...overrides, error })
    assert.equal(error.message, original)
  }
  await harness.retry({ sessionID: "child", error: { type: "provider.invalid-request" } })
  const result = await harness.afterTool()
  assert.equal(result.error.message, "Subagent failed (sessionID: child): connection timed out")
  await harness.retry({ sessionID: "child" })
  await harness.beforeTool({ agent: "spec", sessionID: "child" }, "root")
  const restarted = await harness.afterTool()
  assert.equal(restarted.error.message, "Subagent failed (sessionID: child): connection timed out")
})
