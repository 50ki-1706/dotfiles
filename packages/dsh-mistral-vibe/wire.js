import { createHash } from 'node:crypto'
import { LlmError } from '@deepseek-ai/dsh-llm'

// Mistral accepts exactly nine alphanumeric characters. Map the whole history
// together so tool results use the same id, including calls from other routes.
function toolIds() {
  const mapped = new Map()
  const used = new Set()
  return id => {
    if (mapped.has(id)) return mapped.get(id)
    let salt = 0
    let wire
    do {
      wire = createHash('sha256').update(`${id}:${salt++}`).digest('hex').slice(0, 9)
    } while (used.has(wire))
    used.add(wire)
    mapped.set(id, wire)
    return wire
  }
}

export function requestBody(options, info) {
  const idFor = toolIds()
  const messages = []
  if (options.system) messages.push({ role: 'system', content: options.system })
  for (const message of options.messages) {
    // The harness folds tool changes into options.tools for this route.
    const content = []
    const calls = []
    for (const block of message.content) {
      switch (block.type) {
        case 'text': content.push({ type: 'text', text: block.text }); break
        case 'reasoning':
          if (message.role === 'assistant' && info.reasoning) {
            content.push({ type: 'thinking', thinking: [{ type: 'text', text: block.text }] })
          }
          break
        case 'tool-call':
          if (message.role !== 'assistant') throw new LlmError('Tool call outside assistant message', 'INVALID_REQUEST')
          calls.push({ id: idFor(block.id), type: 'function', function: { name: block.name, arguments: block.arguments } })
          break
        case 'tool-addition': case 'tool-removal':
          if (message.role !== 'developer') throw new LlmError('Tool update outside developer message', 'INVALID_REQUEST')
          break
        default:
          throw new LlmError('Mistral Vibe supports text input only', 'UNSUPPORTED_CONTENT')
      }
    }
    if (message.role === 'developer' && !content.length) continue
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) {
      throw new LlmError('Unsupported message role', 'INVALID_REQUEST')
    }
    const row = {
      role: message.role === 'developer' ? 'system' : message.role,
      content: content.some(block => block.type === 'thinking') ? content : content.map(block => block.text).join('\n'),
    }
    if (calls.length) row.tool_calls = calls
    if (message.role === 'tool') row.tool_call_id = idFor(message.toolCallId)
    messages.push(row)
  }
  const body = { model: options.model, messages, stream: true }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
  if (options.stop !== undefined) body.stop = options.stop
  if (options.tools?.length) {
    body.tools = options.tools.map(({ name, description, parameters }) => ({
      type: 'function', function: { name, description, parameters },
    }))
    body.tool_choice = 'auto'
    body.parallel_tool_calls = true
  }
  const effort = options.reasoningEffort ?? info.reasoning?.defaultEffort
  if (effort !== undefined) {
    if (!info.reasoning?.efforts.some(level => level.id === effort)) {
      throw new LlmError('Unsupported Mistral reasoning effort for this model', 'UNSUPPORTED_OPTION')
    }
    body.reasoning_effort = effort === 'off' ? 'none' : effort
  }
  return body
}
