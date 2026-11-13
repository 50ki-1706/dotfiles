/**
 * The plugin's entry point.
 *
 * The bundle declares two rows, both pointing at this module:
 *
 * - `id: llm-pi-ai` — the replacement adapter row. It reuses the stock row's
 *   id, so the loader replaces that row instead of adding a second one; the
 *   stock adapter never sees the shim's route, and every other route keeps
 *   exactly the stock code path.
 * - `id: opendesign-toolcall-guard` — the pre-dispatch guard that recovers
 *   concatenated or truncated arguments before dispatch.
 *
 * Both rows are optional: the module reads `role` from its config and does only
 * that job. Removing the bundle removes both, since nothing else in the profile
 * depends on it.
 *
 * @module dsh-opendesign-toolcall-shim
 */
import { mountAdapterRole } from "./plugin/adapter-role.js";
import { mountGuardRole } from "./plugin/guard-role.js";
export const name = 'opendesign-toolcall-shim';
/**
 * Services this plugin reads. Declared statically because cordis gates every
 * `ctx.<service>` access on the plugin's own inject list; a row that needs a
 * service the composition lacks simply stays dormant, which is what keeps the
 * bundle removable from a profile that mounts neither seam.
 */
export const inject = ['llm', 'credentials'];
/**
 * Mount one row.
 * @param ctx - the plugin context of this row.
 * @param config - the row's configuration.
 */
export function apply(ctx, config) {
    if (config.role === 'guard') {
        mountGuardRole(ctx, config);
        return;
    }
    mountAdapterRole(ctx, config);
}
