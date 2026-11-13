import { type Template } from './template.ts';
import { run, type Permission } from './runner.ts';
import { type RepositoryState } from './transaction.ts';
/** Discover one unambiguous GitHub pull request template within the repository. */
export declare function discoverTemplate(root: string, permission: Permission): Promise<Template>;
type Runner = typeof run;
type Expected = {
    branch: string;
    head: string;
};
type PublishRequest = {
    title?: string | undefined;
    body?: string | undefined;
};
export type PublishState = {
    phase: string;
    push: 'not-attempted' | 'pushed' | 'already-up-to-date' | 'unknown';
    remoteVerified: boolean;
    pr: 'not-attempted' | 'absent' | 'known' | 'unknown';
    prUrl?: string;
    outgoingCommitCount: number | null;
    base?: string;
    head: string;
};
/** Retry bookkeeping that survives one publish attempt. */
export type PublishRetry = {
    createUncertain?: boolean;
};
/** Publish failure carrying the state reached before it stopped. */
export declare class PublishError extends Error {
    state: PublishState;
    constructor(message: string, state: PublishState, cause: unknown);
}
/** Synchronization failure recording whether the merge may have started. */
export declare class SyncError extends Error {
    attempted: boolean;
    observed: RepositoryState | null;
    constructor(message: string, attempted: boolean, observed: RepositoryState | null, cause: unknown);
}
/** Fast-forward a clean, bound checkout after approval. */
export declare function syncMain(root: string, expected: Expected, targetHead: string, permission: Permission, signal?: AbortSignal): Promise<{
    before: {
        root: string;
        branch: string;
        head: string;
    };
    state: RepositoryState;
}>;
/**
 * Publish a clean, bound branch.
 *
 * The caller must serialize repository mutations and validate pull request
 * content first. Every state transition is recorded so a partial failure can
 * be reported and retried without duplicating effects.
 */
export declare function publishBranch(root: string, expected: Expected, mode: 'main' | 'pr', request: PublishRequest, permission: Permission, runner?: Runner, signal?: AbortSignal, retry?: PublishRetry): Promise<PublishState>;
export {};
