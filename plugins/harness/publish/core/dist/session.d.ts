import type { RepositoryState } from './transaction.ts';
import type { Template } from './template.ts';
import type { Commit, ToolCall } from './types.ts';
export declare const SESSION_NOT_BOUND = "Run /publish first";
export declare const SESSION_REPLACED = "Publish session replaced";
export declare const BINDING_CHANGED = "Repository binding changed; rerun /publish";
/** Proof that a `/publish` invocation is still the active generation. */
export type Generation = {
    isCurrent(): boolean;
};
/** Promise that settles when the command prompt is admitted or fails. */
export type Admission = {
    promise: Promise<void>;
    admit(): void;
    reject(error: unknown): void;
};
export declare function createAdmission(): Admission;
/** Inspection result that later show and commit calls are validated against. */
export type RepositorySnapshot = {
    state: RepositoryState;
    hunks: string;
    stagedDiff: string;
};
/** State bound to one `/publish` command invocation. */
export type SessionEntry = {
    state: RepositoryState;
    template: Template;
    untracked: string[];
    commits: Commit[];
    /** Settles once the command prompt is delivered; rejects on delivery failure. */
    admission: Promise<void>;
    snapshot?: RepositorySnapshot | undefined;
    /** Hunk base IDs already shown for the current snapshot. */
    shown: Set<string>;
    retry: {
        createUncertain?: boolean;
    };
};
/** Pending fast-forward approval the approval hook may promote to `ask`. */
export type SyncApproval = {
    call: ToolCall;
    entry: SessionEntry;
    targetHead: string;
};
export type SyncApprovals = Set<SyncApproval>;
/**
 * Session bindings, command generations, and per-repository serialization.
 *
 * Tool calls resolve through `bind`, which waits for command admission and
 * re-checks that a newer `/publish` did not replace the binding.
 */
export declare class PublishSessions {
    #private;
    /** Drop the previous binding and start a new command generation. */
    begin(sessionID: string): Generation;
    install(sessionID: string, entry: SessionEntry): void;
    isActive(sessionID: string, entry: SessionEntry): boolean;
    assertActive(call: ToolCall, entry: SessionEntry): void;
    /** Drop the binding only while `entry` still owns it. */
    release(sessionID: string, entry: SessionEntry): void;
    /** Resolve the admitted entry for a tool call. */
    bind(call: ToolCall): Promise<SessionEntry>;
    /** Run `action` while holding the repository lock for `root`. */
    serialize<T>(root: string, action: () => Promise<T>): Promise<T>;
    clear(): void;
}
/** Require a freshly observed repository state to match the bound session. */
export declare function assertSameBinding(entry: SessionEntry, state: RepositoryState): void;
