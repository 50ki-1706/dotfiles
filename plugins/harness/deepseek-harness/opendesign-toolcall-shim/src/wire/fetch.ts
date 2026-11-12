/**
 * The `fetch` pi-ai is handed, with the index rewriter spliced into it.
 *
 * pi-ai accepts a `fetch` option on its stream options, which is the seam that
 * lets the shim fix the response before pi-ai's own index-keyed assembly runs.
 * The wrapper delegates to the platform fetch (or the caller's own) and only
 * touches a successful `text/event-stream` response; every other outcome is
 * returned as-is, so error handling, redirects, and non-streaming bodies behave
 * exactly as they did.
 *
 * @module dsh-opendesign-toolcall-shim/wire/fetch
 */

import { ToolCallIndexRewriter } from './index-rewriter.ts'
import { rewriteSseStream } from './sse.ts'

/** The fetch implementation and rewriter one request uses. */
export interface RewritingFetch {
  /** The fetch to hand pi-ai. */
  readonly fetch: typeof globalThis.fetch
  /** The rewriter it drives, readable after the response settles. */
  readonly rewriter: ToolCallIndexRewriter
}

/**
 * Build the `fetch` pi-ai should use for one request.
 * @param base - the fetch implementation to delegate to; defaults to the platform's.
 * @returns the fetch function to hand pi-ai, plus the rewriter it will use.
 */
export function createRewritingFetch(base: typeof globalThis.fetch = globalThis.fetch): RewritingFetch {
  const rewriter = new ToolCallIndexRewriter()
  const rewritingFetch: typeof globalThis.fetch = async (input, init) => {
    const response = await base(input, init)
    if (!isRewritableStream(response)) return response
    // Constructing a Response over the rewritten body preserves status and
    // headers; the body is the only part that changes.
    return new Response(rewriteSseStream(response.body, rewriter), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  return { fetch: rewritingFetch, rewriter }
}

/**
 * Whether a response is a successful SSE stream whose body can be rewritten.
 * @param response - the upstream response.
 * @returns true when the body is a readable event stream.
 */
function isRewritableStream(response: Response): response is Response & { body: ReadableStream<Uint8Array> } {
  if (!response.ok || response.body === null) return false
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('text/event-stream')
}
