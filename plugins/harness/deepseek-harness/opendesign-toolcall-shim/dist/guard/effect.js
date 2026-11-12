/**
 * Registering the guard on the shared `tools/pre-execute` waterfall.
 *
 * The guard never denies, never cancels, and never throws — it can only replace
 * the arguments of a call that would otherwise have failed validation. It
 * delegates with `next()` afterwards, so every other policy listener still runs
 * and can still deny the call.
 *
 * @module dsh-opendesign-toolcall-shim/guard/effect
 */
import { inspectArguments } from './inspect.js';
/**
 * Build the effect body that registers the guard.
 *
 * The listener belongs to the plugin's own fiber, so removing the plugin
 * removes it.
 *
 * The return value is the effect body's, not a disposer: callers hand it
 * straight to `ctx.effect()`, which is what ties the listener's lifetime to the
 * fiber. (`ctx.on` itself returns that effect's disposer, so returning its
 * result would nest one effect inside another and never run the listener.)
 * @param ctx - the plugin context owning the listener.
 * @param onRecovered - optional observer for a recovered call, for diagnostics.
 * @returns the effect body that installs the listener.
 */
export function guardEffect(ctx, onRecovered) {
    return () => ctx.on('tools/pre-execute', async (exec, next) => {
        try {
            const outcome = inspectArguments(exec.arguments);
            if (outcome.kind === 'untouched')
                return await next();
            exec.arguments = outcome.arguments;
            onRecovered?.({ toolName: exec.name, outcome });
        }
        catch (error) {
            // The guard is advisory: a failure to inspect must never fail the call.
            ctx.logger.warn(`opendesign tool-call guard: could not inspect arguments for "${exec.name}": ${String(error)}`);
        }
        return await next();
    });
}
/**
 * Describe a recovery for the log.
 * @param recovery - the observer's payload.
 * @returns a one-line diagnostic.
 */
export function describeRecovery(recovery) {
    const { toolName, outcome } = recovery;
    const detail = outcome.kind === 'split'
        ? `split ${outcome.count} concatenated objects, dispatched the first`
        : `repaired ${outcome.repair}`;
    return `opendesign tool-call guard: recovered arguments for tool "${toolName}" (${detail})`;
}
