/**
 * Making a damaged argument string parseable again.
 *
 * A cut-off stream leaves an unclosed value (`{"path":"/tmp/x","content":"unf`),
 * and a gateway that truncates mid-token leaves a dangling member
 * (`{"a":1,"b": tru`). Both are recoverable: closing the containers and dropping
 * the member that never finished yields an object holding the fields that did
 * arrive, which the model can correct from on its next step.
 *
 * The moves are tried in order of confidence and the first one that parses
 * wins. The result is never authoritative — the caller treats it as a hint —
 * and nothing here throws, which is what lets a provider quirk stay a
 * recoverable event instead of a fatal one.
 *
 * @module dsh-opendesign-toolcall-shim/json/repair
 */
import { walkJson } from './scan.js';
import { parseJsonObject } from './values.js';
/** Escape a raw control character the way JSON requires inside a string. */
function escapeControl(char) {
    switch (char) {
        case '\b': return '\\b';
        case '\f': return '\\f';
        case '\n': return '\\n';
        case '\r': return '\\r';
        case '\t': return '\\t';
        default: return `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`;
    }
}
/**
 * Walk the text and report the open-container stack plus string state at its
 * end, escaping raw control characters inside strings as it goes.
 *
 * A model that emits a literal newline inside a string produces text that is
 * structurally fine but not valid JSON; escaping it here means the repair
 * attempts do not each have to.
 * @param text - the candidate argument text.
 * @returns the normalized text and the structural state at its end.
 */
function scanState(text) {
    const open = [];
    let normalized = '';
    const cursor = walkJson(text, (step) => {
        if (step.role === 'container-open')
            open.push(step.char === '{' ? '}' : ']');
        else if (step.role === 'container-close') {
            if (open.at(-1) === step.char)
                open.pop();
        }
        // Inside a string, a raw control character must be escaped to parse.
        const code = step.char.codePointAt(0) ?? 0;
        normalized += step.role === 'string-body' && code <= 0x1f ? escapeControl(step.char) : step.char;
    });
    return { normalized, open, inString: cursor.inString };
}
/**
 * Drop the longest trailing run of characters that cannot end a JSON value, so
 * `{"a":1},` and `{"a":1} ` both become `{"a":1}`.
 * @param text - normalized text that failed to parse.
 * @returns the trimmed text, or `undefined` when nothing is left.
 */
function trimTrailingGarbage(text) {
    let end = text.length;
    while (end > 0) {
        const char = text[end - 1];
        if (char === undefined)
            break;
        if (char === '}' || char === ']' || char === '"' || /[0-9a-z]/.test(char))
            break;
        end -= 1;
    }
    const trimmed = text.slice(0, end);
    return trimmed.length === 0 ? undefined : trimmed;
}
/**
 * Offset of the last comma that sits directly inside the outermost container,
 * used to cut an object back to its last complete member.
 * @param text - normalized text.
 * @returns the comma offset, or `undefined` when there is none.
 */
function lastTopLevelComma(text) {
    let found;
    walkJson(text, (step) => {
        if (step.role === 'plain' && step.char === ',' && step.depthBefore === 1)
            found = step.index;
    });
    return found;
}
/**
 * Build the candidate repairs for one text, in the order they should be tried.
 * @param normalized - the text with control characters escaped.
 * @returns the candidates, most confident first.
 */
function repairAttempts(normalized, original) {
    const attempts = [];
    // A raw control character inside a string is structurally complete but not
    // valid JSON, so escaping it is a repair in its own right.
    if (normalized !== original) {
        attempts.push({ repair: 'escaped-control-characters', candidate: normalized });
    }
    const trimmed = trimTrailingGarbage(normalized);
    if (trimmed !== undefined && trimmed !== normalized) {
        attempts.push({ repair: 'trailing-garbage', candidate: trimmed });
    }
    const state = scanState(normalized);
    if (state.open.length === 0 && !state.inString)
        return attempts;
    // Close what is still open. A dangling string is closed first, because its
    // contents are part of the value the model was writing.
    const closed = `${normalized}${state.inString ? '"' : ''}${[...state.open].reverse().join('')}`;
    attempts.push({ repair: state.inString ? 'truncated-string' : 'closed-open-containers', candidate: closed });
    // A cut mid-token (`{"a": tru`) cannot be closed by punctuation alone;
    // dropping the incomplete member is the remaining move. Both cuts are tried
    // because only one of them leaves a well-formed member behind.
    const lastComma = lastTopLevelComma(closed);
    if (lastComma !== undefined) {
        const head = closed.slice(0, lastComma);
        const headState = scanState(head);
        attempts.push({ repair: 'truncated-token', candidate: `${head}${[...headState.open].reverse().join('')}` });
        const outer = closed.indexOf('{');
        if (outer !== -1)
            attempts.push({ repair: 'truncated-token', candidate: `{${closed.slice(lastComma + 1)}` });
    }
    return attempts;
}
/**
 * Try to make one parseable JSON object out of truncated or slightly damaged
 * tool arguments.
 *
 * The moves are tried in order of confidence and the first one that parses
 * wins: drop trailing garbage, close open containers (and a dangling string),
 * or — as the last resort — keep only the last complete member of the outermost
 * object. The result is never authoritative: the caller treats it as a hint the
 * model can correct from.
 * @param text - the raw argument string.
 * @returns the repaired value, or `undefined` when no move parses.
 */
export function repairPartialJson(text) {
    if (text.trim().length === 0)
        return undefined;
    const normalized = scanState(text).normalized;
    for (const attempt of repairAttempts(normalized, text)) {
        const value = parseJsonObject(attempt.candidate);
        if (value !== undefined)
            return { text: attempt.candidate, value, repair: attempt.repair };
    }
    return undefined;
}
