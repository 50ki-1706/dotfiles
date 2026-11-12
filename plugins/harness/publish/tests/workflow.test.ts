import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverTemplate, publishBranch, PublishError, syncMain, SyncError } from '../src/core/workflow.ts';
import type { run } from '../src/core/runner.ts';

test('discovers a single template and fingerprints current bytes', async () => {
  const root = await mkdtemp('/private/tmp/dsh-publish/template-');
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
  const root = await mkdtemp('/private/tmp/dsh-publish/template-');
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
  const root = await mkdtemp('/private/tmp/dsh-publish/template-');
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
  const root = await mkdtemp('/private/tmp/dsh-publish/template-');
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
  const retry = {};
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
  const invoke = () => publishBranch(root, { branch, head }, branch === 'main' ? 'main' : 'pr', { title: 'Title', body: 'body; $(not-a-command)' }, permission, runner, undefined, retry);
  return { calls, permissions, invoke, options, setPulls: (value: unknown[]) => { pulls = value; } };
}

test('main pushes exact ref and never invokes gh', async () => {
  const h = harness('/private/tmp/dsh-publish', { branch: 'main' });
  assert.deepEqual(await h.invoke(), { push: 'pushed', phase: 'complete', remoteVerified: true, pr: 'not-attempted', outgoingCommitCount: 1, base, head });
  assert.ok(h.calls.some((c) => c.join(' ') === 'git push --no-follow-tags origin HEAD:refs/heads/main'));
  assert.ok(h.permissions.includes('shell:git push --no-follow-tags origin HEAD:refs/heads/main'));
  assert.ok(h.calls.every((c) => c[0] !== 'gh'));
});

test('preflight failures preserve uncertain PR and unknown outgoing count', async () => {
  const retry = { createUncertain: true };
  await assert.rejects(publishBranch('/private/tmp/dsh-publish', { branch: 'feature', head }, 'pr', { title: 'Title', body: 'body' }, async () => {}, async () => { throw new Error('offline'); }, undefined, retry), (error: unknown) => {
    assert.ok(error instanceof PublishError);
    assert.equal(error.state.pr, 'unknown');
    assert.equal(error.state.outgoingCommitCount, null);
    assert.equal(retry.createUncertain, true);
    return true;
  });
});

test('feature creates PR with origin pinned and body passed as one argument', async () => {
  const h = harness('/private/tmp/dsh-publish');
  assert.deepEqual(await h.invoke(), { push: 'pushed', phase: 'complete', remoteVerified: true, pr: 'known', outgoingCommitCount: 1, base, head, prUrl: 'https://github.com/acme/repo/pull/2' });
  const create = h.calls.find((c) => c[0] === 'gh' && c[2] === 'create')!;
  assert.deepEqual(create, ['gh', 'pr', 'create', '--repo', 'acme/repo', '--base', 'main', '--head', 'feature', '--title', 'Title', '--body', 'body; $(not-a-command)']);
});

test('existing matching PR is returned, mismatched and multiple PRs fail before push', async () => {
  const pull = { url: 'https://github.com/acme/repo/pull/1', baseRefName: 'main', headRefName: 'feature', headRepositoryOwner: { login: 'acme' } };
  const h = harness('/private/tmp/dsh-publish', { pulls: [pull] });
  assert.equal((await h.invoke()).prUrl, pull.url);
  assert.ok(!h.calls.some((c) => c[0] === 'gh' && c[2] === 'create'));
  for (const pulls of [[{ ...pull, baseRefName: 'develop' }], [pull, pull]]) {
    const bad = harness('/private/tmp/dsh-publish', { pulls });
    await assert.rejects(bad.invoke());
    assert.ok(!bad.calls.some((c) => c[1] === 'push'));
  }
});

test('dirty, detached, changed HEAD, bad ancestry, non-conventional history and push failure stop publication', async () => {
  for (const options of [{ dirty: true }, { detached: true }, { currentHead: base }, { ancestryFailure: true }, { subject: 'not conventional' }, { pushFailure: true }, { remoteUrl: 'https://example.com/repo' }]) {
    const h = harness('/private/tmp/dsh-publish', options);
    await assert.rejects(h.invoke());
    assert.ok(!h.calls.some((c) => c[0] === 'gh' && c[2] === 'create'));
  }
});

test('empty outgoing subjects are counted and rejected instead of disappearing from main publication', async () => {
  for (const subject of ['\n', 'fix: valid\n\n']) {
    const h = harness('/private/tmp/dsh-publish', { branch: 'main', subject });
    await assert.rejects(h.invoke(), (error: unknown) => {
      assert.ok(error instanceof PublishError);
      assert.match(error.message, /Non-conventional outgoing commit/);
      assert.equal(error.state.outgoingCommitCount, subject === '\n' ? 1 : 2);
      assert.equal(error.state.push, 'not-attempted');
      return true;
    });
    assert.ok(!h.calls.some((call) => call[1] === 'push'));
  }
});

test('uncertain create blocks another create until a matching PR is found', async () => {
  const h = harness('/private/tmp/dsh-publish', { createFailure: true });
  await assert.rejects(h.invoke(), (error: unknown) => {
    assert.ok(error instanceof PublishError);
    assert.match(error.message, /Push pushed; PR creation failed: network failed/);
    assert.equal(error.state.push, 'pushed');
    assert.equal(error.state.remoteVerified, true);
    assert.equal(error.state.pr, 'unknown');
    assert.equal(error.state.outgoingCommitCount, 1);
    return true;
  });
  await assert.rejects(h.invoke(), /Previous PR creation remains uncertain/);
  assert.equal(h.calls.filter((c) => c[0] === 'gh' && c[2] === 'create').length, 1);
  h.setPulls([{ url: 'https://github.com/acme/repo/pull/2', baseRefName: 'main', headRefName: 'feature', headRepositoryOwner: { login: 'acme' } }]);
  const result = await h.invoke();
  assert.equal(result.push, 'already-up-to-date');
  assert.equal(result.prUrl, 'https://github.com/acme/repo/pull/2');
  assert.equal(h.calls.filter((c) => c[1] === 'push').length, 1);
});

test('create network error recovers a matching PR', async () => {
  const h = harness('/private/tmp/dsh-publish', { createFailure: true, createdOnError: true });
  assert.equal((await h.invoke()).prUrl, 'https://github.com/acme/repo/pull/2');
});

test('already pushed branch skips push and incompatible mode is rejected', async () => {
  const h = harness('/private/tmp/dsh-publish', { remote: head });
  assert.equal((await h.invoke()).push, 'already-up-to-date');
  assert.ok(!h.calls.some((c) => c[1] === 'push'));
  await assert.rejects(publishBranch('/private/tmp/dsh-publish', { branch: 'main', head }, 'pr', { title: 'x', body: 'x' }, async () => {}), /mode/);
});

test('real local origin main push, retry, and dirty refusal use the runner and push permission', async () => {
  const temp = await mkdtemp('/private/tmp/dsh-publish/git-');
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
    assert.equal((await publish()).push, 'pushed');
    assert.equal(await git(temp, '--git-dir', origin, 'rev-parse', 'refs/heads/main'), head);
    assert.equal(await git(temp, '--git-dir', origin, 'tag', '--list'), '');
    assert.ok(permissions.includes('shell:git push --no-follow-tags origin HEAD:refs/heads/main'));
    assert.equal((await publish()).push, 'already-up-to-date');
    assert.equal(permissions.filter((entry) => entry === 'shell:git push --no-follow-tags origin HEAD:refs/heads/main').length, 1);
    await writeFile(join(repo, 'untracked.txt'), 'dirty\n');
    await assert.rejects(publish(), /clean state changed/);
    assert.equal(await git(temp, '--git-dir', origin, 'rev-parse', 'refs/heads/main'), head);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

async function syncFixture(action: (f: { repo: string; old: string; target: string; git: (...args: string[]) => Promise<string> }) => Promise<void>) {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'sync-test-')));
  const repo = join(temp, 'repo');
  const origin = join(temp, 'origin');
  const execute = promisify(execFile);
  const command = async (cwd: string, ...args: string[]) => (await execute('git', args, { cwd })).stdout.trim();
  const git = (...args: string[]) => command(repo, ...args);
  try {
    await command(temp, 'init', '--bare', '--initial-branch=main', origin);
    await command(temp, 'init', '--initial-branch=main', repo);
    await git('config', 'user.name', 'Test');
    await git('config', 'user.email', 'test@example.invalid');
    await git('remote', 'add', 'origin', origin);
    await writeFile(join(repo, 'file'), 'old\n');
    await git('add', 'file'); await git('commit', '-m', 'old');
    const old = await git('rev-parse', 'HEAD');
    await writeFile(join(repo, 'file'), 'new\n');
    await git('add', 'file'); await git('commit', '-m', 'new');
    const target = await git('rev-parse', 'HEAD');
    await git('push', 'origin', 'HEAD:refs/heads/main');
    await git('reset', '--hard', old);
    await action({ repo, old, target, git });
  } finally { await rm(temp, { recursive: true, force: true }); }
}

test('sync fast-forwards the bound feature branch to the exact fetched main', async () => {
  await syncFixture(async ({ repo, old, target, git }) => {
    await git('switch', '-c', 'feature');
    const result = await syncMain(repo, { branch: 'feature', head: old }, target, async () => {});
    assert.deepEqual(result.before, { root: repo, branch: 'feature', head: old });
    assert.deepEqual(result.state, { root: repo, branch: 'feature', head: target, status: [] });
    await git('merge-base', '--is-ancestor', old, target);
  });
});

test('sync denial and approval-time mutations never launch merge', async () => {
  for (const mutation of ['deny', 'head', 'index', 'worktree', 'branch', 'operation']) {
    await syncFixture(async ({ repo, old, target, git }) => {
      let approved = false;
      const permission = async (action: string, resources: string[]) => {
        if (action !== 'shell' || resources[0] !== `git merge --ff-only --no-edit ${target}`) return;
        approved = true;
        if (mutation === 'deny') throw new Error('denied');
        if (mutation === 'head') await git('commit', '--allow-empty', '-m', 'external');
        if (mutation === 'index') { await writeFile(join(repo, 'other'), 'external'); await git('add', 'other'); }
        if (mutation === 'worktree') await writeFile(join(repo, 'file'), 'external');
        if (mutation === 'branch') await git('switch', '-c', 'external');
        if (mutation === 'operation') await writeFile(join(repo, '.git', 'MERGE_HEAD'), target + '\n');
      };
      await assert.rejects(syncMain(repo, { branch: 'main', head: old }, target, permission), (error: unknown) => error instanceof SyncError && !error.attempted);
      assert.equal(approved, true, mutation);
      assert.notEqual(await git('rev-parse', 'HEAD'), target, mutation);
      if (mutation === 'worktree') assert.equal(await readFile(join(repo, 'file'), 'utf8'), 'external');
      if (mutation === 'branch') assert.equal(await git('branch', '--show-current'), 'external');
      if (mutation === 'operation') assert.equal(await readFile(join(repo, '.git', 'MERGE_HEAD'), 'utf8'), target + '\n');
    });
  }
});

test('sync rejects dirty, wrong target, and non-ancestor states', async () => {
  for (const condition of ['dirty', 'target', 'ancestor']) {
    await syncFixture(async ({ repo, old, target, git }) => {
      let head = old;
      if (condition === 'dirty') await writeFile(join(repo, 'file'), 'dirty');
      if (condition === 'ancestor') { await git('commit', '--allow-empty', '-m', 'diverged'); head = await git('rev-parse', 'HEAD'); }
      await assert.rejects(syncMain(repo, { branch: 'main', head }, condition === 'target' ? old : target, async () => {}), (error: unknown) => error instanceof SyncError && !error.attempted);
      assert.equal(await git('rev-parse', 'HEAD'), head);
    });
  }
});

test('sync reports a post-merge hook mutation as attempted and observed', async () => {
  await syncFixture(async ({ repo, old, target }) => {
    await writeFile(join(repo, '.git', 'hooks', 'post-merge'), '#!/bin/sh\nprintf mutation > file\n', { mode: 0o755 });
    await assert.rejects(syncMain(repo, { branch: 'main', head: old }, target, async () => {}), (error: unknown) => {
      assert.ok(error instanceof SyncError);
      assert.equal(error.attempted, true);
      assert.equal(error.observed?.head, target);
      assert.ok(error.observed?.status.length);
      return true;
    });
  });
});

test('sync refuses a racy dirty index before requesting merge permission', async () => {
  await syncFixture(async ({ repo, old, target, git }) => {
    // Align cached file and index seconds so Git must hash the same-size edit.
    const stamp = 1600000000;
    await git('config', 'core.trustctime', 'false');
    await utimes(join(repo, 'file'), stamp, stamp);
    await git('add', 'file');
    await utimes(join(repo, '.git/index'), stamp, stamp);
    await writeFile(join(repo, 'file'), 'bad\n');
    await utimes(join(repo, 'file'), stamp, stamp);
    const index = await readFile(join(repo, '.git/index'));
    let mergePermission = false;
    await assert.rejects(syncMain(repo, { branch: 'main', head: old }, target, async (action, resources) => {
      if (action === 'shell' && resources[0].startsWith('git merge --ff-only')) mergePermission = true;
    }), (error: unknown) => error instanceof SyncError && !error.attempted);
    assert.equal(mergePermission, false);
    assert.equal(await git('rev-parse', 'HEAD'), old);
    assert.equal(await readFile(join(repo, 'file'), 'utf8'), 'bad\n');
    assert.deepEqual(await readFile(join(repo, '.git/index')), index);
    assert.equal(await git('ls-remote', 'origin', 'refs/heads/main'), `${target}\trefs/heads/main`);
  });
});
