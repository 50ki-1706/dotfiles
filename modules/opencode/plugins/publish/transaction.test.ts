import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, chmod, appendFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { commitHunks, inspectHunks, showHunk } from './transaction.ts';
import { run } from './runner.ts';

test('real surgeon previews staged and untracked changes without altering real index', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-test-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'tracked.txt'), 'before\n');
    await git(['add', 'tracked.txt']);
    await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'tracked.txt'), 'staged\n');
    await git(['add', 'tracked.txt']);
    await writeFile(join(cwd, 'tracked.txt'), 'final\n');
    await writeFile(join(cwd, 'new.txt'), 'new\n');
    const before = await git(['diff', '--cached']);
    const result = await inspectHunks(cwd, permission, ['new.txt']);
    assert.match(result.hunks, /final/);
    assert.match(result.hunks, /new/);
    assert.match(result.stagedDiff, /staged/);
    const id = result.hunks.match(/^([a-zA-Z0-9_-]+) tracked\.txt/m)?.[1];
    assert.ok(id);
    assert.match(await showHunk(cwd, id, permission, ['new.txt']), /final/);
    assert.equal(await git(['diff', '--cached']), before);
    await assert.rejects(inspectHunks(cwd, permission, ['../outside']), /invalid path/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('fully staged changes can be committed without leaving them staged', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-staged-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n');
    await git(['add', 'file']);
    await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'file'), 'new\n');
    await git(['add', 'file']);
    const id = (await inspectHunks(cwd, permission)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1];
    assert.ok(id);
    await commitHunks(cwd, [id], 'fix: staged', permission);
    assert.equal(await git(['diff', '--cached']), '');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('untracked file is committed through the alternate index', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-new-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await git(['commit', '--allow-empty', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'new'), 'new\n');
    const id = (await inspectHunks(cwd, permission, ['new'])).hunks.match(/^([a-zA-Z0-9_-]+) new\s/m)?.[1];
    assert.ok(id);
    await commitHunks(cwd, [id], 'feat: new', permission, ['new']);
    assert.equal((await git(['show', 'HEAD:new'])).trim(), 'new');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

for (const staged of [true, false]) {
  test(`new ${staged ? 'staged' : 'opted-in'} file followed by tracked change preserves other staged changes`, async () => {
    const cwd = await mkdtemp('/private/tmp/opencode/publish-sequence-');
    const permission = async () => {};
    const git = (args: string[]) => run(cwd, 'git', args, permission);
    try {
      await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
      await writeFile(join(cwd, 'tracked.patch'), 'before\n'); await writeFile(join(cwd, 'partial'), 'base\n');
      await git(['add', 'tracked.patch', 'partial']); await git(['commit', '-m', 'chore: initial']);
      await writeFile(join(cwd, 'tracked.patch'), 'after\n');
      await writeFile(join(cwd, 'partial'), 'staged\n'); await git(['add', 'partial']); await writeFile(join(cwd, 'partial'), 'worktree\n');
      await writeFile(join(cwd, 'other.patch'), 'other staged\n'); await git(['add', 'other.patch']);
      await writeFile(join(cwd, 'new.patch'), 'staged version\n');
      if (staged) { await git(['add', 'new.patch']); await writeFile(join(cwd, 'new.patch'), 'final version\n'); }
      const optins = staged ? [] : ['new.patch'];
      const index = join(cwd, '.git/index'); const before = await readFile(index);
      const first = await inspectHunks(cwd, permission, optins);
      const newId = first.hunks.match(/^([a-zA-Z0-9_-]+) new\.patch\s/m)?.[1]; assert.ok(newId);
      assert.match(await showHunk(cwd, newId, permission, optins), /version/);
      assert.deepEqual(await readFile(index), before);
      await commitHunks(cwd, [newId], 'feat: new', permission, optins);
      assert.equal(await git(['show', 'HEAD:new.patch']), staged ? 'final version\n' : 'staged version\n');
      if (staged) assert.equal(await git(['show', ':new.patch']), 'staged version\n');
      const second = await inspectHunks(cwd, permission);
      const trackedId = second.hunks.match(/^([a-zA-Z0-9_-]+) tracked\.patch\s/m)?.[1]; assert.ok(trackedId);
      assert.match(await showHunk(cwd, trackedId, permission), /after/);
      const captured = await readFile(index); let checked = 0; let sawLock = false;
      const checkingPermission = async (action: string) => {
        if (action === 'shell') {
          const locked = await access(`${index}.lock`).then(() => true, () => false);
          if (!sawLock || locked) { assert.deepEqual(await readFile(index), captured); checked++; }
          if (locked) sawLock = true;
        }
      };
      await commitHunks(cwd, [trackedId], 'fix: tracked', checkingPermission);
      assert.ok(checked > 0);
      assert.equal(await git(['show', 'HEAD:tracked.patch']), 'after\n');
      assert.equal(await git(['show', ':other.patch']), 'other staged\n');
      assert.equal(await git(['show', ':partial']), 'staged\n');
      assert.equal(await readFile(join(cwd, 'partial'), 'utf8'), 'worktree\n');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
}

test('show and commit one of two unchanged staged additions preserves the other', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-staged-pair-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await git(['commit', '--allow-empty', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'one.patch'), 'one\n'); await writeFile(join(cwd, 'two.patch'), 'two\n');
    await git(['add', 'one.patch', 'two.patch']);
    const index = join(cwd, '.git/index'); const before = await readFile(index);
    const id = (await inspectHunks(cwd, permission)).hunks.match(/^([a-zA-Z0-9_-]+) one\.patch\s/m)?.[1]; assert.ok(id);
    assert.match(await showHunk(cwd, id, permission), /one/); assert.deepEqual(await readFile(index), before);
    await commitHunks(cwd, [id], 'feat: one', permission);
    assert.equal(await git(['show', 'HEAD:one.patch']), 'one\n');
    assert.equal(await git(['show', ':two.patch']), 'two\n');
    assert.match(await git(['diff', '--cached', '--name-only']), /^two\.patch\n$/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('literal pathspec names are previewed and selected without changing unrelated state', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-literal-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'other'), 'base\n'); await git(['add', 'other']); await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'other'), 'staged\n'); await git(['add', 'other']); await writeFile(join(cwd, 'other'), 'unstaged\n');
    await mkdir(join(cwd, 'app/[id]'), { recursive: true });
    await mkdir(join(cwd, 'app/i'), { recursive: true });
    await mkdir(join(cwd, 'app/d'), { recursive: true });
    const names = ['app/[id]/page.tsx', 'bracket[1]', 'glob*', ':(glob)magic'];
    const neighbors = ['app/i/page.tsx', 'app/d/page.tsx', 'bracket1', 'glob-neighbor', 'magic'];
    for (const name of names) await writeFile(join(cwd, name), `${name}\n`);
    for (const name of neighbors) await writeFile(join(cwd, name), `neighbor ${name}\n`);
    const before = await git(['diff', '--cached']);
    const snapshot = await inspectHunks(cwd, permission, names);
    assert.equal(await git(['diff', '--cached']), before);
    const headers = snapshot.hunks.split('\n').filter((line) => /^[a-zA-Z0-9_-]+\s/.test(line));
    for (const name of neighbors) assert.ok(!headers.some((line) => line.startsWith(`${line.split(' ')[0]} ${name} `)));
    const ids = snapshot.hunks.split('\n').filter((line) => names.some((name) => line.includes(name))).map((line) => line.match(/^([a-zA-Z0-9_-]+)\s/)?.[1]).filter((id): id is string => !!id);
    assert.equal(ids.length, names.length);
    for (const id of ids) await showHunk(cwd, id, permission, names);
    await commitHunks(cwd, ids, 'feat: literal paths', permission, names);
    for (const name of names) assert.equal(await git(['show', `HEAD:${name}`]), `${name}\n`);
    assert.equal(await git(['diff', '--cached']), before);
    assert.equal(await readFile(join(cwd, 'other'), 'utf8'), 'unstaged\n');
    const tree = (await git(['ls-tree', '-r', '--name-only', 'HEAD'])).split('\n');
    const status = (await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0');
    for (const name of neighbors) {
      assert.ok(!tree.includes(name));
      assert.ok(status.includes(`?? ${name}`));
      assert.equal(await readFile(join(cwd, name), 'utf8'), `neighbor ${name}\n`);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('missing or binary staged additions fail before preview initialization', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-unsafe-add-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await git(['commit', '--allow-empty', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'new.patch'), Buffer.from([0, 1])); await git(['add', 'new.patch']);
    const before = await readFile(join(cwd, '.git/index'));
    await assert.rejects(inspectHunks(cwd, permission), /Binary/);
    assert.deepEqual(await readFile(join(cwd, '.git/index')), before);
    await writeFile(join(cwd, 'new.patch'), 'text\n'); await git(['add', 'new.patch']);
    const textIndex = await readFile(join(cwd, '.git/index'));
    await rm(join(cwd, 'new.patch'));
    await assert.rejects(inspectHunks(cwd, permission), /ENOENT/);
    assert.deepEqual(await readFile(join(cwd, '.git/index')), textIndex);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

for (const field of ['head', 'branch', 'worktree', 'status', 'indexBytes'] as const) {
  test(`external ${field} change under index lock is rejected without disclosing content`, async () => {
    const cwd = await mkdtemp('/private/tmp/opencode/publish-race-');
    const permission = async () => {};
    const git = (args: string[]) => run(cwd, 'git', args, permission);
    try {
      await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
      await writeFile(join(cwd, 'file'), 'base\n'); await git(['add', 'file']); await git(['commit', '-m', 'chore: initial']);
      const head = (await git(['rev-parse', 'HEAD'])).trim();
      const tree = (await git(['rev-parse', 'HEAD^{tree}'])).trim();
      const alternate = (await git(['commit-tree', tree, '-p', head, '-m', 'external'])).trim();
      await writeFile(join(cwd, 'file'), 'private-content\n');
      const id = (await inspectHunks(cwd, permission)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
      const index = join(cwd, '.git/index'); const before = await readFile(index); let changed = false;
      const mutate = async (action: string) => {
        if (action !== 'shell' || changed || !(await access(`${index}.lock`).then(() => true, () => false))) return;
        changed = true;
        if (field === 'head') await git(['update-ref', 'refs/heads/main', alternate]);
        if (field === 'branch') await git(['symbolic-ref', 'HEAD', 'refs/heads/other']);
        if (field === 'branch') await git(['update-ref', 'refs/heads/other', head]);
        if (field === 'worktree') await writeFile(join(cwd, 'file'), 'external-content\n');
        if (field === 'status') await writeFile(join(cwd, 'external'), 'external-content\n');
        if (field === 'indexBytes') await appendFile(index, Buffer.from([0]));
      };
      await assert.rejects(commitHunks(cwd, [id], 'fix: selected', mutate), (error: Error & { mismatches?: string[]; commitStatus?: string }) => {
        assert.ok(error.mismatches?.includes(field)); assert.match(error.message, new RegExp(`\\b${field}\\b`));
        assert.doesNotMatch(error.message, /content|publish-race-|[a-f0-9]{40}/); assert.equal(error.commitStatus, undefined); return true;
      });
      assert.ok(changed);
      assert.equal((await git(['rev-parse', 'HEAD'])).trim(), field === 'head' ? alternate : head);
      assert.deepEqual(await readFile(index), field === 'indexBytes' ? Buffer.concat([before, Buffer.from([0])]) : before);
      assert.equal(await readFile(join(cwd, 'file'), 'utf8'), field === 'worktree' ? 'external-content\n' : 'private-content\n');
      if (field === 'status') assert.equal(await readFile(join(cwd, 'external'), 'utf8'), 'external-content\n');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
}

test('failing hook and existing index lock prevent commits', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-hook-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n');
    await git(['add', 'file']);
    await git(['commit', '-m', 'chore: initial']);
    const head = await git(['rev-parse', 'HEAD']);
    await writeFile(join(cwd, 'file'), 'new\n');
    const id = (await inspectHunks(cwd, permission)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1];
    assert.ok(id);
    const hook = join(cwd, '.git/hooks/pre-commit');
    await writeFile(hook, '#!/bin/sh\nexit 1\n');
    await chmod(hook, 0o755);
    const before = await readFile(join(cwd, '.git/index'));
    await assert.rejects(commitHunks(cwd, [id], 'fix: test', permission), (error: Error & { commitStatus?: string; indexInstalled?: boolean; createdSha?: string | null }) => {
      assert.equal(error.commitStatus, 'uncertain'); assert.equal(error.indexInstalled, false); assert.equal(error.createdSha, null); return true;
    });
    assert.deepEqual(await readFile(join(cwd, '.git/index')), before);
    assert.equal(await git(['rev-parse', 'HEAD']), head);
    await writeFile(join(cwd, '.git/index.lock'), 'held');
    await assert.rejects(commitHunks(cwd, [id], 'fix: test', permission), /EEXIST/);
    assert.equal(await git(['rev-parse', 'HEAD']), head);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('binary changes fail before creating a commit', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-binary-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n');
    await git(['add', 'file']);
    await git(['commit', '-m', 'chore: initial']);
    const head = await git(['rev-parse', 'HEAD']);
    await writeFile(join(cwd, 'file'), Buffer.from([0, 1, 2]));
    await assert.rejects(commitHunks(cwd, ['not-a-hunk'], 'fix: binary', permission), /Binary/);
    assert.equal(await git(['rev-parse', 'HEAD']), head);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('a line range commits only selected additions', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-lines-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'base\n');
    await git(['add', 'file']);
    await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'file'), 'base\nfirst\nsecond\n');
    const hunks = (await inspectHunks(cwd, permission)).hunks;
    const id = hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1];
    assert.ok(id);
    const shown = await showHunk(cwd, id, permission);
    const line = shown.match(/^\s*(\d+):\+first$/m)?.[1];
    assert.ok(line);
    await commitHunks(cwd, [`${id}:${line}-${line}`], 'feat: first', permission);
    assert.equal(await git(['show', 'HEAD:file']), 'base\nfirst\n');
    assert.match(await git(['diff']), /\+second/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('multiple hunks preserve a disjoint partially staged hunk in the same file', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-partial-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    const base = Array.from({ length: 50 }, (_, i) => `line ${i}\n`);
    await writeFile(join(cwd, 'file'), base.join(''));
    await git(['add', 'file']);
    await git(['commit', '-m', 'chore: initial']);
    const staged = [...base]; staged[2] = 'staged\n';
    await writeFile(join(cwd, 'file'), staged.join(''));
    await git(['add', 'file']);
    const work = [...staged]; work[20] = 'selected one\n'; work[40] = 'selected two\n';
    await writeFile(join(cwd, 'file'), work.join(''));
    const hunks = (await inspectHunks(cwd, permission)).hunks;
    const ids = [...hunks.matchAll(/^([a-zA-Z0-9_-]+) file\s.*$/gm)].map((m) => m[1]);
    const selected: string[] = [];
    for (const id of ids) if ((await showHunk(cwd, id, permission)).includes('+selected ')) selected.push(id);
    assert.equal(selected.length, 2);
    await commitHunks(cwd, selected, 'fix: selected changes', permission);
    const committed = await git(['show', 'HEAD:file']);
    assert.match(committed, /selected one/); assert.match(committed, /selected two/);
    assert.doesNotMatch(committed, /staged/);
    assert.match(await git(['diff', '--cached']), /\+staged/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('post-commit hook mutation reports created SHA and leaves original index intact', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-mutating-hook-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n');
    await writeFile(join(cwd, 'clean'), 'clean\n');
    await git(['add', 'file', 'clean']); await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'file'), 'new\n');
    const original = await readFile(join(cwd, '.git/index'));
    const id = (await inspectHunks(cwd, permission)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1];
    assert.ok(id);
    const hook = join(cwd, '.git/hooks/post-commit');
    await writeFile(hook, '#!/bin/sh\nprintf changed > clean\n'); await chmod(hook, 0o755);
    await assert.rejects(commitHunks(cwd, [id], 'fix: hook', permission), (error: any) => {
      assert.match(error.createdSha, /^[a-f0-9]{40}$/); assert.equal(error.indexInstalled, false); return true;
    });
    assert.deepEqual(await readFile(join(cwd, '.git/index')), original);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('preauthorized recovery reports SHA after post-commit permission denial', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-denial-');
  const allow = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, allow);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n'); await git(['add', 'file']); await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'file'), 'new\n');
    const original = await readFile(join(cwd, '.git/index'));
    const id = (await inspectHunks(cwd, allow)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
    const permission = async (action: string, resources: string[]) => {
      if (action === 'shell' && /^git rev-parse '[a-f0-9]+\^'/.test(resources[0])) throw new Error('denied after commit');
    };
    await assert.rejects(commitHunks(cwd, [id], 'fix: denial', permission), (error: any) => {
      assert.match(error.createdSha, /^[a-f0-9]{40}$/); assert.equal(error.indexInstalled, false); return true;
    });
    assert.deepEqual(await readFile(join(cwd, '.git/index')), original);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('abort after commit reports recovered SHA and does not install index', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-abort-');
  const allow = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, allow);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n'); await git(['add', 'file']); await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'file'), 'new\n');
    const original = await readFile(join(cwd, '.git/index'));
    const id = (await inspectHunks(cwd, allow)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
    const controller = new AbortController();
    const permission = async (action: string, resources: string[]) => {
      if (action === 'shell' && /^git rev-parse '[a-f0-9]+\^'/.test(resources[0])) controller.abort();
    };
    await assert.rejects(commitHunks(cwd, [id], 'fix: abort', permission, [], controller.signal), (error: any) => {
      assert.match(error.createdSha, /^[a-f0-9]{40}$/); assert.equal(error.indexInstalled, false); return true;
    });
    assert.deepEqual(await readFile(join(cwd, '.git/index')), original);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('concurrent index modification is detected before commit without overwriting it', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-concurrent-');
  const allow = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, allow);
  try {
    await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'old\n'); await git(['add', 'file']); await git(['commit', '-m', 'chore: initial']);
    const head = await git(['rev-parse', 'HEAD']);
    await writeFile(join(cwd, 'file'), 'new\n');
    const id = (await inspectHunks(cwd, allow)).hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
    const index = join(cwd, '.git/index'); const initial = await readFile(index); let changed = false;
    const permission = async (action: string, resources: string[]) => {
      if (!changed && action === 'shell' && resources[0].startsWith('git symbolic-ref')) {
        const locked = await access(`${index}.lock`).then(() => true, () => false);
        if (locked) { changed = true; await appendFile(index, 'external'); }
      }
    };
    await assert.rejects(commitHunks(cwd, [id], 'fix: concurrent', permission));
    assert.ok(changed); assert.deepEqual(await readFile(index), Buffer.concat([initial, Buffer.from('external')]));
    assert.equal(await git(['rev-parse', 'HEAD']), head);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('real surgeon commits selected hunk and preserves unrelated staged content', async () => {
  const cwd = await mkdtemp('/private/tmp/opencode/publish-commit-');
  const permission = async () => {};
  const git = (args: string[]) => run(cwd, 'git', args, permission);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Test']);
    await git(['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'one'), 'before\n');
    await writeFile(join(cwd, 'two'), 'before\n');
    await git(['add', 'one', 'two']);
    await git(['commit', '-m', 'chore: initial']);
    await writeFile(join(cwd, 'one'), 'changed\n');
    await writeFile(join(cwd, 'two'), 'staged\n');
    await git(['add', 'two']);
    const hunks = (await inspectHunks(cwd, permission)).hunks;
    const id = hunks.match(/^([a-zA-Z0-9_-]+) one\s/m)?.[1];
    assert.ok(id);
    const result = await commitHunks(cwd, [id], 'fix: one', permission);
    assert.match(result.sha, /^[a-f0-9]{40}$/);
    assert.equal((await git(['show', 'HEAD:one'])).trim(), 'changed');
    assert.equal((await git(['show', ':two'])).trim(), 'staged');
    assert.match(await git(['diff', '--cached']), /staged/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
