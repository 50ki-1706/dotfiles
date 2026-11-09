import z from '@deepseek-ai/schemastery'
import { LlmError } from '@deepseek-ai/dsh-llm'

export const PROVIDER = 'mistral-vibe'
export const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions'

// Vibe 3.1.0's DEFAULT_ACTIVE_MODEL_CONFIG. This route currently accepts text only.
export const DEFAULT_MODELS = [{
  id: 'mistral-vibe-cli-latest',
  name: 'Mistral Vibe',
  contextWindow: 262144,
  reasoningEfforts: ['off', 'high'],
  defaultEffort: 'high',
}]

export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default('MISTRAL_API_KEY').volatile(),
  models: z.array(z.object({
    id: z.string().required(),
    name: z.string(),
    contextWindow: z.number().step(1).min(1),
    maxTokens: z.number().step(1).min(1),
    reasoningEfforts: z.array(z.string()).default([]),
    defaultEffort: z.string(),
  })).default(DEFAULT_MODELS).volatile(),
  timeoutMs: z.number().step(1).min(1).max(2147483647).default(600000).volatile(),
})

export function settings(config) {
  const value = structuredClone({
    apiKeyEnv: config.apiKeyEnv.get(),
    models: config.models.get(),
    timeoutMs: config.timeoutMs.get(),
  })
  const invalid = () => { throw new LlmError('Invalid Mistral Vibe configuration', 'INVALID_CONFIG') }
  if (!value.apiKeyEnv.trim() || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1
    || value.timeoutMs > 2147483647) invalid()
  const ids = new Set()
  for (const model of value.models) {
    if (!model.id.trim() || ids.has(model.id)) invalid()
    ids.add(model.id)
    const levels = model.reasoningEfforts ?? []
    if (new Set(levels).size !== levels.length || levels.some(level => !/^(off|minimal|low|medium|high|xhigh|max)$/.test(level))
      || (model.defaultEffort !== undefined && !levels.includes(model.defaultEffort))) invalid()
    for (const key of ['contextWindow', 'maxTokens']) {
      if (model[key] !== undefined && (!Number.isSafeInteger(model[key]) || model[key] < 1)) invalid()
    }
    if (model.maxTokens > model.contextWindow) invalid()
  }
  return value
}

export function modelInfo(provider, id, config) {
  const model = config.models.find(model => model.id === id)
  return {
    provider, id, name: model?.name || id, inputModalities: ['text'],
    ...(model?.contextWindow ? { context: { contextWindow: model.contextWindow } } : {}),
    ...(model?.maxTokens ? { defaultMaxTokens: model.maxTokens } : {}),
    ...(model?.reasoningEfforts?.length ? {
      reasoning: {
        efforts: model.reasoningEfforts.map(id => ({ id, name: id })),
        ...(model.defaultEffort ? { defaultEffort: model.defaultEffort } : {}),
      },
    } : {}),
  }
}
