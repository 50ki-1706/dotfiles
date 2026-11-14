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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ApprovalRequestEvent } from './dsh-types.ts';
import type { ApprovalRequest, PermissionAction, PublishHost } from '@publish/core/types';
import type { PublishConfig } from './config.ts';
export declare const name = "publish";
/**
 * Services this plugin reads. Declared statically because cordis gates every
 * `ctx.<service>` access on the plugin's own inject list.
 */
export declare const inject: string[];
export type { PublishConfig };
/**
 * Build the DSH host for the publish core.
 *
 * A `/publish` run binds its agent for the duration of the command so later
 * tool calls can resolve the same session's directory and skills.
 * @param ctx - the plugin context.
 * @param config - this row's configuration.
 * @returns the host the core calls.
 */
export declare function createDshHost(ctx: Context, _config: PublishConfig): PublishHost & {
    /** Record the agent whose `/publish` run is admitting. */
    begin(agent: Agent): void;
    /** Forget the agent after its `/publish` run settles. */
    end(): void;
};
/**
 * Adapt one DSH approval request to the host's vocabulary.
 *
 * Exported for tests: the mapping is the seam the fast-forward promotion
 * depends on, and a lossy mapping silently disables it.
 */
export declare function toApprovalRequest(request: ApprovalRequestEvent, asked: ReadonlyMap<string, {
    action: PermissionAction;
    resources: string[];
}>): ApprovalRequest;
/**
 * Register the publish plugin on the Harness.
 * @param ctx - the plugin context.
 * @param config - this row's configuration.
 */
export declare function apply(ctx: Context, config?: PublishConfig): Promise<void>;
