/**
 * The subset of the OpenAI chat-completion wire format the shim reads.
 *
 * Only `delta.tool_calls[]` matters: the collision is a repeated `index` on
 * entries that carry distinct `id`s. Everything else in a chunk is passed
 * through untouched, so these types stay deliberately narrow.
 *
 * @module dsh-opendesign-toolcall-shim/wire/chunk
 */
/**
 * Read the tool-call deltas out of one chunk.
 * @param chunk - the parsed SSE payload.
 * @returns the deltas, or an empty array when the chunk carries none.
 */
export function toolCallDeltasOf(chunk) {
    const calls = chunk.choices?.[0]?.delta?.tool_calls;
    return Array.isArray(calls) ? calls : [];
}
/**
 * The call id a delta names, when it names one.
 * @param call - one delta entry.
 * @returns the id, or `undefined` for a continuation delta.
 */
export function idOf(call) {
    return typeof call.id === 'string' && call.id.length > 0 ? call.id : undefined;
}
/**
 * The stream index a delta names, when it names a usable one.
 * @param call - one delta entry.
 * @returns the index, or `undefined` when absent or not a safe integer.
 */
export function indexOf(call) {
    return typeof call.index === 'number' && Number.isSafeInteger(call.index) ? call.index : undefined;
}
