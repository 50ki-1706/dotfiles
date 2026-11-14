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
import type { ResourceLoader } from '@publish/core/resources';
import type { ApprovalRequest, PublishHost } from '@publish/core/types';
import type { PermissionEvaluation, PluginContext } from './types.ts';
/** The plugin id OpenCode reports for this plugin. */
export declare const name = "publish";
/** The plugin object OpenCode loads. */
export type PublishPluginModule = {
    id: string;
    setup(ctx: PluginContext): Promise<() => Promise<void>>;
};
/** Options, injectable for tests. */
export type AdapterOptions = {
    /** Overrides the bundled resource loader. */
    loadResources?: ResourceLoader;
};
/**
 * Build the OpenCode host for the publish core.
 * @param ctx - the plugin context.
 * @returns the host the core calls.
 */
export declare function createOpencodeHost(ctx: PluginContext): PublishHost;
/**
 * Adapt one OpenCode permission evaluation to the host's vocabulary.
 *
 * Exported for tests: the mapping is the seam the fast-forward promotion
 * depends on, and a lossy mapping silently disables it.
 */
export declare function toApprovalRequest(event: PermissionEvaluation): ApprovalRequest;
/**
 * Create the publish plugin OpenCode loads.
 * @param options - resource overrides, for tests.
 * @returns the plugin object with its `setup`.
 */
export declare function createPublishPlugin(options?: AdapterOptions): PublishPluginModule;
declare const _default: PublishPluginModule;
export default _default;
