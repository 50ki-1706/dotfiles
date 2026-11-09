import { LlmAdapter, LlmError, assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { Config, ENDPOINT, PROVIDER, modelInfo, settings } from './config.js'
import { requestBody } from './wire.js'
import { translate } from './stream.js'

export { Config }
export const name = 'llm-mistral-vibe'
export const inject = ['llm']

async function credentialWithSignal(resolve, signal) {
  let abort
  try {
    return await Promise.race([
      Promise.resolve().then(() => { signal.throwIfAborted(); return resolve() }),
      new Promise((_resolve, reject) => {
        abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      }),
    ])
  } finally { signal.removeEventListener('abort', abort) }
}

export async function resolveKey(ctx, ref) {
  const credentials = ctx.get('credentials')
  // A configured credential service owns lookup, including its environment
  // policy. A miss must not fall back to a different account's ambient key.
  const key = credentials !== undefined
    ? (await credentials.resolve(ref))?.value
    : launchEnvironmentOf(ctx).get(ref)?.value
  if (!key) throw new LlmError(`Store ${ref} in DSH credentials or export it before starting DSH`, 'MISSING_CREDENTIAL')
  return assertUsableApiKey(key, name, ref)
}

export class MistralVibeAdapter extends LlmAdapter {
  constructor(config, credential, fetchImpl = globalThis.fetch) {
    super()
    this.config = config
    this.credential = credential
    this.fetch = fetchImpl
  }

  providerInfo(provider) { return { id: provider, name: 'Mistral Vibe' } }
  async listModels(provider) {
    return this.config().models.map(model => ({ provider, id: model.id, name: model.name || model.id, inputModalities: ['text'] }))
  }
  async resolveModel(provider, id) { return modelInfo(provider, id, this.config()) }
  async prepareCall(provider, id) {
    const config = this.config()
    const model = modelInfo(provider, id, config)
    return { model, stream: options => this.streamWith(config, model, options) }
  }
  async *stream(options) {
    const call = await this.prepareCall(options.provider, options.model)
    yield* call.stream(options)
  }
  async *streamWith(config, model, options) {
    const body = requestBody(options, model)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    try {
      signal.throwIfAborted()
      const key = await credentialWithSignal(() => this.credential(config.apiKeyEnv), signal)
      signal.throwIfAborted()
      const response = await this.fetch(ENDPOINT, {
        method: 'POST', redirect: 'error', signal,
        headers: { ...attributionHeaders(), authorization: `Bearer ${key}`,
          accept: 'text/event-stream', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const status = response.status
        const code = status === 401 || status === 403 ? 'AUTH' : status === 429 ? 'RATE_LIMIT'
          : status >= 500 ? 'SERVER' : status === 408 ? 'TIMEOUT' : 'INVALID_REQUEST'
        const retry = response.headers.get('retry-after')
        const delay = retry === null ? 0 : /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
        await response.body?.cancel()
        throw new LlmError(`Mistral API request failed (HTTP ${status})`, code, {
          status, ...(Number.isFinite(delay) && delay > 0 ? { providerRetryAfterMs: delay } : {}),
        })
      }
      if (!response.body) throw new LlmError('Mistral returned no response body', 'TRANSPORT')
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
        await response.body.cancel()
        throw new LlmError('Mistral returned a non-SSE response', 'INVALID_RESPONSE')
      }
      yield* translate(response.body)
    } catch (error) {
      if (options.signal?.aborted) throw new LlmError('Mistral request cancelled', 'ABORTED')
      if (controller.signal.aborted) throw new LlmError('Mistral request timed out', 'TIMEOUT')
      if (error instanceof LlmError) throw error
      throw new LlmError('Mistral request transport failed', 'TRANSPORT')
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }
}

export function apply(ctx, config) {
  const snapshot = () => settings(config)
  snapshot()
  const adapter = new MistralVibeAdapter(snapshot, ref => resolveKey(ctx, ref))
  ctx.llm.registerAdapter([PROVIDER], adapter)
  ctx.llm.registerConfigurableProviders([{
    provider: PROVIDER, displayName: 'Mistral Vibe',
    settingsNs: ctx.fiber.entry?.options.id ?? name, settingsPath: [],
    defaultBaseURL: 'https://api.mistral.ai/v1',
  }])
  ctx.on('loader/volatile-update', () => ctx.emit('llm/models-updated', PROVIDER))
}
