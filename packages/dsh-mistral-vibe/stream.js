import { randomUUID } from 'node:crypto'
import { LlmError } from '@deepseek-ai/dsh-llm'

const invalid = () => new LlmError('Invalid Mistral streaming response', 'INVALID_RESPONSE')

// Decode SSE independently of byte/UTF-8/CRLF boundaries. Always release the
// connection, including cancellation, malformed events and early iteration exit.
export async function* events(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  let data = []
  let size = 0
  function line(value) {
    if (value === '') {
      const event = data.length ? data.join('\n') : undefined
      data = []
      size = 0
      return event
    }
    if (value.startsWith('data:')) {
      const part = value.slice(5).replace(/^ /, '')
      size += part.length
      if (size > 1024 * 1024) throw invalid()
      data.push(part)
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      let match
      while ((match = /\r\n|\n|\r/.exec(pending))) {
        if (!done && match[0] === '\r' && match.index === pending.length - 1) break
        const event = line(pending.slice(0, match.index))
        pending = pending.slice(match.index + match[0].length)
        if (event !== undefined) yield event
      }
      if (pending.length > 1024 * 1024) throw invalid()
      if (done) {
        if (pending) line(pending)
        const event = line('')
        if (event !== undefined) yield event
        return
      }
    }
  } finally {
    try { await reader.cancel() } catch { /* Keep the original stream failure. */ }
    reader.releaseLock()
  }
}

export function tokenUsage(raw) {
  const count = value => Number.isSafeInteger(value) && value >= 0
  if (!raw || !count(raw.prompt_tokens) || !count(raw.completion_tokens)) return undefined
  const cached = raw.prompt_tokens_details?.cached_tokens ?? 0
  if (!count(cached) || cached > raw.prompt_tokens) return undefined
  return {
    inputTokens: raw.prompt_tokens - cached,
    outputTokens: raw.completion_tokens,
    totalTokens: raw.prompt_tokens + raw.completion_tokens,
    ...(cached ? { cacheReadTokens: cached } : {}),
    ...(count(raw.completion_tokens_details?.reasoning_tokens)
      ? { reasoningTokens: raw.completion_tokens_details.reasoning_tokens } : {}),
  }
}

export async function* translate(body) {
  let nextIndex = 0
  let open
  const calls = new Map()
  let finish
  let usage
  let sawContent = false
  function* closeText() {
    if (!open) return
    yield { type: 'block-end', index: open.index, block: { type: open.type, text: open.text } }
    open = undefined
  }
  function* text(type, value) {
    if (typeof value !== 'string') throw invalid()
    if (!value) return
    sawContent = true
    if (open?.type !== type) {
      yield* closeText()
      open = { index: nextIndex++, type, text: '' }
      yield { type: 'block-start', index: open.index, blockType: type }
    }
    open.text += value
    yield { type: `${type}-delta`, index: open.index, text: value }
  }
  for await (const data of events(body)) {
    if (data === '[DONE]') break
    let event
    try { event = JSON.parse(data) } catch { throw invalid() }
    if (!event || typeof event !== 'object') throw invalid()
    // Never reflect upstream bodies: they may echo prompts or credentials.
    if (event.error) throw new LlmError('Mistral returned a streaming error', 'SERVER')
    if (event.usage) usage = tokenUsage(event.usage) ?? usage
    if (!Array.isArray(event.choices)) throw invalid()
    if (event.choices.length === 0) continue
    if (event.choices.length !== 1 || finish) throw invalid()
    const choice = event.choices[0]
    if (choice.index !== undefined && choice.index !== 0) throw invalid()
    const delta = choice.delta ?? {}
    if (typeof delta.content === 'string') yield* text('text', delta.content)
    else if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (part.type === 'text') yield* text('text', part.text)
        else if (part.type === 'thinking' && Array.isArray(part.thinking)) {
          for (const inner of part.thinking) {
            if (typeof inner === 'string') yield* text('reasoning', inner)
            else if (inner.type === 'text') yield* text('reasoning', inner.text)
            else throw invalid()
          }
        } else throw invalid()
      }
    } else if (delta.content != null) throw invalid()
    if (delta.tool_calls !== undefined && !Array.isArray(delta.tool_calls)) throw invalid()
    for (const call of delta.tool_calls ?? []) {
      yield* closeText()
      // Mistral's streaming contract correlates fragments by index. Without
      // one only an unambiguous provider id can establish a call.
      const slot = call.index ?? call.id
      if (!(Number.isSafeInteger(slot) && slot >= 0) && !(typeof slot === 'string' && slot)) throw invalid()
      let state = calls.get(slot)
      if (!state) {
        state = { index: nextIndex++, wireId: call.id, id: `mistral_${randomUUID()}`, name: '', arguments: '' }
        calls.set(slot, state)
        yield { type: 'block-start', index: state.index, blockType: 'tool-call' }
      } else if (call.id !== undefined && state.wireId !== undefined && call.id !== state.wireId) throw invalid()
      state.wireId ??= call.id
      const name = call.function?.name
      const args = call.function?.arguments ?? ''
      if ((name !== undefined && typeof name !== 'string') || typeof args !== 'string') throw invalid()
      state.name += name ?? ''
      state.arguments += args
      sawContent = true
      yield { type: 'tool-call-delta', index: state.index, id: state.id,
        ...(name ? { name: state.name } : {}), argumentsDelta: args }
    }
    if (choice.finish_reason != null) {
      finish = { stop: 'stop', tool_calls: 'tool-calls', length: 'max-tokens', model_length: 'max-tokens' }[choice.finish_reason]
      if (!finish) throw invalid()
    }
  }
  if (!finish) throw new LlmError('Mistral stream ended before its finish reason', 'TRANSPORT')
  if (!sawContent) throw new LlmError('Mistral returned no content', 'EMPTY_RESPONSE')
  yield* closeText()
  for (const state of calls.values()) {
    // At the token limit the harness drops incomplete tools. Otherwise refuse
    // malformed JSON before the loop can execute a truncated invocation.
    if (finish !== 'max-tokens') {
      if (!state.name) throw invalid()
      if (!state.arguments) {
        state.arguments = '{}'
        yield { type: 'tool-call-delta', index: state.index, id: state.id, argumentsDelta: '{}' }
      }
      try {
        const args = JSON.parse(state.arguments)
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw invalid()
      } catch { throw invalid() }
    }
    yield { type: 'block-end', index: state.index,
      block: { type: 'tool-call', id: state.id, name: state.name, arguments: state.arguments } }
  }
  if (usage) yield { type: 'usage', usage }
  yield { type: 'finish', reason: { kind: finish } }
}
