import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublishPlugin } from './index.ts';
import { parseTemplate } from './template.ts';

const base = { root: '/repo', branch: 'feature', head: 'a'.repeat(40), status: [] as string[] };
const tc = (sessionID = 's') => ({ sessionID, agent: 'agent', messageID: 'm', id: 'call', signal: new AbortController().signal });
async function fixture() {
  let state = { ...base }; let template = parseTemplate('template.md', '## Summary\n');
  let skills = [{ id: 'git-surgeon', path: '/trusted/SKILL.md', content: 'official' }, { id: 'pr', path: '/trusted/pr/SKILL.md', content: 'pr official' }]; let loads: boolean[] = [];
  let denied = false; let pending: Promise<void> = Promise.resolve(); let calls = 0; let publishArgs: any[] = []; let onPermission = async (_input: any) => {};
  let command: any; let tools: Record<string, any> = {}; let prompt: any; const disposed: string[] = []; const permissions: any[] = [];
  const ops: any = {
    inspectRepository: async () => ({ ...state }),
    inspectHunks: async () => ({ state: { ...state }, hunks: 'hunks', stagedDiff: 'staged' }),
    showHunk: async () => 'shown',
    commitHunks: async (_root: any, _ids: any, message: string) => { calls++; state = { ...state, head: String(calls).repeat(40) }; return { sha: state.head, message, state: { ...state } }; },
    discoverTemplate: async () => template,
    publishBranch: async (...args: any[]) => { publishArgs = args; return { push: 'pushed', prUrl: 'https://github.com/a/b/pull/1' }; },
  };
  const ctx: any = {
    command: { transform: async (f: any) => { f({ add: (x: any) => command = x }); return { dispose: async () => { disposed.push('command'); } }; } },
    tool: { transform: async (f: any) => { ctx.tool.install = f; f({ add: (x: any) => tools[x.name] = x }); return { dispose: async () => { disposed.push('tool'); } }; }, reload: async () => { tools = {}; ctx.tool.install({ add: (x: any) => tools[x.name] = x }); } },
    session: { get: async () => ({ location: { directory: '/repo' } }), prompt: async (x: any) => { prompt = x; await pending; } },
    skill: { list: async () => ({ data: skills }) },
    permission: { assert: async (x: any) => { permissions.push(x); if (denied && x.action === 'skill') throw Error('denied'); await onPermission(x); } },
  };
  const dispose = await createPublishPlugin({ operations: ops, loadResources: async (includePrSkill) => { loads.push(includePrSkill); return { instructions: 'instructions', officialSkill: '---\nname: git-surgeon\n---\nofficial\n', trustedSkillPath: '/trusted/SKILL.md', ...(includePrSkill ? { prSkill: '---\nname: pr\n---\npr official\n', trustedPrSkillPath: '/trusted/pr/SKILL.md' } : {}) }; } }).setup(ctx);
  const invoke = (sessionID = 's', skills = [{ id: 'other' }]) => command.execute({ sessionID, prompt: { text: 'request', skills }, delivery: 'default' });
  const call = async (name: string, input: any, sessionID = 's') => JSON.parse((await tools[name].execute(input, tc(sessionID))).content);
  const inspect = async (...ids: string[]) => { await call('publish_inspect', { untracked: [] }); for (const id of ids) await call('publish_show', { id }); };
  return { invoke, call, inspect, dispose, disposed, permissions, get tools() { return tools; }, get prompt() { return prompt; }, get publishArgs() { return publishArgs; }, get calls() { return calls; }, get loads() { return loads; }, setSkills: (x: typeof skills) => skills = x, setDenied: (x: boolean) => denied = x, setPending: (x: Promise<void>) => pending = x, setTemplate: (x: typeof template) => template = x, setState: (x: typeof state) => state = x, setPermissionHook: (hook: typeof onPermission) => onPermission = hook, ops };
}

test('command registers, verifies and attaches skill and reloads required template fields', async () => {
  const f = await fixture(); await f.invoke();
  assert.deepEqual(f.prompt.skills, [{ id: 'other' }, { id: 'git-surgeon' }, { id: 'pr' }]);
  assert.match(f.prompt.text, /instructions/);
  assert.deepEqual(f.tools.publish_pr.input.required, ['title', 'fingerprint', 'fields']);
  assert.deepEqual(f.tools.publish_pr.input.properties.fields.required, ['summary_1']);
  assert.equal(f.tools.publish_pr.input.properties.fingerprint.type, 'string');
  assert.equal(f.tools.publish_pr.options.codemode, false);
});

test('tool visibility uses read for inspection and edit for mutations', async () => {
  const f = await fixture();
  for (const name of ['publish_inspect', 'publish_show']) assert.deepEqual(f.tools[name].options, { codemode: false, permission: 'read' });
  for (const name of ['commit_hunks', 'publish_main', 'publish_pr']) assert.deepEqual(f.tools[name].options, { codemode: false, permission: 'edit' });
});

test('edit denial blocks commit and publish before repository operations', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a');
  let operations = 0;
  f.ops.inspectHunks = async () => { operations++; throw Error('unexpected'); };
  f.ops.inspectRepository = async () => { operations++; throw Error('unexpected'); };
  f.setPermissionHook(async (input) => { if (input.action === 'edit') throw Error('edit denied'); });
  await assert.rejects(f.call('commit_hunks', { ids: ['a'], message: 'fix: test' }), /edit denied/);
  const fingerprint = f.tools.publish_pr.input.properties.fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'x' } }), /edit denied/);
  await assert.rejects(f.call('publish_main', {}), /edit denied/);
  assert.equal(operations, 0);
  assert.deepEqual(f.permissions.find((x) => x.action === 'edit'), { sessionID: 's', agent: 'agent', source: { type: 'tool', messageID: 'm', id: 'call' }, action: 'edit', resources: ['/repo'] });
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
  const commit = await f.call('commit_hunks', { ids: ['a'], message: 'fix: test' }); assert.equal(commit.count, 1);
  const fingerprint = f.tools.publish_pr.input.properties.fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary', extra: 'x' } }));
  const result = await f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary' } });
  assert.equal(result.count, 1); assert.equal(f.publishArgs[1].head, commit.sha); assert.match(f.publishArgs[3].body, /Summary/);
  f.setTemplate(parseTemplate('template.md', '## Changed\n'));
  await assert.rejects(f.call('publish_pr', { title: 'Title', fingerprint, fields: { summary_1: 'Summary' } }), /Template changed/);
});

test('schema reload from another session does not override session fingerprint', async () => {
  const f = await fixture(); await f.invoke(); const first = f.tools.publish_pr.input.properties.fingerprint.const;
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
  f.ops.commitHunks = async () => { throw Error(`Commit created (${sha}); index not installed: validation failed`); };
  await assert.rejects(f.call('commit_hunks', { ids: ['b'], message: 'fix: two' }), (error: Error) => {
    assert.match(error.message, /"count":2/); assert.match(error.message, new RegExp(sha));
    assert.match(error.message, /"requestedMessage":"fix: two"/); assert.match(error.message, /residualLastObserved/); return true;
  });
  await assert.rejects(f.call('publish_main', {}), /Run \/publish/);
});

test('publish partial failure retains commits and the workflow push report', async () => {
  const f = await fixture(); await f.invoke(); await f.inspect('a'); await f.call('commit_hunks', { ids: ['a'], message: 'fix: one' });
  f.ops.publishBranch = async () => { throw Error('Push pushed; PR creation failed: denied'); };
  const fingerprint = f.tools.publish_pr.input.properties.fingerprint.const;
  await assert.rejects(f.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'summary' } }), (error: Error) => {
    assert.match(error.message, /Push pushed/); assert.match(error.message, /"count":1/); assert.match(error.message, /fix: one/); return true;
  });
});

test('no-template schema requires a body and publishes it unchanged', async () => {
  const f = await fixture(); f.setTemplate(parseTemplate(null, '')); await f.invoke();
  const schema = f.tools.publish_pr.input;
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
  const fingerprint = g.tools.publish_pr.input.properties.fingerprint.const;
  await assert.rejects(g.call('publish_pr', { title: 'x', fingerprint, fields: { summary_1: 'x' } }), /Branch does not match/);
});

test('successful admission releases waiting tool and cleanup disposes registrations', async () => {
  const f = await fixture(); let release!: () => void; f.setPending(new Promise((resolve) => { release = resolve; }));
  const invocation = f.invoke(); await new Promise((r) => setImmediate(r));
  let finished = false; const pending = f.call('publish_inspect', { untracked: [] }).then((x) => { finished = true; return x; });
  await new Promise((r) => setImmediate(r)); assert.equal(finished, false);
  release(); await invocation; assert.equal((await pending).hunks, 'hunks');
  await f.dispose(); assert.deepEqual(f.disposed, ['command', 'tool']);
  await assert.rejects(f.call('publish_inspect', { untracked: [] }), /Run \/publish/);
});

test('directory permissions are forwarded without an unconditional external-directory assertion', async () => {
  const f = await fixture();
  f.ops.inspectRepository = async (_cwd: string, permission: any) => { await permission('read', ['/repo']); return { ...base }; };
  const inspect = f.ops.inspectHunks;
  f.ops.inspectHunks = async (cwd: string, permission: any, ...rest: any[]) => { await permission('read', ['/repo/file']); return inspect(cwd, permission, ...rest); };
  await f.invoke(); await f.call('publish_inspect', { untracked: [] });
  assert.equal(f.permissions.some((x) => x.action === 'external_directory'), false);
  assert.deepEqual(f.permissions.find((x) => x.resources[0] === '/repo'), { sessionID: 's', action: 'read', resources: ['/repo'] });
  assert.deepEqual(f.permissions.find((x) => x.resources[0] === '/repo/file'), { sessionID: 's', agent: 'agent', source: { type: 'tool', messageID: 'm', id: 'call' }, action: 'read', resources: ['/repo/file'] });
});

test('approval rechecks template and clean binding before push using raw permission callback', async () => {
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
    const fingerprint = f.tools.publish_pr.input.properties.fingerprint.const;
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
  const fingerprint = f.tools.publish_pr.input.properties.fingerprint.const;
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
  assert.deepEqual(f.prompt.skills, [{ id: 'other' }, { id: 'git-surgeon' }]);
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

test('managed skill duplicates are normalized and unrelated attachments preserved', async () => {
  const f = await fixture();
  await f.invoke('s', [{ id: 'other' }, { id: 'pr' }, { id: 'git-surgeon' }, { id: 'pr' }, { id: 'git-surgeon' }]); assert.deepEqual(f.prompt.skills.map((x: any) => x.id), ['other', 'git-surgeon', 'pr']);
});

test('command instructions prioritize templates and require observed evidence with no-template guidance', async () => {
  const instructions = await readFile(new URL('../../commands/publish.md', import.meta.url), 'utf8');
  assert.match(instructions, /template.*take precedence/);
  assert.match(instructions, /Without a template use Summary, Evidence, and Merge Danger/);
  assert.match(instructions, /only observed diffs, committed changes and actual validation/);
  assert.match(instructions, /Never invent/);
  assert.match(instructions, /omit an incompatible visual/);
});
