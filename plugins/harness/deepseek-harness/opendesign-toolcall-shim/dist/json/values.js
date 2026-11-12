/**
 * The JSON value shapes the shim treats as tool arguments, plus the two
 * predicates everything else in `json/` is built on.
 *
 * Tool arguments are always a single JSON object. Anything else — an array, a
 * scalar, a concatenation of objects — is not arguments and must be handled by
 * the recovery moves rather than passed through.
 *
 * @module dsh-opendesign-toolcall-shim/json/values
 */
/**
 * Whether a parsed value is a plain JSON object usable as tool arguments.
 * @param value - any parsed JSON value.
 * @returns true for a non-null, non-array object.
 */
export function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Parse one complete JSON object without any repair.
 * @param text - the candidate argument string.
 * @returns the parsed object, or `undefined` when the text is not exactly one object.
 */
export function parseJsonObject(text) {
    if (text.trim().length === 0)
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    return isJsonObject(parsed) ? parsed : undefined;
}
