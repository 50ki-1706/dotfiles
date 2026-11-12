import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { getEventListeners } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafePath, run, validateSelection } from '../src/core/runner.ts';
import { parseTemplate, renderTemplate } from '../src/core/template.ts';
import { inspectRepository } from '../src/core/transaction.ts';

async function waitForPid(path: string): Promise<number> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { const pid = Number(await readFile(path, 'utf8')); if (pid > 0) return pid; } catch { /* Wait for the marker. */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Process marker not observed');
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Process ${pid} was not reaped`);
}

test('selection rejects duplicates, invalid ranges and non-conventional messages', () => {
  validateSelection(['abc:1-3', 'def'], 'fix(scope)!: repair');
  for (const ids of [['-x'], ['abc', 'abc:1-2'], ['abc:3-2'], ['abc:0-1']]) {
    assert.throws(() => validateSelection(ids, 'fix: repair'));
  }
  for (const message of ['repair', 'fix: ', 'fix: x\ny', 'other: x']) {
    assert.throws(() => validateSelection(['abc'], message));
  }
});

test('sensitive paths are rejected in every path segment', () => {
  for (const path of ['.env', 'foo/.env.local/x', 'foo/id_rsa.pub', 'foo/a.pem']) assert.throws(() => assertSafePath(path));
  assert.doesNotThrow(() => assertSafePath('foo/.env.example'));
});

test('runner distinguishes permission denial from a launched command failure', async () => {
  await assert.rejects(run('/private/tmp', 'git', ['--version'], async () => { throw new Error('denied'); }), (error: Error & { commandStarted?: boolean }) => error.commandStarted === false);
  await assert.rejects(run('/private/tmp', 'git', ['not-a-git-command'], async () => {}), (error: Error & { commandStarted?: boolean }) => error.commandStarted === true);
});

test('runner checks permissions and executes git without a shell', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publish-runner-'));
  try {
    const actions: string[] = [];
    const output = await run(cwd, 'git', ['--version'], async (action) => { actions.push(action); });
    assert.match(output, /^git version/);
    assert.deepEqual(actions, ['shell']);
    await assert.rejects(run(cwd, 'git', ['--version'], async () => { throw new Error('denied'); }), /denied/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('runner handles spawn failure, abort, timeout, output cap and listener cleanup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publish-process-'));
  const permission = async () => {};
  const controller = new AbortController();
  try {
    await assert.rejects(run(cwd, 'git', [], permission, { env: { PATH: cwd }, timeout: 2000 }), /ENOENT/);
    controller.abort();
    await assert.rejects(run(cwd, 'git', [], permission, { signal: controller.signal }), /aborted/);
    const script = join(cwd, 'git');
    await writeFile(script, '#!/bin/sh\nprintf %s "$GIT_LITERAL_PATHSPECS"\n'); await chmod(script, 0o755);
    assert.equal(await run(cwd, 'git', [], permission, { env: { PATH: cwd, GIT_LITERAL_PATHSPECS: '0' } }), '1');
    await writeFile(script, '#!/bin/sh\nexec /usr/bin/head -c 1048577 /dev/zero\n'); await chmod(script, 0o755);
    await assert.rejects(run(cwd, 'git', [], permission, { env: { PATH: cwd }, timeout: 5000 }), /output limit/);
    await writeFile(script, '#!/bin/sh\nexec /bin/sleep 30\n');
    const signal = new AbortController();
    await assert.rejects(run(cwd, 'git', [], permission, { env: { PATH: cwd }, signal: signal.signal, timeout: 50 }), /timed out/);
    assert.equal(getEventListeners(signal.signal, 'abort').length, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('mid-flight abort terminates ordinary descendants and removes listener', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publish-descendant-'));
  const script = join(cwd, 'git'); const marker = join(cwd, 'pid');
  const controller = new AbortController();
  let running: Promise<string> | undefined;
  try {
    await writeFile(script, `#!/bin/sh\n/bin/sleep 30 &\necho $! > '${marker}'\nwait\n`); await chmod(script, 0o755);
    running = run(cwd, 'git', [], async () => {}, { env: { PATH: cwd }, signal: controller.signal, timeout: 5000 });
    running.catch(() => {});
    const pid = await waitForPid(marker);
    controller.abort(); await assert.rejects(running, /aborted/);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    await waitForExit(pid);
  } finally { controller.abort(); await running?.catch(() => {}); await rm(cwd, { recursive: true, force: true }); }
});

test('transient group signal failure is reported after deadline terminates the child', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publish-signal-'));
  const script = join(cwd, 'git'); const marker = join(cwd, 'pid');
  const controller = new AbortController(); const originalKill = process.kill;
  let running: Promise<string> | undefined; let failed = false;
  try {
    await writeFile(script, `#!/bin/sh\necho $$ > '${marker}'\nexec /bin/sleep 30\n`); await chmod(script, 0o755);
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid < 0 && !failed) { failed = true; throw Object.assign(new Error('signal denied'), { code: 'EPERM' }); }
      return originalKill(pid, signal);
    }) as typeof process.kill;
    running = run(cwd, 'git', [], async () => {}, { env: { PATH: cwd }, signal: controller.signal, timeout: 1000 });
    running.catch(() => {});
    const pid = await waitForPid(marker); controller.abort();
    await assert.rejects(running, (error: Error) => error instanceof AggregateError && /aborted/.test(error.message) && /signal denied/.test(error.message));
    assert.equal(failed, true); await waitForExit(pid);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  } finally { controller.abort(); await running?.catch(() => {}); process.kill = originalKill; await rm(cwd, { recursive: true, force: true }); }
});

test('template preserves fixed text, CRLF and checkboxes with unique duplicate headings', () => {
  const source = '## Summary\r\n<!-- Explain -->\r\n## Summary\r\n- [ ] Tested\r\n';
  const template = parseTemplate('.github/PULL_REQUEST_TEMPLATE.md', source);
  assert.deepEqual(template.slots.map((slot) => slot.key), ['summary_1', 'summary_2', 'checkbox_tested_1']);
  assert.equal(renderTemplate(template, { summary_1: 'First', summary_2: 'Second', checkbox_tested_1: true }), '## Summary\r\n\r\nFirst\r\n<!-- Explain -->\r\n## Summary\r\n\r\nSecond\r\n- [x] Tested\r\n');
});

test('template ignores fenced headings and recognizes Setext headings', () => {
  const template = parseTemplate('template', '```md\n# Not a heading\n```\nTitle\n=====\n');
  assert.deepEqual(template.slots.map((slot) => slot.key), ['title_1']);
});

test('template fails closed on unsupported structures and invalid fields', () => {
  assert.throws(() => parseTemplate('x', '```\n'));
  const template = parseTemplate(null, '');
  for (const values of [{}, { content_1: 'N/A' }, { content_1: '# injected' }, { content_1: 'x', extra: true }]) {
    assert.throws(() => renderTemplate(template, values));
  }
  assert.notEqual(template.fingerprint, parseTemplate('x', '').fingerprint);
});

test('inspection reports clean repository and rejects detached HEAD', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'publish-inspect-'));
  const permission = async () => {};
  try {
    await run(cwd, 'git', ['init', '-b', 'main'], permission);
    await run(cwd, 'git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'chore: initial'], permission);
    const state = await inspectRepository(cwd, permission);
    assert.equal(state.branch, 'main');
    assert.deepEqual(state.status, []);
    await run(cwd, 'git', ['checkout', '--detach'], permission);
    await assert.rejects(inspectRepository(cwd, permission));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
