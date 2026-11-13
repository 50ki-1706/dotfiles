/**
 * Tolerant JSON handling for model-produced tool-call arguments.
 *
 * The opendesign gateway intermittently hands two parallel tool calls the same
 * `index` (nexu-io/open-design#9369). Clients that assemble by index append
 * both argument strings into one field, producing `{"a":1}{"b":2}`. This layer
 * owns the two recovery moves the shim needs:
 *
 * - {@link splitConcatenatedJson} — split a run of complete JSON values that
 *   were appended together, honouring string escapes so a `}` inside a string
 *   never splits.
 * - {@link repairPartialJson} — close a truncated value so a cut-off stream
 *   still yields something the model can correct from.
 *
 * Nothing here throws: every entry point returns a result or `undefined`, which
 * is what lets the callers keep a turn alive instead of turning a provider
 * quirk into a fatal error.
 *
 * The layer is pure — no harness types, no I/O — so it is the easiest part of
 * the shim to keep once the shim itself is gone.
 *
 * @module dsh-opendesign-toolcall-shim/json
 */
export { describeInvalidArguments } from "./diagnose.js";
export { repairPartialJson } from "./repair.js";
export { isWhitespace, walkJson } from "./scan.js";
export { jsonValueBoundaries, splitConcatenatedJson } from "./split.js";
export { isJsonObject, parseJsonObject } from "./values.js";
