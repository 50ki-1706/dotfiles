import { type Permission } from './runner.ts';
/** Index bytes together with their whole-second modification time. */
export type IndexSnapshot = {
    bytes: Buffer;
    mtimeSeconds: number;
};
/**
 * Capture index bytes with their whole-second, floored modification time.
 *
 * The handle, the path, and the inode are all compared before and after the
 * read, so a concurrently written or replaced index is never adopted.
 */
export declare function readIndexSnapshot(path: string): Promise<IndexSnapshot>;
/** Write index bytes and restore their conservative, floored modification time. */
export declare function writeIndexSnapshot(path: string, snapshot: IndexSnapshot): Promise<void>;
export type RepositoryState = {
    root: string;
    branch: string;
    head: string;
    /** `git status --porcelain=v1 -z` entries; each starts with its two-letter code. */
    status: string[];
};
/** Inspect a checkout and return its root, branch, HEAD, and status. */
export declare function inspectRepository(cwd: string, permission: Permission, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<RepositoryState>;
/** Preview the hunks that the staged and worktree combination would introduce. */
export declare function inspectHunks(cwd: string, permission: Permission, untracked?: string[], signal?: AbortSignal): Promise<{
    state: RepositoryState;
    hunks: string;
    stagedDiff: string;
}>;
/** Render one hunk exactly as the preview numbered it. */
export declare function showHunk(cwd: string, id: string, permission: Permission, untracked?: string[], signal?: AbortSignal): Promise<string>;
/**
 * Commit selected hunks from the worktree into a verified commit.
 *
 * Hunks are staged into a disposable index, reconciled with the caller's staged
 * content, and only installed as the real index after the commit and its checks
 * succeed. A failure therefore leaves the caller's staged state untouched.
 */
export declare function commitHunks(cwd: string, ids: string[], message: string, permission: Permission, untracked?: string[], signal?: AbortSignal): Promise<{
    sha: string;
    message: string;
    state: RepositoryState;
}>;
