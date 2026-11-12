import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mountPublish } from '../src/index.ts';
import { parseTemplate } from '../src/core/template.ts';
import { PublishError, SyncError, publishBranch, syncMain } from '../src/core/workflow.ts';
import * as transaction from '../src/core/transaction.ts';
import { run } from '../src/core/runner.ts';
import type {
  ApprovalDecision,
  ApprovalRequest,
  PublishHost,
  PublishTool,
  ToolCall,
} from '../src/types.ts';

const base = { root: '/repo', branch: 'feature', head: 'a'.repeat(40), status: [] as string[] };
const tc = (sessionID = 's'): ToolCall => ({ sessionID, callID: 'call', signal: new AbortController().signal });

async function fixture(root = '/repo', overrides: any = {}) {
  let state = { ...base }; let template = parseTemplate('template.md', '## Summary\n');
  let skills = [{ id: 'git-surgeon', path: '/trusted/SKILL.md', content: 'official' }, { id: 'pr', path: '/trusted/pr/SKILL.md', content: 'pr official' }]; let loads: boolean[] = [];
  let denied = false; let pending: Promise<void> = Promise.resolve(); let calls = 0; let publishArgs: any[] = []; let onPermission = async (_input: any) => {};
  let prompt: any; let listener: (request: ApprovalRequest) => ApprovalDecision | undefined = () => undefined; let reloads = 0; const observed: ApprovalRequest[] = [];
  const disposed: string[] = []; const permissions: any[] = [];
  const ops: any = {
    inspectRepository: async () => ({ ...state }),
    inspectHunks: async () => ({ state: { ...state }, hunks: 'hunks', stagedDiff: 'staged' }),
    showHunk: async () => 'shown',
    commitHunks: async (_root: any, _ids: any, message: string) => { calls++; state = { ...state, head: String(calls).repeat(40) }; return { sha: state.head, message, state: { ...state } }; },
    discoverTemplate: async () => template,
    publishBranch: async (...args: any[]) => { publishArgs = args; return { push: 'pushed', prUrl: 'https://github.com/a/b/pull/1' }; },
    syncMain: async (_root: string, _expected: any, target: string, permission: any) => { const before = { ...state }; await permission('shell', [`git merge --ff-only --no-edit ${target}`]); state = { ...state, head: target }; return { before, state: { ...state } }; },
    ...overrides,
  };
  const host: PublishHost = {
    async authorize(action, resources, options) {
      const input = { sessionID: options?.call?.sessionID ?? 's', callID: options?.call?.callID, action, resources };
      permissions.push(input);
      if (denied && action === 'skill') throw Error('denied');
      await onPermission(input);
    },
    directory: async () => root,
    skills: async () => skills,
    deliver: async (_sessionID, value) => { prompt = value; await pending; },
    reloadTools: async () => { reloads++; },
    observeApproval: (next) => {
      listener = next;
      return () => { disposed.push('observe'); };
    },
  };
  const mounted = await mountPublish(host, {
    operations: ops,
    loadResources: async (includePrSkill) => {
      loads.push(includePrSkill);
      return {
        instructions: 'instructions',
        officialSkill: '---\nname: git-surgeon\n---\nofficial\n',
        trustedSkillPath: '/trusted/SKILL.md',
        ...(includePrSkill ? { prSkill: '---\nname: pr\n---\npr official\n', trustedPrSkillPath: '/trusted/pr/SKILL.md' } : {}),
      };
    },
  });
  const tools: Record<string, PublishTool> = Object.fromEntries(mounted.tools.map((tool) => [tool.name, tool]));
  const invoke = (sessionID = 's') => mounted.command.execute(sessionID);
  const call = async (name: string, input: any, sessionID = 's') => tools[name].execute(input, tc(sessionID));
  const inspect = async (...ids: string[]) => { await call('publish_inspect', { untracked: [] }); for (const id of ids) await call('publish_show', { id }); };
  return {
    invoke, call, inspect, permissions, tools,
    approve: (request: ApprovalRequest) => { observed.push(request); return listener(request); },
    get observed() { return observed; },
    dispose: async () => { await mounted.dispose(); disposed.push('dispose'); },
    get disposed() { return disposed; },
    get prompt() { return prompt; },
    get publishArgs() { return publishArgs; },
    get calls() { return calls; },
    get loads() { return loads; },
    get reloads() { return reloads; },
    setSkills: (x: typeof skills) => skills = x,
    setDenied: (x: boolean) => denied = x,
    setPending: (x: Promise<void>) => pending = x,
    setTemplate: (x: typeof template) => template = x,
    setState: (x: typeof state) => state = x,
    setPermissionHook: (hook: typeof onPermission) => onPermission = hook,
    ops,
  };
}

test('command admits a binding, verifies skills, and installs the template schema', async () => {
  const f = await fixture(); await f.invoke();
  assert.equal(f.prompt.text, 'instructions');
  assert.deepEqual(f.prompt.skills, ['git-surgeon', 'pr']);
  assert.deepEqual(f.tools.publish_pr.input.required, ['title', 'fingerprint', 'fields']);
  assert.deepEqual((f.tools.publish_pr.input.properties as any).fields.required, ['summary_1']);
  assert.equal((f.tools.publish_pr.input.properties as any).fingerprint.type, 'string');
  assert.equal(f.reloads, 1);
});

for (const staged of [true, false]) {
  test(`plugin commits a ${staged ? 'staged' : 'opted-in'} new file then tracked changes with real surgeon`, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'publish-'));
    const git = (args: string[]) => run(cwd, 'git', args, async () => {});
    try {
      await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']);
      await writeFile(join(cwd, 'tracked'), 'before\n'); await writeFile(join(cwd, 'residual'), 'before\n');
      await git(['add', 'tracked', 'residual']); await git(['commit', '-m', 'chore: initial']);
      await writeFile(join(cwd, 'new'), 'new\n'); if (staged) await git(['add', 'new']);
      await writeFile(join(cwd, 'tracked'), 'after\n'); await writeFile(join(cwd, 'residual'), 'after\n');
      const f = await fixture(cwd, transaction); await f.invoke();
      const first = await f.call('publish_inspect', { untracked: staged ? [] : ['new'] });
      const newId = first.hunks.match(/^([a-zA-Z0-9_-]+) new\s/m)?.[1]; assert.ok(newId);
      await f.call('publish_show', { id: newId });
      assert.equal((await f.call('commit_hunks', { ids: [newId], message: 'feat: new' })).count, 1);
      await assert.rejects(f.call('publish_show', { id: newId }), /publish_inspect/);
      const second = await f.call('publish_inspect', { untracked: [] });
      const trackedId = second.hunks.match(/^([a-zA-Z0-9_-]+) tracked\s/m)?.[1]; assert.ok(trackedId);
      await f.call('publish_show', { id: trackedId });
      const committed = await f.call('commit_hunks', { ids: [trackedId], message: 'fix: tracked' });
      assert.equal(committed.invocationCreatedCount, 2); assert.equal(committed.count, 2);
      assert.match((await f.call('publish_inspect', { untracked: [] })).hunks, /residual/);
      assert.equal(await git(['show', 'HEAD:new']), 'new\n');
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
}

test('fast-forward approval promotes only the exact pending call', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a');
  const target = 'b'.repeat(40); const resource = `git merge --ff-only --no-edit ${target}`;
  f.setPermissionHook(async input => {
    if (input.action !== 'shell') return;
    const matching: ApprovalRequest = { sessionID: 's', callID: 'call', action: 'shell', resources: [resource], decision: 'allow' };
    const promoted = f.approve(matching);
    assert.equal(promoted?.decision, 'ask'); assert.match(promoted?.reason ?? '', /Fast-forward approval/);
    for (const change of [
      { decision: 'deny' as const }, { sessionID: 'other' }, { callID: undefined }, { callID: 'other' },
      { resources: ['git status'] }, { resources: [resource, resource] },
    ]) {
      const request: ApprovalRequest = { sessionID: 's', callID: 'call', action: 'shell', resources: [resource], decision: 'allow', ...change };
      assert.equal(f.approve(request), undefined);
    }
  });
  const result = await f.call('publish_sync_main', { expectedHead: base.head, targetHead: target });
  assert.equal(result.state.head, target); assert.equal(result.reviewRequired, true);
  await assert.rejects(f.call('publish_show', { id: 'a' }), /publish_inspect/);
  const outside: ApprovalRequest = { sessionID: 's', callID: 'other', action: 'shell', resources: [resource], decision: 'allow' };
  assert.equal(f.approve(outside), undefined);
});

test('sync denial retains admission for retry while attempted failure revokes it', async () => {
  const f = await fixture(); await f.invoke(); const target = 'b'.repeat(40); const sync = f.ops.syncMain;
  f.ops.syncMain = async () => { throw new SyncError('denied', false, null, undefined); };
  await assert.rejects(f.call('publish_sync_main', { expectedHead: base.head, targetHead: target }), /"attempted":false/);
  f.ops.syncMain = sync; assert.equal((await f.call('publish_sync_main', { expectedHead: base.head, targetHead: target })).state.head, target);
  f.ops.syncMain = async () => { throw new SyncError('unexpected', true, null, undefined); };
  await assert.rejects(f.call('publish_sync_main', { expectedHead: target, targetHead: 'c'.repeat(40) }), /"attempted":true/);
  await assert.rejects(f.call('publish_inspect', { untracked: [] }), /Run \/publish/);
});

test('replaced admission cannot launch a pending synchronization before or after approval', async () => {
  for (const timing of ['before-permission', 'during-approval']) {
    const f = await fixture(); await f.invoke(); const sync = f.ops.syncMain;
    const target = 'b'.repeat(40);
    // Replacing the binding mid-merge must not let the merge continue.
    const replacement = new Error('Publish session replaced');
    const original = sync;
    let queued: any;
    f.ops.syncMain = async (...args: any[]) => {
      if (timing === 'before-permission') {
        await f.invoke();
        queued = f.permissions.find((entry) => entry.action === 'shell');
      }
      try { return await original(...args); }
      catch (error) { throw new SyncError('Publish session replaced', false, null, error); }
    };
    if (timing === 'during-approval') f.setPermissionHook(async (input) => {
      if (input.action !== 'shell' || input.resources[0] !== `git merge --ff-only --no-edit ${target}`) return;
      // The approval is observed before the user answers it.
      const decision = f.approve({ sessionID: 's', callID: input.callID, action: 'shell', resources: [input.resources[0]], decision: 'allow' });
      assert.equal(decision?.decision, 'ask');
      await f.invoke();
      throw replacement;
    });
    await assert.rejects(f.call('publish_sync_main', { expectedHead: base.head, targetHead: target }), /"attempted":false/);
    if (timing === 'before-permission') {
      // A replaced binding is denied even though the merge was queued first.
      queued ??= f.permissions.find((entry) => entry.action === 'shell');
      assert.ok(queued, `queued=${JSON.stringify(f.permissions)}`);
      const denied = f.approve({ sessionID: 's', callID: queued.callID, action: 'shell', resources: [`git merge --ff-only --no-edit ${target}`], decision: 'allow' });
      assert.ok(denied === undefined || denied.decision === 'deny', `denied=${JSON.stringify(denied)}`);
    }
    assert.equal((await f.call('publish_inspect', { untracked: [] })).state.head, base.head);
  }
});

test('real sync denial can be retried and requires a new review before a real commit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'publish-sync-'));
  const origin = join(dir, 'origin.git'); const cwd = join(dir, 'work');
  const git = (root: string, args: string[]) => run(root, 'git', args, async () => {});
  try {
    await git(dir, ['init', '--bare', origin]); await git(dir, ['init', '-b', 'main', cwd]);
    await git(cwd, ['config', 'user.name', 'Test']); await git(cwd, ['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'one\n'); await git(cwd, ['add', 'file']); await git(cwd, ['commit', '-m', 'chore: initial']);
    await git(cwd, ['remote', 'add', 'origin', origin]); await git(cwd, ['push', 'origin', 'main']);
    const old = (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    const f = await fixture(cwd, { ...transaction, syncMain }); await f.invoke(); await f.call('publish_inspect', { untracked: [] });
    const other = join(dir, 'other'); await git(dir, ['clone', '-b', 'main', origin, other]);
    await git(other, ['config', 'user.name', 'Test']); await git(other, ['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(other, 'file'), 'two\n'); await git(other, ['add', 'file']); await git(other, ['commit', '-m', 'fix: upstream']); await git(other, ['push', 'origin', 'main']);
    const target = (await git(other, ['rev-parse', 'HEAD'])).trim();
    f.setPermissionHook(async input => { if (input.action === 'shell' && input.resources[0].startsWith('git merge ')) throw Error('denied'); });
    await assert.rejects(f.call('publish_sync_main', { expectedHead: old, targetHead: target }), /"attempted":false/);
    assert.equal((await git(cwd, ['rev-parse', 'HEAD'])).trim(), old);
    f.setPermissionHook(async () => {});
    assert.equal((await f.call('publish_sync_main', { expectedHead: old, targetHead: target })).state.head, target);
    await assert.rejects(f.call('publish_show', { id: 'old' }), /publish_inspect/);
    await writeFile(join(cwd, 'file'), 'three\n');
    const inspection = await f.call('publish_inspect', { untracked: [] });
    const id = inspection.hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
    await f.call('publish_show', { id });
    assert.equal((await f.call('commit_hunks', { ids: [id], message: 'fix: local' })).count, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('sync rejects malformed and stale heads and changed repository binding', async () => {
  for (const change of [{ root: '/other' }, { branch: 'other' }, { head: 'c'.repeat(40) }]) {
    const f = await fixture(); await f.invoke(); f.setState({ ...base, ...change });
    await assert.rejects(f.call('publish_sync_main', { expectedHead: base.head, targetHead: 'b'.repeat(40) }), /binding changed/);
  }
  const f = await fixture(); await f.invoke();
  await assert.rejects(f.call('publish_sync_main', { expectedHead: 'c'.repeat(40), targetHead: 'b'.repeat(40) }), /does not match/);
  await assert.rejects(f.call('publish_sync_main', { expectedHead: base.head, targetHead: 'bad' }), /Invalid synchronization HEAD/);
});

test('tool access marks inspection read and mutations edit', async () => {
  const f = await fixture();
  for (const name of ['publish_inspect', 'publish_show']) assert.equal(f.tools[name].access, 'read');
  for (const name of ['commit_hunks', 'publish_main', 'publish_pr', 'publish_sync_main']) assert.equal(f.tools[name].access, 'edit');
});

test('edit denial blocks commit and publish before repository operations', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a');
  let operations = 0;
  f.ops.inspectHunks = async () => { operations++; throw Error('unexpected'); };
  f.ops.inspectRepository = async () => { operations++; throw Error('unexpected'); };
  f.setPermissionHook(async (input) => { if (input.action === 'edit') throw Error('edit denied'); });
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: test' }), /edit denied/);
  const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'x' } }), /edit denied/);
  await assert.rejects(f.call('publish_main', {}), /edit denied/);
  await assert.rejects(f.call('publish_sync_main', { expectedHead: base.head, targetHead: 'b'.repeat(40) }), /edit denied/);
  assert.equal(operations, 0);
  assert.deepEqual(f.permissions.find((x) => x.action === 'edit'), { sessionID: 's', callID: 'call', action: 'edit', resources: ['/repo'] });
});

test('missing, substituted and denied skill abort before prompt', async () => {
  for (const skill of [[], [{ id: 'git-surgeon', path: '/evil', content: 'official' }], [{ id: 'git-surgeon', path: '/trusted/SKILL.md', content: 'substitute' }], [{ id: 'other', path: '/trusted/SKILL.md', content: 'official' }]]) {
    const f = await fixture(); f.setSkills(skill); await assert.rejects(f.invoke()); assert.equal(f.prompt, undefined);
  }
  const f = await fixture(); f.setDenied(true); await assert.rejects(f.invoke(), /denied/); assert.equal(f.prompt, undefined);
});

test('pending admission gates tools and rejection revokes access', async () => {
  const f = await fixture(); let reject!: (error: Error) => void; f.setPending(new Promise((_, r) => reject = r));
  const invocation = f.invoke(); await new Promise((r) => setImmediate(r));
  const call = f.call('commit_hunks', { ids: ['a'], message: 'fix: test' }); await new Promise((r) => setImmediate(r)); assert.equal(f.calls, 0);
  reject(Error('admission failed')); await assert.rejects(invocation, /admission failed/); await assert.rejects(call, /admission failed/); await assert.rejects(f.call('publish_inspect', { untracked: [] }), /Run/);
});

test('commit updates head and report, PR renders fields and rejects stale and malformed schemas', async () => {
  const f = await fixture(); await f.invoke();
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: test', extra: 1 }));
  await f.inspect('a');
  const commit = await f.call('commit_hunks', { ids: ['a'], message: 'fix: test' }); assert.equal(commit.count, 1); assert.equal(commit.invocationCreatedCount, 1);
  const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary', extra: 'x' } }));
  const result = await f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary' } });
  assert.equal(result.count, 1); assert.equal(f.publishArgs[1].head, commit.sha); assert.match(f.publishArgs[3].body, /Summary/);
  f.setTemplate(parseTemplate('template.md', '## Changed\n'));
  await assert.rejects(f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary' } }), /Template changed/);
});

test('schema reload from another session does not override session fingerprint', async () => {
  const f = await fixture(); await f.invoke(); const first = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  f.setTemplate(parseTemplate('template.md', '## Changed\n')); await f.invoke('other');
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint: first, fields: { summary_1: 'x' } }), /Template changed/);
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint: first, fields: { summary_1: 'x' } }, 'other'), /fingerprint/);
});

test('main publishes and serializes competing commits', async () => {
  const f = await fixture(); f.setState({ ...base, branch: 'main' }); await f.invoke();
  let active = 0, max = 0; const original = f.ops.commitHunks;
  f.ops.commitHunks = async (...args: any[]) => { active++; max = Math.max(active, max); await new Promise((r) => setTimeout(r, 10)); const value = await original(...args); active--; return value; };
  await f.inspect('a', 'b');
  const competing = await Promise.allSettled([f.call('commit_hunks', { ids: ['a'], message: 'fix: one' }), f.call('commit_hunks', { ids: ['b'], message: 'fix: two' })]);
  assert.deepEqual(competing.map((result) => result.status), ['fulfilled', 'rejected']);
  await f.inspect('b'); await f.call('commit_hunks', { ids: ['b'], message: 'fix: two' });
  assert.equal(max, 1); const result = await f.call('publish_main', {}); assert.equal(result.count, 2); assert.equal(result.push, 'pushed');
  await assert.rejects(f.call('publish_main', { extra: true }));
});

test('inspection and successful show of each selected base ID are required for the current snapshot', async () => {
  const f = await fixture(); await f.invoke();
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: one' }), /publish_inspect/);
  await f.call('publish_inspect', { untracked: [] });
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: one' }), /Show every/);
  await f.call('publish_show', { id: 'a' });
  const old = f.ops.inspectHunks;
  f.ops.inspectHunks = async (...args: any[]) => ({ ...await old(...args), hunks: 'changed' });
  await assert.rejects(f.call('commit_hunks', { ids: ['a:1-2'], message: 'fix: one' }), /snapshot changed/);
  assert.equal(f.calls, 0);
  await f.inspect('a'); await f.call('commit_hunks', { ids: ['a:1-2'], message: 'fix: one' });
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: two' }), /publish_inspect/);
});

test('commit partial failure reports created SHA and prior commits, and revokes the session', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a');
  await f.call('commit_hunks', { ids: ['a'], message: 'fix: one' }); await f.inspect('b');
  const sha = 'b'.repeat(40);
  f.ops.commitHunks = async () => { throw Object.assign(Error(`Commit created (${sha}); index not installed: validation failed`), { createdSha: sha, commitStatus: 'created', indexInstalled: false, mismatches: ['index'] }); };
  await assert.rejects(f.call('commit_hunks', { ids: ['b'], message: 'fix: two' }), (error: Error) => {
    assert.match(error.message, /"count":2/); assert.match(error.message, /"invocationCreatedCount":2/); assert.match(error.message, new RegExp(sha));
    assert.match(error.message, /"requestedMessage":"fix: two"/); assert.match(error.message, /"indexInstalled":false/); assert.match(error.message, /"mismatches":\["index"\]/); assert.match(error.message, /residualLastObserved/); return true;
  });
  await assert.rejects(f.call('publish_main', {}), /Run \/publish/);
});

test('typed publish failure exposes pushed state and remains retryable', async () => {
  const f = await fixture(); await f.invoke();
  let calls = 0;
  f.ops.publishBranch = async () => {
    if (++calls === 1) throw new PublishError('create denied', { phase: 'pr-create', push: 'pushed', remoteVerified: true, pr: 'absent', outgoingCommitCount: 1, head: base.head }, new Error('denied'));
    return { push: 'already-up-to-date', pr: 'known' };
  };
  const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  const input = { title: 'x', fingerprint, fields: { summary_1: 'summary' } };
  await assert.rejects(f.call('publish_pr', input), (error: Error) => {
    assert.match(error.message, /"push":"pushed"/); assert.match(error.message, /"pr":"absent"/);
    assert.match(error.message, /"outgoingCommitCount":1/); assert.match(error.message, /"invocationCreatedCount":0/); return true;
  });
  assert.equal((await f.call('publish_pr', input)).pr, 'known');
});

test('real publish retains a verified push after create permission denial and retries without duplicate effects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'publish-retry-'));
  const origin = join(dir, 'origin.git'); const cwd = join(dir, 'work'); const bin = join(dir, 'bin');
  const created = join(dir, 'created.json'); const url = 'https://github.com/acme/repo/pull/42';
  const git = (root: string, args: string[]) => run(root, 'git', args, async () => {});
  try {
    await mkdir(bin);
    await writeFile(join(bin, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst file = ${JSON.stringify(created)};\nif (args[0] !== 'pr') process.exit(2);\nif (args[1] === 'list') console.log(JSON.stringify(fs.existsSync(file) ? [{url:${JSON.stringify(url)},baseRefName:'main',headRefName:'feature',headRepositoryOwner:{login:'acme'}}] : []));\nelse if (args[1] === 'create') { fs.appendFileSync(file, JSON.stringify(args) + '\\n'); console.log(${JSON.stringify(url)}); }\nelse process.exit(2);\n`, { mode: 0o755 });
    await git(dir, ['init', '--bare', origin]); await git(dir, ['init', '-b', 'main', cwd]);
    await git(cwd, ['config', 'user.name', 'Test']); await git(cwd, ['config', 'user.email', 'test@example.invalid']);
    await writeFile(join(cwd, 'file'), 'base\n'); await git(cwd, ['add', 'file']); await git(cwd, ['commit', '-m', 'chore: base']);
    await git(cwd, ['remote', 'add', 'origin', origin]); await git(cwd, ['push', 'origin', 'main']);
    await git(cwd, ['checkout', '-b', 'feature']); await writeFile(join(cwd, 'file'), 'outgoing\n');
    await git(cwd, ['add', 'file']); await git(cwd, ['commit', '-m', 'feat: existing']);
    await writeFile(join(cwd, 'file'), 'wip\n');
    let pushes = 0; let creates = 0;
    const runner: typeof run = async (root, exe, args, permission, options) => {
      const result = await run(root, exe, args, permission, { ...options, env: { PATH: `${bin}:${process.env.PATH}` } });
      if (exe === 'git' && args[0] === 'push') pushes++;
      if (exe === 'gh' && args[0] === 'pr' && args[1] === 'create') creates++;
      if (exe === 'git' && args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/acme/repo.git\n';
      return result;
    };
    const f = await fixture(cwd, { ...transaction, publishBranch: (root: any, expected: any, mode: any, request: any, permission: any, _runner: any, signal: any, retry: any) => publishBranch(root, expected, mode, request, permission, runner, signal, retry) });
    f.setTemplate(parseTemplate(null, '')); await f.invoke();
    const inspection = await f.call('publish_inspect', { untracked: [] });
    const id = inspection.hunks.match(/^([a-zA-Z0-9_-]+) file\s/m)?.[1]; assert.ok(id);
    await f.call('publish_show', { id });
    const commit = await f.call('commit_hunks', { ids: [id], message: 'fix: wip' });
    const body = 'Evidence:\nnix fmt\nnix run home-manager -- build --flake .#koki\nnix build .#darwinConfigurations.mac.system --out-link result-darwin\n';
    const input = { title: 'Test PR', fingerprint: (f.tools.publish_pr.input.properties as any).fingerprint.const, body };
    f.setPermissionHook(async x => { if (x.action === 'shell' && x.resources[0].startsWith('gh pr create ')) throw Error('create denied'); });
    await assert.rejects(f.call('publish_pr', input), (error: Error) => {
      assert.ok(error.message.startsWith('Publish incomplete: '));
      const state = JSON.parse(error.message.slice('Publish incomplete: '.length));
      assert.equal(state.push, 'pushed'); assert.equal(state.remoteVerified, true); assert.equal(state.pr, 'absent');
      assert.equal(state.invocationCreatedCount, 1); assert.equal(state.outgoingCommitCount, 2);
      assert.deepEqual(state.commits, [{ sha: commit.sha, message: 'fix: wip' }]); assert.deepEqual(state.residualLastObserved, []);
      return true;
    });
    assert.equal((await git(dir, ['--git-dir', origin, 'rev-parse', 'refs/heads/feature'])).trim(), commit.sha);
    assert.equal(pushes, 1); assert.equal(creates, 0);
    await assert.rejects(readFile(created), { code: 'ENOENT' });
    f.setPermissionHook(async () => {});
    const retry = await f.call('publish_pr', input);
    assert.equal(retry.push, 'already-up-to-date'); assert.equal(retry.pr, 'known'); assert.equal(retry.prUrl, url);
    assert.equal(pushes, 1); assert.equal(creates, 1);
    assert.deepEqual((await readFile(created, 'utf8')).trim().split('\n').map(line => JSON.parse(line)), [['pr', 'create', '--repo', 'acme/repo', '--base', 'main', '--head', 'feature', '--title', input.title, '--body', body]]);
    const again = await f.call('publish_pr', input);
    assert.equal(again.push, 'already-up-to-date'); assert.equal(again.pr, 'known'); assert.equal(again.prUrl, url);
    assert.equal(pushes, 1); assert.equal(creates, 1);
    assert.equal((await readFile(created, 'utf8')).trim().split('\n').length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('publish partial failure retains commits and the workflow push report', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a'); await f.call('commit_hunks', { ids: ['a'], message: 'fix: one' });
  f.ops.publishBranch = async () => { throw Error('Push pushed; PR creation failed: denied'); };
  const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'summary' } }), (error: Error) => {
    assert.match(error.message, /Push pushed/); assert.match(error.message, /"count":1/); assert.match(error.message, /fix: one/); return true;
  });
});

test('no-template schema requires a body and publishes it unchanged', async () => {
  const f = await fixture(); f.setTemplate(parseTemplate(null, '')); await f.invoke();
  const schema = f.tools.publish_pr.input as any;
  assert.deepEqual(schema.required, ['title', 'fingerprint', 'body']); assert.equal(schema.properties.fingerprint.type, 'string');
  const fingerprint = schema.properties.fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'Title', fingerprint, body: '' }));
  await f.call('publish_pr', { title: 'Title', fingerprint, body: 'Evidence and summary' });
  assert.equal(f.publishArgs[3].body, 'Evidence and summary');
});

test('branch mode mismatch and changed root, branch, or head fail closed', async () => {
  for (const change of [{ root: '/other' }, { branch: 'other' }, { head: 'b'.repeat(40) }]) {
    const f = await fixture(); await f.invoke(); f.setState({ ...base, ...change });
    await assert.rejects(f.call('publish_main', {}), /binding changed/);
  }
  const f = await fixture(); await f.invoke(); await assert.rejects(f.call('publish_main', {}), /Branch does not match/);
  const g = await fixture(); g.setState({ ...base, branch: 'main' }); await g.invoke();
  const fingerprint = (g.tools.publish_pr.input.properties as any).fingerprint.const;
  await assert.rejects(g.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'x' } }), /Branch does not match/);
});

test('successful admission releases waiting tool and cleanup releases the approval hook', async () => {
  const f = await fixture(); let release!: () => void; f.setPending(new Promise((resolve) => { release = resolve; }));
  const invocation = f.invoke(); await new Promise((r) => setImmediate(r));
  let finished = false; const pending = f.call('publish_inspect', { untracked: [] }).then((x) => { finished = true; return x; });
  await new Promise((r) => setImmediate(r)); assert.equal(finished, false);
  release(); await invocation; assert.equal((await pending).hunks, 'hunks');
  await f.dispose(); assert.deepEqual(f.disposed, ['observe', 'dispose']);
  await assert.rejects(f.call('publish_inspect', { untracked: [] }), /Run \/publish/);
});

test('directory permissions are forwarded without an unconditional external-directory assertion', async () => {
  const f = await fixture();
  f.ops.inspectRepository = async (_cwd: string, permission: any) => { await permission('read', ['/repo']); return { ...base }; };
  const inspect = f.ops.inspectHunks;
  f.ops.inspectHunks = async (cwd: string, permission: any, ...rest: any[]) => { await permission('read', ['/repo/file']); return inspect(cwd, permission, ...rest); };
  await f.invoke(); await f.call('publish_inspect', { untracked: [] });
  assert.equal(f.permissions.some((x) => x.action === 'external_directory'), false);
  assert.deepEqual(f.permissions.find((x) => x.resources[0] === '/repo'), { sessionID: 's', callID: undefined, action: 'read', resources: ['/repo'] });
  assert.deepEqual(f.permissions.find((x) => x.resources[0] === '/repo/file'), { sessionID: 's', callID: 'call', action: 'read', resources: ['/repo/file'] });
});

test('approval rechecks template and clean binding before push using the raw permission callback', async () => {
  for (const mutation of ['template', 'root', 'head', 'dirty', 'none']) {
    const f = await fixture(); await f.invoke(); let pushed = false;
    const originalDiscover = f.ops.discoverTemplate;
    f.ops.discoverTemplate = async (root: string, permission: any) => { await permission('read', ['/repo/template']); return originalDiscover(root, permission); };
    const originalInspect = f.ops.inspectRepository;
    f.ops.inspectRepository = async (root: string, permission: any) => { await permission('read', ['/repo']); return originalInspect(root, permission); };
    f.setPermissionHook(async (input) => {
      if (input.action !== 'shell') return;
      if (mutation === 'template') f.setTemplate(parseTemplate('template.md', '## Changed\n'));
      if (mutation === 'root') f.setState({ ...base, root: '/other' });
      if (mutation === 'head') f.setState({ ...base, head: 'b'.repeat(40) });
      if (mutation === 'dirty') f.setState({ ...base, status: [' M changed'] });
    });
    f.ops.publishBranch = async (_root: string, _expected: unknown, _mode: string, _request: unknown, permission: any) => {
      await permission('shell', ['git push --no-follow-tags origin HEAD:refs/heads/feature']); pushed = true;
      return { push: 'pushed' };
    };
    const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
    const publish = f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'summary' } });
    if (mutation === 'none') { await publish; assert.equal(pushed, true); }
    else { await assert.rejects(publish, /Template changed|binding changed|not clean/); assert.equal(pushed, false); }
    assert.equal(f.permissions.filter((x) => x.action === 'shell').length, 1);
    assert.ok(f.permissions.some((x) => x.action === 'read' && x.resources[0] === '/repo/template'));
  }
});

test('template changed at create approval prevents PR creation and retains prior push and commits', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a'); await f.call('commit_hunks', { ids: ['a'], message: 'fix: one' });
  let pushed = false; let created = false;
  f.setPermissionHook(async (input) => { if (input.action === 'shell' && input.resources[0].startsWith('gh pr create ')) f.setTemplate(parseTemplate('template.md', '## Changed\n')); });
  f.ops.publishBranch = async (_root: string, _expected: unknown, _mode: string, _request: unknown, permission: any) => {
    await permission('shell', ['git push --no-follow-tags origin HEAD:refs/heads/feature']); pushed = true;
    try { await permission('shell', ['gh pr create --repo a/b --title x --body y']); created = true; }
    catch (error) { throw Error(`Push pushed; PR creation failed: ${String(error)}`); }
    return { push: 'pushed' };
  };
  const fingerprint = (f.tools.publish_pr.input.properties as any).fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'summary' } }), (error: Error) => {
    assert.match(error.message, /Push pushed/); assert.match(error.message, /Template changed/); assert.match(error.message, /"count":1/); return true;
  });
  assert.equal(pushed, true); assert.equal(created, false);
});

test('main push approval rechecks clean repository', async () => {
  const f = await fixture(); f.setState({ ...base, branch: 'main' }); await f.invoke(); let pushed = false;
  f.setPermissionHook(async (input) => { if (input.action === 'shell') f.setState({ ...base, branch: 'main', status: [' M changed'] }); });
  f.ops.publishBranch = async (_root: string, _expected: unknown, _mode: string, _request: unknown, permission: any) => {
    await permission('shell', ['git push --no-follow-tags origin HEAD:refs/heads/main']); pushed = true; return { push: 'pushed' };
  };
  await assert.rejects(f.call('publish_main', {}), /not clean/); assert.equal(pushed, false);
});

test('main loads and asserts only git-surgeon without a pr registry entry', async () => {
  const f = await fixture(); f.setState({ ...base, branch: 'main' });
  f.setSkills([{ id: 'git-surgeon', path: '/trusted/SKILL.md', content: 'official' }]);
  await f.invoke(); assert.deepEqual(f.loads, [false]);
  assert.deepEqual(f.prompt.skills, ['git-surgeon']);
  assert.deepEqual(f.permissions.filter(x => x.action === 'skill').map(x => x.resources), [['git-surgeon']]);
});

test('missing, duplicated, wrong-path, substituted or denied pr aborts before prompt and mutation', async () => {
  const git = { id: 'git-surgeon', path: '/trusted/SKILL.md', content: 'official' };
  const pr = { id: 'pr', path: '/trusted/pr/SKILL.md', content: 'pr official' };
  for (const entries of [[git], [git, pr, pr], [git, { ...pr, path: '/evil' }], [git, { ...pr, content: 'wrong' }]]) {
    const f = await fixture(); f.setSkills(entries); await assert.rejects(f.invoke(), /untrusted pr/);
    assert.equal(f.prompt, undefined); assert.equal(f.calls, 0);
    await assert.rejects(f.call('publish_inspect', { untracked: [] }), /Run \/publish/);
  }
  const f = await fixture(); f.setPermissionHook(async x => { if (x.action === 'skill' && x.resources[0] === 'pr') throw Error('pr denied'); });
  await assert.rejects(f.invoke(), /pr denied/); assert.equal(f.prompt, undefined); assert.equal(f.calls, 0);
});

test('command instructions prioritize templates and require observed evidence with no-template guidance', async () => {
  const instructions = await readFile(new URL('../instructions.md', import.meta.url), 'utf8');
  assert.match(instructions, /template.*take precedence/);
  assert.match(instructions, /Without a template use Summary, Evidence, and Merge Danger/);
  assert.match(instructions, /only observed diffs, committed changes and actual validation/);
  assert.match(instructions, /Never invent/);
  assert.match(instructions, /omit an incompatible visual/);
});
