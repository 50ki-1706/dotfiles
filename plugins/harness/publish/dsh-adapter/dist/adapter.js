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
import { fileURLToPath } from 'node:url';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { isModelInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { schemaProperties } from '@publish/core/input';
import { loadResourcesFrom } from '@publish/core/resources';
import { mountPublish } from '@publish/core';
export const name = 'publish';
/**
 * Services this plugin reads. Declared statically because cordis gates every
 * `ctx.<service>` access on the plugin's own inject list.
 */
export const inject = ['tools', 'commands', 'skills', 'workingDirectory', 'approval'];
/** The agent a tool call runs for. */
function agentOf(exec) {
    if (exec.agent === undefined)
        throw new Error('publish tools require an agent session');
    return exec.agent;
}
/** Build the core's tool-call identity from a DSH execution. */
function callOf(exec) {
    return { sessionID: agentOf(exec).session.id, callID: exec.callId, signal: exec.signal };
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
export function createDshHost(ctx, _config) {
    /** Agents whose `/publish` command is admitting, keyed by session id. */
    const bound = new Map();
    /** The agent whose `/publish` run is currently admitting. */
    let active;
    const agentFor = (sessionID) => {
        const agent = bound.get(sessionID);
        if (agent === undefined)
            throw new Error('Run /publish first');
        return agent;
    };
    const approve = async (agent, reason) => {
        const outcome = await ctx.approval.request({
            agent,
            toolName: 'publish',
            reason,
            signal: new AbortController().signal,
        });
        if (outcome !== 'allowed-once')
            throw new Error(`Publish approval ${outcome}: ${reason}`);
    };
    const skillsFor = async (agent, directory) => {
        const entries = [];
        for (const summary of await ctx.skills.list({ cwd: directory, scope: agent })) {
            const skill = await ctx.skills.get(summary.name, { cwd: directory, scope: agent });
            if (skill === undefined)
                continue;
            entries.push({ id: skill.name, path: skill.path ?? '', content: skill.content });
        }
        return entries;
    };
    return {
        begin(agent) {
            bound.set(agent.session.id, agent);
            active = agent;
        },
        end() {
            active = undefined;
        },
        async authorize(action, resources, options) {
            const sessionID = options?.call?.sessionID;
            const agent = sessionID === undefined ? active : bound.get(sessionID);
            if (agent === undefined)
                return;
            await approve(agent, `${action}: ${resources.join(' ')}`);
        },
        async directory(sessionID) {
            return ctx.workingDirectory.ensure(agentFor(sessionID));
        },
        async skills(directory) {
            const agent = active;
            if (agent === undefined)
                throw new Error('Run /publish first');
            return skillsFor(agent, directory);
        },
        async deliver(sessionID, prompt) {
            const agent = agentFor(sessionID);
            const directory = await ctx.workingDirectory.ensure(agent);
            const bodies = [];
            for (const id of prompt.skills) {
                const skill = await ctx.skills.get(id, { cwd: directory, scope: agent });
                if (skill === undefined)
                    throw new Error(`Missing or untrusted ${id} skill`);
                if (!isModelInvocable(skill))
                    throw new Error(`Skill ${id} is not model-invocable`);
                bodies.push({ type: 'text', text: renderSkillContent(skill) });
            }
            agent.send(createUserMessage({
                content: [{ type: 'text', text: prompt.text }, ...bodies],
                source: { kind: 'user' },
            }), 'next-turn', true);
        },
        async reloadTools() {
            // DSH projects each tool schema from its definition at request time, so a
            // changed `publish_pr` input needs no explicit reload.
        },
        observeApproval(listener) {
            return ctx.on('approval/request', async (request, next) => {
                const decision = listener(toApprovalRequest(request));
                if (decision === undefined)
                    return next();
                if (decision.decision === 'ask')
                    return next();
                return decision.decision === 'deny' ? 'rejected' : 'allowed-once';
            });
        },
    };
}
/** Adapt one DSH approval request to the host's vocabulary. */
function toApprovalRequest(request) {
    return {
        sessionID: request.agent.session.id,
        action: request.toolName,
        resources: request.reason === undefined ? [] : [request.reason],
        ...request.callId === undefined ? {} : { callID: request.callId },
        decision: 'allow',
    };
}
/** Project one core tool onto a DSH tool definition. */
function toToolDefinition(tool) {
    return defineTool({
        name: tool.name,
        description: tool.description,
        parameters: schemaProperties(tool.input),
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [
                { type: 'text', text: JSON.stringify(value) },
            ],
        },
        async execute(args, exec) {
            return tool.execute(args, callOf(exec));
        },
    });
}
/**
 * Register the publish plugin on the Harness.
 * @param ctx - the plugin context.
 * @param config - this row's configuration.
 */
export async function apply(ctx, config = {}) {
    const host = createDshHost(ctx, config);
    // The bundle's resources sit beside its package.json, one level above dist/.
    const mounted = await mountPublish(host, {
        ...config,
        loadResources: loadResourcesFrom(fileURLToPath(new URL('..', import.meta.url))),
    });
    for (const tool of mounted.tools) {
        ctx.tools.register(toToolDefinition(tool), { when: ({ agent }) => agent !== undefined });
    }
    const command = {
        name: mounted.command.name,
        description: mounted.command.description,
        handler: async ({ agent }) => {
            host.begin(agent);
            try {
                await mounted.command.execute(agent.session.id);
                return { kind: 'success', text: 'Publish binding admitted; follow the delivered instructions.' };
            }
            catch (error) {
                return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
            }
            finally {
                host.end();
            }
        },
    };
    ctx.commands.register(command);
    ctx.effect(() => async () => {
        await mounted.dispose();
    });
}
