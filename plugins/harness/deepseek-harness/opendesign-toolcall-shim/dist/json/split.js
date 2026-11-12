/**
 * Splitting a run of JSON values that were appended into one argument string.
 *
 * The opendesign gateway intermittently hands two parallel tool calls the same
 * `index` (nexu-io/open-design#9369). A client that assembles by index appends
 * both argument strings into one field, producing `{"a":1}{"b":2}`. The tool
 * layer then sees one call whose arguments are two documents, and the turn
 * fails on a strict parse.
 *
 * This module answers the narrow question the recovery needs: *is this string a
 * concatenation of complete JSON objects, and if so where does each one end?*
 * It answers `undefined` for anything that is not exactly that, so a genuinely
 * broken argument string is never mistaken for a concatenation.
 *
 * @module dsh-opendesign-toolcall-shim/json/split
 */
import { isWhitespace, walkJson } from './scan.js';
import { parseJsonObject } from './values.js';
/**
 * Scan for the end offsets of consecutive complete JSON values.
 *
 * A value ends when container depth returns to zero after having opened. A `}`
 * or `]` inside a string literal is skipped, so `{"a":"x}y"}` is one value.
 * Anything after a boundary (whitespace aside) begins the next value.
 * @param text - the concatenated argument string.
 * @returns the exclusive end offset of each complete value, in order. A
 *   trailing incomplete value contributes no offset.
 */
export function jsonValueBoundaries(text) {
    const boundaries = [];
    let started = false;
    walkJson(text, (step) => {
        switch (step.role) {
            case 'container-open':
            case 'string-open':
                started = true;
                return;
            case 'container-close':
                // A closer with nothing open means the text is not JSON at all.
                if (step.depthBefore === 0)
                    return false;
                // Depth 1 before the closer means this one ends the outermost container.
                if (step.depthBefore === 1 && started) {
                    boundaries.push(step.index + 1);
                    started = false;
                }
                return;
            case 'plain':
                if (started && step.depthBefore === 0 && !isWhitespace(step.char)) {
                    // A scalar (number, true/false/null) ends at the first structural or
                    // whitespace character; tool arguments are objects, so stop scanning.
                    return false;
                }
                return;
            default:
                return;
        }
    });
    return boundaries;
}
/**
 * Split a concatenation of complete JSON objects into its values.
 *
 * Returns `undefined` unless every segment parses as a JSON object on its own,
 * so a genuinely broken string is never mistaken for a concatenation.
 * @param text - the argument string a client assembled by appending deltas.
 * @returns one entry per recovered object (two or more), or `undefined`.
 */
export function splitConcatenatedJson(text) {
    if (parseJsonObject(text) !== undefined)
        return undefined;
    const boundaries = jsonValueBoundaries(text);
    if (boundaries.length < 2)
        return undefined;
    const values = [];
    let start = 0;
    for (const end of boundaries) {
        const segment = text.slice(start, end).trim();
        const value = parseJsonObject(segment);
        if (value === undefined)
            return undefined;
        values.push({ text: segment, value });
        start = end;
    }
    // Trailing text that is not a complete value means this is not a clean
    // concatenation, and the repair path should decide instead.
    if (text.slice(start).trim().length > 0)
        return undefined;
    return values;
}
