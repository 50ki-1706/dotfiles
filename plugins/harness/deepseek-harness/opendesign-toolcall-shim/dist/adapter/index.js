/**
 * The opendesign route's adapter, and the split that keeps every other route
 * on the stock code path.
 *
 * - {@link IdKeyedPiAiAdapter} replaces pi-ai's stream path for one route.
 * - {@link RouteSplittingAdapter} serves the whole route set from it plus the
 *   stock `PiAiAdapter`.
 * - `route.ts` reads the route profile, `credentials.ts` resolves the key, and
 *   `headers.ts` and `stream.ts` hold the request path.
 *
 * @module dsh-opendesign-toolcall-shim/adapter
 */
export { resolveApiKey } from './credentials.js';
export { requestHeaders } from './headers.js';
export { IdKeyedPiAiAdapter } from './id-keyed.js';
export { declaredProviders, resolveRoute } from './route.js';
export { RouteSplittingAdapter } from './route-split.js';
export { streamCall } from './stream.js';
