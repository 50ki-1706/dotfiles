/**
 * A minimal JSON-RPC 2.0 peer over stdio.
 *
 * The Codex adapter speaks MCP directly instead of depending on an SDK: the
 * protocol surface it needs is `initialize`, `tools/list` and `tools/call`,
 * and a dependency would have to be vendored into the Nix build for that.
 *
 * Only the subset MCP requires on the server side is implemented. Unknown
 * requests answer `Method not found`; notifications (no `id`) are ignored.
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
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const

/** A handler result: a JSON value, or an error to report. */
export type HandlerResult = { result: unknown } | { error: JsonRpcError }

/** Request handlers keyed by method name. */
export type Handlers = Record<string, (params: unknown) => Promise<HandlerResult> | HandlerResult>

/**
 * Serve JSON-RPC over a readable/writable pair until the input closes.
 * @param handlers - method handlers; an unlisted method answers `Method not found`.
 * @param input - readable byte stream carrying newline-delimited JSON.
 * @param output - writable byte stream receiving newline-delimited JSON.
 * @returns after the input stream closes.
 */
export async function serve(
  handlers: Handlers,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {
  const send = (message: unknown): void => {
    output.write(`${JSON.stringify(message)}\n`)
  }

  const lines = createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      continue
    }
    // Notifications (no id) expect no response.
    if (message.id === undefined) continue

    const handler = handlers[message.method]
    if (handler === undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: ERROR_CODES.methodNotFound, message: `Method not found: ${message.method}` },
      })
      continue
    }
    try {
      const outcome = await handler(message.params)
      send(
        'error' in outcome
          ? { jsonrpc: '2.0', id: message.id, error: outcome.error }
          : { jsonrpc: '2.0', id: message.id, result: outcome.result },
      )
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: ERROR_CODES.internal, message: error instanceof Error ? error.message : String(error) },
      })
    }
  }
}
