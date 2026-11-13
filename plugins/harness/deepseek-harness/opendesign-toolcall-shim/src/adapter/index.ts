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

export { resolveApiKey } from './credentials.ts'
export { requestHeaders } from './headers.ts'
export { IdKeyedPiAiAdapter } from './id-keyed.ts'
export { declaredProviders, resolveProfiles, resolveRouteProfile } from './profile.ts'
export type {
  PiAiModelProfile,
  PiAiProviderProfile,
  PiAiReasoningEfforts,
  ResolvedModel,
  ResolvedRouteProfile,
  ShimRoute,
} from './profile.ts'
export { declaredProvidersOf, resolveRoute } from './route.ts'
export type { DeclaredProviders } from './route.ts'
export { RouteSplittingAdapter } from './route-split.ts'
export type { RoutableAdapter } from './route-split.ts'
export { streamCall } from './stream.ts'
export type { StreamContext } from './stream.ts'
