/**
 * Mounting the guard role.
 *
 * The guard is a separate row so it can be mounted on a profile whose adapter
 * is still the stock one — useful while the wire rewrite is being validated
 * against a real gateway.
 *
 * @module dsh-opendesign-toolcall-shim/plugin/guard-role
 */
import { describeRecovery, guardEffect } from "../guard/index.js";
/**
 * Mount the guard role.
 * @param ctx - the plugin context of this row.
 * @param config - the row's configuration.
 */
export function mountGuardRole(ctx, config) {
    const logRecoveries = config.logRecoveries ?? true;
    ctx.effect(guardEffect(ctx, logRecoveries
        ? recovery => ctx.logger.warn(describeRecovery(recovery))
        : undefined));
}
