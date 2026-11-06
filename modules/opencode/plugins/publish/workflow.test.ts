import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverTemplate, publishBranch } from './workflow.ts';
import type { run } from './runner.ts';

test('discovers a single template and fingerprints current bytes', async () => {
  const root = await mkdtemp('/private/tmp/opencode/publish-template-');
  const reads: string[] = [];
  const permission = async (action: string, resources: string[]) => { assert.equal(action, 'read'); reads.push(...resources); };
  try {
    const absent = await discoverTemplate(root, permission);
    assert.equal(absent.path, null);
    await mkdir(join(root, '.github'));
    await writeFile(join(root, '.github', 'pull_request_template.md'), '## Test\n');
    const found = await discoverTemplate(root, permission);
    assert.equal(found.path, '.github/pull_request_template.md');
    assert.notEqual(found.fingerprint, absent.fingerprint);
    assert.ok(reads.includes(join(root, found.path!)));
    await writeFile(join(root, '.github', 'pull_request_template.md'), '## Other\n');
    assert.notEqual((await discoverTemplate(root, permission)).fingerprint, found.fingerprint);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects ambiguous templates and symlinked discovery paths', async () => {
  const root = await mkdtemp('/private/tmp/opencode/publish-template-');
  try {
    await writeFile(join(root, 'PULL_REQUEST_TEMPLATE.md'), 'one');
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'pull_request_template.md'), 'two');
    await assert.rejects(discoverTemplate(root, async () => {}), /Ambiguous/);
    await rm(join(root, 'docs', 'pull_request_template.md'));
    await symlink('/private/tmp', join(root, '.github'));
    await assert.rejects(discoverTemplate(root, async () => {}), /Symlink/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects a template replaced by a symlink before open and checks nested directory permissions', async () => {
  const root = await mkdtemp('/private/tmp/opencode/publish-template-');
  try {
    const directory = join(root, '.github', 'PULL_REQUEST_TEMPLATE');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'one.md');
    await writeFile(path, '## Original\n');
    let fileChecks = 0;
    const reads: string[] = [];
    await assert.rejects(discoverTemplate(root, async (_action, resources) => {
      reads.push(resources[0]);
      if (resources[0] === path && ++fileChecks === 2) {
        await rename(path, `${path}.old`);
        await symlink('/private/tmp', path);
      }
    }), /Invalid or replaced template file|Symlink/);
    assert.ok(reads.includes(directory));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects a template directory replaced after discovery', async () => {
  const root = await mkdtemp('/private/tmp/opencode/publish-template-');
  try {
    const directory = join(root, '.github');
    await mkdir(directory);
    await writeFile(join(directory, 'pull_request_template.md'), '## Original\n');
    let checks = 0;
    await assert.rejects(discoverTemplate(root, async (_action, resources) => {
      if (resources[0] === directory && ++checks === 3) {
        await rename(directory, `${directory}-old`);
        await mkdir(directory);
        await writeFile(join(directory, 'pull_request_template.md'), '## Replacement\n');
      }
    }), /Template parent changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const base = 'a'.repeat(40), head = 'b'.repeat(40);
type Scenario = {
  branch?: string; currentHead?: string; dirty?: boolean; detached?: boolean; ancestryFailure?: boolean;
  subject?: string; remote?: string; pulls?: unknown[]; pushFailure?: boolean; createFailure?: boolean;
  createdOnError?: boolean; remoteUrl?: string;
};

function harness(root: string, options: Scenario = {}) {
  const calls: string[][] = [];
  const permissions: string[] = [];
  const branch = options.branch ?? 'feature';
  let remote = options.remote;
  let fetched = base;
  let pulls = options.pulls ?? [];
  const runner: typeof run = async (_cwd, executable, args, permission) => {
    calls.push([executable, ...args]);
    await permission('shell', [[executable, ...args].join(' ')]);
    if (executable === 'gh') {
      if (args[1] === 'list') return JSON.stringify(pulls);
      if (options.createdOnError) pulls = [{ url: 'https://github.com/acme/repo/pull/2', baseRefName: 'main', headRefName: branch, headRepositoryOwner: { login: 'acme' } }];
      if (options.createFailure) throw new Error('network failed');
      return 'https://github.com/acme/repo/pull/2\n';
    }
    if (args[0] === 'rev-parse') {
      if (args[1] === '--show-toplevel') return root;
      if (args[1] === '--git-path') return join(root, '.git', args[2]);
      return args[2] === 'FETCH_HEAD' ? fetched : options.currentHead ?? head;
    }
    if (args[0] === 'symbolic-ref') { if (options.detached) throw new Error('detached'); return branch; }
    if (args[0] === 'status') return options.dirty ? '?? file\0' : '';
    if (args[0] === 'remote') return options.remoteUrl ?? 'git@github.com:acme/repo.git';
    if (args[0] === 'ls-remote') {
      const value = args[3] === 'refs/heads/main' ? (branch === 'main' ? remote ?? base : base) : remote;
      return value ? `${value}\t${args[3]}\n` : '';
    }
    if (args[0] === 'fetch') { fetched = args[3] === 'refs/heads/main' ? (branch === 'main' ? remote ?? base : base) : remote!; return ''; }
    if (args[0] === 'merge-base' && options.ancestryFailure) throw new Error('not ancestor');
    if (args[0] === 'log') return options.subject ?? 'fix: repair\n';
    if (args[0] === 'push') { if (options.pushFailure) throw new Error('push denied'); remote = head; return ''; }
    return '';
  };
  const permission = async (action: string, resources: string[]) => { permissions.push(`${action}:${resources[0]}`); };
  const invoke = () => publishBranch(root, { branch, head }, branch === 'main' ? 'main' : 'pr', { title: 'Title', body: 'body; $(not-a-command)' }, permission, runner);
  return { calls, permissions, invoke, options };
}

test('main pushes exact ref and never invokes gh', async () => {
  const h = harness('/private/tmp/opencode', { branch: 'main' });
  assert.deepEqual(await h.invoke(), { push: 'pushed' });
  assert.ok(h.calls.some((c) => c.join(' ') === 'git push --no-follow-tags origin HEAD:refs/heads/main'));
  assert.ok(h.permissions.includes('shell:git push --no-follow-tags origin HEAD:refs/heads/main'));
  assert.ok(h.calls.every((c) => c[0] !== 'gh'));
});

test('feature creates PR with origin pinned and body passed as one argument', async () => {
  const h = harness('/private/tmp/opencode');
  assert.deepEqual(await h.invoke(), { push: 'pushed', prUrl: 'https://github.com/acme/repo/pull/2' });
  const create = h.calls.find((c) => c[0] === 'gh' && c[2] === 'create')!;
  assert.deepEqual(create, ['gh', 'pr', 'create', '--repo', 'acme/repo', '--base', 'main', '--head', 'feature', '--title', 'Title', '--body', 'body; $(not-a-command)']);
});

test('existing matching PR is returned, mismatched and multiple PRs fail before push', async () => {
  const pull = { url: 'https://github.com/acme/repo/pull/1', baseRefName: 'main', headRefName: 'feature', headRepositoryOwner: { login: 'acme' } };
  const h = harness('/private/tmp/opencode', { pulls: [pull] });
  assert.deepEqual(await h.invoke(), { push: 'pushed', prUrl: pull.url });
  assert.ok(!h.calls.some((c) => c[0] === 'gh' && c[2] === 'create'));
  for (const pulls of [[{ ...pull, baseRefName: 'develop' }], [pull, pull]]) {
    const bad = harness('/private/tmp/opencode', { pulls });
    await assert.rejects(bad.invoke());
    assert.ok(!bad.calls.some((c) => c[1] === 'push'));
  }
});

test('dirty, detached, changed HEAD, bad ancestry, non-conventional history and push failure stop publication', async () => {
  for (const options of [{ dirty: true }, { detached: true }, { currentHead: base }, { ancestryFailure: true }, { subject: 'not conventional' }, { pushFailure: true }, { remoteUrl: 'https://example.com/repo' }]) {
    const h = harness('/private/tmp/opencode', options);
    await assert.rejects(h.invoke());
    assert.ok(!h.calls.some((c) => c[0] === 'gh' && c[2] === 'create'));
  }
});

test('failed create reports push and retry does not push again', async () => {
  const h = harness('/private/tmp/opencode', { createFailure: true });
  await assert.rejects(h.invoke(), /Push pushed; PR creation failed: network failed/);
  h.options.createFailure = false;
  assert.deepEqual(await h.invoke(), { push: 'already-up-to-date', prUrl: 'https://github.com/acme/repo/pull/2' });
  assert.equal(h.calls.filter((c) => c[1] === 'push').length, 1);
});

test('create network error recovers a matching PR', async () => {
  const h = harness('/private/tmp/opencode', { createFailure: true, createdOnError: true });
  assert.deepEqual(await h.invoke(), { push: 'pushed', prUrl: 'https://github.com/acme/repo/pull/2' });
});

test('already pushed branch skips push and incompatible mode is rejected', async () => {
  const h = harness('/private/tmp/opencode', { remote: head });
  assert.equal((await h.invoke()).push, 'already-up-to-date');
  assert.ok(!h.calls.some((c) => c[1] === 'push'));
  await assert.rejects(publishBranch('/private/tmp/opencode', { branch: 'main', head }, 'pr', { title: 'x', body: 'x' }, async () => {}), /mode/);
});

test('real local origin main push, retry, and dirty refusal use the runner and push permission', async () => {
  const temp = await mkdtemp('/private/tmp/opencode/publish-git-');
  const repo = join(temp, 'work');
  const origin = join(temp, 'origin.git');
  const execute = promisify(execFile);
  const git = async (cwd: string, ...args: string[]) => (await execute('git', args, { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
  try {
    await git(temp, 'init', '--bare', '--initial-branch=main', origin);
    await git(temp, 'init', '--initial-branch=main', repo);
    await git(repo, 'config', 'user.name', 'Publish Test');
    await git(repo, 'config', 'user.email', 'publish-test@example.invalid');
    await git(repo, 'remote', 'add', 'origin', origin);
    await writeFile(join(repo, 'fixture.txt'), 'base\n');
    await git(repo, 'add', 'fixture.txt');
    await git(repo, 'commit', '-m', 'chore: create fixture');
    await git(repo, 'push', 'origin', 'HEAD:refs/heads/main');
    await writeFile(join(repo, 'fixture.txt'), 'base\nchange\n');
    await git(repo, 'add', 'fixture.txt');
    await git(repo, 'commit', '-m', 'fix: update fixture');
    await git(repo, 'config', 'push.followTags', 'true');
    await git(repo, 'tag', '-a', 'fixture-tag', '-m', 'fixture');
    const head = await git(repo, 'rev-parse', 'HEAD');
    const permissions: string[] = [];
    const permission = async (action: string, resources: string[]) => { permissions.push(`${action}:${resources[0]}`); };
    const publish = () => publishBranch(repo, { branch: 'main', head }, 'main', {}, permission);
    assert.deepEqual(await publish(), { push: 'pushed' });
    assert.equal(await git(temp, '--git-dir', origin, 'rev-parse', 'refs/heads/main'), head);
    assert.equal(await git(temp, '--git-dir', origin, 'tag', '--list'), '');
    assert.ok(permissions.includes('shell:git push --no-follow-tags origin HEAD:refs/heads/main'));
    assert.deepEqual(await publish(), { push: 'already-up-to-date' });
    assert.equal(permissions.filter((entry) => entry === 'shell:git push --no-follow-tags origin HEAD:refs/heads/main').length, 1);
    await writeFile(join(repo, 'untracked.txt'), 'dirty\n');
    await assert.rejects(publish(), /clean state changed/);
    assert.equal(await git(temp, '--git-dir', origin, 'rev-parse', 'refs/heads/main'), head);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
