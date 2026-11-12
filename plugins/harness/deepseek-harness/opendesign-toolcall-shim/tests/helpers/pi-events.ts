/**
 * Hand-built pi-ai events, so the assembler is testable without HTTP.
 *
 * pi-ai's own events carry the partial message and its content index; these
 * builders reproduce just enough of that shape to exercise the assembler's
 * identity resolution.
 *
 * @module dsh-opendesign-toolcall-shim/tests/helpers/pi-events
 */

import type { AssistantMessageEvent } from '@earendil-works/pi-ai'

/** The partial message shape pi-ai attaches to each event. */
export type PiPartial = Extract<AssistantMessageEvent, { type: 'toolcall_start' }>['partial']

/** One pi-ai tool-call block as the partial carries it. */
export function piToolBlock(id: string, name: string, argumentsValue: Record<string, unknown> = {}) {
  return { type: 'toolCall' as const, id, name, arguments: argumentsValue }
}

/** A pi-ai partial carrying the given content blocks. */
export function piPartial(content: unknown[]): PiPartial {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'opendesign',
    model: 'deepseek-v4.1-flash',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse',
    timestamp: 0,
  } as unknown as PiPartial
}

/**
 * A partial whose content array is long enough to hold `contentIndex`, as
 * pi-ai's own partial always is: the block at that index is the call.
 */
export function piContentAt(contentIndex: number, block: ReturnType<typeof piToolBlock>) {
  const content: unknown[] = Array.from({ length: contentIndex }, () => ({ type: 'text', text: '' }))
  content[contentIndex] = block
  return content
}

/** A `toolcall_start` event for one call. */
export function piToolStart(contentIndex: number, id: string, name: string): AssistantMessageEvent {
  return { type: 'toolcall_start', contentIndex, partial: piPartial(piContentAt(contentIndex, piToolBlock(id, name))) }
}

/** A `toolcall_delta` event carrying one argument fragment. */
export function piToolDelta(contentIndex: number, delta: string, id = ''): AssistantMessageEvent {
  return {
    type: 'toolcall_delta',
    contentIndex,
    delta,
    partial: piPartial(piContentAt(contentIndex, piToolBlock(id, 'read_file'))),
  }
}

/**
 * A `toolcall_end` event for one call.
 *
 * pi-ai keeps each call's identity on the partial's block at its own content
 * index; the assembler reads it from there.
 */
export function piToolEnd(contentIndex: number, id: string): AssistantMessageEvent {
  return {
    type: 'toolcall_end',
    contentIndex,
    toolCall: piToolBlock(id, 'read_file'),
    partial: piPartial(piContentAt(contentIndex, piToolBlock(id, 'read_file'))),
  }
}

/** The terminal `done` event. */
export function piDone(): AssistantMessageEvent {
  return {
    type: 'done',
    reason: 'toolUse',
    message: {
      ...piPartial([piToolBlock('call_a', 'read_file')]),
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    },
  } as AssistantMessageEvent
}
