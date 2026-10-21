import { classifyFailure } from "./failures.js"
import { sameModel, switchTarget } from "./models.js"

export function createState() {
  return {
    cursor: 0,
    count: 0,
    lastFailureAt: 0,
    pendingTerminal: false, // Carry a terminal failure into the next retry run.
    successLatched: false, // Remember success after compaction removes its message.
  }
}

export function hasAssistantSuccess(messages, lastFailureAt) {
  return (
    Array.isArray(messages) &&
    messages.some(
      (message) =>
        message?.type === "assistant" &&
        Boolean(message.finish) &&
        message.error == null &&
        Number(message.time?.completed) > lastFailureAt,
    )
  )
}

function unchanged(state) {
  return { state, requested: null }
}

export function reduceFailure(state, input) {
  const {
    event,
    sessionModel,
    chain,
    threshold,
    contextMessages = [],
    contextFailed = false,
    now,
  } = input

  if (!sameModel(event?.model, sessionModel)) return unchanged(state)

  const failureType = classifyFailure(event?.error)
  if (failureType === "other") {
    if (state.count === 0 && !state.pendingTerminal) return unchanged(state)
    return {
      state: { ...state, count: 0, pendingTerminal: false },
      requested: null,
    }
  }

  const immediate = failureType === "quota"
  const activeThreshold = immediate ? 1 : threshold
  if (!Array.isArray(chain) || !Number.isInteger(activeThreshold) || activeThreshold < 1) {
    return unchanged(state)
  }
  const selectedIndex = chain.findIndex((model) => sameModel(model, event.model))
  if (selectedIndex < 0) return unchanged(state)
  if (!immediate && contextFailed && !state.successLatched) return unchanged(state)

  const next = { ...state }
  if (selectedIndex !== next.cursor) {
    next.cursor = selectedIndex
    next.count = 0
    next.pendingTerminal = false
  }

  if (!contextFailed && hasAssistantSuccess(contextMessages, next.lastFailureAt)) {
    next.count = 0
    next.pendingTerminal = false
  }

  // OpenCode's first retry has attempt 2; preserve a preceding terminal failure across runs.
  if (event.attempt === 2 && !next.pendingTerminal) next.count = 0
  next.count += 1
  next.lastFailureAt = now
  next.successLatched = false
  next.pendingTerminal = event.decision?.retry === false && next.count < activeThreshold

  const nextModel = chain[next.cursor + 1]
  const requested =
    next.count >= activeThreshold && next.count % activeThreshold === 0 && nextModel
      ? { index: next.cursor + 1, model: switchTarget(nextModel) }
      : null

  return { state: next, requested: requested?.model ? requested : null }
}

export function applySwitchResult(state, requested, ok) {
  if (!ok || !requested || !Number.isInteger(requested.index)) return state
  return {
    ...state,
    cursor: requested.index,
    count: 0,
    pendingTerminal: false,
    successLatched: false,
  }
}

export function reduceCompaction(state, { messages = [], contextFailed = false }) {
  if (contextFailed) {
    return {
      ...state,
      count: 0,
      pendingTerminal: false,
      successLatched: false,
    }
  }
  if (!hasAssistantSuccess(messages, state.lastFailureAt)) return state
  return {
    ...state,
    count: 0,
    pendingTerminal: false,
    successLatched: true,
  }
}
