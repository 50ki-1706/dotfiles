import { assertSafePath, run, validateSelection, authorizeHeadRecovery, type Permission } from './runner.ts';
import { lstat, mkdtemp, mkdir, rm, readFile, writeFile, open, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export type RepositoryState = {
  root: string;
  branch: string;
  head: string;
  status: string[];
};

export async function inspectRepository(cwd: string, permission: Permission, signal?: AbortSignal): Promise<RepositoryState> {
  const git = (args: string[]) => run(cwd, 'git', args, permission, { signal });
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

async function preview<T>(cwd: string, permission: Permission, untracked: string[], signal: AbortSignal | undefined, action: (state: RepositoryState, env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  if (!Array.isArray(untracked) || new Set(untracked).size !== untracked.length) throw new Error('Invalid untracked paths');
  const state = await inspectRepository(cwd, permission, signal);
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
  const paths = state.status.map((entry) => entry.slice(3));
  if (paths.length) {
    const attrs = (await run(state.root, 'git', ['check-attr', '-z', 'diff', 'merge', '--', ...paths], permission, { signal })).split('\0');
    for (let i = 2; i < attrs.length; i += 3) {
      if (attrs[i] !== 'unspecified') throw new Error('Custom diff or merge attributes are unsupported');
    }
  }
  await mkdir('/private/tmp/opencode', { recursive: true });
  const dir = await mkdtemp('/private/tmp/opencode/publish-index-');
  const env = { GIT_INDEX_FILE: join(dir, 'index') };
  try {
    await run(state.root, 'git', ['read-tree', state.head], permission, { env, signal });
    if (untracked.length) await run(state.root, 'git', ['add', '-N', '--', ...untracked], permission, { env, signal });
    return await action(state, env);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function inspectHunks(cwd: string, permission: Permission, untracked: string[] = [], signal?: AbortSignal): Promise<{ state: RepositoryState; hunks: string; stagedDiff: string }> {
  return preview(cwd, permission, untracked, signal, async (state, env) => {
    const stagedDiff = await run(state.root, 'git', ['-c', 'diff.external=', 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--no-renames'], permission, { signal });
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
  return preview(cwd, permission, untracked, signal, async (state, env) => {
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
    if (!(await lstat(indexPath)).isFile()) throw new Error('Unsupported index file');
    const original = await readFile(indexPath);
    const flags = await realGit(['ls-files', '-v', '-z']);
    if (flags.split('\0').filter(Boolean).some((entry) => !entry.startsWith('H '))) throw new Error('Unsupported index flags');
    for (const args of [['diff', '--raw', '-z', '--find-renames', state.head], ['diff', '--raw', '-z', '--find-renames', '--cached', state.head]]) {
      const raw = await realGit(args);
      for (const part of raw.split('\0')) {
        if (!part.startsWith(':')) continue;
        const match = part.match(/^:(\d+) (\d+) [a-f0-9]+ [a-f0-9]+ ([A-Z])/);
        if (!match || !['M', 'A', 'D'].includes(match[3]) || [match[1], match[2]].some((mode) => mode !== '000000' && mode !== '100644' && mode !== '100755') || (match[1] !== '000000' && match[2] !== '000000' && match[1] !== match[2])) throw new Error('Unsupported rename, type or mode change');
      }
    }
    for (const args of [['diff', '--numstat', '-z', state.head], ['diff', '--numstat', '-z', '--cached', state.head]]) {
      if ((await realGit(args)).split('\0').some((line) => /^-\t-\t/.test(line))) throw new Error('Binary changes are unsupported');
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
    const originalIndex = `${env.GIT_INDEX_FILE}.original`;
    await writeFile(originalIndex, original);
    const indexEnv = { GIT_INDEX_FILE: originalIndex };
    const originalTree = (await git(['write-tree'], indexEnv)).trim();
    const range = ids[0].split(':');
    const stageArgs = range.length === 2 ? ['stage', range[0], '--lines', range[1]] : ['stage', ...ids];
    await run(state.root, 'git-surgeon', stageArgs, permission, { env, signal });
    const candidate = (await git(['write-tree'])).trim();
    const originalCommit = (await git(['commit-tree', originalTree, '-p', state.head, '-m', 'index snapshot'])).trim();
    const candidateCommit = (await git(['commit-tree', candidate, '-p', state.head, '-m', 'candidate snapshot'])).trim();
    const merged = (await git(['merge-tree', '--write-tree', '--merge-base', state.head, originalCommit, candidateCommit])).trim().split('\n')[0];
    if (!/^[a-f0-9]{40,64}$/.test(merged)) throw new Error('Index reconciliation failed');
    await git(['read-tree', merged], indexEnv);
    await git(['read-tree', state.head]);
    if (untracked.length) await git(['add', '-N', '--', ...untracked]);
    await permission('shell', [`git-surgeon commit ${ids.join(' ')} -m '${message.replaceAll("'", "'\\''")}'`]);
    const recoverHead = await authorizeHeadRecovery(state.root, permission);
    const lockPath = `${indexPath}.lock`;
    const lock = await open(lockPath, 'wx', 0o666);
    let sha: string | undefined;
    let attempted = false;
    let ownsLock = true;
    let installed = false;
    try {
      const now = await inspectRepository(state.root, permission, signal);
      if (now.head !== state.head || now.branch !== state.branch || JSON.stringify(now.status) !== JSON.stringify(state.status) || !(await readFile(indexPath)).equals(original) || await fingerprint() !== worktreeHash) throw new Error('Repository changed before commit');
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
      const after = await inspectRepository(state.root, permission, signal);
      const known = new Set(state.status.map((entry) => entry.slice(3)));
      if (after.status.some((entry) => !known.has(entry.slice(3)))) throw new Error('New worktree changes after commit');
      if (parent !== state.head || tree !== candidate || actualMessage !== message || currentBranch !== state.branch || !(await readFile(indexPath)).equals(original) || await fingerprint() !== worktreeHash) throw new Error('Post-commit validation failed');
      if ((await realGit(['rev-parse', '--verify', 'HEAD'])).trim() !== sha) throw new Error('HEAD changed after commit');
      await lock.writeFile(await readFile(originalIndex));
      await lock.close();
      await rename(lockPath, indexPath);
      ownsLock = false;
      installed = true;
      return { sha, message, state: await inspectRepository(state.root, permission, signal) };
    } catch (error) {
      if (attempted) {
        const failure = new Error(`Commit ${sha ? `created (${sha})` : 'status uncertain'}; index ${installed ? 'installed' : 'not installed'}: ${String(error)}`);
        Object.assign(failure, { createdSha: sha ?? null, indexInstalled: installed, commitStatus: sha ? 'created' : 'uncertain' });
        throw failure;
      }
      throw error;
    } finally {
      await lock.close().catch(() => {});
      if (ownsLock) await rm(lockPath, { force: true });
    }
  });
}
