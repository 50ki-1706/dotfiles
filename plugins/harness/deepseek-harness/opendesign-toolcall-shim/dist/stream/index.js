/**
 * Id-keyed assembly of streamed tool calls.
 *
 * pi-ai assembles `delta.tool_calls[]` by `index` first and only falls back to
 * `id`, so two calls the gateway labels with the same index
 * (nexu-io/open-design#9369) are merged into one call whose arguments are the
 * two JSON documents appended together. The wire rewrite in `wire/` removes
 * that collision before pi-ai sees it; this layer is the second line of defence
 * and the one that owns the harness stream protocol.
 *
 * - {@link ToolCallTracker} owns call identity and argument accumulation.
 * - {@link IdKeyedToolCallAssembler} folds pi-ai events into harness chunks.
 * - `terminal.ts` maps usage and finish reasons, never throwing for malformed
 *   completed arguments (deepseek-ai/deepseek-harness#7581).
 *
 * @module dsh-opendesign-toolcall-shim/stream
 */
export { IdKeyedToolCallAssembler, assembleStream, isCompleteJsonObject } from "./assembler.js";
export { ToolCallTracker, idOfCall } from "./calls.js";
export { mapStopReason, mapUsage } from "./terminal.js";
