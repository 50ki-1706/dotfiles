import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseTemplate, type Template } from './template.ts';
import { assertSafePath, run, type Permission } from './runner.ts';

/** Discover one unambiguous GitHub pull request template within the repository. */
export async function discoverTemplate(root: string, permission: Permission): Promise<Template> {
  const candidates: string[] = [];
  await permission('read', [root]);
  const canonicalRoot = await realpath(root);
  const rootInfo = await lstat(canonicalRoot);
  const same = (a: { dev: number; ino: number }, b: { dev: number; ino: number }) => a.dev === b.dev && a.ino === b.ino;
  const discovered = new Map<string, Awaited<ReturnType<typeof lstat>>>();
  const stat = async (relative: string) => {
    const path = join(root, relative);
    await permission('read', [path]);
    try {
      const entry = await lstat(path);
      if (entry.isSymbolicLink()) throw new Error(`Symlink in template discovery: ${relative}`);
      discovered.set(relative, entry);
      return entry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  };
  for (const parent of ['', '.github', 'docs']) {
    if (parent) {
      const entry = await stat(parent);
      if (!entry) continue;
      if (!entry.isDirectory()) throw new Error(`Invalid template directory: ${parent}`);
    }
    await permission('read', [join(root, parent)]);
    const names = await readdir(join(root, parent));
    for (const name of ['PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md']) {
      if (!names.includes(name)) continue;
      const relative = parent ? `${parent}/${name}` : name;
      const entry = await stat(relative);
      if (entry) {
        if (!entry.isFile()) throw new Error(`Invalid template: ${relative}`);
        candidates.push(relative);
      }
    }
    for (const name of ['PULL_REQUEST_TEMPLATE', 'pull_request_template']) {
      if (!names.includes(name)) continue;
      const relative = parent ? `${parent}/${name}` : name;
      const entry = await stat(relative);
      if (!entry) continue;
      if (!entry.isDirectory()) throw new Error(`Invalid template directory: ${relative}`);
      await permission('read', [join(root, relative)]);
      for (const child of await readdir(join(root, relative))) {
        if (!child.toLowerCase().endsWith('.md')) continue;
        const path = `${relative}/${child}`;
        assertSafePath(path);
        const file = await stat(path);
        if (!file?.isFile()) throw new Error(`Invalid template: ${path}`);
        candidates.push(path);
      }
    }
  }
  if (candidates.length > 1) throw new Error('Ambiguous pull request templates');
  const path = candidates[0];
  if (!path) return parseTemplate(null, '');
  const parts = path.split('/');
  const parents = [canonicalRoot];
  for (let i = 1; i < parts.length; i++) parents.push(join(canonicalRoot, ...parts.slice(0, i)));
  const identities = await Promise.all(parents.map(async (parent) => {
    await permission('read', [parent]);
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Template parent is not a directory');
    const original = parent === canonicalRoot ? rootInfo : discovered.get(relative(canonicalRoot, parent));
    if (!original || !same(original, info)) throw new Error('Template parent changed');
    const real = await realpath(parent);
    const within = relative(canonicalRoot, real);
    if (within.startsWith('..') || resolve(canonicalRoot, within) !== real) throw new Error('Template parent escapes repository');
    return { info, real };
  }));
  if (!same(rootInfo, identities[0].info)) throw new Error('Repository directory changed');
  const filePath = join(canonicalRoot, path);
  await permission('read', [filePath]);
  const before = await lstat(filePath);
  const original = discovered.get(path);
  if (!before.isFile() || before.isSymbolicLink() || !original || !same(original, before)) throw new Error('Invalid or replaced template file');
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const check = async () => {
      const current = await lstat(filePath);
      const opened = await file.stat();
      if (!current.isFile() || current.isSymbolicLink() || !same(before, current) || !same(before, opened)
        || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs)
        throw new Error('Template file changed');
      for (let i = 0; i < parents.length; i++) {
        const currentParent = await lstat(parents[i]);
        if (!currentParent.isDirectory() || currentParent.isSymbolicLink() || !same(identities[i].info, currentParent)
          || await realpath(parents[i]) !== identities[i].real) throw new Error('Template parent changed');
      }
      if (await realpath(dirname(filePath)) !== identities[identities.length - 1].real) throw new Error('Template parent changed');
    };
    await check();
    const source = await file.readFile('utf8');
    await check();
    return parseTemplate(path, source);
  } finally { await file.close(); }
}

type Runner = typeof run;
type Expected = { branch: string; head: string };
type PublishRequest = { title?: string; body?: string };
type PublishResult = { push: 'pushed' | 'already-up-to-date'; prUrl?: string };

const shaPattern = /^[0-9a-f]{40,64}$/;
const conventional = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?: \S[^\r\n]*$/;

/** Publish a clean, bound branch. The caller must serialize repository mutations and validate PR content first. */
export async function publishBranch(
  root: string, expected: Expected, mode: 'main' | 'pr', request: PublishRequest,
  permission: Permission, runner: Runner = run, signal?: AbortSignal,
): Promise<PublishResult> {
  if (mode !== 'main' && mode !== 'pr') throw new Error('Invalid publish mode');
  if (!shaPattern.test(expected.head) || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(expected.branch)
    || expected.branch.includes('..') || expected.branch.includes('//') || expected.branch.endsWith('/')
    || expected.branch.endsWith('.') || expected.branch.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock')))
    throw new Error('Unsafe expected branch or HEAD');
  if ((mode === 'main') !== (expected.branch === 'main')) throw new Error('Branch does not match publish mode');
  if (mode === 'pr' && (typeof request.title !== 'string' || !request.title.trim() || /[\r\n]/.test(request.title)
    || typeof request.body !== 'string' || !request.body.trim())) throw new Error('PR title and body are required');
  const command = (exe: 'git' | 'gh', args: string[]) => runner(root, exe, args, permission, { signal });
  const git = (args: string[]) => command('git', args);
  const ref = `refs/heads/${expected.branch}`;
  const checkState = async () => {
    const actualRoot = (await git(['rev-parse', '--show-toplevel'])).trim();
    const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
    const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
    const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
    if (resolve(actualRoot) !== resolve(root) || branch !== expected.branch || head !== expected.head || status)
      throw new Error('Repository root, branch, HEAD, or clean state changed');
    for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      const path = (await git(['rev-parse', '--git-path', name])).trim();
      await permission('read', [resolve(root, path)]);
      try { await lstat(resolve(root, path)); throw new Error(`Git operation in progress: ${name}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };
  await checkState();
  await git(['check-ref-format', '--branch', expected.branch]);
  const fetchUrls = (await git(['remote', 'get-url', '--all', 'origin'])).trim().split('\n');
  const pushUrls = (await git(['remote', 'get-url', '--push', '--all', 'origin'])).trim().split('\n');
  if (fetchUrls.length !== 1 || pushUrls.length !== 1 || !fetchUrls[0] || fetchUrls[0] !== pushUrls[0])
    throw new Error('Origin fetch and push URLs are ambiguous or differ');
  let repo: string | undefined;
  let owner: string | undefined;
  if (mode === 'pr') {
    const match = fetchUrls[0].match(/^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
    if (!match) throw new Error('Origin must identify one GitHub repository');
    owner = match[1]; repo = `${owner}/${match[2]}`;
  }
  const remoteSha = async (remoteRef: string) => {
    const output = (await git(['ls-remote', '--refs', 'origin', remoteRef])).trim();
    if (!output) return undefined;
    const lines = output.split('\n');
    const fields = lines[0].split(/\s+/);
    if (lines.length !== 1 || fields.length !== 2 || !shaPattern.test(fields[0]) || fields[1] !== remoteRef)
      throw new Error('Unexpected remote ref response');
    return fields[0];
  };
  const base = await remoteSha('refs/heads/main');
  if (!base) throw new Error('origin/main does not exist');
  await git(['fetch', '--no-tags', 'origin', 'refs/heads/main']);
  if ((await git(['rev-parse', '--verify', 'FETCH_HEAD'])).trim() !== base) throw new Error('origin/main changed during fetch');
  await git(['merge-base', '--is-ancestor', base, expected.head]);
  const subjects = (await git(['log', '--format=%s', `${base}..${expected.head}`])).trim();
  if (subjects && subjects.split('\n').some((subject) => !conventional.test(subject))) throw new Error('Non-conventional outgoing commit');
  if (mode === 'pr' && !subjects) throw new Error('No outgoing commits');
  await git(['diff', '--stat', base, expected.head, '--']);
  const remote = mode === 'main' ? base : await remoteSha(ref);
  if (remote && remote !== expected.head) {
    await git(['fetch', '--no-tags', 'origin', ref]);
    if ((await git(['rev-parse', '--verify', 'FETCH_HEAD'])).trim() !== remote) throw new Error('Remote branch changed during fetch');
    await git(['merge-base', '--is-ancestor', remote, expected.head]);
  }
  type Pull = { url: string; baseRefName: string; headRefName: string; headRepositoryOwner: { login: string } };
  const findPull = async (): Promise<string | undefined> => {
    const raw = await command('gh', ['pr', 'list', '--repo', repo!, '--state', 'open', '--head', expected.branch, '--limit', '100', '--json', 'url,baseRefName,headRefName,headRepositoryOwner']);
    const pulls: unknown = JSON.parse(raw);
    if (!Array.isArray(pulls) || pulls.length >= 100 || pulls.length > 1) throw new Error('Ambiguous open pull requests');
    if (!pulls.length) return undefined;
    const pull = pulls[0] as Pull;
    if (pull.baseRefName !== 'main' || pull.headRefName !== expected.branch || pull.headRepositoryOwner?.login?.toLowerCase() !== owner!.toLowerCase()
      || typeof pull.url !== 'string' || !pull.url.toLowerCase().startsWith(`https://github.com/${repo!.toLowerCase()}/pull/`)
      || !/\/pull\/\d+$/.test(pull.url)) throw new Error('Open pull request does not match origin, head, or base');
    return pull.url;
  };
  const existing = mode === 'pr' ? await findPull() : undefined;
  await checkState();
  if ((await remoteSha('refs/heads/main')) !== base) throw new Error('origin/main changed before push');
  if ((await remoteSha(ref)) !== remote) throw new Error('Remote branch changed before push');
  let push: PublishResult['push'] = 'already-up-to-date';
  if (remote !== expected.head) {
    await git(['push', '--no-follow-tags', 'origin', `HEAD:${ref}`]);
    push = 'pushed';
  }
  try {
    await checkState();
    if ((await remoteSha(ref)) !== expected.head) throw new Error('remote verification failed');
    if (mode === 'pr' && (await remoteSha('refs/heads/main')) !== base) throw new Error('origin/main changed');
  } catch (error) {
    throw new Error(`Push ${push}; post-push verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (mode === 'main') return { push };
  if (existing) return { push, prUrl: existing };
  try {
    await checkState();
    if ((await remoteSha(ref)) !== expected.head) throw new Error('Remote branch changed before PR creation');
    if ((await remoteSha('refs/heads/main')) !== base) throw new Error('origin/main changed before PR creation');
    const nowExisting = await findPull();
    if (nowExisting) return { push, prUrl: nowExisting };
  } catch (error) {
    throw new Error(`Push ${push}; PR preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const created = (await command('gh', ['pr', 'create', '--repo', repo!, '--base', 'main', '--head', expected.branch, '--title', request.title!, '--body', request.body!])).trim();
    if (!created.toLowerCase().startsWith(`https://github.com/${repo!.toLowerCase()}/pull/`) || !/\/pull\/\d+$/.test(created)) throw new Error('Unexpected PR creation response');
    return { push, prUrl: created };
  } catch (error) {
    try {
      const recovered = await findPull();
      if (recovered) return { push, prUrl: recovered };
    } catch { /* Preserve the original failure and push status. */ }
    throw new Error(`Push ${push}; PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
