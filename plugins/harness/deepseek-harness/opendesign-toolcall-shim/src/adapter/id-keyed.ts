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

import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type { Api, Model, Models, MutableModels, Provider } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import { authContextFrom, credentialStoreFrom } from './auth.ts'
import { resolveApiKey } from './credentials.ts'
import type { ResolvedModel, ResolvedRouteProfile } from './profile.ts'
import type { Protocol } from './protocols.ts'
import { PROTOCOLS, SUPPORTED_PROTOCOLS } from './protocols.ts'
import { resolveRoute } from './route.ts'
import type { ShimRoute } from './route.ts'
import { streamCall } from './stream.ts'

/** One resolution's frozen view: the profile and the pi-ai collection built from it. */
interface ShimSnapshot {
  readonly profile: ResolvedRouteProfile
  readonly models: Models
}

/**
 * Adapter that owns exactly one route and assembles its tool calls by id.
 */
export class IdKeyedPiAiAdapter extends LlmAdapter {
  private snapshot: ShimSnapshot | undefined
  private readonly ctx: Context
  private readonly route: ShimRoute

  constructor(ctx: Context, route: ShimRoute) {
    super()
    this.ctx = ctx
    this.route = route
  }

  /**
   * The snapshot for the current configuration, memoized by profile identity.
   *
   * The adapter runs on behalf of the row that registered it, so the route
   * facts come from that row's own configuration every time. Each snapshot
   * gets a fresh pi-ai collection holding this route's provider, which is what
   * an operation that already captured a snapshot keeps using.
   */
  private current(): ShimSnapshot {
    const profile = resolveRoute(this.ctx, this.route)
    if (this.snapshot?.profile === profile) return this.snapshot
    // pi-ai resolves a route's credential through the store and ambient
    // context it was built with, so the collection carries the harness seams
    // exactly as the stock adapter's does.
    const models: MutableModels = builtinModels({
      credentials: credentialStoreFrom(this.ctx),
      authContext: authContextFrom(this.ctx),
    })
    models.clearProviders()
    models.setProvider(createRouteProvider(profile))
    this.snapshot = { profile, models }
    return this.snapshot
  }

  /** The exact pi-ai model descriptor for this route, or the configuration failure. */
  private modelOf(snapshot: ShimSnapshot, model: string): Model<Api> {
    const failure = snapshot.profile.modelErrors.get(model)
    if (failure !== undefined) throw new LlmError(failure, 'INVALID_CONFIG')
    const resolved = snapshot.models.getModel(this.route.provider, model)
    if (resolved === undefined) {
      throw new LlmError(
        `pi-ai provider "${this.route.provider}" has no configured model "${model}"`,
        'UNKNOWN_MODEL',
      )
    }
    return resolved
  }

  override providerInfo(_provider: string): LlmProviderInfo {
    return { id: this.route.provider, name: this.current().profile.displayName }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined {
    return this.current().profile.retryPolicy
  }

  override imageRequestTarget(_provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget {
    const snapshot = this.current()
    this.modelOf(snapshot, model)
    return {
      ...requestImageDimensions(image.width, image.height, snapshot.profile.requestImagePixelBudget),
      maxBytes: snapshot.profile.requestImageMaxBytes,
    }
  }

  override listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve().then(() => {
      const snapshot = this.current()
      return snapshot.models.getModels(this.route.provider).map((model): LlmModelInfo => ({
        provider: this.route.provider,
        id: model.id,
        name: model.name,
        inputModalities: [...model.input],
      }))
    })
  }

  override resolveModel(_provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return Promise.resolve().then(() => this.modelInfo(this.current(), model))
  }

  private modelInfo(snapshot: ShimSnapshot, model: string): LlmResolvedModelInfo {
    const resolved = this.modelOf(snapshot, model)
    const configuredMaxTokens = snapshot.profile.configuredMaxTokens.get(model)
    return {
      provider: this.route.provider,
      id: model,
      name: resolved.name,
      inputModalities: [...resolved.input],
      context: { contextWindow: resolved.contextWindow },
      ...configuredMaxTokens === undefined ? {} : { defaultMaxTokens: configuredMaxTokens },
    }
  }

  override prepareCall(_provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const snapshot = this.current()
    return Promise.resolve({
      model: this.modelInfo(snapshot, model),
      stream: options => this.streamWithSnapshot(options, snapshot),
    })
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithSnapshot(options, this.current())
  }

  /**
   * Stream one call against a frozen snapshot.
   *
   * The credential resolves here rather than inside `streamCall` so the await
   * happens before the watchdog starts, exactly as the stock adapter orders it.
   */
  private async * streamWithSnapshot(
    options: GenerateOptions,
    snapshot: ShimSnapshot,
  ): AsyncIterable<StreamChunk> {
    if (options.stop !== undefined) {
      throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION')
    }
    const model = this.modelOf(snapshot, options.model)
    const apiKey = await resolveApiKey(this.ctx, this.route.provider, snapshot.profile.apiKeyEnv)
    yield* streamCall({
      ctx: this.ctx,
      provider: this.route.provider,
      profile: snapshot.profile,
      model,
      models: snapshot.models,
      apiKey,
    }, options)
  }
}

/**
 * Build the pi-ai provider for one route.
 *
 * The stock adapter reuses the installed catalog provider so its protocol
 * implementations and quirks stay pi-ai's own. This route is hand-declared, so
 * the provider is built the same way the stock resolver builds one: the
 * protocol factory pi-ai ships for the route's `api`, the route's endpoint and
 * models, and the harness credential seam as its authentication.
 * @param profile - the resolved route profile.
 * @returns the provider to register in the pi-ai collection.
 */
function createRouteProvider(profile: ResolvedRouteProfile): Provider {
  const factory = protocolFor(profile.api)
  const models = profile.models.map(toPiModel)
  return {
    id: profile.provider,
    name: profile.displayName,
    ...profile.baseURL === undefined ? {} : { baseUrl: profile.baseURL },
    // pi-ai resolves a route's credential through this method: the harness
    // credential is handed in when one is stored, and the method reports it
    // back as the request's API key.
    auth: {
      apiKey: {
        name: profile.displayName,
        resolve: ({ credential }: { credential?: { key?: string } }) => Promise.resolve({
          auth: credential?.key === undefined ? {} : { apiKey: credential.key },
          source: profile.displayName,
        }),
      },
    },
    getModels: () => models,
    stream: (model: never, context: never, options: never) => factory.stream(model, context, options),
    // pi-ai's simple path calls the provider's own `streamSimple`, so the
    // route's protocol is reached through it as well.
    streamSimple: (model: never, context: never, options: never) => factory.stream(model, context, options),
  } as unknown as Provider
}

/**
 * The pi-ai protocol implementation for one route's `api`.
 * @param api - the route's wire protocol.
 * @returns the protocol factory.
 * @throws {LlmError} `INVALID_CONFIG` for a protocol this build cannot serve.
 */
function protocolFor(api: string | undefined): Protocol {
  const factory = api === undefined ? undefined : PROTOCOLS[api]
  if (factory === undefined) {
    throw new LlmError(
      `opendesign tool-call shim cannot serve api "${String(api)}"; supported protocols are ${SUPPORTED_PROTOCOLS.join(', ')}`,
      'INVALID_CONFIG',
    )
  }
  return factory()
}

/**
 * Project one resolved model into the descriptor pi-ai's collection holds.
 * @param model - the resolved model.
 * @returns the pi-ai model descriptor.
 */
function toPiModel(model: ResolvedModel): Model<Api> {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    provider: model.provider,
    baseUrl: model.baseUrl,
    input: [...model.input],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning,
    ...model.thinkingLevelMap === undefined ? {} : { thinkingLevelMap: model.thinkingLevelMap },
    ...model.compat === undefined ? {} : { compat: model.compat },
  } as unknown as Model<Api>
}
