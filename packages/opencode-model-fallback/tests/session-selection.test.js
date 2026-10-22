import assert from "node:assert/strict"
import test from "node:test"

import { createModelFallbackPlugin } from "opencode-model-fallback"
import { fallback, primary, sessionStore, setupPlugin, target } from "./helpers/plugin.js"

test("a child quota failure retries on the fallback and new siblings inherit it only within that root", async (t) => {
  const storage = new Map()
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
    sibling: { parentID: "root", model: primary },
    otherRoot: { model: "openai/parent" },
  })
  const harness = await setupPlugin(t, { session, storage })
  const event = await harness.retry({ sessionID: "child", error: { type: "provider.quota" } })
  assert.deepEqual(event.decision, { retry: true, delay: 0 })
  assert.deepEqual(await session.get({ sessionID: "child" }), { parentID: "root", model: target })
  assert.deepEqual(await session.get({ sessionID: "root" }), { model: "openai/parent" })
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }, "root"), {
    agent: "spec",
    model: fallback,
  })
  // A sibling already created before the switch catches up to the remembered model.
  const sibling = await harness.retry({ sessionID: "sibling" })
  assert.deepEqual(sibling.decision, { retry: true, delay: 0 })
  assert.deepEqual(await session.get({ sessionID: "sibling" }), { parentID: "root", model: target })
  assert.equal(harness.context.mock.callCount(), 0)

  await harness.compact("child")
  const reloaded = await setupPlugin(t, { session, storage })
  assert.deepEqual(await reloaded.beforeTool({ agent: "spec" }, "root"), {
    agent: "spec",
    model: fallback,
  })
  assert.deepEqual(await reloaded.beforeTool({ agent: "spec" }, "otherRoot"), { agent: "spec" })
  assert.deepEqual(await reloaded.beforeTool({ agent: "other" }, "root"), { agent: "other" })
})

test("subagent inheritance respects explicit models, resumed children, and other tools", async (t) => {
  const harness = await setupPlugin(t)
  await harness.retry({ error: { type: "provider.quota" } })
  for (const input of [
    { agent: "spec", model: "xai/explicit" },
    { agent: "spec", sessionID: "existing-child" },
    { agent: "missing" },
  ]) {
    assert.deepEqual(await harness.beforeTool({ ...input }), input)
  }
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }, "s", "other-tool"), { agent: "spec" })
  for (const input of [null, undefined, "spec"]) {
    assert.equal(await harness.beforeTool(input), input)
  }
})

test("nested and concurrent children share a forward-only selection and stop at the end of the chain", async (t) => {
  const last = "xai/last-test"
  const plugin = createModelFallbackPlugin({
    threshold: 3,
    agents: { spec: { primary, fallbacks: [fallback, last] } },
  })
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
    nested: { parentID: "child", model: primary },
    late: { parentID: "root", model: primary },
  })
  const storage = new Map()
  const harness = await setupPlugin(t, { plugin, session, storage })
  const quota = { error: { type: "provider.quota" } }
  await Promise.all([
    harness.retry({ ...quota, sessionID: "child" }),
    harness.retry({ ...quota, sessionID: "nested" }),
  ])
  assert.deepEqual(await session.get({ sessionID: "child" }), { parentID: "root", model: target })
  assert.deepEqual(await session.get({ sessionID: "nested" }), { parentID: "child", model: target })
  await harness.retry({ ...quota, sessionID: "child", model: target })
  // An older child must catch up without rolling the shared model back to the first fallback.
  await harness.retry({ ...quota, sessionID: "late" })
  assert.deepEqual(await session.get({ sessionID: "late" }), {
    parentID: "root",
    model: { providerID: "xai", id: "last-test" },
  })
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }, "nested"), { agent: "spec", model: last })
  const exhausted = await harness.retry({ ...quota, sessionID: "late", model: last })
  assert.deepEqual(exhausted.decision, { retry: false })
  assert.equal(session.switchModel.mock.callCount(), 4)
  const reloaded = await setupPlugin(t, { plugin, session, storage })
  assert.deepEqual(await reloaded.beforeTool({ agent: "spec" }, "root"), { agent: "spec", model: last })
})

test("stale events neither retry nor remember a fallback", async (t) => {
  const harness = await setupPlugin(t)
  const event = await harness.retry({ model: fallback, error: { type: "provider.quota" } })
  assert.deepEqual(event.decision, { retry: false })
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }), { agent: "spec" })
})

test("concurrent failures in the same child switch only once and leave the stale retry unchanged", async (t) => {
  const session = sessionStore(t, {
    root: { model: "openai/parent" },
    child: { parentID: "root", model: primary },
  })
  const harness = await setupPlugin(t, { session })
  const events = await Promise.all([
    harness.retry({ sessionID: "child", error: { type: "provider.quota" } }),
    harness.retry({ sessionID: "child", error: { type: "provider.quota" } }),
  ])
  assert.equal(harness.switchModel.mock.callCount(), 1)
  assert.deepEqual(events.map((event) => event.decision), [
    { retry: true, delay: 0 },
    { retry: false },
  ])
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }, "root"), {
    agent: "spec",
    model: fallback,
  })
})

test("a storage failure retains the selection in memory and does not prevent the retry", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {})
  const harness = await setupPlugin(t, {
    storage: {
      get: async () => {
        throw new Error("storage unavailable")
      },
      set: async () => {
        throw new Error("storage unavailable")
      },
    },
  })
  const event = await harness.retry({ error: { type: "provider.quota" } })
  assert.deepEqual(event.decision, { retry: true, delay: 0 })
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }), { agent: "spec", model: fallback })
  assert.equal(warnings.mock.callCount(), 2)
})

test("a failed parent lookup still switches the failing child without leaking selection to another root", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {})
  const harness = await setupPlugin(t, {
    session: {
      get: async ({ sessionID }) => {
        if (sessionID === "missing-parent") throw new Error("parent unavailable")
        return { model: primary, parentID: sessionID === "child" ? "missing-parent" : undefined }
      },
    },
  })
  const event = await harness.retry({ sessionID: "child", error: { type: "provider.quota" } })
  assert.deepEqual(event.decision, { retry: true, delay: 0 })
  assert.equal(harness.switchModel.mock.callCount(), 1)
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }), { agent: "spec" })
  assert.equal(warnings.mock.callCount(), 1)
})
