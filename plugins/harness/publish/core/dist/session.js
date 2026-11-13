export const SESSION_NOT_BOUND = 'Run /publish first';
export const SESSION_REPLACED = 'Publish session replaced';
export const BINDING_CHANGED = 'Repository binding changed; rerun /publish';
export function createAdmission() {
    let admit;
    let reject;
    const promise = new Promise((resolve, fail) => {
        admit = resolve;
        reject = fail;
    });
    // The command reports its own failure; avoid an unhandled rejection here.
    promise.catch(() => { });
    return { promise, admit, reject };
}
/**
 * Session bindings, command generations, and per-repository serialization.
 *
 * Tool calls resolve through `bind`, which waits for command admission and
 * re-checks that a newer `/publish` did not replace the binding.
 */
export class PublishSessions {
    #entries = new Map();
    #generations = new Map();
    #locks = new Map();
    /** Drop the previous binding and start a new command generation. */
    begin(sessionID) {
        this.#entries.delete(sessionID);
        const generation = {};
        this.#generations.set(sessionID, generation);
        return { isCurrent: () => this.#generations.get(sessionID) === generation };
    }
    install(sessionID, entry) {
        this.#entries.set(sessionID, entry);
    }
    isActive(sessionID, entry) {
        return this.#entries.get(sessionID) === entry;
    }
    assertActive(call, entry) {
        if (!this.isActive(call.sessionID, entry))
            throw new Error(SESSION_REPLACED);
    }
    /** Drop the binding only while `entry` still owns it. */
    release(sessionID, entry) {
        if (this.isActive(sessionID, entry))
            this.#entries.delete(sessionID);
    }
    /** Resolve the admitted entry for a tool call. */
    async bind(call) {
        const entry = this.#entries.get(call.sessionID);
        if (!entry)
            throw new Error(SESSION_NOT_BOUND);
        await entry.admission;
        if (!this.isActive(call.sessionID, entry))
            throw new Error(SESSION_REPLACED);
        return entry;
    }
    /** Run `action` while holding the repository lock for `root`. */
    async serialize(root, action) {
        const previous = this.#locks.get(root) ?? Promise.resolve();
        let release;
        const next = new Promise((resolve) => {
            release = resolve;
        });
        this.#locks.set(root, next);
        await previous;
        try {
            return await action();
        }
        finally {
            release();
            if (this.#locks.get(root) === next)
                this.#locks.delete(root);
        }
    }
    clear() {
        this.#entries.clear();
        this.#generations.clear();
    }
}
/** Require a freshly observed repository state to match the bound session. */
export function assertSameBinding(entry, state) {
    if (state.root !== entry.state.root || state.branch !== entry.state.branch || state.head !== entry.state.head) {
        throw new Error(BINDING_CHANGED);
    }
}
