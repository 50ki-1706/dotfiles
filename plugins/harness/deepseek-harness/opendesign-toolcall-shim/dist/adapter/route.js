/**
 * Reading the shim's own route configuration.
 *
 * The shim's adapter row reuses the stock `llm-pi-ai` row's id, so the
 * profile's `providers` document lands in this plugin's own fiber config
 * verbatim. Reading it from there — rather than looking the namespace up
 * through the settings service — is both authoritative and independent of
 * whether a settings form exists for the row: a plugin without a schemastery
 * `Config` export has no form, and its config is still live.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/route
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai/src/config.ts';
/**
 * The `providers` document this shim's own row was configured with.
 * @param ctx - the plugin context of the shim's row.
 * @returns the declared providers, or an empty document.
 */
export function declaredProviders(ctx) {
    const config = ctx.fiber?.config;
    return config?.providers ?? {};
}
/**
 * Resolve the route profile from the row's own configuration.
 *
 * A route the row does not declare is a configuration error, not a silent
 * no-op: the shim only ever registers a route it can serve.
 * @param ctx - the plugin context of the shim's row.
 * @param route - the route to resolve.
 * @returns the resolved profile.
 * @throws {LlmError} `INVALID_CONFIG` when the row does not declare the route.
 */
export function resolveRoute(ctx, route) {
    const profile = resolveProfiles(declaredProviders(ctx), 'deferred').get(route.provider);
    if (profile === undefined) {
        throw new LlmError(`opendesign tool-call shim owns route "${route.provider}", which its own "${route.settingsNamespace}" configuration does not declare`, 'INVALID_CONFIG');
    }
    return profile;
}
