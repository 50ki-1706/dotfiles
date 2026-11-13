/**
 * Resolving one route's profile from the shim row's own configuration.
 *
 * The shim's adapter row reuses the stock `llm-pi-ai` row's id, so the
 * profile's `providers` document lands in this plugin's own fiber config
 * verbatim. Reading it from there — rather than looking the namespace up
 * through the settings service — is both authoritative and independent of
 * whether a settings form exists for the row.
 *
 * This module exists because the shim cannot import the stock resolver: it
 * lives at `@deepseek-ai/dsh-llm-pi-ai/src/config.ts`, a TypeScript source
 * inside `node_modules`, and Node refuses to strip types there
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). The desktop app ships that
 * package as `src/*.ts` plus `lib/index.js`, so a deep import of it fails to
 * load the whole bundle. Only the public entry point is loadable.
 *
 * What is reproduced here is the part of the stock resolution the shim's
 * adapter reads: the scalar defaults, the credential reference, the retry
 * policy, and the per-model descriptor the pi-ai collection is built from.
 * The shape is the stock `ResolvedPiAiProviderProfile`, narrowed to the fields
 * this adapter uses.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/profile
 */

import type { Api, Model, ModelThinkingLevel } from '@earendil-works/pi-ai'
import { LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'

/** One modality a model accepts. */
export type PiAiModality = 'text' | 'image'

/** Wire spellings of the reasoning levels a profile may declare. */
export type PiAiReasoningEfforts = Partial<Record<ModelThinkingLevel, string | null>>

/** The configured fields of one model entry. */
export interface PiAiModelProfile {
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
  readonly input?: readonly PiAiModality[]
  readonly reasoningEfforts?: false | PiAiReasoningEfforts
  readonly compat?: Readonly<Record<string, unknown>>
}

/** The configured fields of one route. */
export interface PiAiProviderProfile {
  readonly apiKeyEnv?: string
  readonly displayName?: string
  readonly api?: string
  readonly baseURL?: string
  readonly models?: readonly PiAiModelProfile[]
  readonly compat?: Readonly<Record<string, unknown>>
  readonly defaultContextWindow?: number
  readonly defaultMaxTokens?: number
  readonly defaultInput?: readonly PiAiModality[]
  readonly headers?: Readonly<Record<string, string>>
  readonly reasoning?: ModelThinkingLevel
  readonly thinkingBudgets?: Readonly<Record<string, number>>
  readonly cacheRetention?: string
  readonly transport?: string
  readonly timeoutMs?: number
  readonly websocketConnectTimeoutMs?: number
  readonly streamIdleTimeoutMs?: number
  readonly maxRequestImageBytes?: number
  readonly maxRequestImages?: number
  readonly imageOffloadCountQuantum?: number
  readonly requestImagePixelBudget?: number
  readonly requestImageMaxBytes?: number
  readonly retryPolicy?: unknown
}

/** One resolved model descriptor, as the pi-ai collection receives it. */
export interface ResolvedModel {
  readonly id: string
  readonly name: string
  readonly api: string
  readonly provider: string
  readonly baseUrl: string
  readonly input: readonly PiAiModality[]
  readonly contextWindow: number
  readonly maxTokens: number
  readonly reasoning: boolean
  readonly thinkingLevelMap?: Readonly<Record<string, string | null>>
  readonly compat?: Readonly<Record<string, unknown>>
}

/** One route's resolved profile, narrowed to what the shim's adapter reads. */
export interface ResolvedRouteProfile {
  /** Route key, which is also the pi-ai collection key. */
  readonly provider: string
  readonly displayName: string
  /** Resolved credential reference, when the route names one. */
  readonly apiKeyEnv?: CredentialRef
  readonly api?: string
  readonly baseURL?: string
  readonly compat?: Readonly<Record<string, unknown>>
  readonly defaultInput: readonly PiAiModality[]
  readonly headers?: Readonly<Record<string, string>>
  readonly reasoning?: ModelThinkingLevel
  readonly thinkingBudgets?: Readonly<Record<string, number>>
  readonly cacheRetention?: string
  readonly transport?: string
  readonly timeoutMs?: number
  readonly websocketConnectTimeoutMs?: number
  readonly streamIdleTimeoutMs: number
  readonly maxRequestImageBytes: number
  readonly maxRequestImages: number
  readonly imageOffloadCountQuantum: number
  readonly requestImagePixelBudget: number
  readonly requestImageMaxBytes: number
  readonly retryPolicy: ResolvedRetryPolicy
  /** The route's serviceable models in configuration order. */
  readonly models: readonly ResolvedModel[]
  /** Per-model configuration failures, reported before a request. */
  readonly modelErrors: ReadonlyMap<string, string>
  /** Per-model output caps the profile configured explicitly. */
  readonly configuredMaxTokens: ReadonlyMap<string, number>
}

/** The stock defaults, restated so a route without them resolves identically. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_MAX_REQUEST_IMAGES = 50
const DEFAULT_IMAGE_OFFLOAD_COUNT_QUANTUM = 10
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const DEFAULT_CONTEXT_WINDOW = 1_000_000
const DEFAULT_MAX_TOKENS = 128_000
const DEFAULT_INPUT: readonly PiAiModality[] = ['text']
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Every thinking level a profile may declare, in escalation order. */
const THINKING_LEVELS: readonly ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * A configuration failure the route keeps, so the settings stay editable.
 */
class ProfileError extends Error {}

/**
 * The `providers` document this shim's own row was configured with.
 * @param config - the row's configuration.
 * @returns the declared providers, or an empty document.
 */
export function declaredProviders(config: unknown): Record<string, PiAiProviderProfile> {
  const providers = (config as { providers?: Record<string, PiAiProviderProfile> } | undefined)?.providers
  return providers ?? {}
}

/**
 * Resolve every declared route.
 * @param providers - configured provider profiles keyed by route.
 * @param validation - `strict` throws on a bad model, `deferred` keeps the
 *   route and records the model's failure for repair.
 * @returns the resolved profiles in configuration order.
 */
export function resolveProfiles(
  providers: Record<string, PiAiProviderProfile>,
  validation: 'strict' | 'deferred' = 'strict',
): Map<string, ResolvedRouteProfile> {
  const resolved = new Map<string, ResolvedRouteProfile>()
  for (const [provider, source] of Object.entries(providers)) {
    if (provider.length === 0) throw new Error('llm-pi-ai: provider names must be non-empty')
    if (source.baseURL !== undefined && source.baseURL.length === 0) {
      throw new Error(`llm-pi-ai: provider "${provider}" has an empty baseURL`)
    }
    const displayName = source.displayName ?? provider
    const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
    if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
      throw new Error(`llm-pi-ai: provider "${provider}" streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
    }
    const maxRequestImageBytes = source.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES
    const maxRequestImages = source.maxRequestImages ?? DEFAULT_MAX_REQUEST_IMAGES
    const imageOffloadCountQuantum = source.imageOffloadCountQuantum
      ?? Math.min(DEFAULT_IMAGE_OFFLOAD_COUNT_QUANTUM, maxRequestImages)
    const requestImagePixelBudget = source.requestImagePixelBudget ?? DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET
    const requestImageMaxBytes = source.requestImageMaxBytes ?? DEFAULT_REQUEST_IMAGE_MAX_BYTES
    const defaultInput = source.defaultInput ?? DEFAULT_INPUT
    const defaultContextWindow = source.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
    const defaultMaxTokens = source.defaultMaxTokens ?? DEFAULT_MAX_TOKENS

    const modelErrors = new Map<string, string>()
    const configuredMaxTokens = new Map<string, number>()
    const models: ResolvedModel[] = []
    for (const entry of source.models ?? []) {
      try {
        models.push(resolveModel(provider, source, entry, defaultInput, defaultContextWindow, defaultMaxTokens))
        if (entry.maxTokens !== undefined) configuredMaxTokens.set(entry.id, entry.maxTokens)
      } catch (error) {
        if (validation === 'strict' || !(error instanceof ProfileError)) throw error
        modelErrors.set(entry.id, error.message)
      }
    }

    resolved.set(provider, {
      provider,
      displayName,
      ...source.apiKeyEnv === undefined ? {} : { apiKeyEnv: source.apiKeyEnv as CredentialRef },
      ...source.api === undefined ? {} : { api: source.api },
      ...source.baseURL === undefined ? {} : { baseURL: source.baseURL },
      ...source.compat === undefined ? {} : { compat: source.compat },
      defaultInput,
      ...source.headers === undefined ? {} : { headers: { ...source.headers } },
      ...source.reasoning === undefined ? {} : { reasoning: source.reasoning },
      ...source.thinkingBudgets === undefined ? {} : { thinkingBudgets: { ...source.thinkingBudgets } },
      ...source.cacheRetention === undefined ? {} : { cacheRetention: source.cacheRetention },
      ...source.transport === undefined ? {} : { transport: source.transport },
      ...source.timeoutMs === undefined ? {} : { timeoutMs: source.timeoutMs },
      ...source.websocketConnectTimeoutMs === undefined
        ? {}
        : { websocketConnectTimeoutMs: source.websocketConnectTimeoutMs },
      streamIdleTimeoutMs,
      maxRequestImageBytes,
      maxRequestImages,
      imageOffloadCountQuantum,
      requestImagePixelBudget,
      requestImageMaxBytes,
      retryPolicy: resolveRetryPolicy(source.retryPolicy, `llm-pi-ai: provider "${provider}" retryPolicy`),
      models,
      modelErrors,
      configuredMaxTokens,
    })
  }
  return resolved
}

/**
 * Resolve one configured model entry into the descriptor pi-ai receives.
 *
 * A hand-declared route names its own `api` and `baseURL`; without them there
 * is nothing to send the request to, which is why they are required here
 * rather than defaulted.
 * @param provider - the route key.
 * @param route - the route's configuration.
 * @param entry - the model entry.
 * @param defaultInput - the route's modality fallback.
 * @param defaultContextWindow - the route's capacity fallback.
 * @param defaultMaxTokens - the route's output fallback.
 * @returns the model descriptor.
 */
function resolveModel(
  provider: string,
  route: PiAiProviderProfile,
  entry: PiAiModelProfile,
  defaultInput: readonly PiAiModality[],
  defaultContextWindow: number,
  defaultMaxTokens: number,
): ResolvedModel {
  if (entry.id.length === 0) throw new ProfileError(`llm-pi-ai: provider "${provider}" has a model with an empty id`)
  const api = route.api
  if (api === undefined) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" needs an api; the shim serves hand-declared routes, so set the route's api`)
  }
  const baseUrl = route.baseURL
  if (baseUrl === undefined) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" needs a baseURL`)
  }
  const contextWindow = entry.contextWindow ?? defaultContextWindow
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" contextWindow must be a positive integer`)
  }
  const maxTokens = entry.maxTokens ?? defaultMaxTokens
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" maxTokens must be a positive integer`)
  }
  const input = entry.input === undefined || entry.input.length === 0 ? [...defaultInput] : [...entry.input]
  const reasoning = resolveReasoning(provider, entry, route.compat)
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    api,
    provider,
    baseUrl,
    input,
    contextWindow,
    maxTokens,
    ...reasoning,
    ...entry.compat === undefined ? {} : { compat: { ...route.compat, ...entry.compat } },
  }
}

/**
 * Resolve one model's reasoning capability from its declared efforts.
 *
 * A declared dict becomes pi-ai's `thinkingLevelMap` with every level decided
 * explicitly: declared levels carry their wire spelling, undeclared levels are
 * pinned to `null`. Pinning matters because pi-ai's own defaulting is
 * asymmetric and would otherwise offer a level the gateway cannot take.
 * @param provider - the route key, for diagnostics.
 * @param entry - the model entry.
 * @param routeCompat - the route's compat block, which may carry the format.
 * @returns the reasoning fields of the descriptor.
 */
function resolveReasoning(
  provider: string,
  entry: PiAiModelProfile,
  routeCompat: Readonly<Record<string, unknown>> | undefined,
): { reasoning: boolean; thinkingLevelMap?: Record<string, string | null> } {
  const efforts = entry.reasoningEfforts
  if (efforts === undefined) return { reasoning: false }
  if (efforts === false) return { reasoning: false }
  const declared = THINKING_LEVELS.flatMap((level): [ModelThinkingLevel, string | null][] => {
    const wire = efforts[level]
    return wire === undefined ? [] : [[level, wire]]
  })
  if (declared.length === 0) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" has an empty reasoningEfforts`)
  }
  for (const [level, wire] of declared) {
    if (wire === null) {
      if (level !== 'off') {
        throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" reasoningEfforts.${level} needs the wire value dispatch should send; only "off" may leave it empty`)
      }
    } else if (wire.length === 0) {
      throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" reasoningEfforts.${level} must not be an empty string`)
    }
  }
  if (!declared.some(([level]) => level !== 'off')) {
    throw new ProfileError(`llm-pi-ai: provider "${provider}" model "${entry.id}" reasoningEfforts offers no level beyond "off"`)
  }
  const map: Record<string, string | null> = {}
  for (const level of THINKING_LEVELS) {
    const wire = efforts[level]
    if (wire === undefined) map[level] = null
    else if (wire !== null) map[level] = wire
  }
  // The wire format the declared spellings belong to is a route-level switch;
  // it is recorded on the descriptor so pi-ai dispatches the levels it was
  // configured with.
  const thinkingFormat = routeCompat?.thinkingFormat
  return {
    reasoning: true,
    thinkingLevelMap: map,
    ...typeof thinkingFormat === 'string' ? {} : {},
  }
}

/**
 * The route this shim owns.
 */
export interface ShimRoute {
  /** The `llm-pi-ai` settings namespace the route profile lives in. */
  readonly settingsNamespace: string
  /** The provider route key this shim replaces. */
  readonly provider: string
}

/**
 * Resolve the route profile from the row's own configuration.
 *
 * A route the row does not declare is a configuration error, not a silent
 * no-op: the shim only ever registers a route it can serve.
 * @param config - the plugin context's row configuration.
 * @param route - the route to resolve.
 * @returns the resolved profile.
 * @throws {LlmError} `INVALID_CONFIG` when the row does not declare the route.
 */
export function resolveRouteProfile(config: unknown, route: ShimRoute): ResolvedRouteProfile {
  const profile = resolveProfiles(declaredProviders(config), 'deferred').get(route.provider)
  if (profile === undefined) {
    throw new LlmError(
      `opendesign tool-call shim owns route "${route.provider}", which its own "${route.settingsNamespace}" configuration does not declare`,
      'INVALID_CONFIG',
    )
  }
  return profile
}

/** Re-exported so callers do not need the pi-ai type module for a descriptor. */
export type ShimModel = Model<Api>
