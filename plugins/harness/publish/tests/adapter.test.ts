/**
 * The DSH adapter against the real Harness services.
 *
 * These cases mount the production tool registry, command registry, skill
 * registry, and approval service through the agent-loop testkit, then drive the
 * adapter's `apply()` exactly as a profile row would. Nothing here is mocked:
 * the point is that the core's tools and `/publish` command reach a real
 * Agent, and that the approval seam decides the fast-forward request.
 *
 * @module dsh-publish/tests/adapter
 */

import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { CommandRuntime } from '@deepseek-ai/dsh-commands'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { apply, inject, name } from '../src/dsh/adapter.ts'

const contexts: Context[] = []

after(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
})

/** Mount the publish adapter on a fresh Harness context. */
async function harness(cwd: string): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('publish-adapter'), {}, { cwd })
  await ctx.plugin({ name, inject, apply })
  return { ctx, agent }
}

describe('DSH adapter', () => {
  it('registers every publish tool and the /publish command', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'publish-adapter-'))
    try {
      const { ctx, agent } = await harness(cwd)
      const names = ctx.tools.definitions().map(definition => definition.name)
      assert.deepEqual(names, [
        'publish_inspect',
        'publish_show',
        'commit_hunks',
        'publish_sync_main',
        'publish_main',
        'publish_pr',
      ])
      assert.deepEqual(ctx.commands.list(agent).map(command => command.name), ['publish'])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('exposes publish_pr with the no-template body schema before /publish runs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'publish-adapter-'))
    try {
      const { ctx } = await harness(cwd)
      const pr = ctx.tools.definitions().find(definition => definition.name === 'publish_pr')
      assert.ok(pr)
      assert.deepEqual(pr.parameters.required, ['title', 'fingerprint', 'body'])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('reports why /publish could not admit a binding', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'publish-adapter-'))
    try {
      const { ctx, agent } = await harness(cwd)
      const result = await ctx.commands.execute(agent, '/publish', [], new AbortController().signal)
      assert.ok(result)
      assert.equal(result.result.kind, 'error')
      // The approval seam refuses an ask outside an open turn, so the command
      // settles as an error rather than admitting a binding it cannot audit.
      assert.match(
        result.result.kind === 'error' ? result.result.text : '',
        /approval|skill|publish/i,
      )
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
