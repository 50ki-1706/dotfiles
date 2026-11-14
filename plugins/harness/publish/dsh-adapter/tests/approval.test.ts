/**
 * Integration coverage for the fast-forward approval promotion.
 *
 * The unit tests in `index.test.ts` hand-build `ApprovalRequest` objects, so
 * they cannot see a lossy adapter mapping: an adapter that sends the tool name
 * as the action and folds the command into a free-form reason still passes
 * them while promoting nothing in a real session.
 *
 * These cases drive the adapter's own `apply()` against the production
 * `ApprovalService` and the production tool pipeline, so the mapping under
 * test is the one DSH actually runs.
 *
 * @module dsh-publish/tests/approval
 */

import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CommandRuntime } from '@deepseek-ai/dsh-commands'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { apply, inject, name } from '../src/adapter.ts'

const contexts: Context[] = []

after(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
})

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  },
})

/** One approval the test observed, with the outcome the chain produced. */
type Seen = { toolName: string; callId?: string; reason?: string; outcome: string }

/**
 * Mount the adapter on a real repository with an open turn.
 *
 * `ApprovalService.request` rejects an ask outside a turn, so the session gets
 * a `turn/start` exactly as the agent loop would have appended.
 */
async function harness(cwd: string): Promise<{ ctx: Context; agent: Agent; seen: Seen[] }> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('publish-approval'), {}, { cwd })
  agent.session.append('turn/start', { turn: 1 })

  const seen: Seen[] = []
  // Registered before the plugin, so it wraps the adapter's own listener and
  // records the outcome the adapter decided: a promoted request is refused
  // here, while a delegated one continues to the answerer below.
  ctx.on('approval/request', async (request, next) => {
    const entry: Seen = {
      toolName: request.toolName,
      ...request.callId === undefined ? {} : { callId: request.callId },
      ...request.reason === undefined ? {} : { reason: request.reason },
      outcome: 'delegated',
    }
    seen.push(entry)
    const outcome = await next()
    entry.outcome = outcome
    return outcome
  })
  await ctx.plugin({ name, inject, apply })
  // The interactive answerer a human drives: it grants what it is asked. It is
  // registered after the plugin so it sits below the core's promotion hook in
  // the waterfall; registered first, it would claim every request before the
  // hook ever saw it.
  ctx.on('approval/request', async () => 'allowed-once' as const)
  return { ctx, agent, seen }
}

/**
 * A repository whose `main` can fast-forward to `origin/main`.
 *
 * `publish_sync_main` fetches `refs/heads/main` from `origin`, so the remote
 * has to be real for the merge approval to be reached at all.
 */
async function repository(): Promise<{ cwd: string; origin: string; head: string; target: string }> {
  const origin = await mkdtemp(join(tmpdir(), 'publish-approval-origin-'))
  git(origin, 'init', '-q', '--bare', '-b', 'main')
  const cwd = await mkdtemp(join(tmpdir(), 'publish-approval-'))
  git(cwd, 'init', '-q', '-b', 'main')
  git(cwd, 'remote', 'add', 'origin', origin)
  await writeFile(join(cwd, 'a.txt'), 'one\n')
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-qm', 'chore: init')
  const head = git(cwd, 'rev-parse', 'HEAD').trim()
  git(cwd, 'push', '-q', 'origin', 'main')
  // A second commit on origin/main is the fast-forward target.
  await writeFile(join(cwd, 'b.txt'), 'two\n')
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-qm', 'chore: second')
  const target = git(cwd, 'rev-parse', 'HEAD').trim()
  git(cwd, 'push', '-q', 'origin', 'main')
  git(cwd, 'reset', '-q', '--hard', head)
  return { cwd, origin, head, target }
}

describe('fast-forward approval promotion through the real ApprovalService', () => {
  it('refuses the merge rather than silently treating promotion as an ordinary ask', async () => {
    const { cwd, origin, head, target } = await repository()
    try {
      const { ctx, agent, seen } = await harness(cwd)
      const admitted = await ctx.commands.execute(agent, '/publish', [], new AbortController().signal)
      assert.equal(admitted?.result.kind, 'success', 'the binding must admit before a tool call')
      agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      agent.session.append('turn/start', { turn: 2 })

      const signal = new AbortController().signal
      const toolSet = await ctx.tools.resolve({ agent, modelSelection: { provider: 'test', model: 'test' }, signal })
      const result = await executeModelToolFixture(ctx, {
        agent,
        signal,
        callId: ToolCallId('sync-1'),
        name: 'publish_sync_main',
        arguments: { expectedHead: head, targetHead: target },
        toolSet,
      })

      // The merge ask was promoted, and DSH cannot express "ask" as an
      // outcome, so the adapter refuses it instead of letting it pass as a
      // routine prompt the answerer would auto-grant.
      const merge = seen.find(entry => entry.callId === 'sync-1'
        && entry.reason === `shell: git merge --ff-only --no-edit ${target}`)
      assert.ok(merge, `the merge must raise an approval carrying the tool call id; saw ${JSON.stringify(seen.filter(e => e.callId === 'sync-1'))}`)
      assert.equal(merge.outcome, 'rejected')
      assert.equal(result.isError, true)
      // The merge never ran.
      assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), head)
    } finally {
      await rm(cwd, { recursive: true, force: true })
      await rm(origin, { recursive: true, force: true })
    }
  })

  it('leaves a merge ask the core did not queue on the ordinary path', async () => {
    const { cwd, origin, target } = await repository()
    try {
      const { ctx, agent, seen } = await harness(cwd)
      // Same command text as a real merge, but no pending sync for this call.
      // The promotion hook must not claim it, so the answerer grants it as an
      // ordinary ask and no merge is attempted.
      const outcome = await ctx.approval.request({
        agent,
        toolName: 'publish',
        reason: `shell: git merge --ff-only --no-edit ${target}`,
        callId: ToolCallId('unrelated'),
      })
      assert.equal(outcome, 'allowed-once')
      const request = seen.find(entry => entry.callId === 'unrelated')
      assert.ok(request)
      assert.equal(request.outcome, 'allowed-once')
    } finally {
      await rm(cwd, { recursive: true, force: true })
      await rm(origin, { recursive: true, force: true })
    }
  })
})
