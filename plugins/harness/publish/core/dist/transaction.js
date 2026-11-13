import { constants } from 'node:fs';
import { lstat, mkdtemp, open, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { assertSafePath, authorizeHeadRecovery, run, validateSelection } from "./runner.js";
/** Git operations that a publish commit must not interrupt. */
const IN_PROGRESS_STATE_FILES = [
    'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD',
    'rebase-merge', 'rebase-apply', 'sequencer',
];
/** Numeric SHA-1 or SHA-256 object name. */
const OBJECT_NAME = /^[a-f0-9]{40,64}$/;
/** Raw diff header: source mode, destination mode, checksums, status letter. */
const RAW_DIFF_HEADER = /^:(\d+) (\d+) [a-f0-9]+ [a-f0-9]+ ([A-Z])/;
/** Modes a plain file may have; `000000` marks a created or deleted path. */
const PLAIN_FILE_MODE = /^(?:000000|100644|100755)$/;
/** `ls-files --stage` entry whose blob is unchanged and unstaged further. */
const UNCHANGED_BLOB_ENTRY = /^100(644|755) [a-f0-9]+ 0\t/;
/** `ls-files --stage` line captured into mode, object name, and path. */
const STAGED_INDEX_ENTRY = /^(\d+) ([a-f0-9]+) 0\t([\s\S]+)$/;
const isMissing = (error) => error.code === 'ENOENT';
const isBinaryNumstat = (line) => /^-\t-\t/.test(line);
const latestRepresentableSecond = () => Math.floor((Date.now() + 1000) / 1000);
/** Reject timestamps Git's racy-index checks cannot represent safely. */
function validateIndexTimestamp(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > latestRepresentableSecond()) {
        throw new Error('Unsupported index timestamp');
    }
}
/** True when both observations describe the same, unmodified regular file. */
function sameFileState(first, second) {
    return first.isFile()
        && second.isFile()
        && first.dev === second.dev
        && first.ino === second.ino
        && first.size === second.size
        && first.mtimeNs === second.mtimeNs
        && first.ctimeNs === second.ctimeNs;
}
/**
 * Capture index bytes with their whole-second, floored modification time.
 *
 * The handle, the path, and the inode are all compared before and after the
 * read, so a concurrently written or replaced index is never adopted.
 */
export async function readIndexSnapshot(path) {
    let file;
    try {
        file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const before = await file.stat({ bigint: true });
        if (!before.isFile())
            throw new Error('Unsupported index file');
        const bytes = await file.readFile();
        const after = await file.stat({ bigint: true });
        const current = await lstat(path, { bigint: true });
        if (!sameFileState(before, after) || !sameFileState(before, current) || BigInt(bytes.length) !== before.size) {
            throw new Error('Index snapshot changed during read');
        }
        // A newer copy can disable Git's racy-index content checks.
        const mtimeSeconds = Number(before.mtimeNs / 1000000000n);
        validateIndexTimestamp(mtimeSeconds);
        if (before.mtimeNs > BigInt(Date.now() + 1000) * 1000000n)
            throw new Error('Unsupported index timestamp');
        return { bytes, mtimeSeconds };
    }
    catch (error) {
        if (error instanceof Error
            && ['Unsupported index timestamp', 'Unsupported index file'].includes(error.message)) {
            throw error;
        }
        throw new Error('Index snapshot changed during read');
    }
    finally {
        await file?.close();
    }
}
/** Write index bytes and restore their conservative, floored modification time. */
export async function writeIndexSnapshot(path, snapshot) {
    validateIndexTimestamp(snapshot.mtimeSeconds);
    try {
        await writeFile(path, snapshot.bytes);
        // utimes requires an access time; Git's index checks depend on the modification time.
        await utimes(path, snapshot.mtimeSeconds, snapshot.mtimeSeconds);
    }
    catch {
        throw new Error('Index snapshot write failed');
    }
}
/** Reject status entries that would make a hunk selection ambiguous or unsafe. */
function parseStatusEntries(raw) {
    const status = raw.split('\0').filter(Boolean);
    for (const entry of status) {
        if (entry.length < 4 || entry[2] !== ' ')
            throw new Error('Unexpected git status');
        const code = entry.slice(0, 2);
        if (code.includes('U') || code === 'AA' || code === 'DD')
            throw new Error('Unmerged index');
        assertSafePath(entry.slice(3));
    }
    return status;
}
const changedPaths = (state) => state.status.map((entry) => entry.slice(3));
/** Staged additions are the only entries that can introduce new files. */
const stagedAdditions = (state) => state.status.filter((entry) => entry[0] === 'A').map((entry) => entry.slice(3));
/** Inspect a checkout and return its root, branch, HEAD, and status. */
export async function inspectRepository(cwd, permission, signal, env) {
    const git = (args) => run(cwd, 'git', args, permission, { signal, env });
    const root = (await git(['rev-parse', '--show-toplevel'])).trim();
    await permission('read', [root]);
    const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
    const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
    if (!OBJECT_NAME.test(head) || !branch || branch.startsWith('-'))
        throw new Error('Unsafe repository state');
    const raw = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
    return { root, branch, head, status: parseStatusEntries(raw) };
}
/** Reject symlinked parents so reads follow only the paths the checkout shows. */
async function rejectSymlinkedChangedPaths(state) {
    for (const path of changedPaths(state)) {
        let current = state.root;
        for (const segment of path.split('/')) {
            current = join(current, segment);
            const info = await lstat(current).catch((error) => {
                if (isMissing(error))
                    return null;
                throw error;
            });
            if (info?.isSymbolicLink())
                throw new Error('Symlinks are unsupported');
        }
    }
}
/** Require every opted-in path to still be an untracked file. */
function requireOptedInUntracked(state, untracked) {
    for (const path of untracked) {
        assertSafePath(path);
        if (!state.status.includes(`?? ${path}`))
            throw new Error('Path is not an untracked file');
    }
}
/** Reject staged additions that are not plain text regular files. */
async function assertStagedAdditionsSupported(state, permission, snapshotEnv, signal) {
    const added = stagedAdditions(state);
    if (!added.length)
        return;
    const entries = (await run(state.root, 'git', ['ls-files', '--stage', '-z', '--', ...added], permission, { env: snapshotEnv, signal })).split('\0').filter(Boolean);
    if (entries.some((entry) => !UNCHANGED_BLOB_ENTRY.test(entry)))
        throw new Error('Unsupported file type');
    const stats = await run(state.root, 'git', ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--numstat', '-z', state.head, '--', ...added], permission, { env: snapshotEnv, signal });
    if (stats.split('\0').some(isBinaryNumstat))
        throw new Error('Binary changes are unsupported');
}
/** Reject missing, non-regular, or binary files among newly tracked paths. */
async function assertIntentPathsSupported(state, intentPaths) {
    for (const path of intentPaths) {
        const file = await open(join(state.root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            if (!(await file.stat()).isFile())
                throw new Error('Unsupported file type');
            if ((await file.readFile()).includes(0))
                throw new Error('Binary changes are unsupported');
        }
        finally {
            await file.close();
        }
    }
}
/** Reject custom diff or merge attributes that would change hunk semantics. */
async function assertNoCustomMergeAttributes(state, permission, signal) {
    const paths = changedPaths(state);
    if (!paths.length)
        return;
    const attributes = (await run(state.root, 'git', ['check-attr', '-z', 'diff', 'merge', '--', ...paths], permission, { signal })).split('\0');
    for (let i = 2; i < attributes.length; i += 3) {
        if (attributes[i] !== 'unspecified')
            throw new Error('Custom diff or merge attributes are unsupported');
    }
}
/**
 * Run `action` against a disposable copy of the repository index.
 *
 * Reads never touch the caller's index. Symlinks, unsupported file types,
 * binary content, and custom attributes are rejected before the action runs.
 */
async function preview(cwd, permission, untracked, signal, action) {
    if (!Array.isArray(untracked) || new Set(untracked).size !== untracked.length) {
        throw new Error('Invalid untracked paths');
    }
    const dir = await mkdtemp(join(tmpdir(), 'publish-index-'));
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    const snapshot = { GIT_INDEX_FILE: join(dir, 'snapshot') };
    try {
        const root = (await run(cwd, 'git', ['rev-parse', '--show-toplevel'], permission, { signal })).trim();
        const indexPath = resolve(root, (await run(root, 'git', ['rev-parse', '--git-path', 'index'], permission, { signal })).trim());
        await permission('read', [indexPath]);
        const initialIndex = await readIndexSnapshot(indexPath);
        // Isolate Git reads: commands can internally write the index even with optional locks disabled.
        await writeIndexSnapshot(snapshot.GIT_INDEX_FILE, initialIndex);
        const state = await inspectRepository(cwd, permission, signal, snapshot);
        await rejectSymlinkedChangedPaths(state);
        requireOptedInUntracked(state, untracked);
        await permission('read', changedPaths(state).map((path) => join(state.root, path)));
        await assertStagedAdditionsSupported(state, permission, snapshot, signal);
        const intentPaths = [...stagedAdditions(state), ...untracked];
        await assertIntentPathsSupported(state, intentPaths);
        await assertNoCustomMergeAttributes(state, permission, signal);
        const initialize = async () => {
            await run(state.root, 'git', ['read-tree', state.head], permission, { env, signal });
            if (intentPaths.length) {
                await run(state.root, 'git', ['add', '-N', '--', ...intentPaths], permission, { env, signal });
            }
        };
        await initialize();
        return await action({ state, env, snapshot, initialize, initialIndex });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
}
/** Preview the hunks that the staged and worktree combination would introduce. */
export async function inspectHunks(cwd, permission, untracked = [], signal) {
    return preview(cwd, permission, untracked, signal, async ({ state, env, snapshot }) => {
        const stagedDiff = await run(state.root, 'git', ['-c', 'diff.external=', 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--no-renames'], permission, { env: snapshot, signal });
        const hunks = await run(state.root, 'git-surgeon', ['hunks', '--full'], permission, { env, signal });
        return { state, hunks, stagedDiff };
    });
}
/** Render one hunk exactly as the preview numbered it. */
export async function showHunk(cwd, id, permission, untracked = [], signal) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
        throw new Error('Invalid hunk ID');
    return preview(cwd, permission, untracked, signal, ({ state, env }) => run(state.root, 'git-surgeon', ['show', id], permission, { env, signal }));
}
/** Reject commits while another Git operation is in progress. */
async function assertNoOperationInProgress(root, git) {
    for (const name of IN_PROGRESS_STATE_FILES) {
        const path = resolve(root, (await git(['rev-parse', '--git-path', name])).trim());
        const exists = await lstat(path).then(() => true, (error) => {
            if (isMissing(error))
                return false;
            throw error;
        });
        if (exists)
            throw new Error('Git operation is in progress');
    }
}
/** Reject index flags, renames, type changes, and binary changes in a candidate index. */
async function assertCandidateIndexSupported(git, head, validationEnv) {
    const flags = await git(['ls-files', '-v', '-z'], validationEnv);
    if (flags.split('\0').filter(Boolean).some((entry) => !entry.startsWith('H '))) {
        throw new Error('Unsupported index flags');
    }
    for (const args of [
        ['diff', '--raw', '-z', '--find-renames', head],
        ['diff', '--raw', '-z', '--find-renames', '--cached', head],
    ]) {
        const raw = await git(args, validationEnv);
        for (const part of raw.split('\0')) {
            if (!part.startsWith(':'))
                continue;
            const match = part.match(RAW_DIFF_HEADER);
            const [, sourceMode = '', destinationMode = '', status = ''] = match ?? [];
            const supported = match !== null
                && ['M', 'A', 'D'].includes(status)
                && PLAIN_FILE_MODE.test(sourceMode)
                && PLAIN_FILE_MODE.test(destinationMode)
                && (sourceMode === '000000' || destinationMode === '000000' || sourceMode === destinationMode);
            if (!supported)
                throw new Error('Unsupported rename, type or mode change');
        }
    }
    for (const args of [['diff', '--numstat', '-z', head], ['diff', '--numstat', '-z', '--cached', head]]) {
        if ((await git(args, validationEnv)).split('\0').some(isBinaryNumstat)) {
            throw new Error('Binary changes are unsupported');
        }
    }
}
/** Hash every changed path's bytes so external edits become detectable. */
async function fingerprintWorktree(state) {
    const hash = createHash('sha256');
    for (const entry of state.status) {
        const path = join(state.root, entry.slice(3));
        hash.update(entry.slice(3)).update('\0');
        try {
            let parent = state.root;
            for (const segment of entry.slice(3).split('/').slice(0, -1)) {
                parent = join(parent, segment);
                const info = await lstat(parent);
                if (!info.isDirectory() || info.isSymbolicLink())
                    throw new Error('Unsafe path parent');
            }
            const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
            let data;
            try {
                if (!(await file.stat()).isFile())
                    throw new Error('Unsupported file type');
                data = await file.readFile();
            }
            finally {
                await file.close();
            }
            if (data.includes(0))
                throw new Error('Binary changes are unsupported');
            hash.update(data);
        }
        catch (error) {
            if (!isMissing(error))
                throw error;
            hash.update('missing');
        }
        hash.update('\0');
    }
    return hash.digest('hex');
}
/** Failure raised after a commit may or may not have reached the repository. */
function reportCommitInterrupted(error, sha, installed) {
    const mismatches = error.mismatches;
    throw Object.assign(new Error(`Commit ${sha ? `created (${sha})` : 'status uncertain'}; index ${installed ? 'installed' : 'not installed'}: ${String(error)}`), {
        createdSha: sha ?? null,
        indexInstalled: installed,
        commitStatus: sha ? 'created' : 'uncertain',
        ...(mismatches ? { mismatches } : {}),
    });
}
/**
 * Commit selected hunks from the worktree into a verified commit.
 *
 * Hunks are staged into a disposable index, reconciled with the caller's staged
 * content, and only installed as the real index after the commit and its checks
 * succeed. A failure therefore leaves the caller's staged state untouched.
 */
export async function commitHunks(cwd, ids, message, permission, untracked = [], signal) {
    validateSelection(ids, message);
    if (ids.some((id) => id.includes(':')) && ids.length !== 1)
        throw new Error('Line ranges require one hunk');
    return preview(cwd, permission, untracked, signal, async ({ state, env, initialize, initialIndex }) => {
        const git = (args, index = env) => run(state.root, 'git', args, permission, { env: index, signal });
        const realGit = (args) => run(state.root, 'git', args, permission, { signal });
        const indexPath = resolve(state.root, (await realGit(['rev-parse', '--git-path', 'index'])).trim());
        await assertNoOperationInProgress(state.root, realGit);
        await permission('read', [indexPath]);
        const original = await readIndexSnapshot(indexPath);
        if (!original.bytes.equals(initialIndex.bytes)) {
            throw Object.assign(new Error('Repository changed before commit: indexBytes'), { mismatches: ['indexBytes'] });
        }
        const originalEnv = { GIT_INDEX_FILE: `${env.GIT_INDEX_FILE}.original` };
        const validationEnv = { GIT_INDEX_FILE: `${env.GIT_INDEX_FILE}.validation` };
        await writeIndexSnapshot(originalEnv.GIT_INDEX_FILE, original);
        await writeIndexSnapshot(validationEnv.GIT_INDEX_FILE, original);
        await assertCandidateIndexSupported(git, state.head, validationEnv);
        const worktreeHash = await fingerprintWorktree(state);
        // 1. Stage the selection into the disposable index and reconcile it with the
        //    caller's staged content, so unselected staged changes survive the commit.
        const originalTree = (await git(['write-tree'], originalEnv)).trim();
        const [base = '', range] = (ids[0] ?? '').split(':');
        const stageArgs = range ? ['stage', base, '--lines', range] : ['stage', ...ids];
        await run(state.root, 'git-surgeon', stageArgs, permission, { env, signal });
        const candidate = (await git(['write-tree'])).trim();
        const selectedPaths = new Set((await git(['diff', '--cached', '--name-only', '-z', '--no-renames', state.head])).split('\0').filter(Boolean));
        const additions = new Set(stagedAdditions(state));
        const mergeEnv = { GIT_INDEX_FILE: `${env.GIT_INDEX_FILE}.merge` };
        await git(['read-tree', candidate], mergeEnv);
        // Reconcile a new file with its original staged blob, not an add/add merge
        // against the selected worktree version. The commit itself keeps candidate.
        for (const entry of (await git(['ls-files', '--stage', '-z'], originalEnv)).split('\0').filter(Boolean)) {
            const match = entry.match(STAGED_INDEX_ENTRY);
            const [, mode, object, path] = match ?? [];
            if (mode !== undefined && object !== undefined && path !== undefined
                && additions.has(path) && selectedPaths.has(path)) {
                await git(['update-index', '--add', '--cacheinfo', mode, object, path], mergeEnv);
            }
        }
        const mergeCandidate = (await git(['write-tree'], mergeEnv)).trim();
        const originalCommit = (await git(['commit-tree', originalTree, '-p', state.head, '-m', 'index snapshot'])).trim();
        const candidateCommit = (await git(['commit-tree', mergeCandidate, '-p', state.head, '-m', 'candidate snapshot'])).trim();
        const merged = (await git(['merge-tree', '--write-tree', '--merge-base', state.head, originalCommit, candidateCommit]))
            .trim()
            .split('\n')[0] ?? '';
        if (!OBJECT_NAME.test(merged))
            throw new Error('Index reconciliation failed');
        // This copy becomes the reconciled index, installed only after validation.
        await git(['read-tree', merged], originalEnv);
        await initialize();
        // 2. Authorize the commit and its HEAD recovery before touching the real
        //    repository, then hold the index lock while the commit runs.
        await permission('shell', [`git-surgeon commit ${ids.join(' ')} -m '${message.replaceAll("'", "'\\''")}'`]);
        const recoverHead = await authorizeHeadRecovery(state.root, permission);
        const lockPath = `${indexPath}.lock`;
        const lock = await open(lockPath, 'wx', 0o666);
        let sha;
        let attempted = false;
        let ownsLock = true;
        let installed = false;
        try {
            const current = await inspectRepository(state.root, permission, signal, validationEnv);
            const before = [
                current.root !== state.root && 'root',
                current.head !== state.head && 'head',
                current.branch !== state.branch && 'branch',
                JSON.stringify(current.status) !== JSON.stringify(state.status) && 'status',
                !(await readFile(indexPath)).equals(original.bytes) && 'indexBytes',
                (await fingerprintWorktree(state)) !== worktreeHash && 'worktree',
            ].filter((item) => Boolean(item));
            if (before.length)
                throw Object.assign(new Error(`Repository changed before commit: ${before.join(', ')}`), { mismatches: before });
            try {
                attempted = true;
                await run(state.root, 'git-surgeon', ['commit', ...ids, '-m', message], permission, { env, signal });
            }
            finally {
                const current = (await recoverHead()).trim();
                if (current !== state.head)
                    sha = current;
            }
            if (!sha)
                throw new Error('Commit was not created');
            const parent = (await realGit(['rev-parse', `${sha}^`])).trim();
            const tree = (await realGit(['rev-parse', `${sha}^{tree}`])).trim();
            const actualMessage = (await realGit(['show', '-s', '--format=%B', sha])).trimEnd();
            const currentBranch = (await realGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
            const after = await inspectRepository(state.root, permission, signal, validationEnv);
            const knownPaths = new Set(changedPaths(state));
            if (after.status.some((entry) => !knownPaths.has(entry.slice(3)))) {
                throw Object.assign(new Error('New worktree changes after commit: status'), { mismatches: ['status'] });
            }
            const post = [
                after.root !== state.root && 'root',
                parent !== state.head && 'parent',
                tree !== candidate && 'tree',
                actualMessage !== message && 'message',
                currentBranch !== state.branch && 'branch',
                !(await readFile(indexPath)).equals(original.bytes) && 'indexBytes',
                (await fingerprintWorktree(state)) !== worktreeHash && 'worktree',
            ].filter((item) => Boolean(item));
            if (post.length)
                throw Object.assign(new Error(`Post-commit validation failed: ${post.join(', ')}`), { mismatches: post });
            if ((await realGit(['rev-parse', '--verify', 'HEAD'])).trim() !== sha) {
                throw Object.assign(new Error('HEAD changed after commit: head'), { mismatches: ['head'] });
            }
            await lock.writeFile(await readFile(originalEnv.GIT_INDEX_FILE));
            await lock.utimes(original.mtimeSeconds, original.mtimeSeconds);
            await lock.close();
            await rename(lockPath, indexPath);
            ownsLock = false;
            installed = true;
            await writeIndexSnapshot(validationEnv.GIT_INDEX_FILE, await readIndexSnapshot(indexPath));
            return { sha, message, state: await inspectRepository(state.root, permission, signal, validationEnv) };
        }
        catch (error) {
            if (!attempted)
                throw error;
            return reportCommitInterrupted(error, sha, installed);
        }
        finally {
            await lock.close().catch(() => { });
            if (ownsLock)
                await rm(lockPath, { force: true });
        }
    });
}
