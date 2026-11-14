/**
 * The OpenCode adapter for the publish plugin.
 *
 * The publish core (`@publish/core`) knows nothing about OpenCode: it asks a
 * {@link PublishHost} for permission, directories, skills, and prompt delivery.
 * This module implements that host on `ctx.permission`, `ctx.session`,
 * `ctx.skill`, and `ctx.tool`, and registers the core's tools and command on
 * the runtime.
 *
 * OpenCode is the one harness that can express the core's fast-forward
 * promotion exactly: its permission hook lets a listener raise an evaluation
 * to `ask`, which stops an automatic allow and forces a human decision.
 *
 * @module @publish/opencode-adapter/adapter
 */
import { fileURLToPath } from 'node:url';
import { loadResourcesFrom } from '@publish/core/resources';
import { mountPublish } from '@publish/core';
/** The plugin id OpenCode reports for this plugin. */
export const name = 'publish';
/** Build the core's tool-call identity from an OpenCode execution. */
function callOf(context) {
    return { sessionID: context.sessionID, callID: context.id, signal: context.signal };
}
/**
 * Build the OpenCode host for the publish core.
 * @param ctx - the plugin context.
 * @returns the host the core calls.
 */
export function createOpencodeHost(ctx) {
    return {
        async authorize(action, resources, options) {
            const call = options?.call;
            // OpenCode attributes an ask to the tool call that raised it through
            // `source`, so the core's promotion hook can match the exact call.
            await ctx.permission.assert({
                sessionID: call?.sessionID ?? '',
                action,
                resources,
                ...call === undefined
                    ? {}
                    : { agent: undefined, source: { type: 'tool', id: call.callID } },
            });
        },
        async directory(sessionID) {
            const { location } = await ctx.session.get({ sessionID });
            return location.directory;
        },
        async skills(directory) {
            const { data } = await ctx.skill.list({ location: { directory } });
            return data.map((skill) => ({ id: skill.id, path: skill.path, content: skill.content }));
        },
        async deliver(sessionID, prompt) {
            // The runtime attaches skills by id from its own catalog, so the
            // instructions travel as text and the skill ids as attachments.
            await ctx.session.prompt({
                sessionID,
                text: prompt.text,
                skills: prompt.skills.map((id) => ({ id })),
            });
        },
        async reloadTools() {
            // The template-specific `publish_pr` schema is installed by the command;
            // the runtime re-reads tool definitions on reload.
            await ctx.tool.reload();
        },
        observeApproval(listener) {
            let disposed = false;
            ctx.permission.hook('evaluate', (event) => {
                if (disposed)
                    return;
                const decision = listener(toApprovalRequest(event));
                if (decision === undefined)
                    return;
                // OpenCode mutates the event to change the decision: `ask` raises an
                // automatic allow into a human question, which is exactly the
                // promotion the core asks for.
                event.effect = decision.decision;
                if (decision.reason !== undefined)
                    event.message = decision.reason;
            });
            return () => {
                disposed = true;
            };
        },
    };
}
/**
 * Adapt one OpenCode permission evaluation to the host's vocabulary.
 *
 * Exported for tests: the mapping is the seam the fast-forward promotion
 * depends on, and a lossy mapping silently disables it.
 */
export function toApprovalRequest(event) {
    return {
        sessionID: event.sessionID,
        action: event.action,
        resources: event.resources ?? [],
        ...event.source?.id === undefined ? {} : { callID: event.source.id },
        decision: event.effect === 'deny' ? 'deny' : event.effect === 'ask' ? 'ask' : 'allow',
    };
}
/** Project one core tool onto an OpenCode tool definition. */
function toToolDefinition(tool) {
    return {
        name: tool.name,
        description: tool.description,
        input: tool.input,
        options: { codemode: false, permission: tool.access },
        async execute(input, context) {
            const value = await tool.execute(input, callOf(context));
            return { content: JSON.stringify(value) };
        },
    };
}
/**
 * Create the publish plugin OpenCode loads.
 * @param options - resource overrides, for tests.
 * @returns the plugin object with its `setup`.
 */
export function createPublishPlugin(options = {}) {
    return {
        id: name,
        async setup(ctx) {
            const host = createOpencodeHost(ctx);
            // The bundle's resources sit beside its package.json, one level above dist/.
            const mounted = await mountPublish(host, {
                loadResources: options.loadResources ?? loadResourcesFrom(fileURLToPath(new URL('..', import.meta.url))),
            });
            const toolRegistration = await ctx.tool.transform((editor) => {
                for (const tool of mounted.tools)
                    editor.add(toToolDefinition(tool));
            });
            const command = {
                name: mounted.command.name,
                description: mounted.command.description,
                async execute({ sessionID }) {
                    await mounted.command.execute(sessionID);
                },
            };
            const commandRegistration = await ctx.command.transform((editor) => editor.add(command));
            return async () => {
                await mounted.dispose();
                await commandRegistration.dispose();
                await toolRegistration.dispose();
            };
        },
    };
}
export default createPublishPlugin();
