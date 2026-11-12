/**
 * SSE framing: applying the index rewriter to a response body without
 * buffering it.
 *
 * The OpenAI wire format puts one JSON document per `data:` line and one event
 * per blank-line-separated block. A block that does not match that shape is not
 * a chat chunk and is passed through byte-identically, so a well-behaved
 * response is unchanged on the wire.
 *
 * @module dsh-opendesign-toolcall-shim/wire/sse
 */

import type { WireChunk } from './chunk.ts'
import type { ToolCallIndexRewriter } from './index-rewriter.ts'

/** The `data:` prefix of an SSE line. */
const DATA_PREFIX = 'data:'

/** The blank line that ends an SSE event block. */
const BLOCK_SEPARATOR = '\n\n'

/**
 * Rewrite one SSE `data:` payload.
 * @param payload - the text after `data: ` on one line.
 * @param rewriter - the per-response rewriter.
 * @returns the payload to send on, unchanged when no rewrite was needed.
 */
export function rewriteSsePayload(payload: string, rewriter: ToolCallIndexRewriter): string {
  const trimmed = payload.trim()
  if (trimmed === '[DONE]' || !trimmed.startsWith('{')) return payload
  let chunk: WireChunk
  try {
    chunk = JSON.parse(trimmed) as WireChunk
  } catch {
    return payload
  }
  return rewriter.rewrite(chunk) ? JSON.stringify(chunk) : payload
}

/**
 * Rewrite one SSE event block (the text between blank lines).
 *
 * Only `data:` lines are considered, and a block with several `data:` lines is
 * left alone: the OpenAI wire format puts one JSON document per `data:` line,
 * so a multi-line block is not a chat chunk.
 * @param block - the raw event block, including its line terminators.
 * @param rewriter - the per-response rewriter.
 * @returns the block to send on.
 */
export function rewriteSseBlock(block: string, rewriter: ToolCallIndexRewriter): string {
  const lines = block.split('\n')
  const dataLines = lines.filter(line => line.startsWith(DATA_PREFIX))
  if (dataLines.length !== 1) return block
  const [line] = dataLines
  if (line === undefined) return block
  const payload = line.slice(DATA_PREFIX.length).trimStart()
  const rewritten = rewriteSsePayload(payload, rewriter)
  if (rewritten === payload) return block
  return lines.map(candidate => candidate === line ? `${DATA_PREFIX} ${rewritten}` : candidate).join('\n')
}

/**
 * Wrap an SSE body so each event block passes through the rewriter.
 *
 * The transform is streaming: it forwards complete blocks as they arrive and
 * holds only the incomplete tail, so a long response is never buffered whole.
 * @param body - the response body stream.
 * @param rewriter - the per-response rewriter.
 * @returns the rewritten body stream.
 */
export function rewriteSseStream(
  body: ReadableStream<Uint8Array>,
  rewriter: ToolCallIndexRewriter,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      let boundary = pending.indexOf(BLOCK_SEPARATOR)
      while (boundary !== -1) {
        const block = pending.slice(0, boundary)
        pending = pending.slice(boundary + BLOCK_SEPARATOR.length)
        controller.enqueue(encoder.encode(`${rewriteSseBlock(block, rewriter)}${BLOCK_SEPARATOR}`))
        boundary = pending.indexOf(BLOCK_SEPARATOR)
      }
    },
    flush(controller) {
      const tail = pending + decoder.decode()
      if (tail.length === 0) return
      controller.enqueue(encoder.encode(rewriteSseBlock(tail, rewriter)))
    },
  }))
}
