import { spawn } from 'node:child_process';
/**
 * Files that must never be published, matched against every path segment.
 *
 * Covers environment files, private keys and certificates (including the
 * Java/Windows keystore formats), SSH keys of every algorithm, credential
 * files for the common clouds and package registries, and service-account
 * JSON. The list is deliberately broad: an untracked file that matches is
 * refused rather than published, and the user can still commit it by hand.
 */
const SENSITIVE_SEGMENT = new RegExp('^(?:'
    + String.raw `\.env(?!\.example$).*`
    + String.raw `|.*\.(?:key|pem|p12|pfx|jks|keystore)`
    + String.raw `|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?`
    + String.raw `|\.npmrc|\.netrc|\.pypirc|\.pgpass`
    + String.raw `|credentials(?:\.json)?`
    + String.raw `|service-account.*\.json`
    + ')$', 'i');
const MAX_OUTPUT_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * Timeout for commands that wait on the network.
 *
 * A push, fetch, or `gh` call can legitimately take far longer than a local
 * git command, and killing one halfway leaves the push state `unknown`. The
 * longer budget keeps a slow link from being mistaken for a failure.
 */
const NETWORK_TIMEOUT_MS = 120_000;
/** Executables whose every invocation talks to a remote. */
const NETWORK_EXECUTABLES = new Set(['gh']);
/** git subcommands that talk to a remote. */
const NETWORK_GIT_SUBCOMMANDS = new Set(['push', 'fetch', 'ls-remote', 'clone', 'pull']);
/** Whether one invocation may wait on the network. */
function isNetworkCommand(executable, args) {
    if (NETWORK_EXECUTABLES.has(executable))
        return true;
    if (executable !== 'git')
        return false;
    return args.some((argument) => NETWORK_GIT_SUBCOMMANDS.has(argument));
}
/**
 * Environment inherited by git and gh.
 *
 * Repository-selecting `GIT_*` variables are dropped so a caller cannot redirect
 * the repository, while prompts, optional locks, replacement objects, and pathspec
 * magic are pinned to values the workflow can reason about.
 */
function commandEnvironment(extra) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    return Object.assign(inherited, extra, {
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_LITERAL_PATHSPECS: '1',
    });
}
/** Reject paths that are absolute, empty-segmented, or sensitive. */
export function assertSafePath(path) {
    const invalid = !path
        || path.includes('\0')
        || path.startsWith('/')
        || path.startsWith('-')
        || path.split('/').some((part) => !part || part === '.' || part === '..' || SENSITIVE_SEGMENT.test(part));
    if (invalid)
        throw new Error('Sensitive or invalid path');
}
/**
 * Run one executable in its own process group and collect bounded output.
 *
 * The process group is killed on abort, timeout, or output overflow, so a
 * wrapper command cannot leave children holding the repository.
 */
function execute(cwd, executable, args, options = {}) {
    if (args.some((arg) => arg.includes('\0')))
        throw new Error('Invalid argument');
    if (process.platform === 'win32')
        throw new Error('Publish requires POSIX process groups');
    if (options.signal?.aborted)
        throw new Error('Command aborted');
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd,
            env: commandEnvironment(options.env),
            shell: false,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let failure;
        let outputBytes = 0;
        const killProcessGroup = (error) => {
            failure ??= error;
            if (!child.pid)
                return;
            try {
                process.kill(-child.pid, 'SIGKILL');
            }
            catch (signalError) {
                if (signalError.code !== 'ESRCH') {
                    failure = new AggregateError([failure, signalError], `${failure.message}; failed to signal process group: ${String(signalError)}`);
                }
            }
        };
        const abort = () => killProcessGroup(new Error('Command aborted'));
        const timeout = options.timeout
            ?? (isNetworkCommand(executable, args) ? NETWORK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
        const timer = setTimeout(() => killProcessGroup(new Error(`${executable} timed out`)), timeout);
        options.signal?.addEventListener('abort', abort, { once: true });
        const collect = (which, chunk) => {
            if (failure)
                return;
            outputBytes += chunk.length;
            if (outputBytes > MAX_OUTPUT_BYTES) {
                killProcessGroup(new Error(`${executable} exceeded output limit`));
                return;
            }
            if (which === 'stdout')
                stdout += chunk.toString();
            else
                stderr += chunk.toString();
        };
        child.stdout.on('data', (chunk) => collect('stdout', chunk));
        child.stderr.on('data', (chunk) => collect('stderr', chunk));
        child.once('error', (error) => {
            failure ??= error;
        });
        child.once('close', (code) => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
            if (failure)
                reject(failure);
            else if (code !== 0)
                reject(new Error(`${executable} exited ${code}: ${stderr}`));
            else
                resolve(stdout);
        });
    });
}
/** Quote an argument so the permission resource reads like the executed command. */
function quoteArgument(argument) {
    return /^[a-zA-Z0-9_./:=+,-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`;
}
/** Tag an error with whether the command reached the runtime boundary. */
function tagCommandStarted(error, commandStarted) {
    const target = error instanceof Error && Object.isExtensible(error)
        ? error
        : new Error(String(error), { cause: error });
    return Object.assign(target, { commandStarted });
}
/**
 * Ask permission, then run the command without a shell.
 *
 * `commandStarted` distinguishes a denial (the command never ran) from a
 * launched command whose failure status is therefore uncertain.
 */
export async function run(cwd, executable, args, permission, options = {}) {
    let commandStarted = false;
    try {
        await permission('shell', [[executable, ...args].map(quoteArgument).join(' ')]);
        commandStarted = true;
        return await execute(cwd, executable, args, options);
    }
    catch (error) {
        throw tagCommandStarted(error, commandStarted);
    }
}
/**
 * Obtain a one-shot HEAD recovery closure for a commit whose outcome may be
 * uncertain. The permission is requested before any mutation starts.
 */
export async function authorizeHeadRecovery(cwd, permission) {
    await permission('shell', ['git rev-parse --verify HEAD']);
    return () => execute(cwd, 'git', ['rev-parse', '--verify', 'HEAD']);
}
const HUNK_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?::[1-9]\d*-[1-9]\d*)?$/;
const LINE_RANGE = /^[1-9]\d*-[1-9]\d*$/;
const CONVENTIONAL_COMMIT = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?: \S[^\r\n]*$/;
/**
 * Validate a hunk selection: each ID is a base ID or one base ID plus a line
 * range, and no base ID repeats because the same hunk cannot be staged twice.
 */
export function validateSelection(ids, message) {
    const invalidIds = !Array.isArray(ids)
        || !ids.length
        || ids.some((id) => typeof id !== 'string' || !HUNK_ID.test(id));
    if (invalidIds)
        throw new Error('Invalid hunk selection');
    const seen = new Set();
    for (const id of ids) {
        const [base = '', range] = id.split(':');
        if (seen.has(base))
            throw new Error('Duplicate hunk');
        seen.add(base);
        if (!range)
            continue;
        if (!LINE_RANGE.test(range))
            throw new Error('Invalid line range');
        const [start, end] = range.split('-').map(Number);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start ?? 0) > (end ?? 0)) {
            throw new Error('Invalid line range');
        }
    }
    if (typeof message !== 'string' || !CONVENTIONAL_COMMIT.test(message)) {
        throw new Error('Invalid conventional commit message');
    }
}
