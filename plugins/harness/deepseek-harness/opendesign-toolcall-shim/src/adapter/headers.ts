/**
 * Request headers for one pi-ai call.
 *
 * The contract every adapter honors: start from the profile's headers, let the
 * `llm-pi-ai/request-headers` waterfall contribute, then apply Harness
 * attribution last so a contributor cannot replace it.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/headers
 */

import type { Context } from '@deepseek-ai/cordis'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai/src/config.ts'

/**
 * Build the headers for one request.
 * @param ctx - the plugin context owning the waterfall.
 * @param provider - the route key.
 * @param profile - the resolved route profile.
 * @param options - the call being prepared.
 * @param baseURL - the endpoint the request will reach.
 * @returns the headers to send.
 */
export function requestHeaders(
  ctx: Context,
  provider: string,
  profile: ResolvedPiAiProviderProfile,
  options: GenerateOptions,
  baseURL: string,
): Record<string, string> {
  const initial = new Headers()
  // Profile aliases overwrite case-insensitively; the Headers constructor appends them.
  for (const [name, value] of Object.entries(profile.headers ?? {})) initial.set(name, value)
  const headers = ctx.waterfall(
    'llm-pi-ai/request-headers',
    {
      provider,
      model: options.model,
      baseURL,
      ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
      ...options.purpose === undefined ? {} : { purpose: options.purpose },
    },
    initial,
    () => initial,
  )
  for (const [name, value] of Object.entries(attributionHeaders())) headers.set(name, value)
  return Object.fromEntries(headers)
}
