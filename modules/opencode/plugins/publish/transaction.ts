import { assertSafePath, run, validateSelection, authorizeHeadRecovery, type Permission } from './runner.ts';
import { lstat, mkdtemp, mkdir, rm, readFile, writeFile, open, rename, utimes } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export type IndexSnapshot = { bytes: Buffer; mtimeSeconds: number };

function validateIndexTimestamp(seconds: number): void {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > Math.floor((Date.now() + 1000) / 1000))
    throw new Error('Unsupported index timestamp');
}

/** Capture index bytes with their whole-second, floored modification time. */
export async function readIndexSnapshot(path: string): Promise<IndexSnapshot> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new Error('Unsupported index file');
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    const same = (a: typeof before, b: typeof before) => a.isFile() && b.isFile()
      && a.dev === b.dev && a.ino === b.ino && a.size === b.size
      && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
    if (!same(before, after) || !same(before, current) || BigInt(bytes.length) !== before.size)
      throw new Error('Index snapshot changed during read');
    // A newer copy can disable Git's racy-index content checks.
    const seconds = before.mtimeNs / 1000000000n;
    const mtimeSeconds = Number(seconds);
    validateIndexTimestamp(mtimeSeconds);
    if (before.mtimeNs > BigInt(Date.now() + 1000) * 1000000n) throw new Error('Unsupported index timestamp');
    return { bytes, mtimeSeconds };
  } catch (error) {
    if (error instanceof Error && ['Unsupported index timestamp', 'Unsupported index file'].includes(error.message)) throw error;
    throw new Error('Index snapshot changed during read');
  } finally { await file?.close(); }
}

export async function writeIndexSnapshot(path: string, snapshot: IndexSnapshot): Promise<void> {
  validateIndexTimestamp(snapshot.mtimeSeconds);
  try {
    await writeFile(path, snapshot.bytes);
    // utimes requires an access time; Git's index checks depend on modification time.
    await utimes(path, snapshot.mtimeSeconds, snapshot.mtimeSeconds);
  } catch { throw new Error('Index snapshot write failed'); }
}

export type RepositoryState = {
  root: string;
  branch: string;
  head: string;
  status: string[];
};

export async function inspectRepository(cwd: string, permission: Permission, signal?: AbortSignal, env?: NodeJS.ProcessEnv): Promise<RepositoryState> {
  const git = (args: string[]) => run(cwd, 'git', args, permission, { signal, env });
  const root = (await git(['rev-parse', '--show-toplevel'])).trim();
  await permission('read', [root]);
  const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
  const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
  if (!/^[0-9a-f]{40,64}$/.test(head) || !branch || branch.startsWith('-')) throw new Error('Unsafe repository state');
  const raw = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  const status = raw.split('\0').filter(Boolean);
  for (const entry of status) {
    if (entry.length < 4 || entry[2] !== ' ') throw new Error('Unexpected git status');
    const code = entry.slice(0, 2);
    if (code.includes('U') || code === 'AA' || code === 'DD') throw new Error('Unmerged index');
    assertSafePath(entry.slice(3));
  }
  return { root, branch, head, status };
}

async function preview<T>(cwd: string, permission: Permission, untracked: string[], signal: AbortSignal | undefined, action: (state: RepositoryState, env: NodeJS.ProcessEnv, snapshot: NodeJS.ProcessEnv, initialize: () => Promise<void>, initialIndex: IndexSnapshot) => Promise<T>): Promise<T> {
  if (!Array.isArray(untracked) || new Set(untracked).size !== untracked.length) throw new Error('Invalid untracked paths');
  await mkdir('/private/tmp/opencode', { recursive: true });
  const dir = await mkdtemp('/private/tmp/opencode/publish-index-');
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
    for (const entry of state.status) {
      const path = entry.slice(3);
      assertSafePath(path);
      let current = state.root;
      for (const segment of path.split('/')) {
        current = join(current, segment);
        const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (info?.isSymbolicLink()) throw new Error('Symlinks are unsupported');
      }
    }
    for (const path of untracked) {
      assertSafePath(path);
      if (!state.status.includes(`?? ${path}`)) throw new Error('Path is not an untracked file');
    }
    await permission('read', state.status.map((entry) => join(state.root, entry.slice(3))));
    const stagedAdds = state.status.filter((entry) => entry[0] === 'A').map((entry) => entry.slice(3));
    if (stagedAdds.length) {
      const entries = (await run(state.root, 'git', ['ls-files', '--stage', '-z', '--', ...stagedAdds], permission, { env: snapshot, signal })).split('\0').filter(Boolean);
      if (entries.some((entry) => !/^100(644|755) [a-f0-9]+ 0\t/.test(entry))) throw new Error('Unsupported file type');
      const stats = await run(state.root, 'git', ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--numstat', '-z', state.head, '--', ...stagedAdds], permission, { env: snapshot, signal });
      if (stats.split('\0').some((line) => /^-\t-\t/.test(line))) throw new Error('Binary changes are unsupported');
    }
    const intentPaths = [...stagedAdds, ...untracked];
    for (const path of intentPaths) {
      const file = await open(join(state.root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await file.stat()).isFile()) throw new Error('Unsupported file type');
        if ((await file.readFile()).includes(0)) throw new Error('Binary changes are unsupported');
      } finally { await file.close(); }
    }
    const paths = state.status.map((entry) => entry.slice(3));
    if (paths.length) {
      const attrs = (await run(state.root, 'git', ['check-attr', '-z', 'diff', 'merge', '--', ...paths], permission, { signal })).split('\0');
      for (let i = 2; i < attrs.length; i += 3) {
        if (attrs[i] !== 'unspecified') throw new Error('Custom diff or merge attributes are unsupported');
      }
    }
    const initialize = async () => {
      await run(state.root, 'git', ['read-tree', state.head], permission, { env, signal });
      if (intentPaths.length) await run(state.root, 'git', ['add', '-N', '--', ...intentPaths], permission, { env, signal });
    };
    await initialize();
    return await action(state, env, snapshot, initialize, initialIndex);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function inspectHunks(cwd: string, permission: Permission, untracked: string[] = [], signal?: AbortSignal): Promise<{ state: RepositoryState; hunks: string; stagedDiff: string }> {
  return preview(cwd, permission, untracked, signal, async (state, env, snapshot) => {
    const stagedDiff = await run(state.root, 'git', ['-c', 'diff.external=', 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--no-renames'], permission, { env: snapshot, signal });
    const hunks = await run(state.root, 'git-surgeon', ['hunks', '--full'], permission, { env, signal });
    return { state, hunks, stagedDiff };
  });
}

export async function showHunk(cwd: string, id: string, permission: Permission, untracked: string[] = [], signal?: AbortSignal): Promise<string> {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('Invalid hunk ID');
  return preview(cwd, permission, untracked, signal, (state, env) => run(state.root, 'git-surgeon', ['show', id], permission, { env, signal }));
}

export async function commitHunks(cwd: string, ids: string[], message: string, permission: Permission, untracked: string[] = [], signal?: AbortSignal): Promise<{ sha: string; message: string; state: RepositoryState }> {
  validateSelection(ids, message);
  if (ids.some((id) => id.includes(':')) && ids.length !== 1) throw new Error('Line ranges require one hunk');
  return preview(cwd, permission, untracked, signal, async (state, env, _snapshot, initialize, initialIndex) => {
    const git = (args: string[], index = env) => run(state.root, 'git', args, permission, { env: index, signal });
    const realGit = (args: string[]) => run(state.root, 'git', args, permission, { signal });
    const indexPath = resolve(state.root, (await realGit(['rev-parse', '--git-path', 'index'])).trim());
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      const path = resolve(state.root, (await realGit(['rev-parse', '--git-path', name])).trim());
      const exists = await lstat(path).then(() => true, (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      if (exists) throw new Error('Git operation in progress');
    }
    await permission('read', [indexPath]);
    const original = await readIndexSnapshot(indexPath);
    if (!original.bytes.equals(initialIndex.bytes)) throw Object.assign(new Error('Repository changed before commit: indexBytes'), { mismatches: ['indexBytes'] });
    const originalIndex = `${env.GIT_INDEX_FILE}.original`;
    await writeIndexSnapshot(originalIndex, original);
    const indexEnv = { GIT_INDEX_FILE: originalIndex };
    const validationEnv = { GIT_INDEX_FILE: `${env.GIT_INDEX_FILE}.validation` };
    await writeIndexSnapshot(validationEnv.GIT_INDEX_FILE, original);
    const flags = await git(['ls-files', '-v', '-z'], validationEnv);
    if (flags.split('\0').filter(Boolean).some((entry) => !entry.startsWith('H '))) throw new Error('Unsupported index flags');
    for (const args of [['diff', '--raw', '-z', '--find-renames', state.head], ['diff', '--raw', '-z', '--find-renames', '--cached', state.head]]) {
      const raw = await git(args, validationEnv);
      for (const part of raw.split('\0')) {
        if (!part.startsWith(':')) continue;
        const match = part.match(/^:(\d+) (\d+) [a-f0-9]+ [a-f0-9]+ ([A-Z])/);
        if (!match || !['M', 'A', 'D'].includes(match[3]) || [match[1], match[2]].some((mode) => mode !== '000000' && mode !== '100644' && mode !== '100755') || (match[1] !== '000000' && match[2] !== '000000' && match[1] !== match[2])) throw new Error('Unsupported rename, type or mode change');
      }
    }
    for (const args of [['diff', '--numstat', '-z', state.head], ['diff', '--numstat', '-z', '--cached', state.head]]) {
      if ((await git(args, validationEnv)).split('\0').some((line) => /^-\t-\t/.test(line))) throw new Error('Binary changes are unsupported');
    }
    const fingerprint = async () => {
      const hash = createHash('sha256');
      for (const entry of state.status) {
        const path = join(state.root, entry.slice(3));
        hash.update(entry.slice(3)).update('\0');
        try {
          let parent = state.root;
          for (const segment of entry.slice(3).split('/').slice(0, -1)) {
            parent = join(parent, segment);
            const info = await lstat(parent);
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe path parent');
          }
          const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
          let data: Buffer;
          try {
            if (!(await file.stat()).isFile()) throw new Error('Unsupported file type');
            data = await file.readFile();
          } finally { await file.close(); }
          if (data.includes(0)) throw new Error('Binary changes are unsupported');
          hash.update(data);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          hash.update('missing');
        }
        hash.update('\0');
      }
      return hash.digest('hex');
    };
    const worktreeHash = await fingerprint();
    const originalTree = (await git(['write-tree'], indexEnv)).trim();
    const range = ids[0].split(':');
    const stageArgs = range.length === 2 ? ['stage', range[0], '--lines', range[1]] : ['stage', ...ids];
    await run(state.root, 'git-surgeon', stageArgs, permission, { env, signal });
    const candidate = (await git(['write-tree'])).trim();
    const selectedPaths = new Set((await git(['diff', '--cached', '--name-only', '-z', '--no-renames', state.head])).split('\0').filter(Boolean));
    const stagedAdds = new Set(state.status.filter((entry) => entry[0] === 'A').map((entry) => entry.slice(3)));
    const mergeEnv = { GIT_INDEX_FILE: `${env.GIT_INDEX_FILE}.merge` };
    await git(['read-tree', candidate], mergeEnv);
    // Reconcile a new file using its original staged blob, not an add/add merge
    // against the selected worktree version. The actual commit keeps candidate.
    for (const entry of (await git(['ls-files', '--stage', '-z'], indexEnv)).split('\0').filter(Boolean)) {
      const match = entry.match(/^(\d+) ([a-f0-9]+) 0\t([\s\S]+)$/);
      if (match && stagedAdds.has(match[3]) && selectedPaths.has(match[3])) await git(['update-index', '--add', '--cacheinfo', match[1], match[2], match[3]], mergeEnv);
    }
    const mergeCandidate = (await git(['write-tree'], mergeEnv)).trim();
    const originalCommit = (await git(['commit-tree', originalTree, '-p', state.head, '-m', 'index snapshot'])).trim();
    const candidateCommit = (await git(['commit-tree', mergeCandidate, '-p', state.head, '-m', 'candidate snapshot'])).trim();
    const merged = (await git(['merge-tree', '--write-tree', '--merge-base', state.head, originalCommit, candidateCommit])).trim().split('\n')[0];
    if (!/^[a-f0-9]{40,64}$/.test(merged)) throw new Error('Index reconciliation failed');
    // This copy becomes the reconciled index installed only after validation.
    await git(['read-tree', merged], indexEnv);
    await initialize();
    await permission('shell', [`git-surgeon commit ${ids.join(' ')} -m '${message.replaceAll("'", "'\\''")}'`]);
    const recoverHead = await authorizeHeadRecovery(state.root, permission);
    const lockPath = `${indexPath}.lock`;
    const lock = await open(lockPath, 'wx', 0o666);
    let sha: string | undefined;
    let attempted = false;
    let ownsLock = true;
    let installed = false;
    try {
      const now = await inspectRepository(state.root, permission, signal, validationEnv);
      const mismatches = [now.root !== state.root && 'root', now.head !== state.head && 'head', now.branch !== state.branch && 'branch', JSON.stringify(now.status) !== JSON.stringify(state.status) && 'status', !(await readFile(indexPath)).equals(original.bytes) && 'indexBytes', await fingerprint() !== worktreeHash && 'worktree'].filter(Boolean);
      if (mismatches.length) throw Object.assign(new Error(`Repository changed before commit: ${mismatches.join(', ')}`), { mismatches });
      try {
        attempted = true;
        await run(state.root, 'git-surgeon', ['commit', ...ids, '-m', message], permission, { env, signal });
      } finally {
        const current = (await recoverHead()).trim();
        if (current !== state.head) sha = current;
      }
      if (!sha) throw new Error('Commit was not created');
      const parent = (await realGit(['rev-parse', `${sha}^`])).trim();
      const tree = (await realGit(['rev-parse', `${sha}^{tree}`])).trim();
      const actualMessage = (await realGit(['show', '-s', '--format=%B', sha])).trimEnd();
      const currentBranch = (await realGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
      const after = await inspectRepository(state.root, permission, signal, validationEnv);
      const known = new Set(state.status.map((entry) => entry.slice(3)));
      if (after.status.some((entry) => !known.has(entry.slice(3)))) throw Object.assign(new Error('New worktree changes after commit: status'), { mismatches: ['status'] });
      const postMismatches = [after.root !== state.root && 'root', parent !== state.head && 'parent', tree !== candidate && 'tree', actualMessage !== message && 'message', currentBranch !== state.branch && 'branch', !(await readFile(indexPath)).equals(original.bytes) && 'indexBytes', await fingerprint() !== worktreeHash && 'worktree'].filter(Boolean);
      if (postMismatches.length) throw Object.assign(new Error(`Post-commit validation failed: ${postMismatches.join(', ')}`), { mismatches: postMismatches });
      if ((await realGit(['rev-parse', '--verify', 'HEAD'])).trim() !== sha) throw Object.assign(new Error('HEAD changed after commit: head'), { mismatches: ['head'] });
      await lock.writeFile(await readFile(originalIndex));
      await lock.utimes(original.mtimeSeconds, original.mtimeSeconds);
      await lock.close();
      await rename(lockPath, indexPath);
      ownsLock = false;
      installed = true;
      await writeIndexSnapshot(validationEnv.GIT_INDEX_FILE, await readIndexSnapshot(indexPath));
      return { sha, message, state: await inspectRepository(state.root, permission, signal, validationEnv) };
    } catch (error) {
      if (attempted) {
        const failure = new Error(`Commit ${sha ? `created (${sha})` : 'status uncertain'}; index ${installed ? 'installed' : 'not installed'}: ${String(error)}`);
        Object.assign(failure, { createdSha: sha ?? null, indexInstalled: installed, commitStatus: sha ? 'created' : 'uncertain', ...((error as { mismatches?: string[] }).mismatches ? { mismatches: (error as { mismatches: string[] }).mismatches } : {}) });
        throw failure;
      }
      throw error;
    } finally {
      await lock.close().catch(() => {});
      if (ownsLock) await rm(lockPath, { force: true });
    }
  });
}
