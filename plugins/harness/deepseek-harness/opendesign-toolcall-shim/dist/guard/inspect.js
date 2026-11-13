/**
 * Deciding what to do with one call's arguments.
 *
 * The agent loop's `parseArguments()` keeps malformed argument text as a
 * string, so a damaged call reaches the tool body and its schema validation
 * reports `INVALID_ARGS` — the turn survives. That is already the tolerant
 * policy; this decision exists for the two shapes where a *correct* call can be
 * recovered instead of merely reported:
 *
 * 1. **Concatenated objects** — the gateway's index collision
 *    (nexu-io/open-design#9369) makes a client append two argument documents.
 *    Splitting them and dispatching the first call's arguments means the work
 *    the model asked for still happens.
 * 2. **Truncated objects** — a cut-off stream leaves an unclosed value.
 *    Closing it means the tool sees the fields that did arrive.
 *
 * Anything else is left untouched: the tool reports `INVALID_ARGS` and the
 * model corrects itself on the next step.
 *
 * @module dsh-opendesign-toolcall-shim/guard/inspect
 */
import { parseJsonObject, repairPartialJson, splitConcatenatedJson } from "../json/index.js";
/**
 * Decide what to do with one call's arguments.
 *
 * A call whose arguments already parse is untouched — the guard must never
 * change a well-formed call. A concatenation is split and the first object is
 * dispatched, because the first call is the one this tool call id belongs to
 * and the remaining objects were the collision's other calls. A truncated value
 * is repaired only when the repair is a complete object.
 * @param args - the parsed-or-raw argument value the tool batch produced.
 * @returns the guard outcome.
 */
export function inspectArguments(args) {
    // A parsed object is what the tool batch produces for valid arguments; a
    // string is the malformed text it preserves for diagnostics.
    if (typeof args !== 'string')
        return { kind: 'untouched' };
    if (parseJsonObject(args) !== undefined)
        return { kind: 'untouched' };
    const split = splitConcatenatedJson(args);
    if (split !== undefined && split.length > 1) {
        const [first] = split;
        if (first !== undefined) {
            return { kind: 'split', arguments: first.value, count: split.length, ignored: split.length - 1 };
        }
    }
    const repaired = repairPartialJson(args);
    if (repaired !== undefined) {
        return { kind: 'repaired', arguments: repaired.value, repair: repaired.repair };
    }
    return { kind: 'untouched' };
}
/**
 * The model-facing note appended to a recovered call, so the recovery is
 * visible.
 * @param outcome - the guard outcome.
 * @returns the note, or `undefined` when nothing was recovered.
 */
export function recoveryNote(outcome) {
    switch (outcome.kind) {
        case 'untouched':
            return undefined;
        case 'split':
            return `The tool arguments arrived as ${outcome.count} concatenated JSON objects (the provider reused a tool-call index);`
                + ` this call used the first object and ${outcome.ignored} further call(s) were not dispatched.`;
        case 'repaired':
            return `The tool arguments were truncated or malformed and were repaired (${outcome.repair});`
                + ' re-issue the call if the recovered fields are not what you intended.';
    }
}
