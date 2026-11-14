/** Ask the runtime for permission; rejects when the user or policy denies it. */
export type Permission = (action: 'shell' | 'read' | 'edit' | 'external_directory', resources: string[]) => Promise<void>;
export type Executable = 'git' | 'git-surgeon' | 'gh';
export type RunOptions = {
    signal?: AbortSignal | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    timeout?: number | undefined;
};
/** Reject paths that are absolute, empty-segmented, or sensitive. */
export declare function assertSafePath(path: string): void;
/**
 * Ask permission, then run the command without a shell.
 *
 * `commandStarted` distinguishes a denial (the command never ran) from a
 * launched command whose failure status is therefore uncertain.
 */
export declare function run(cwd: string, executable: Executable, args: string[], permission: Permission, options?: RunOptions): Promise<string>;
/**
 * Obtain a one-shot HEAD recovery closure for a commit whose outcome may be
 * uncertain. The permission is requested before any mutation starts.
 */
export declare function authorizeHeadRecovery(cwd: string, permission: Permission): Promise<() => Promise<string>>;
/**
 * Validate a hunk selection: each ID is a base ID or one base ID plus a line
 * range, and no base ID repeats because the same hunk cannot be staged twice.
 */
export declare function validateSelection(ids: unknown, message: unknown): asserts ids is string[];
