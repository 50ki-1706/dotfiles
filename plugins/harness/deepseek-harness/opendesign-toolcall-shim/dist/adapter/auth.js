/**
 * The two adapters between pi-ai's auth model and the harness credential plane.
 *
 * The stock adapter builds these from `@deepseek-ai/dsh-llm-pi-ai/src/auth.ts`,
 * a TypeScript source inside `node_modules` that the desktop app's Node refuses
 * to load. Both are thin: every pi-ai-specific concept stays on pi-ai's side,
 * and the harness seams they consume name nothing from pi-ai.
 *
 * - {@link credentialStoreFrom} is pi-ai's credential store, backed by the
 *   records this profile keeps under the `llm-pi-ai` scope.
 * - {@link authContextFrom} is pi-ai's ambient lookup, which resolves a
 *   credential reference through the same service before falling back to the
 *   launch environment.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/auth
 */
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
/** The credential scope the `llm-pi-ai` settings namespace owns. */
export const RECORD_SCOPE = 'llm-pi-ai';
/**
 * The credential-store key for one provider route.
 * @param providerId - the route key.
 * @returns the scoped record key.
 */
export function recordKeyFor(providerId) {
    return `${RECORD_SCOPE}:${providerId}`;
}
/**
 * pi-ai's credential store over the harness credential service.
 * @param ctx - the plugin context.
 * @returns the store pi-ai reads and writes.
 */
export function credentialStoreFrom(ctx) {
    return {
        async read(providerId) {
            const credentials = ctx.get('credentials');
            if (credentials === undefined)
                return undefined;
            const record = await credentials.readRecord(recordKeyFor(providerId));
            if (record === undefined)
                return undefined;
            return { type: record.kind === 'api-key' ? 'api_key' : 'oauth', ...record.value };
        },
        async list() {
            const records = await ctx.get('credentials')?.listRecords() ?? [];
            return records
                .filter(record => String(record.key).startsWith(`${RECORD_SCOPE}:`))
                .map(record => ({
                providerId: String(record.key).slice(RECORD_SCOPE.length + 1),
                type: record.kind === 'api-key' ? 'api_key' : 'oauth',
            }));
        },
        async modify(providerId, mutate) {
            const credentials = ctx.get('credentials');
            if (credentials === undefined)
                return undefined;
            return await credentials.modifyRecord(recordKeyFor(providerId), mutate);
        },
        async delete(providerId) {
            await ctx.get('credentials')?.deleteRecord(recordKeyFor(providerId));
        },
    };
}
/**
 * pi-ai's ambient lookup over the harness credential service and launch
 * environment.
 * @param ctx - the plugin context.
 * @returns the auth context pi-ai hands to a provider's auth method.
 */
export function authContextFrom(ctx) {
    return {
        async env(name) {
            const hit = await ctx.get('credentials')?.resolve(name);
            if (hit !== undefined)
                return hit.value;
            return launchEnvironmentOf(ctx).get(name)?.value;
        },
        async fileExists(path) {
            const fs = ctx.get('fs');
            if (fs === undefined)
                return false;
            const expanded = path.startsWith('~/') || path === '~'
                ? `${process.env.HOME ?? ''}${path.slice(1)}`
                : path;
            try {
                await fs.stat(expanded);
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
