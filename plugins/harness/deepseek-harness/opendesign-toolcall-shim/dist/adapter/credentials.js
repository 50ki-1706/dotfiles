/**
 * Credential resolution through the harness seam.
 *
 * The stock adapter's rule, restated once so both the shim's adapter and the
 * stock adapter it constructs for other routes share it: a profile that names
 * no credential at all defers to pi-ai's provider-native discovery, and once
 * one is named, a miss must fail loud. Handing pi-ai `undefined` for a named
 * reference would let it pick up an unrelated ambient key and bill another
 * tenant.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/credentials
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/**
 * Resolve one route's credential.
 * @param ctx - the plugin context.
 * @param provider - the route key, for the diagnostic.
 * @param ref - the profile's credential reference.
 * @returns the credential, or `undefined` when the route names none.
 * @throws {LlmError} `MISSING_CREDENTIAL` when a named reference does not resolve.
 */
export async function resolveApiKey(ctx, provider, ref) {
    if (ref === undefined)
        return undefined;
    const credentials = ctx.get('credentials');
    const hit = credentials !== undefined
        ? (await credentials.resolve(ref))?.value
        : undefined;
    if (hit !== undefined && hit.length > 0)
        return hit;
    throw new LlmError(`llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not set`, 'MISSING_CREDENTIAL');
}
