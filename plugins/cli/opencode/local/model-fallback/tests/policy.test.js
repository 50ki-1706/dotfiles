import assert from "node:assert/strict"
import test from "node:test"

import { sameModel } from "../src/models.js"
import { applySwitchResult, createState, reduceCompaction, reduceFailure } from "../src/policy.js"

const threshold = 3
const communicationError = { type: "provider.timeout" }

function failure(state, chain, options = {}) {
  const model = options.model ?? chain[state.cursor]
  const retry = options.retry ?? true
  const event = {
    model,
    error: options.error ?? communicationError,
    attempt: options.attempt ?? 1,
    decision: { retry },
  }
  return reduceFailure(state, {
    event,
    sessionModel: options.sessionModel ?? model,
    chain,
    threshold,
    now: options.now ?? 1000 + state.count,
    contextMessages: options.contextMessages ?? [],
    contextFailed: options.contextFailed ?? false,
  })
}

test("the third matching communication failure requests one next model without writing retry decision", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6.1-sol#high"]
  for (const retry of [true, false]) {
    let state = createState()
    let result
    let lastEvent
    for (let count = 0; count < threshold; count += 1) {
      lastEvent = {
        model: chain[0],
        error: communicationError,
        attempt: 1,
        decision: { retry },
      }
      result = reduceFailure(state, {
        event: lastEvent,
        sessionModel: chain[0],
        chain,
        threshold,
        now: 1000 + count,
        contextMessages: [],
      })
      state = result.state
      assert.equal(lastEvent.decision.retry, retry)
    }
    assert.deepEqual(result.requested, {
      index: 1,
      model: { providerID: "openai", id: "gpt-6.1-sol", variant: "high" },
    })
    assert.equal("decision" in result, false)
    assert.equal("decisionWrite" in result, false)
  }
})

test("switch targets preserve configured variants and omit missing variants", () => {
  const variantChain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  let state = createState()
  let result
  for (let count = 0; count < threshold; count += 1) {
    result = failure(state, variantChain)
    state = result.state
  }
  assert.deepEqual(result.requested.model, {
    providerID: "openai",
    id: "gpt-6-luna",
    variant: "max",
  })

  const noVariantChain = ["xai/grok-4.7#high", "xai/grok-build-0.1"]
  state = createState()
  for (let count = 0; count < threshold; count += 1) {
    result = failure(state, noVariantChain)
    state = result.state
  }
  assert.deepEqual(result.requested.model, { providerID: "xai", id: "grok-build-0.1" })
  assert.equal("variant" in result.requested.model, false)
})

test("fallback chains progress one entry at a time and stop when exhausted", () => {
  const chains = {
    spec: [
      "xai/grok-4.7#high",
      "opencode/glm-5.3-flash-free#high",
      "opencode/deepseek-v4.1-flash-free#high",
      "openai/gpt-6.1-sol#high",
    ],
    general: [
      "openai/gpt-6-luna#max",
      "opencode/deepseek-v4.1-flash-free#max",
      "xai/grok-build-0.1",
    ],
    explore: [
      "opencode/glm-5.3-flash-free#high",
      "opencode/deepseek-v4.1-flash-free#high",
      "opencode/mimo-v2.6-flash-free",
      "openai/gpt-6-luna#high",
    ],
    plan_review: [
      "openai/gpt-6.1-sol#xhigh",
      "opencode/glm-5.3-flash-free#max",
      "opencode/deepseek-v4.1-flash-free#max",
      "opencode/mimo-v2.6-flash-free",
    ],
  }

  for (const [agent, chain] of Object.entries(chains)) {
    let state = createState()
    for (let cursor = 0; cursor < chain.length; cursor += 1) {
      let result
      for (let count = 1; count <= threshold; count += 1) {
        result = failure(state, chain, { now: cursor * 100 + count })
        state = result.state
        if (count < threshold) {
          assert.equal(result.requested, null, `${agent} switched before three failures`)
        }
      }

      if (cursor + 1 < chain.length) {
        assert.equal(result.requested.index, cursor + 1, `${agent} skipped a fallback`)
        assert.ok(sameModel(result.requested.model, chain[cursor + 1]))
        state = applySwitchResult(state, result.requested, true)
        assert.equal(state.cursor, cursor + 1)
        assert.equal(state.count, 0)
      } else {
        assert.equal(result.requested, null, `${agent} switched after exhausting its chain`)
      }
    }
  }
})

test("separate reducer states do not share cursor or count", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const first = createState()
  const second = createState()
  const one = failure(first, chain)
  const two = failure(one.state, chain)
  assert.equal(two.state.count, 2)
  assert.equal(second.count, 0)
  assert.equal(second.cursor, 0)
  assert.notEqual(first, second)
})

test("attempt 2 resets a new run unless a terminal failure latched continuation", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const accumulated = { ...createState(), count: 2 }
  const reset = failure(accumulated, chain, { attempt: 2 })
  assert.equal(reset.state.count, 1)

  const terminal = { ...createState(), count: 1, pendingTerminal: true }
  const continued = failure(terminal, chain, { attempt: 2, retry: false })
  assert.equal(continued.state.count, 2)
  assert.equal(continued.state.pendingTerminal, true)
})

test("excluded errors reset a matching streak without switching", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const state = { ...createState(), count: 2, pendingTerminal: true }
  const result = failure(state, chain, {
    error: { type: "provider.invalid-model" },
    retry: true,
  })
  assert.equal(result.state.count, 0)
  assert.equal(result.state.pendingTerminal, false)
  assert.equal(result.requested, null)
})

test("a stale model mismatch is a complete no-op", () => {
  const state = { ...createState(), count: 2, pendingTerminal: true }
  const result = failure(state, ["xai/grok-4.7#high", "openai/gpt-6-luna#max"], {
    model: "xai/grok-4.7#high",
    sessionModel: "openai/gpt-6-luna#max",
  })
  assert.equal(result.state, state)
  assert.equal(result.requested, null)
})

test("an omitted event variant matches session variant default", () => {
  assert.equal(
    sameModel(
      { providerID: "openai", id: "gpt-6-luna" },
      { providerID: "openai", id: "gpt-6-luna", variant: "default" },
    ),
    true,
  )
  const eventModel = { providerID: "openai", id: "gpt-6-luna" }
  const result = failure(createState(), ["openai/gpt-6-luna"], {
    model: eventModel,
    sessionModel: { ...eventModel, variant: "default" },
  })
  assert.equal(result.state.count, 1)
})

test("a newer assistant success resets before counting; errors and missing finish do not", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const previous = { ...createState(), count: 2, lastFailureAt: 100 }
  const success = failure(previous, chain, {
    now: 101,
    contextMessages: [{ type: "assistant", finish: "stop", time: { completed: 101 } }],
  })
  assert.equal(success.state.count, 1)
  assert.equal(success.requested, null)

  const notSuccess = [
    { type: "assistant", finish: "stop", error: { type: "failure" }, time: { completed: 101 } },
    { type: "assistant", time: { completed: 101 } },
  ]
  for (const assistant of notSuccess) {
    const result = failure(previous, chain, { now: 102, contextMessages: [assistant] })
    assert.equal(result.state.count, 3)
    assert.equal(result.requested.index, 1)
  }
})

test("compaction latches a pre-truncation success for the next failure", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const state = { ...createState(), count: 2, lastFailureAt: 100, pendingTerminal: true }
  const compacted = reduceCompaction(state, {
    messages: [{ type: "assistant", finish: "stop", time: { completed: 101 } }],
  })
  assert.equal(compacted.count, 0)
  assert.equal(compacted.pendingTerminal, false)
  assert.equal(compacted.successLatched, true)

  const next = failure(compacted, chain, {
    retry: false,
    now: 102,
    contextMessages: [],
  })
  assert.equal(next.state.count, 1)
  assert.equal(next.state.pendingTerminal, true)
  assert.equal(next.requested, null)
})

test("compaction context failure clears the count and success latch", () => {
  const state = {
    ...createState(),
    count: 2,
    pendingTerminal: true,
    successLatched: true,
  }
  const failed = reduceCompaction(state, { contextFailed: true })
  assert.equal(failed.count, 0)
  assert.equal(failed.pendingTerminal, false)
  assert.equal(failed.successLatched, false)
})

test("a context failure after compaction latch counts once and consumes the latch", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const compacted = reduceCompaction(
    { ...createState(), count: 2, lastFailureAt: 100 },
    { messages: [{ type: "assistant", finish: "stop", time: { completed: 101 } }] },
  )
  assert.equal(compacted.successLatched, true)

  const failed = failure(compacted, chain, { contextFailed: true, now: 102 })
  assert.equal(failed.state.count, 1)
  assert.equal(failed.state.successLatched, false)
  assert.equal(failed.requested, null)
})

test("attempts 2, 3, and 4 count toward the next-model request without changing retry decisions", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6.1-sol#high"]
  let state = createState()
  let result

  for (const attempt of [2, 3, 4]) {
    const event = {
      model: chain[0],
      error: communicationError,
      attempt,
      decision: { retry: false },
    }
    result = reduceFailure(state, {
      event,
      sessionModel: chain[0],
      chain,
      threshold,
      now: 1500 + attempt,
      contextMessages: [],
    })
    state = result.state
    assert.equal(event.decision.retry, false)
  }

  assert.deepEqual(result.requested, {
    index: 1,
    model: { providerID: "openai", id: "gpt-6.1-sol", variant: "high" },
  })
  assert.equal("decision" in result, false)
  assert.equal("decisionWrite" in result, false)
})

test("three terminal failures without a success signal request the next model", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  let state = createState()
  let result
  for (let count = 0; count < threshold; count += 1) {
    result = failure(state, chain, { attempt: 2, retry: false, now: 2000 + count })
    state = result.state
  }
  assert.equal(state.count, 3)
  assert.deepEqual(result.requested.model, {
    providerID: "openai",
    id: "gpt-6-luna",
    variant: "max",
  })
})

test("a switch failure keeps the target in place until three more failures", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max", "opencode/mimo-v2.6-flash-free"]
  let state = createState()
  let result
  for (let count = 0; count < threshold; count += 1) {
    result = failure(state, chain)
    state = result.state
  }
  const notSwitched = applySwitchResult(state, result.requested, false)
  assert.equal(notSwitched.cursor, 0)
  assert.equal(notSwitched.count, 3)

  let retryState = notSwitched
  for (let count = 1; count <= threshold; count += 1) {
    result = failure(retryState, chain, { now: 3000 + count })
    retryState = result.state
    if (count < threshold) assert.equal(result.requested, null)
  }
  assert.equal(result.requested.index, 1)
  assert.deepEqual(result.requested.model, {
    providerID: "openai",
    id: "gpt-6-luna",
    variant: "max",
  })
})

test("context failure does not count without a latched success", () => {
  const chain = ["xai/grok-4.7#high", "openai/gpt-6-luna#max"]
  const state = { ...createState(), count: 2 }
  const result = failure(state, chain, { contextFailed: true })
  assert.equal(result.state, state)
  assert.equal(result.requested, null)
})

test("an immediate message requests the next model on its first failure", () => {
  const chain = ["xai/primary-test#high", "openai/fallback-test#max"]
  const event = {
    model: chain[0],
    error: {
      type: "unknown",
      message: "personal-team-blocked:spending-limit: gRPC error: You have run out of credits...",
    },
    attempt: 1,
    decision: { retry: true },
  }
  const result = reduceFailure(createState(), {
    event,
    sessionModel: chain[0],
    chain,
    threshold,
    now: 1000,
  })
  assert.equal(result.requested.index, 1)
  assert.deepEqual(result.requested.model, {
    providerID: "openai",
    id: "fallback-test",
    variant: "max",
  })
})

test("an immediate failure bypasses a context failure without a success latch", () => {
  const chain = ["xai/primary-test#high", "openai/fallback-test#max"]
  const result = failure(createState(), chain, { error: { type: "provider.quota" }, contextFailed: true })
  assert.equal(result.requested.index, 1)
})

test("an immediate failure does not request a model after the chain is exhausted", () => {
  const chain = ["xai/primary-test#high"]
  const result = failure(createState(), chain, { error: { type: "provider.quota" } })
  assert.equal(result.requested, null)
})

test("an immediate failure outside the chain is a complete no-op", () => {
  const chain = ["xai/primary-test#high", "openai/fallback-test#max"]
  const state = createState()
  const result = failure(state, chain, { model: "xai/other-test#high", error: { type: "provider.quota" } })
  assert.equal(result.state, state)
  assert.equal(result.requested, null)
})

test("quota detection in the reducer needs no caller-supplied flag", () => {
  const chain = ["xai/primary-test#high", "openai/fallback-test#max"]
  const state = { ...createState(), count: 2, pendingTerminal: true }
  const result = failure(state, chain, {
    error: { type: "unknown", message: "personal-team-blocked:spending-limit: gRPC error" },
  })
  assert.equal(result.state.count, 3)
  assert.equal(result.state.pendingTerminal, false)
  assert.equal(result.requested.index, 1)
})

test("an immediate attempt 2 requests a model on the first failure even when retry is false", () => {
  const chain = ["xai/primary-test#high", "openai/fallback-test#max"]
  const result = failure(createState(), chain, {
    attempt: 2,
    retry: false,
    error: { type: "provider.quota" },
  })
  assert.equal(result.requested.index, 1)
})

test("applySwitchResult commits the next cursor only when the switch succeeds", () => {
  const state = { ...createState(), count: 3, lastFailureAt: 100 }
  const requested = { index: 1, model: { providerID: "openai", id: "gpt-6-luna" } }
  assert.equal(applySwitchResult(state, requested, false), state)
  const committed = applySwitchResult(state, requested, true)
  assert.equal(committed.cursor, 1)
  assert.equal(committed.count, 0)
  assert.equal(committed.lastFailureAt, 100)
})
