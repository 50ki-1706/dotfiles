/**
 * A minimal JSON-RPC 2.0 peer over stdio.
 *
 * The Codex adapter speaks MCP directly instead of depending on an SDK: the
 * protocol surface it needs is `initialize`, `tools/list` and `tools/call`,
 * and a dependency would have to be vendored into the Nix build for that.
 *
 * Requests are dispatched concurrently, so a slow `tools/call` (a push or a
 * fetch waiting on the network) does not block the ones behind it. A
 * `notifications/cancelled` aborts the matching in-flight call.
 *
 * @module @publish/codex-adapter/jsonrpc
 */

import { createInterface } from 'node:readline'

/** One JSON-RPC request or notification. */
export interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

/** A JSON-RPC error object. */
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/** Standard JSON-RPC error codes used by this server. */
export const ERROR_CODES = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const

/** A handler result: a JSON value, or an error to report. */
export type HandlerResult = { result: unknown } | { error: JsonRpcError }

/** What a handler receives beyond its params. */
export interface HandlerContext {
  /** Aborted when the client cancels this request. */
  signal: AbortSignal
}

/** Request handlers keyed by method name. */
export type Handlers = Record<
  string,
  (params: unknown, context: HandlerContext) => Promise<HandlerResult> | HandlerResult
>

/** The MCP protocol versions this server can speak, newest first. */
export const PROTOCOL_VERSIONS = ['2024-11-05'] as const

/**
 * Serve JSON-RPC over a readable/writable pair until the input closes.
 * @param handlers - method handlers; an unlisted method answers `Method not found`.
 * @param input - readable byte stream carrying newline-delimited JSON.
 * @param output - writable byte stream receiving newline-delimited JSON.
 * @returns after the input stream closes and every in-flight request settles.
 */
export async function serve(
  handlers: Handlers,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {
  const send = (message: unknown): void => {
    output.write(`${JSON.stringify(message)}\n`)
  }

  /** In-flight requests, so a cancellation can abort the right one. */
  const inFlight = new Map<string | number, AbortController>()
  /** Request ids are strings or numbers; a JSON `null` id is never matched. */
  const isRequestId = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number'

  const lines = createInterface({ input, crlfDelay: Infinity })
  const pending: Promise<void>[] = []

  for await (const line of lines) {
    if (!line.trim()) continue
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: ERROR_CODES.parse, message: 'Parse error' } })
      continue
    }
    if (typeof message !== 'object' || message === null || message.jsonrpc !== '2.0') {
      send({ jsonrpc: '2.0', id: null, error: { code: ERROR_CODES.invalidRequest, message: 'Invalid request' } })
      continue
    }

    // Notifications (no id) expect no response. The one that matters is a
    // cancellation, which must abort the request it names.
    if (message.id === undefined) {
      if (message.method === 'notifications/cancelled') {
        const { requestId } = (message.params ?? {}) as { requestId?: unknown }
        if (isRequestId(requestId)) inFlight.get(requestId)?.abort()
      }
      continue
    }

    const id = message.id
    const handler = handlers[message.method]
    if (handler === undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: ERROR_CODES.methodNotFound, message: `Method not found: ${message.method}` },
      })
      continue
    }

    const controller = new AbortController()
    if (isRequestId(id)) inFlight.set(id, controller)
    // Dispatch without awaiting, so one slow call cannot block the next.
    pending.push((async () => {
      try {
        const outcome = await handler(message.params, { signal: controller.signal })
        send(
          'error' in outcome
            ? { jsonrpc: '2.0', id, error: outcome.error }
            : { jsonrpc: '2.0', id, result: outcome.result },
        )
      } catch (error) {
        send({
          jsonrpc: '2.0',
          id,
          error: { code: ERROR_CODES.internal, message: error instanceof Error ? error.message : String(error) },
        })
      } finally {
        if (isRequestId(id)) inFlight.delete(id)
      }
    })())
  }

  await Promise.allSettled(pending)
}
