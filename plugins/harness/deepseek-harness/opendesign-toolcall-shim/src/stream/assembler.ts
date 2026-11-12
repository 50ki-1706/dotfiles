/**
 * Folding pi-ai's assistant event stream into harness chunks.
 *
 * This is the harness stream protocol side of the shim: one `push()` per pi-ai
 * event, `drain()` for the chunks produced since the last call, and a terminal
 * event that closes every call still open. Identity and argument accumulation
 * belong to {@link ToolCallTracker}; the terminal mappings belong to
 * `terminal.ts`. What is left here is the event switch itself.
 *
 * Unlike dsh's stock translator this never throws for malformed completed
 * arguments: the raw text is kept on the `block-end` block so the tool layer
 * reports `INVALID_ARGS` and the model can correct itself
 * (deepseek-ai/deepseek-harness#7581).
 *
 * @module dsh-opendesign-toolcall-shim/stream/assembler
 */

import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { ToolCallTracker, idOfCall } from './calls.ts'
import type { AssembledToolCall, PendingToolCall } from './calls.ts'
import { mapStopReason, mapUsage } from './terminal.ts'

/** The result of assembling one pi-ai event stream. */
export interface AssembledStream {
  /** Chunks in emission order; ends with `usage` then `finish` once terminal. */
  readonly chunks: StreamChunk[]
  /** Completed tool calls, in stream order, with their raw argument text. */
  readonly toolCalls: AssembledToolCall[]
}

/**
 * Whether a completed argument string is a single JSON object.
 * @param text - the raw argument text.
 * @returns true when `JSON.parse` yields a plain object.
 */
export function isCompleteJsonObject(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Fold pi-ai's assistant event stream into harness chunks, keying tool calls
 * by id instead of index.
 */
export class IdKeyedToolCallAssembler {
  private readonly chunks: StreamChunk[] = []
  private readonly calls = new ToolCallTracker()
  private nextBlockIndex = 0

  /**
   * Feed one pi-ai event.
   * @param event - the next assistant event.
   * @returns false when the event was terminal (the stream is done).
   */
  push(event: AssistantMessageEvent): boolean {
    switch (event.type) {
      case 'start':
        return true
      case 'text_start':
        this.openBlock('text')
        return true
      case 'text_delta':
        this.chunks.push({ type: 'text-delta', index: this.lastOpened('text'), text: event.delta })
        return true
      case 'text_end':
        this.closeBlock(this.lastOpened('text'), { type: 'text', text: event.content })
        return true
      case 'thinking_start':
        this.openBlock('reasoning')
        return true
      case 'thinking_delta':
        this.chunks.push({ type: 'reasoning-delta', index: this.lastOpened('reasoning'), text: event.delta })
        return true
      case 'thinking_end':
        this.closeBlock(this.lastOpened('reasoning'), { type: 'reasoning', text: event.content })
        return true
      case 'toolcall_start':
        this.startToolCall(event)
        return true
      case 'toolcall_delta':
        // The delta event carries no id of its own; pi-ai already resolved the
        // content index, so the call is found through the partial's identity.
        this.appendArguments(this.calls.atContentIndex(event.contentIndex, event.partial, true), event.delta)
        return true
      case 'toolcall_end':
        this.endToolCall(event)
        return true
      case 'done':
        this.terminate(event.message)
        return false
      case 'error':
        this.terminate(event.error)
        return false
      default:
        return true
    }
  }

  /** Take the chunks emitted since the last call, in order. */
  drain(): StreamChunk[] {
    return this.chunks.splice(0, this.chunks.length)
  }

  /** The assembled result; meaningful once the terminal event has been pushed. */
  result(): AssembledStream {
    return {
      chunks: this.drain(),
      toolCalls: this.calls.all.map(call => ({
        id: idOfCall(call),
        name: call.name,
        arguments: call.argumentsText,
      })),
    }
  }

  /** Emit a block-start for a text or reasoning block. */
  private openBlock(blockType: 'text' | 'reasoning'): void {
    this.chunks.push({ type: 'block-start', index: this.nextBlockIndex, blockType })
    this.nextBlockIndex += 1
  }

  /** Emit a block-end for a text or reasoning block. */
  private closeBlock(index: number, block: ContentBlock): void {
    this.chunks.push({ type: 'block-end', index, block })
  }

  /** Open a tool call the first time pi-ai reports it. */
  private startToolCall(event: Extract<AssistantMessageEvent, { type: 'toolcall_start' }>): void {
    const partial = event.partial.content[event.contentIndex]
    const id = partial?.type === 'toolCall' ? partial.id : ''
    const name = partial?.type === 'toolCall' ? partial.name : ''
    this.calls.resolve(id, name, event.contentIndex)
  }

  /** Close a tool call, letting the terminal event supply a name the deltas omitted. */
  private endToolCall(event: Extract<AssistantMessageEvent, { type: 'toolcall_end' }>): void {
    const call = this.calls.atContentIndex(event.contentIndex, event.partial)
    if (call.name.length === 0 && event.toolCall.name.length > 0) call.name = event.toolCall.name
    this.finish(call)
  }

  /** Append one argument fragment and emit the matching delta chunk. */
  private appendArguments(call: PendingToolCall, delta: string): void {
    if (delta.length === 0) return
    call.argumentsText += delta
    this.chunks.push({
      type: 'tool-call-delta',
      index: call.blockIndex,
      id: ToolCallId(idOfCall(call)),
      ...call.name.length > 0 ? { name: call.name } : {},
      argumentsDelta: delta,
    })
  }

  /** Emit the opening chunk for a call the first time it is observed. */
  private start(call: PendingToolCall): void {
    if (call.started) return
    call.started = true
    this.chunks.push({ type: 'block-start', index: call.blockIndex, blockType: 'tool-call' })
  }

  /** Close one call, emitting its `block-end` with the raw argument text. */
  private finish(call: PendingToolCall): void {
    if (call.closed) return
    call.closed = true
    this.start(call)
    this.chunks.push({
      type: 'block-end',
      index: call.blockIndex,
      block: {
        type: 'tool-call',
        id: ToolCallId(idOfCall(call)),
        name: call.name,
        arguments: call.argumentsText,
      },
    })
  }

  /** Close every open call, then emit usage and the finish reason. */
  private terminate(message: AssistantMessage): void {
    for (const call of this.calls.all) this.finish(call)
    this.chunks.push({ type: 'usage', usage: mapUsage(message.usage) })
    this.chunks.push({ type: 'finish', reason: mapStopReason(message) })
  }

  /** Index of the block of one type opened most recently. */
  private lastOpened(blockType: 'text' | 'reasoning'): number {
    for (let index = this.chunks.length - 1; index >= 0; index -= 1) {
      const chunk = this.chunks[index]
      if (chunk !== undefined && chunk.type === 'block-start' && chunk.blockType === blockType) return chunk.index
    }
    return 0
  }
}

/**
 * Assemble one pi-ai event stream into harness chunks.
 * @param events - the assistant event stream from pi-ai.
 * @returns the assembled chunks and the completed tool calls.
 * @throws {LlmError} `STREAM_CLOSED` when the source ends without a terminal event.
 */
export async function assembleStream(
  events: AsyncIterable<AssistantMessageEvent>,
): Promise<AssembledStream> {
  const assembler = new IdKeyedToolCallAssembler()
  for await (const event of events) {
    if (!assembler.push(event)) return assembler.result()
  }
  throw new LlmError('pi-ai event stream ended without done/error', 'STREAM_CLOSED')
}
