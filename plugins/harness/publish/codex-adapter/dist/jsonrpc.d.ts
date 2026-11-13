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
/** One JSON-RPC request or notification. */
export interface JsonRpcMessage {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: unknown;
}
/** A JSON-RPC error object. */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
/** Standard JSON-RPC error codes used by this server. */
export declare const ERROR_CODES: {
    readonly methodNotFound: -32601;
    readonly invalidParams: -32602;
    readonly internal: -32603;
};
/** A handler result: a JSON value, or an error to report. */
export type HandlerResult = {
    result: unknown;
} | {
    error: JsonRpcError;
};
/** Request handlers keyed by method name. */
export type Handlers = Record<string, (params: unknown) => Promise<HandlerResult> | HandlerResult>;
/**
 * Serve JSON-RPC over a readable/writable pair until the input closes.
 * @param handlers - method handlers; an unlisted method answers `Method not found`.
 * @param input - readable byte stream carrying newline-delimited JSON.
 * @param output - writable byte stream receiving newline-delimited JSON.
 * @returns after the input stream closes.
 */
export declare function serve(handlers: Handlers, input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<void>;
