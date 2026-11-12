/**
 * SSE rewriting that removes the gateway's tool-call index collisions.
 *
 * pi-ai assembles `delta.tool_calls[]` by `index` first, so two calls the
 * gateway labels with the same index (nexu-io/open-design#9369) are merged
 * before any harness code sees them. The only place the two calls are still
 * distinguishable is the wire itself, where each delta carries its own `id`.
 *
 * This layer sits between pi-ai and the network through pi-ai's `fetch` option:
 *
 * - {@link ToolCallIndexRewriter} decides which index each call gets.
 * - {@link rewriteSseStream} applies that decision to a streaming body.
 * - {@link createRewritingFetch} wires both into a `fetch` pi-ai can use.
 *
 * Frames that need no rewrite are passed through untouched, so a well-behaved
 * response is byte-identical on the wire.
 *
 * @module dsh-opendesign-toolcall-shim/wire
 */

export { createRewritingFetch } from './fetch.ts'
export type { RewritingFetch } from './fetch.ts'
export { ToolCallIndexRewriter } from './index-rewriter.ts'
export type { RewriteStats } from './index-rewriter.ts'
export { rewriteSseBlock, rewriteSsePayload, rewriteSseStream } from './sse.ts'
