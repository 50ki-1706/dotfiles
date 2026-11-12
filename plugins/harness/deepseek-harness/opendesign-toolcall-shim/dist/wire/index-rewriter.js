/**
 * Reassigning colliding tool-call indexes on the wire.
 *
 * pi-ai resolves `delta.tool_calls[]` through `index` first (see
 * `openai-completions.js`'s `ensureToolCallBlock`), so two calls the gateway
 * labels with the same index (nexu-io/open-design#9369) are merged before any
 * harness code sees them. The only place the two calls are still
 * distinguishable is the wire itself: each delta carries its own `id`.
 *
 * The rewriter therefore assigns every call id a stream index that no other
 * call in the response uses, and follows that call on later frames. pi-ai then
 * assembles the calls the way the provider should have labelled them, and
 * everything downstream — including pi-ai's own `toolcall_start`/`toolcall_end`
 * events — is correct.
 *
 * State is per response, because indexes are only meaningful within one
 * completion.
 *
 * @module dsh-opendesign-toolcall-shim/wire/index-rewriter
 */
import { idOf, indexOf, toolCallDeltasOf } from './chunk.js';
/** The index assignment for one response. */
export class ToolCallIndexRewriter {
    /** Provider index → the call id currently occupying it. */
    occupied = new Map();
    /** Call id → the index this rewriter assigned it. */
    assigned = new Map();
    /** Next index to hand out for a colliding call. */
    nextIndex = 0;
    /** What this pass changed. */
    stats = { rewrittenFrames: 0, reassignedCalls: 0 };
    /**
     * Rewrite one parsed chunk in place.
     * @param chunk - the parsed SSE payload.
     * @returns true when the chunk was modified.
     */
    rewrite(chunk) {
        const calls = toolCallDeltasOf(chunk);
        if (calls.length === 0)
            return false;
        let modified = false;
        for (const call of calls) {
            if (this.rewriteCall(call))
                modified = true;
        }
        if (modified)
            this.stats.rewrittenFrames += 1;
        return modified;
    }
    /**
     * Rewrite one delta entry in place.
     * @param call - the delta entry.
     * @returns true when its index was changed.
     */
    rewriteCall(call) {
        const id = idOf(call);
        const index = indexOf(call);
        if (id === undefined) {
            // An id-less delta is a continuation of whichever call owns its index.
            if (index !== undefined) {
                const owner = this.occupied.get(index);
                if (owner !== undefined)
                    this.assigned.set(owner, index);
            }
            return false;
        }
        const known = this.assigned.get(id);
        if (known !== undefined) {
            // A continuation of a call already placed: make sure this frame names
            // the index that call actually occupies.
            if (call.index === known)
                return false;
            call.index = known;
            return true;
        }
        // A new call. Its own index is usable only when no other call holds it.
        const owner = index === undefined ? undefined : this.occupied.get(index);
        const target = index !== undefined && owner === undefined ? index : this.freeIndex();
        this.assigned.set(id, target);
        this.occupied.set(target, id);
        this.nextIndex = Math.max(this.nextIndex, target + 1);
        if (target === index)
            return false;
        call.index = target;
        this.stats.reassignedCalls += 1;
        return true;
    }
    /** The lowest index no call occupies. */
    freeIndex() {
        let candidate = this.nextIndex;
        while (this.occupied.has(candidate))
            candidate += 1;
        return candidate;
    }
}
