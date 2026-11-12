/**
 * Wire fixtures: the SSE frames each scenario replays.
 *
 * Every fixture is a named scenario rather than an inline array, so a test says
 * *which* provider defect it is exercising and the frames stay in one place.
 *
 * @module dsh-opendesign-toolcall-shim/tests/helpers/wire
 */

/** One `delta.tool_calls[]` entry as the gateway sends it. */
export interface WireToolCall {
  index: number
  id?: string
  name?: string
  arguments?: string
}

/** Build one OpenAI-compatible chunk carrying tool-call deltas. */
export function toolCallChunk(calls: WireToolCall[], finish: string | null = null): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    model: 'deepseek-v4.1-flash',
    choices: [{
      index: 0,
      delta: {
        tool_calls: calls.map(call => ({
          index: call.index,
          ...call.id === undefined ? {} : { id: call.id },
          type: 'function',
          function: {
            ...call.name === undefined ? {} : { name: call.name },
            ...call.arguments === undefined ? {} : { arguments: call.arguments },
          },
        })),
      },
      finish_reason: finish,
    }],
  })
}

/** The terminal usage chunk plus the `[DONE]` sentinel. */
export function terminalChunks(): string[] {
  return [
    JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      model: 'deepseek-v4.1-flash',
      choices: [],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    '[DONE]',
  ]
}

/**
 * The #9369 capture: three parallel calls where the first two share index 0
 * but carry distinct ids, and each argument string is complete on its own.
 */
export function collidingIndexEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{"path":"/tmp/a.txt"}' }]),
    toolCallChunk([{ index: 0, id: 'call_b', name: 'read_file', arguments: '{"path":"/tmp/b.txt"}' }]),
    toolCallChunk([{ index: 1, id: 'call_c', name: 'read_file', arguments: '{"path":"/tmp/c.txt"}' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** Three ordinary calls with distinct indexes, for the identical-behaviour case. */
export function normalToolCallEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{"path":"/tmp/a.txt"}' }]),
    toolCallChunk([{ index: 1, id: 'call_b', name: 'read_file', arguments: '{"path":"/tmp/b.txt"}' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** One call whose arguments were streamed in fragments. */
export function fragmentedToolCallEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'write_file', arguments: '{"path":' }]),
    toolCallChunk([{ index: 0, arguments: '"/tmp/x","content":"hi"}' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** One call whose argument string is two complete objects appended together. */
export function concatenatedArgumentsEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{"path":"/tmp/a.txt"}{"path":"/tmp/b.txt"}' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** One call whose argument string was cut off mid-value. */
export function truncatedArgumentsEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'write_file', arguments: '{"path":"/tmp/x","content":"unfinished' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** One call whose arguments are not JSON at all. */
export function unrecoverableArgumentsEvents(): string[] {
  return [
    toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: 'not json at all' }]),
    toolCallChunk([], 'tool_calls'),
    ...terminalChunks(),
  ]
}

/** A plain text response, for the unchanged-behaviour case. */
export function plainTextEvents(): string[] {
  return [
    JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] }),
    JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    ...terminalChunks(),
  ]
}
