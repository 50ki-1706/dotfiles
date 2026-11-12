/**
 * A pi-ai adapter that assembles tool calls by id, for the opendesign route only.
 *
 * This is a replacement for `PiAiAdapter`'s stream path, scoped to one route.
 * Everything that is not about tool-call assembly — profile resolution,
 * credential resolution, model metadata, request headers, image projection, the
 * idle watchdog — is composed from the same building blocks the stock adapter
 * uses, so the route behaves identically except for the one step this shim
 * exists to fix.
 *
 * The behavioural differences from the stock path:
 *
 * 1. The response body is rewritten before pi-ai's index-keyed assembly runs
 *    (`wire/`), and the events are then folded by
 *    {@link IdKeyedToolCallAssembler}. Two calls the gateway labels with the
 *    same index but distinct ids stay two calls.
 * 2. Malformed completed arguments are kept as raw text instead of throwing
 *    `MALFORMED_RESPONSE`, so the tool layer reports `INVALID_ARGS` and the
 *    model can correct itself (deepseek-ai/deepseek-harness#7581).
 *
 * The class deliberately does not extend `PiAiAdapter`: the private snapshot
 * and the stream body are exactly what this shim replaces. The public
 * `LlmAdapter` seam is small, and every pi-ai building block it composes is
 * exported by its own module.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/id-keyed
 */
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm';
import { createModels } from '@deepseek-ai/dsh-llm-pi-ai/src/models.ts';
import { authContextFrom, credentialStoreFrom } from '@deepseek-ai/dsh-llm-pi-ai/src/auth.ts';
import { requestImageTarget } from '@deepseek-ai/dsh-llm-pi-ai/src/context.ts';
import { resolveApiKey } from './credentials.js';
import { resolveRoute } from './route.js';
import { streamCall } from './stream.js';
/**
 * Adapter that owns exactly one route and assembles its tool calls by id.
 */
export class IdKeyedPiAiAdapter extends LlmAdapter {
    snapshot;
    ctx;
    route;
    constructor(ctx, route) {
        super();
        this.ctx = ctx;
        this.route = route;
    }
    /**
     * The snapshot for the current configuration, memoized by profile identity.
     *
     * The adapter runs on behalf of the row that registered it, so the route
     * facts come from that row's own configuration every time.
     */
    current() {
        const profile = resolveRoute(this.ctx, this.route);
        if (this.snapshot?.profile === profile)
            return this.snapshot;
        const models = createModels({
            credentials: credentialStoreFrom(this.ctx),
            authContext: authContextFrom(this.ctx),
        });
        if (profile.piProvider !== undefined)
            models.setProvider(profile.piProvider);
        this.snapshot = { profile, models };
        return this.snapshot;
    }
    /** The exact pi-ai model descriptor for this route, or the configuration failure. */
    modelOf(snapshot, model) {
        const failure = snapshot.profile.modelErrors.get(model)
            ?? (snapshot.profile.piProvider === undefined ? snapshot.profile.catalogError : undefined);
        if (failure !== undefined)
            throw new LlmError(failure, 'INVALID_CONFIG');
        const resolved = snapshot.models.getModel(this.route.provider, model);
        if (resolved === undefined) {
            throw new LlmError(`pi-ai provider "${this.route.provider}" has no configured model "${model}"`, 'UNKNOWN_MODEL');
        }
        return resolved;
    }
    providerInfo(_provider) {
        return { id: this.route.provider, name: this.current().profile.displayName };
    }
    providerRetryPolicy(_provider) {
        return this.current().profile.retryPolicy;
    }
    imageRequestTarget(_provider, model, image) {
        const snapshot = this.current();
        this.modelOf(snapshot, model);
        return requestImageTarget(image, {
            maxPixels: snapshot.profile.requestImagePixelBudget,
            maxBytes: snapshot.profile.requestImageMaxBytes,
        });
    }
    listModels(_provider) {
        return Promise.resolve().then(() => {
            const snapshot = this.current();
            return snapshot.models.getModels(this.route.provider).map((model) => ({
                provider: this.route.provider,
                id: model.id,
                name: model.name,
                inputModalities: [...model.input],
            }));
        });
    }
    resolveModel(_provider, model, _signal) {
        return Promise.resolve().then(() => this.modelInfo(this.current(), model));
    }
    modelInfo(snapshot, model) {
        const resolved = this.modelOf(snapshot, model);
        const configuredMaxTokens = snapshot.profile.configuredMaxTokens.get(model);
        return {
            provider: this.route.provider,
            id: model,
            name: resolved.name,
            inputModalities: [...resolved.input],
            context: { contextWindow: resolved.contextWindow },
            ...configuredMaxTokens === undefined ? {} : { defaultMaxTokens: configuredMaxTokens },
        };
    }
    prepareCall(_provider, model, _signal) {
        const snapshot = this.current();
        return Promise.resolve({
            model: this.modelInfo(snapshot, model),
            stream: options => this.streamWithSnapshot(options, snapshot),
        });
    }
    stream(options) {
        return this.streamWithSnapshot(options, this.current());
    }
    /**
     * Stream one call against a frozen snapshot.
     *
     * The credential resolves here rather than inside `streamCall` so the await
     * happens before the watchdog starts, exactly as the stock adapter orders it.
     */
    async *streamWithSnapshot(options, snapshot) {
        if (options.stop !== undefined) {
            throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION');
        }
        const model = this.modelOf(snapshot, options.model);
        const apiKey = await resolveApiKey(this.ctx, this.route.provider, snapshot.profile.apiKeyEnv);
        yield* streamCall({
            ctx: this.ctx,
            provider: this.route.provider,
            profile: snapshot.profile,
            model,
            models: snapshot.models,
            apiKey,
        }, options);
    }
}
