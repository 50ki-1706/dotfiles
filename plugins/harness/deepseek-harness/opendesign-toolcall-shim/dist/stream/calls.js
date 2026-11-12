/**
 * Tracking the tool calls in one pi-ai event stream, keyed by id.
 *
 * pi-ai assembles `delta.tool_calls[]` by `index` first and only falls back to
 * `id`, so two calls the gateway labels with the same index
 * (nexu-io/open-design#9369) are merged into one call whose arguments are the
 * two JSON documents appended together. The wire rewrite in `wire/` removes
 * that collision before pi-ai sees it; this tracker is the second line of
 * defence: a delta is matched to a call by its `id` whenever one is available,
 * and `index` is only an ordering hint for deltas that carry no id at all.
 *
 * The tracker owns identity and argument accumulation. It emits nothing; the
 * assembler turns its state into harness chunks.
 *
 * @module dsh-opendesign-toolcall-shim/stream/calls
 */
/**
 * The set of tool calls in flight for one response.
 *
 * Two indexes are kept because the provider names a call two ways: by `id` on
 * the deltas, and by `index` on the frames pi-ai resolves. Both must reach the
 * same call, so both are registered when a call is created.
 */
export class ToolCallTracker {
    calls = [];
    byId = new Map();
    bySlot = new Map();
    nextBlockIndex = 0;
    /** Every call, in the order it was first observed. */
    get all() {
        return this.calls;
    }
    /** The most recently observed call, or `undefined` when none exists yet. */
    get last() {
        return this.calls.at(-1);
    }
    /**
     * Resolve the call one delta belongs to, creating it when it is new.
     *
     * The provider id wins whenever the delta carries one: a repeated id is a
     * continuation, and a fresh id is a new call even when its index collides
     * with a call already in flight. Only an id-less delta falls back to the
     * stream index, which is all such a delta has.
     * @param id - the provider id, or `''` when the delta named none.
     * @param name - the tool name, or `''` when the delta named none.
     * @param streamIndex - the provider stream index, when it named one.
     * @returns the call the delta belongs to.
     */
    resolve(id, name, streamIndex) {
        if (id.length > 0) {
            const existing = this.byId.get(id);
            if (existing !== undefined) {
                this.adopt(existing, name, streamIndex);
                return existing;
            }
            return this.create(id, name, streamIndex);
        }
        const bySlot = streamIndex === undefined ? undefined : this.bySlot.get(streamIndex);
        if (bySlot !== undefined) {
            this.adopt(bySlot, name, streamIndex);
            return bySlot;
        }
        return this.create('', name, streamIndex);
    }
    /**
     * Find the call a pi-ai content index refers to.
     *
     * pi-ai resolves content indexes through its own block list, so the partial's
     * block is the authority; the index is used only when the partial no longer
     * carries the call's identity.
     * @param contentIndex - the content index pi-ai reported.
     * @param partial - the partial message carrying that block.
     * @param preferSlot - true for a delta, which continues whichever call
     *   currently occupies the index it names.
     * @returns the call the index refers to.
     */
    atContentIndex(contentIndex, partial, preferSlot = false) {
        const block = partial.content[contentIndex];
        const bySlot = this.bySlot.get(contentIndex);
        // A delta continues whichever call currently occupies the index it names;
        // pi-ai resolves that index against its own block list before it emits the
        // event, so the slot is the delta's real target.
        if (preferSlot && bySlot !== undefined)
            return bySlot;
        const named = block?.type === 'toolCall' && block.id.length > 0 ? this.byId.get(block.id) : undefined;
        if (named !== undefined)
            return named;
        if (bySlot !== undefined)
            return bySlot;
        if (block?.type === 'toolCall' && block.id.length > 0) {
            // The partial names a call this tracker has not opened (a provider that
            // repeats an index across calls): open it rather than guessing.
            return this.create(block.id, block.name, contentIndex);
        }
        // Neither identity is available. Attribute to the most recently opened
        // call, which is the one a streaming delta belongs to.
        const last = this.last;
        if (last !== undefined)
            return last;
        return this.create(block?.type === 'toolCall' ? block.id : '', block?.type === 'toolCall' ? block.name : '', contentIndex);
    }
    /** Let a later delta fill in a name or index the first one did not carry. */
    adopt(call, name, streamIndex) {
        if (call.name.length === 0 && name.length > 0)
            call.name = name;
        if (streamIndex !== undefined && call.streamIndex === undefined) {
            call.streamIndex = streamIndex;
            this.bySlot.set(streamIndex, call);
        }
    }
    /** Create a pending call and register the identities this delta named. */
    create(id, name, streamIndex) {
        const call = {
            id,
            name,
            argumentsText: '',
            blockIndex: this.nextBlockIndex,
            streamIndex,
            started: false,
            closed: false,
        };
        this.nextBlockIndex += 1;
        this.calls.push(call);
        if (id.length > 0)
            this.byId.set(id, call);
        if (streamIndex !== undefined)
            this.bySlot.set(streamIndex, call);
        return call;
    }
}
/**
 * The call id to report, synthesizing one when the provider never named it.
 * @param call - the pending call.
 * @returns the provider id, or a stable synthesized id.
 */
export function idOfCall(call) {
    return call.id.length > 0 ? call.id : `call-${call.blockIndex}`;
}
