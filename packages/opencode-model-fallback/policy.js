const COMMUNICATION_FAILURES = new Set([
  "provider.transport",
  "provider.timeout",
  "provider.internal",
  "provider.rate-limit",
])

export function createState() {
  return {
    cursor: 0,
    count: 0,
    lastFailureAt: 0,
    pendingTerminal: false,
    successLatched: false,
  }
}

function modelParts(model) {
  if (typeof model === "string") {
    const separator = model.indexOf("/")
    if (separator < 1) return null

    const providerID = model.slice(0, separator)
    const rest = model.slice(separator + 1)
    const variantSeparator = rest.indexOf("#")
    const id = variantSeparator < 0 ? rest : rest.slice(0, variantSeparator)
    const variant = variantSeparator < 0 ? undefined : rest.slice(variantSeparator + 1)
    if (!id || variant === "") return null
    return { providerID, id, variant }
  }

  if (!model || typeof model !== "object") return null
  const providerID = model.providerID ?? model.provider
  const id = model.id
  if (typeof providerID !== "string" || typeof id !== "string") return null
  const variant = typeof model.variant === "string" && model.variant !== "" ? model.variant : undefined
  return { providerID, id, variant }
}

export function sameModel(left, right) {
  const leftParts = modelParts(left)
  const rightParts = modelParts(right)
  return (
    leftParts !== null &&
    rightParts !== null &&
    leftParts.providerID === rightParts.providerID &&
    leftParts.id === rightParts.id &&
    (leftParts.variant ?? "default") === (rightParts.variant ?? "default")
  )
}

function switchTarget(model) {
  const parts = modelParts(model)
  if (!parts) return null
  const target = { providerID: parts.providerID, id: parts.id }
  if (parts.variant && parts.variant !== "default") target.variant = parts.variant
  return target
}

export function isCommunicationFailure(type) {
  return COMMUNICATION_FAILURES.has(type)
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
  const { event, sessionModel, chain, threshold, contextMessages = [], contextFailed = false, now } = input

  if (!sameModel(event?.model, sessionModel)) return unchanged(state)

  if (!isCommunicationFailure(event?.error?.type)) {
    if (state.count === 0 && !state.pendingTerminal) return unchanged(state)
    return {
      state: { ...state, count: 0, pendingTerminal: false },
      requested: null,
    }
  }

  if (!Array.isArray(chain) || !Number.isInteger(threshold) || threshold < 1) {
    return unchanged(state)
  }
  const selectedIndex = chain.findIndex((model) => sameModel(model, event.model))
  if (selectedIndex < 0) return unchanged(state)
  if (contextFailed && !state.successLatched) return unchanged(state)

  const next = { ...state }
  if (selectedIndex !== next.cursor) {
    next.cursor = selectedIndex
    next.count = 0
    next.pendingTerminal = false
  }

  if (!contextFailed && hasAssistantSuccess(contextMessages, next.lastFailureAt)) {
    next.count = 0
    next.pendingTerminal = false
    next.successLatched = true
  }

  if (event.attempt === 2 && !next.pendingTerminal) next.count = 0
  next.count += 1
  next.lastFailureAt = now
  next.successLatched = false
  next.pendingTerminal = event.decision?.retry === false && next.count < threshold

  const nextModel = chain[next.cursor + 1]
  const requested =
    next.count >= threshold && next.count % threshold === 0 && nextModel
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
