/**
 * Mounting the adapter role.
 *
 * The row reuses the stock `llm-pi-ai` row's id, so the loader replaces that
 * row instead of adding a second one. That means this function must rebuild
 * everything the stock row provided: the stock `PiAiAdapter` for every route
 * the shim does not own, and the id-keyed adapter for the one it does.
 *
 * @module dsh-opendesign-toolcall-shim/plugin/adapter-role
 */
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { IdKeyedPiAiAdapter, RouteSplittingAdapter, declaredProviders, resolveApiKey, resolveProfiles, } from "../adapter/index.js";
import { authContextFrom, credentialStoreFrom } from "../adapter/auth.js";
import { DEFAULT_PROVIDER, DEFAULT_SETTINGS_NAMESPACE } from "./config.js";
/**
 * Build the stock adapter for the routes this shim does not own.
 *
 * It is constructed over the same profiles, so a non-shim route behaves exactly
 * as it did before the row was replaced.
 */
function createStockAdapter(ctx, declared) {
    return new PiAiAdapter({
        profiles: () => resolveProfiles(declared, 'deferred'),
        resolveApiKey: (provider, profile) => resolveApiKey(ctx, provider, profile.apiKeyEnv),
        auth: { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) },
        prepareHeaders: (request, headers) => ctx.waterfall('llm-pi-ai/request-headers', request, headers, () => headers),
        resolveAttachments: () => ctx.get('attachments'),
        resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
    });
}
/**
 * Mount the adapter role.
 * @param ctx - the plugin context of this row.
 * @param config - the row's configuration.
 */
export function mountAdapterRole(ctx, config) {
    const settingsNamespace = config.settingsNamespace ?? DEFAULT_SETTINGS_NAMESPACE;
    const shimProvider = config.provider ?? DEFAULT_PROVIDER;
    const declared = declaredProviders(ctx);
    const routes = Object.keys(declared);
    if (routes.length === 0) {
        ctx.logger.info('opendesign tool-call shim: no provider routes are declared; the shim stays dormant');
        return;
    }
    const shim = new IdKeyedPiAiAdapter(ctx, { settingsNamespace, provider: shimProvider });
    const stock = createStockAdapter(ctx, declared);
    let registration = ctx.llm.registerAdapter(routes, new RouteSplittingAdapter(shim, stock, shimProvider));
    const otherRoutes = routes.filter(route => route !== shimProvider).length;
    ctx.logger.info(`opendesign tool-call shim: route "${shimProvider}" now assembles tool calls by id`
        + ` (workaround for open-design#9369 / deepseek-harness#7581); ${otherRoutes}`
        + ' other route(s) keep the stock pi-ai adapter');
    ctx.effect(() => () => {
        registration?.replace([]);
        registration = undefined;
    });
}
