/**
 * The stream path: one pi-ai request folded into harness chunks.
 *
 * This is the shim's whole reason to exist, so it is written as the pipeline it
 * is rather than as a method with a dozen locals:
 *
 * 1. Freeze the profile and model from one snapshot, before any await.
 * 2. Resolve the credential.
 * 3. Build the pi-ai context, offloading images when the call carries any.
 * 4. Stream with the rewriting `fetch` spliced in, so the index collision is
 *    gone before pi-ai's own assembly runs.
 * 5. Fold the events through the id-keyed assembler.
 *
 * The lifecycle scaffolding — one idle watchdog, and a consumer controller that
 * terminates the SDK stream when this generator stops early — mirrors the stock
 * adapter exactly, because a difference there would be a difference in timeout
 * and cancellation behaviour rather than in tool-call assembly.
 *
 * @module dsh-opendesign-toolcall-shim/adapter/stream
 */

import type { Api, Model, Models } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import { LlmError, requiredImageOffload } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { projectContext } from './context.ts'
import type { PiContext } from './context.ts'
import type { ResolvedRouteProfile } from './profile.ts'
import { IdKeyedToolCallAssembler } from '../stream/index.ts'
import { createRewritingFetch } from '../wire/index.ts'
import { requestHeaders } from './headers.ts'

/** Everything one stream call needs, resolved from the adapter's snapshot. */
export interface StreamContext {
  /** The plugin context of the shim's row. */
  readonly ctx: Context
  /** The route key, for diagnostics. */
  readonly provider: string
  /** The frozen route profile. */
  readonly profile: ResolvedRouteProfile
  /** The frozen pi-ai model descriptor. */
  readonly model: Model<Api>
  /** The collection the descriptor came from. */
  readonly models: Models
  /** The resolved credential, when the route names one. */
  readonly apiKey: string | undefined
}

/**
 * Stream one call, folding pi-ai's events through the id-keyed assembler.
 * @param call - the frozen facts for this call.
 * @param options - the harness call options.
 * @returns the harness chunks.
 * @throws {LlmError} `UNSUPPORTED_OPTION`, `TIMEOUT`, `ABORTED`, or `STREAM_CLOSED`.
 */
export async function* streamCall(
  call: StreamContext,
  options: GenerateOptions,
): AsyncIterable<StreamChunk> {
  if (options.stop !== undefined) {
    throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION')
  }
  const { ctx, profile, model, models, provider, apiKey } = call
  const streamIdleTimeoutMs = profile.streamIdleTimeoutMs

  const consumer = new AbortController()
  const upstream = options.signal === undefined
    ? consumer.signal
    : AbortSignal.any([options.signal, consumer.signal])
  using watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, 'LLM_STREAM_IDLE_TIMEOUT')

  try {
    const context = await buildContext(ctx, profile, options, watchdog.signal)
    // The index collision is visible only on the wire, so the response is
    // rewritten before pi-ai's own index-keyed assembly runs. Everything
    // downstream then sees calls the provider should have labelled apart.
    const rewriting = createRewritingFetch()
    const events = models.streamSimple(model, context, {
      ...profileOptions(profile),
      ...apiKey === undefined ? {} : { apiKey },
      ...options.temperature === undefined ? {} : { temperature: options.temperature },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
      ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
      // The agent recovery layer owns visible attempts; one adapter call is one SDK attempt.
      maxRetries: 0,
      fetch: rewriting.fetch,
      signal: watchdog.signal,
      headers: requestHeaders(ctx, provider, profile, options, model.baseUrl),
    })
    yield* foldEvents(ctx, provider, rewriting, events, watchdog)
  } catch (error: unknown) {
    if (timeoutOf(watchdog.signal, 'LLM_STREAM_IDLE_TIMEOUT') !== undefined) {
      throw new LlmError(`pi-ai stream idle timeout after ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error })
    }
    if (options.signal?.aborted) {
      throw new LlmError('pi-ai request aborted by caller', 'ABORTED', { cause: error })
    }
    throw error
  } finally {
    consumer.abort('pi-ai stream consumer stopped')
  }
}

/**
 * The pi-ai stream options a profile contributes.
 *
 * Every field is optional and pi-ai distinguishes "absent" from "explicitly
 * undefined", so each one is spread conditionally.
 */
function profileOptions(profile: ResolvedRouteProfile): Record<string, unknown> {
  return {
    ...profile.thinkingBudgets === undefined ? {} : { thinkingBudgets: profile.thinkingBudgets },
    ...profile.cacheRetention === undefined ? {} : { cacheRetention: profile.cacheRetention },
    ...profile.transport === undefined ? {} : { transport: profile.transport },
    ...profile.timeoutMs === undefined ? {} : { timeoutMs: profile.timeoutMs },
    ...profile.websocketConnectTimeoutMs === undefined ? {} : { websocketConnectTimeoutMs: profile.websocketConnectTimeoutMs },
  }
}

/**
 * Build the pi-ai context for one call.
 *
 * The stock adapter's converter lives at `@deepseek-ai/dsh-llm-pi-ai/src/context.ts`,
 * a TypeScript source the desktop app's Node refuses to load from
 * `node_modules`, so the request is projected by `context.ts` in this bundle.
 *
 * Images resolve through the attachment seam only when the call carries any,
 * because most calls carry none and a composition without the attachment
 * service must still work.
 */
async function buildContext(
  ctx: Context,
  profile: ResolvedRouteProfile,
  options: GenerateOptions,
  signal: AbortSignal,
): Promise<PiContext> {
  const carriesImage = options.messages.some(message => message.content.some(block => block.type === 'image'))
  const attachments = carriesImage ? ctx.get('attachments') : undefined
  if (!carriesImage || attachments === undefined) return projectContext(options, profile, undefined)
  const budget = { maxPixels: profile.requestImagePixelBudget, maxBytes: profile.requestImageMaxBytes }
  const versions = new Map<string, { bytes: Uint8Array; mediaType: string }>()
  const readRequestImage = async (ref: Parameters<typeof attachments.readImageRequest>[0]) => {
    const known = versions.get(String(ref.attachmentId))
    if (known !== undefined) return known
    const version = await attachments.readImageRequest(ref, {
      ...requestImageDimensions(ref.width, ref.height, budget.maxPixels),
      maxBytes: budget.maxBytes,
    }, signal)
    if (version === undefined) return undefined
    const resolved = { bytes: version.data, mediaType: version.mediaType }
    versions.set(String(ref.attachmentId), resolved)
    return resolved
  }
  // The budgets are enforced over the bytes that will actually be sent, so the
  // request images are prepared before the count check runs.
  for (const message of options.messages) {
    for (const block of message.content) {
      if (block.type !== 'image' || block.offloaded === true) continue
      await readRequestImage(block.attachment)
    }
  }
  // The route's count and byte budgets are enforced before the request is
  // built, so an over-budget history asks the caller to offload the oldest
  // occurrences instead of silently dropping them.
  const offload = requiredImageOffload(options.messages, {
    representation: 'base64',
    maxBytes: profile.maxRequestImageBytes,
    maxImages: profile.maxRequestImages,
    countQuantum: profile.imageOffloadCountQuantum,
  }, block => versions.get(String(block.attachment.attachmentId))?.bytes.length ?? 0)
  if (offload > 0) {
    throw new LlmError(
      `pi-ai request images exceed the route image budget; ${offload} more oldest occurrence(s) must be offloaded.`,
      'IMAGE_OFFLOAD_REQUIRED',
      { offloadImages: offload },
    )
  }
  return projectContext(options, profile, {
    readRequestImage,
    maxRequestImageBytes: profile.maxRequestImageBytes,
    maxRequestImages: profile.maxRequestImages,
    imageOffloadCountQuantum: profile.imageOffloadCountQuantum,
    requestImagePolicy: budget,
  })
}

/**
 * Drive the pi-ai event iterator through the assembler.
 *
 * A stream that ends without a terminal event surfaces what was assembled and
 * then fails the way the stock adapter does, so a truncated response cannot
 * silently look complete.
 */
async function* foldEvents(
  ctx: Context,
  provider: string,
  rewriting: ReturnType<typeof createRewritingFetch>,
  events: AsyncIterable<Parameters<IdKeyedToolCallAssembler['push']>[0]>,
  watchdog: { next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>> },
): AsyncIterable<StreamChunk> {
  const assembler = new IdKeyedToolCallAssembler()
  const iterator = events[Symbol.asyncIterator]()
  let exhausted = false
  try {
    while (true) {
      const result = await watchdog.next(iterator)
      if (result.done) {
        exhausted = true
        break
      }
      const terminal = !assembler.push(result.value)
      for (const chunk of assembler.drain()) yield chunk
      if (terminal) {
        exhausted = true
        reportReassignments(ctx, provider, rewriting.rewriter.stats.reassignedCalls)
        return
      }
    }
  } finally {
    if (!exhausted) {
      // A demand the deadline abandoned can stay pending forever, and this
      // generator queues its return behind it; the abort owns SDK termination.
      void iterator.return?.(undefined).catch(() => {})
    }
  }
  for (const chunk of assembler.drain()) yield chunk
  throw new LlmError('pi-ai event stream ended without done/error', 'STREAM_CLOSED')
}

/**
 * Log the wire rewrite when it actually did something.
 *
 * A silent repair would make the provider's defect invisible in the log, which
 * is the one thing that would keep the upstream bug from ever being fixed.
 */
function reportReassignments(ctx: Context, provider: string, reassigned: number): void {
  if (reassigned === 0) return
  ctx.logger.warn(
    `opendesign tool-call shim: reassigned ${reassigned} colliding tool-call index(es)`
    + ` on route "${provider}" (open-design#9369)`,
  )
}
