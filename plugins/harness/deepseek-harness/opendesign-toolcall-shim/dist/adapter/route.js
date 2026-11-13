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
 * The resolution itself lives in `profile.ts`, because the stock resolver is a
 * TypeScript source inside `node_modules` that the desktop app's Node refuses
 * to load.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/route
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import { declaredProviders, resolveProfiles } from "./profile.js";
export { declaredProviders };
/**
 * The routes this shim's own row declares.
 * @param ctx - the plugin context of the shim's row.
 * @returns the declared providers, or an empty document.
 */
export function declaredProvidersOf(ctx) {
    return declaredProviders(ctx.fiber?.config);
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
    const profile = resolveProfiles(declaredProvidersOf(ctx), 'deferred').get(route.provider);
    if (profile === undefined) {
        throw new LlmError(`opendesign tool-call shim owns route "${route.provider}", which its own "${route.settingsNamespace}" configuration does not declare`, 'INVALID_CONFIG');
    }
    return profile;
}
