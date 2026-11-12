/**
 * Serving a whole route set from two adapters.
 *
 * The shim's row replaces the stock `llm-pi-ai` row, so it must serve every
 * route that row served: the shim's own route through
 * {@link IdKeyedPiAiAdapter}, and every other route (mistral, …) through the
 * stock `PiAiAdapter`. This class is that split and nothing else — it exists so
 * the replacement row cannot silently drop a route.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/route-split
 */

import type { GenerateOptions, LlmImageRequestPricing, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import type { IdKeyedPiAiAdapter } from './id-keyed.ts'

/**
 * The subset of the adapter seam both adapters implement.
 *
 * Declared structurally rather than as `LlmAdapter` so the split can be tested
 * with doubles and so the compiler enforces that every method is forwarded.
 */
export interface RoutableAdapter {
  providerInfo(provider: string): LlmProviderInfo
  providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined
  imageRequestTarget(provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget
  imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined
  listModels(provider: string): Promise<readonly LlmModelInfo[]>
  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
  prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/**
 * Route every call to the adapter that owns the requested provider.
 */
export class RouteSplittingAdapter implements RoutableAdapter {
  private readonly shim: RoutableAdapter
  private readonly stock: RoutableAdapter
  private readonly shimProvider: string

  constructor(shim: RoutableAdapter | IdKeyedPiAiAdapter, stock: RoutableAdapter, shimProvider: string) {
    this.shim = shim
    this.stock = stock
    this.shimProvider = shimProvider
  }

  /** The adapter that owns one route. */
  private owner(provider: string): RoutableAdapter {
    return provider === this.shimProvider ? this.shim : this.stock
  }

  providerInfo(provider: string): LlmProviderInfo {
    return this.owner(provider).providerInfo(provider)
  }

  providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.owner(provider).providerRetryPolicy(provider)
  }

  imageRequestTarget(provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget {
    return this.owner(provider).imageRequestTarget(provider, model, image)
  }

  imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined {
    return this.owner(provider).imageRequestPricing(provider, model)
  }

  listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.owner(provider).listModels(provider)
  }

  resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.owner(provider).resolveModel(provider, model, signal)
  }

  prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return this.owner(provider).prepareCall(provider, model, signal)
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.owner(options.provider).stream(options)
  }
}
