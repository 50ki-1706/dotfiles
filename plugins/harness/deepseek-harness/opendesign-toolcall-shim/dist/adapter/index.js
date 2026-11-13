/**
 * The opendesign route's adapter, and the split that keeps every other route
 * on the stock code path.
 *
 * - {@link IdKeyedPiAiAdapter} replaces pi-ai's stream path for one route.
 * - {@link RouteSplittingAdapter} serves the whole route set from it plus the
 *   stock `PiAiAdapter`.
 * - `profile.ts` resolves the route profile from the row's own configuration,
 *   `route.ts` reads it for the plugin, `credentials.ts` resolves the key, and
 *   `headers.ts` and `stream.ts` hold the request path.
 *
 * @module dsh-opendesign-toolcall-shim/adapter
 */
export { resolveApiKey } from "./credentials.js";
export { requestHeaders } from "./headers.js";
export { IdKeyedPiAiAdapter } from "./id-keyed.js";
export { declaredProviders, resolveProfiles, resolveRouteProfile } from "./profile.js";
export { declaredProvidersOf, resolveRoute } from "./route.js";
export { RouteSplittingAdapter } from "./route-split.js";
export { streamCall } from "./stream.js";
