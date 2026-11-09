import assert from "node:assert/strict"
import test from "node:test"

import { createModelFallbackPlugin } from "opencode-model-fallback"
import { config, fallback, primary, setupPlugin, target } from "./helpers/plugin.js"

test("quota errors switch immediately and retry without context lookup", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {})
  const primaries = [
    primary,
    "openai/primary-test#max",
    "opencode/primary-test#high",
    "opencode/primary-test",
  ]
  const errors = [
    { type: "provider.quota" },
    { type: "unknown", message: "personal-team-blocked:spending-limit: You have run out of credits." },
    { type: "provider.timeout", message: "Run out of credits" },
    { type: "provider.rate-limit", response: { body: '{"error":{"code":"insufficient_quota"}}' } },
    { type: "provider.auth", response: { body: '{"error":{"type":"CreditsError"}}' } },
    {
      type: "unknown",
      message: "Free usage limit reached. Subscribe to OpenCode Go to keep going: https://opencode.ai/go",
    },
  ]

  for (const model of primaries) {
    for (const error of errors) {
      const plugin = createModelFallbackPlugin({
        threshold: 3,
        agents: { spec: { primary: model, fallbacks: [fallback] } },
      })
      const harness = await setupPlugin(t, { plugin, model })
      const decision = Object.freeze({ retry: false })
      const event = await harness.retry({ error, decision })

      assert.deepEqual(
        harness.switchModel.mock.calls.map((call) => call.arguments),
        [[{ sessionID: "s", model: target }]],
        `${model}: ${JSON.stringify(error)}`,
      )
      assert.equal(harness.context.mock.callCount(), 0)
      assert.equal(warnings.mock.callCount(), 0)
      assert.deepEqual(decision, { retry: false })
      assert.deepEqual(event.decision, { retry: true, delay: 0 })
    }
  }
})

test("communication failures switch at the configured threshold", async (t) => {
  const harness = await setupPlugin(t)
  for (let count = 1; count <= config.threshold; count += 1) {
    const event = await harness.retry()
    assert.equal(harness.switchModel.mock.callCount(), count === config.threshold ? 1 : 0)
    assert.deepEqual(
      event.decision,
      count === config.threshold ? { retry: true, delay: 0 } : { retry: false },
    )
  }
  assert.equal(harness.context.mock.callCount(), config.threshold)
})

test("unconfigured agents, models outside the chain, and stale events do not fetch context or switch", async (t) => {
  const harness = await setupPlugin(t)
  await harness.retry({ agent: "unconfigured", error: { type: "provider.quota" } })
  await harness.retry({ model: fallback, error: { type: "provider.quota" } })
  const outsideChain = await setupPlugin(t, { model: "xai/unconfigured-test" })
  await outsideChain.retry({ error: { type: "provider.quota" } })
  for (const current of [harness, outsideChain]) {
    assert.equal(current.switchModel.mock.callCount(), 0)
    assert.equal(current.context.mock.callCount(), 0)
  }
})

test("sessions and separate setup calls keep independent failure counts", async (t) => {
  const plugin = createModelFallbackPlugin(config)
  const first = await setupPlugin(t, { plugin })
  const second = await setupPlugin(t, { plugin })
  await first.retry()
  await first.retry()
  await first.retry({ sessionID: "other" })
  await second.retry()
  assert.equal(first.switchModel.mock.callCount(), 0)
  assert.equal(second.switchModel.mock.callCount(), 0)
  await first.retry()
  assert.equal(first.switchModel.mock.callCount(), 1)
  assert.equal(second.switchModel.mock.callCount(), 0)
})

test("context lookup failure blocks communication fallback and warns", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {})
  const harness = await setupPlugin(t, {
    session: {
      context: async () => {
        throw new Error("context unavailable")
      },
    },
  })
  for (let count = 0; count < config.threshold; count += 1) await harness.retry()
  assert.equal(harness.switchModel.mock.callCount(), 0)
  assert.equal(warnings.mock.callCount(), config.threshold)
})

test("compaction preserves a success signal before the next retry", async (t) => {
  let messages = []
  const harness = await setupPlugin(t, { session: { context: async () => messages } })
  await harness.retry()
  await harness.retry()
  messages = [{ type: "assistant", finish: "stop", time: { completed: Date.now() + 1 } }]
  await harness.compact()
  messages = []
  await harness.retry()
  assert.equal(harness.switchModel.mock.callCount(), 0)
})

test("a failed quota switch is retried on the next failure without advancing the chain", async (t) => {
  const warnings = t.mock.method(console, "warn", () => {})
  const switchModel = t.mock.fn(async () => {
    throw new Error("switch unavailable")
  })
  const harness = await setupPlugin(t, { session: { switchModel } })
  for (let count = 0; count < 2; count += 1) {
    const event = await harness.retry({ error: { type: "provider.quota" } })
    assert.deepEqual(event.decision, { retry: false })
  }
  assert.deepEqual(switchModel.mock.calls.map((call) => call.arguments), [
    [{ sessionID: "s", model: target }],
    [{ sessionID: "s", model: target }],
  ])
  assert.equal(warnings.mock.callCount(), 2)
  assert.deepEqual(await harness.beforeTool({ agent: "spec" }), { agent: "spec" })
})
