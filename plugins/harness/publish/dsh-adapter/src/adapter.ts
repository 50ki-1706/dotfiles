/**
 * The DeepSeek Harness adapter for the publish plugin.
 *
 * The publish core (`../index.ts`) knows nothing about DSH: it asks a
 * {@link PublishHost} for permission, directories, skills, and prompt delivery.
 * This module implements that host on `ctx.tools`, `ctx.commands`,
 * `ctx.skills`, and `ctx.approval`, and registers the core's tools and command
 * on the Harness.
 *
 * @module dsh-publish/adapter
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { isModelInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalRequestEvent } from './dsh-types.ts'
import { schemaProperties } from '@publish/core/input'
import { loadResourcesFrom } from '@publish/core/resources'
import { mountPublish } from '@publish/core'
import type { PublishPlugin } from '@publish/core'
import type {
  ApprovalRequest,
  PermissionAction,
  PublishHost,
  PublishTool,
  SkillEntry,
  ToolCall,
} from '@publish/core/types'
import type { PublishConfig } from './config.ts'

export const name = 'publish'

/**
 * Services this plugin reads. Declared statically because cordis gates every
 * `ctx.<service>` access on the plugin's own inject list.
 */
export const inject = ['tools', 'commands', 'skills', 'workingDirectory', 'approval']

export type { PublishConfig }

/** The agent a tool call runs for. */
function agentOf(exec: ToolRunContext): Agent {
  if (exec.agent === undefined) throw new Error('publish tools require an agent session')
  return exec.agent
}

/** Build the core's tool-call identity from a DSH execution. */
function callOf(exec: ToolRunContext): ToolCall {
  return { sessionID: agentOf(exec).session.id, callID: exec.callId, signal: exec.signal }
}

/**
 * Build the DSH host for the publish core.
 *
 * A `/publish` run binds its agent for the duration of the command so later
 * tool calls can resolve the same session's directory and skills.
 * @param ctx - the plugin context.
 * @param config - this row's configuration.
 * @returns the host the core calls.
 */
export function createDshHost(ctx: Context, _config: PublishConfig): PublishHost & {
  /** Record the agent whose `/publish` run is admitting. */
  begin(agent: Agent): void
  /** Forget the agent after its `/publish` run settles. */
  end(): void
} {
  /** Agents whose `/publish` command is admitting, keyed by session id. */
  const bound = new Map<string, Agent>()
  /** The agent whose `/publish` run is currently admitting. */
  let active: Agent | undefined

  /**
   * The permission each in-flight ask is about, keyed by the tool call that
   * raised it.
   *
   * DSH's `approval/request` event carries only a tool name and a free-form
   * reason, so the core's action and resources would be lost on the way out.
   * The core's promotion hook matches on them, so the asker records them here
   * and the listener reads them back for the same call.
   */
  const asked = new Map<string, { action: PermissionAction; resources: string[] }>()
  const askKey = (sessionID: string, callID: string) => `${sessionID}\u0000${callID}`

  const agentFor = (sessionID: string): Agent => {
    const agent = bound.get(sessionID)
    if (agent === undefined) throw new Error('Run /publish first')
    return agent
  }

  const approve = async (agent: Agent, call: ToolCall | undefined, action: PermissionAction, resources: string[]): Promise<void> => {
    const reason = `${action}: ${resources.join(' ')}`
    const key = call === undefined ? undefined : askKey(call.sessionID, call.callID)
    if (key !== undefined) asked.set(key, { action, resources })
    try {
      const outcome: ApprovalOutcome = await ctx.approval.request({
        agent,
        toolName: 'publish',
        reason,
        // Forwarding the call id is what lets the core's promotion hook match
        // the request it queued to the approval DSH is deciding.
        ...call === undefined ? {} : { callId: call.callID as never },
        signal: call?.signal ?? new AbortController().signal,
      })
      if (outcome !== 'allowed-once') throw new Error(`Publish approval ${outcome}: ${reason}`)
    } finally {
      if (key !== undefined) asked.delete(key)
    }
  }

  const skillsFor = async (agent: Agent, directory: string): Promise<SkillEntry[]> => {
    const entries: SkillEntry[] = []
    for (const summary of await ctx.skills.list({ cwd: directory, scope: agent })) {
      const skill: SkillDefinition | undefined = await ctx.skills.get(summary.name, { cwd: directory, scope: agent })
      if (skill === undefined) continue
      entries.push({ id: skill.name, path: skill.path ?? '', content: skill.content })
    }
    return entries
  }

  return {
    begin(agent) {
      bound.set(agent.session.id, agent)
      active = agent
    },
    end() {
      active = undefined
    },
    async authorize(action: PermissionAction, resources: string[], options) {
      const sessionID = options?.call?.sessionID
      const agent = sessionID === undefined ? active : bound.get(sessionID)
      if (agent === undefined) return
      await approve(agent, options?.call, action, resources)
    },

    async directory(sessionID) {
      return ctx.workingDirectory.ensure(agentFor(sessionID))
    },

    async skills(directory) {
      const agent = active
      if (agent === undefined) throw new Error('Run /publish first')
      return skillsFor(agent, directory)
    },

    async deliver(sessionID, prompt) {
      const agent = agentFor(sessionID)
      const directory = await ctx.workingDirectory.ensure(agent)
      const bodies: ContentBlock[] = []
      for (const id of prompt.skills) {
        const skill: SkillDefinition | undefined = await ctx.skills.get(id, { cwd: directory, scope: agent })
        if (skill === undefined) throw new Error(`Missing or untrusted ${id} skill`)
        if (!isModelInvocable(skill)) throw new Error(`Skill ${id} is not model-invocable`)
        bodies.push({ type: 'text', text: renderSkillContent(skill) })
      }
      agent.send(
        createUserMessage({
          content: [{ type: 'text', text: prompt.text }, ...bodies],
          source: { kind: 'user' },
        }),
        'next-turn',
        true,
      )
    },

    async reloadTools() {
      // DSH projects each tool schema from its definition at request time, so a
      // changed `publish_pr` input needs no explicit reload.
    },

    observeApproval(listener) {
      return ctx.on('approval/request', async (
        request: ApprovalRequestEvent,
        next: () => Promise<ApprovalOutcome>,
      ): Promise<ApprovalOutcome> => {
        const decision = listener(toApprovalRequest(request, asked))
        // `undefined` leaves the harness's decision alone.
        if (decision === undefined) return next()
        if (decision.decision === 'deny') return 'rejected'
        if (decision.decision === 'allow') return 'allowed-once'
        // DSH has no "promote to ask" outcome: every request already goes to
        // the answerers, and the only grant is `allowed-once`. Delegating here
        // would make a promoted request indistinguishable from an ordinary one,
        // so the promotion would silently do nothing. Refuse instead: a
        // fast-forward merge the core wants a human to confirm must not run on
        // an answerer this adapter cannot distinguish from a routine prompt.
        return 'rejected'
      })
    },
  }
}

/**
 * Adapt one DSH approval request to the host's vocabulary.
 *
 * Exported for tests: the mapping is the seam the fast-forward promotion
 * depends on, and a lossy mapping silently disables it.
 */
export function toApprovalRequest(
  request: ApprovalRequestEvent,
  asked: ReadonlyMap<string, { action: PermissionAction; resources: string[] }>,
): ApprovalRequest {
  const sessionID = request.agent.session.id
  const callID = request.callId
  const recorded = callID === undefined ? undefined : asked.get(`${sessionID}\u0000${callID}`)
  return {
    sessionID,
    // DSH names the tool that asked, not the permission it wanted. The asker
    // recorded the real action and resources for this call; without them the
    // request cannot be matched and nothing is promoted.
    action: recorded?.action ?? request.toolName,
    resources: recorded?.resources ?? (request.reason === undefined ? [] : [request.reason]),
    ...callID === undefined ? {} : { callID },
    decision: 'allow',
  }
}

/** Project one core tool onto a DSH tool definition. */
function toToolDefinition(tool: PublishTool) {
  return defineTool({
    name: tool.name,
    description: tool.description,
    parameters: schemaProperties(tool.input) as never,
    output: {
      schema: { type: 'json' },
      render: (_args: unknown, value: unknown): ContentBlock[] => [
        { type: 'text', text: JSON.stringify(value) },
      ],
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      return tool.execute(args, callOf(exec)) as Promise<JsonValue>
    },
  })
}

/**
 * Register the publish plugin on the Harness.
 * @param ctx - the plugin context.
 * @param config - this row's configuration.
 */
export async function apply(ctx: Context, config: PublishConfig = {}): Promise<void> {
  const host = createDshHost(ctx, config)
  // The bundle's resources sit beside its package.json, one level above dist/.
  const mounted: PublishPlugin = await mountPublish(host, {
    ...config,
    loadResources: loadResourcesFrom(fileURLToPath(new URL('..', import.meta.url))),
  })

  for (const tool of mounted.tools) {
    ctx.tools.register(toToolDefinition(tool), { when: ({ agent }) => agent !== undefined })
  }

  const command: CommandDefinition = {
    name: mounted.command.name,
    description: mounted.command.description,
    handler: async ({ agent }) => {
      host.begin(agent)
      try {
        await mounted.command.execute(agent.session.id)
        return { kind: 'success', text: 'Publish binding admitted; follow the delivered instructions.' }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      } finally {
        host.end()
      }
    },
  }
  ctx.commands.register(command)

  ctx.effect(() => async () => {
    await mounted.dispose()
  })
}
