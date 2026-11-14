import type { RepositoryState } from './transaction.ts';
import type { Template } from './template.ts';
import type { Commit, ToolCall } from './types.ts';

export const SESSION_NOT_BOUND = 'Run /publish first';
export const SESSION_REPLACED = 'Publish session replaced';
export const BINDING_CHANGED = 'Repository binding changed; rerun /publish';

/** Proof that a `/publish` invocation is still the active generation. */
export type Generation = { isCurrent(): boolean };

/** Promise that settles when the command prompt is admitted or fails. */
export type Admission = { promise: Promise<void>; admit(): void; reject(error: unknown): void };

export function createAdmission(): Admission {
  let admit!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, fail) => {
    admit = resolve;
    reject = fail;
  });
  // The command reports its own failure; avoid an unhandled rejection here.
  promise.catch(() => {});
  return { promise, admit, reject };
}

/** Inspection result that later show and commit calls are validated against. */
export type RepositorySnapshot = { state: RepositoryState; hunks: string; stagedDiff: string };

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
  retry: { createUncertain?: boolean };
};

/** Pending fast-forward approval the approval hook may promote to `ask`. */
export type SyncApproval = { call: ToolCall; entry: SessionEntry; targetHead: string };
export type SyncApprovals = Set<SyncApproval>;

/**
 * Session bindings, command generations, and per-repository serialization.
 *
 * Tool calls resolve through `bind`, which waits for command admission and
 * re-checks that a newer `/publish` did not replace the binding.
 */
export class PublishSessions {
  readonly #entries = new Map<string, SessionEntry>();
  readonly #generations = new Map<string, object>();
  readonly #locks = new Map<string, Promise<void>>();

  /** Drop the previous binding and start a new command generation. */
  begin(sessionID: string): Generation {
    this.#entries.delete(sessionID);
    const generation = {};
    this.#generations.set(sessionID, generation);
    return { isCurrent: () => this.#generations.get(sessionID) === generation };
  }

  install(sessionID: string, entry: SessionEntry): void {
    this.#entries.set(sessionID, entry);
  }

  isActive(sessionID: string, entry: SessionEntry): boolean {
    return this.#entries.get(sessionID) === entry;
  }

  assertActive(call: ToolCall, entry: SessionEntry): void {
    if (!this.isActive(call.sessionID, entry)) throw new Error(SESSION_REPLACED);
  }

  /** Drop the binding only while `entry` still owns it. */
  release(sessionID: string, entry: SessionEntry): void {
    if (this.isActive(sessionID, entry)) this.#entries.delete(sessionID);
  }

  /** Resolve the admitted entry for a tool call. */
  async bind(call: ToolCall): Promise<SessionEntry> {
    const entry = this.#entries.get(call.sessionID);
    if (!entry) throw new Error(SESSION_NOT_BOUND);
    await entry.admission;
    if (!this.isActive(call.sessionID, entry)) throw new Error(SESSION_REPLACED);
    return entry;
  }

  /** Run `action` while holding the repository lock for `root`. */
  async serialize<T>(root: string, action: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(root) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#locks.set(root, next);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.#locks.get(root) === next) this.#locks.delete(root);
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#generations.clear();
  }
}

/** Require a freshly observed repository state to match the bound session. */
export function assertSameBinding(entry: SessionEntry, state: RepositoryState): void {
  if (state.root !== entry.state.root || state.branch !== entry.state.branch || state.head !== entry.state.head) {
    throw new Error(BINDING_CHANGED);
  }
}
