import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { AssistantStreamAccumulator, BlockAssembler } from '@deepseek-ai/dsh-llm'
import { MistralVibeAdapter, resolveKey } from '../index.js'
import * as plugin from '../index.js'
import { Config, ENDPOINT, PROVIDER, settings, modelInfo } from '../config.js'
import { requestBody } from '../wire.js'
import { events } from '../stream.js'

const config = () => settings(Config({}))
const options = { provider: PROVIDER, model: 'mistral-vibe-cli-latest', messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }] }
const delta = (content, finish_reason = null) => ({ choices: [{ index: 0, delta: content, finish_reason }] })
const end = (reason = 'stop') => delta({}, reason)
const wire = rows => rows.map(row => `data: ${typeof row === 'string' ? row : JSON.stringify(row)}\r\n\r\n`).join('')
function response(rows, fragment = 7, onCancel = () => {}) {
  const bytes = new TextEncoder().encode(wire(rows))
  let offset = 0
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) return controller.close()
      controller.enqueue(bytes.slice(offset, offset + fragment))
      offset = Math.min(bytes.length, offset + fragment)
    },
    cancel: onCancel,
  }), { headers: { 'content-type': 'text/event-stream' } })
}
async function collect(stream) {
  const chunks = []
  const accumulator = new AssistantStreamAccumulator()
  const assembler = new BlockAssembler()
  for await (const chunk of stream) {
    accumulator.push({ time: chunks.length, chunk })
    assembler.push(chunk)
    chunks.push(chunk)
  }
  return { chunks, blocks: assembler.blocks(), finish: assembler.finish, usage: assembler.usage }
}
function adapter(rows, capture = () => {}, snapshot = config) {
  return new MistralVibeAdapter(snapshot, async () => 'test-key', async (url, request) => {
    capture(url, request)
    return response(rows)
  })
}

test('official config, registration, catalog and unload work in real Cordis', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    const fork = await ctx.plugin(plugin, {})
    assert.ok(ctx.llm.listProviders().some(row => row.id === PROVIDER))
    const models = await ctx.llm.listModels(PROVIDER)
    assert.ok(models.some(row => row.id === options.model))
    const info = await ctx.llm.resolveModelInfo(PROVIDER, options.model)
    assert.equal(info.context.contextWindow, 262144)
    assert.equal(info.reasoning.defaultEffort, 'high')
    assert.ok(ctx.llm.listConfigurableProviders().some(row => row.provider === PROVIDER))
    await fork.dispose()
    assert.ok(!ctx.llm.listProviders().some(row => row.id === PROVIDER))
    assert.ok(!ctx.llm.listConfigurableProviders().some(row => row.provider === PROVIDER))
  } finally { await ctx.fiber.dispose() }
})

test('streaming text, reasoning, usage and request match the official contract', async () => {
  let sent
  const a = adapter([
    delta({ content: [{ type: 'thinking', thinking: [{ type: 'text', text: '考える' }] }] }),
    delta({ content: 'こんにちは🌍' }), end(),
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } } }, '[DONE]',
  ], (url, request) => { sent = { url, ...request } })
  const out = await collect(a.stream({ ...options, stop: ['END'], temperature: 0.2, maxTokens: 42 }))
  assert.deepEqual(out.blocks, [{ type: 'reasoning', text: '考える' }, { type: 'text', text: 'こんにちは🌍' }])
  assert.deepEqual(out.usage, { inputTokens: 7, outputTokens: 4, totalTokens: 14, cacheReadTokens: 3 })
  assert.equal(out.chunks.at(-2).type, 'usage')
  assert.deepEqual(out.chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
  assert.equal(sent.url, ENDPOINT)
  assert.equal(sent.redirect, 'error')
  assert.match(sent.headers['user-agent'], /^deepseek-harness\//)
  assert.equal(sent.headers.authorization, 'Bearer test-key')
  assert.deepEqual(JSON.parse(sent.body), {
    model: options.model, stream: true, messages: [{ role: 'user', content: 'Hello' }],
    reasoning_effort: 'high', stop: ['END'], temperature: 0.2, max_tokens: 42,
  })
})

const tools = [
  delta({ tool_calls: [
    { index: 0, id: 'same-prefix-1', function: { name: 'read', arguments: '{"file":' } },
    { index: 1, id: 'same-prefix-2', function: { name: 'list', arguments: '' } },
  ] }),
  delta({ tool_calls: [{ index: 0, function: { arguments: '"a"}' } }] }), end('tool_calls'), '[DONE]',
]
test('parallel tools survive assembly and replay with unique ids across turns and restarts', async () => {
  const first = await collect(adapter(tools).stream(options))
  const second = await collect(adapter(tools).stream(options))
  const ids = [...first.blocks, ...second.blocks].map(block => block.id)
  assert.equal(new Set(ids).size, 4)
  assert.equal(first.blocks[0].arguments, '{"file":"a"}')
  assert.equal(first.blocks[1].arguments, '{}')
  const messages = [
    { role: 'assistant', content: [{ type: 'reasoning', text: 'plan' }, ...first.blocks] },
    ...first.blocks.map(block => ({ role: 'tool', toolCallId: block.id, content: [{ type: 'text', text: 'ok' }] })),
  ]
  const body = requestBody({ ...options, messages }, modelInfo(PROVIDER, options.model, config()))
  assert.deepEqual(body.messages[0].content, [{ type: 'thinking', thinking: [{ type: 'text', text: 'plan' }] }])
  assert.ok(!('reasoning_content' in body.messages[0]))
  const wireCalls = body.messages[0].tool_calls
  assert.notEqual(wireCalls[0].id, wireCalls[1].id)
  wireCalls.forEach((call, i) => {
    assert.match(call.id, /^[a-zA-Z0-9]{9}$/)
    assert.equal(call.id, body.messages[i + 1].tool_call_id)
  })
  for (const block of first.blocks) {
    const args = first.chunks.filter(chunk => chunk.type === 'tool-call-delta' && chunk.id === block.id).map(chunk => chunk.argumentsDelta).join('')
    assert.equal(args, block.arguments)
  }
})

test('SSE comments, multiline data, CR and split Unicode are decoded', async () => {
  const bytes = new TextEncoder().encode(': ping\rdata: {\rdata: "x": "日本"}\r\r')
  let pos = 0
  const body = new ReadableStream({ pull(controller) {
    if (pos === bytes.length) controller.close()
    else controller.enqueue(bytes.slice(pos, ++pos))
  } })
  const data = []
  for await (const event of events(body)) data.push(JSON.parse(event))
  assert.deepEqual(data, [{ x: '日本' }])
})

for (const [label, rows, code] of [
  ['early EOF', [delta({ content: 'partial' })], 'TRANSPORT'],
  ['DONE without finish', [delta({ content: 'partial' }), '[DONE]'], 'TRANSPORT'],
  ['bad JSON', ['{bad'], 'INVALID_RESPONSE'],
  ['empty response', [end(), '[DONE]'], 'EMPTY_RESPONSE'],
  ['in-band error', [{ error: { message: 'test-key secret-prompt' } }], 'SERVER'],
  ['invalid tool JSON', [delta({ tool_calls: [{ index: 0, function: { name: 'read', arguments: '{bad' } }] }), end('tool_calls')], 'INVALID_RESPONSE'],
  ['reused tool index', [tools[0], delta({ tool_calls: [{ index: 0, id: 'another', function: { arguments: '{}' } }] })], 'INVALID_RESPONSE'],
  ['unknown finish reason', [delta({ content: 'x' }, 'content_filter')], 'INVALID_RESPONSE'],
]) test(`rejects ${label} without a success finish or leaked body`, async () => {
  await assert.rejects(() => collect(adapter(rows).stream(options)), error => {
    assert.equal(error.code, code)
    assert.doesNotMatch(error.message, /test-key|secret-prompt/)
    return true
  })
})

test('token-limit truncation drops incomplete tool calls in the host assembler', async () => {
  const out = await collect(adapter([delta({ content: 'partial' }), tools[0], end('length'), '[DONE]']).stream(options))
  assert.deepEqual(out.blocks, [{ type: 'text', text: 'partial' }])
  assert.equal(out.finish.kind, 'max-tokens')
})

test('named credential misses and errors do not fall back to ambient credentials', async () => {
  let ref
  const ctx = { get: () => ({ resolve: async value => { ref = value } }) }
  await assert.rejects(resolveKey(ctx, 'CUSTOM_MISTRAL_KEY'), { code: 'MISSING_CREDENTIAL' })
  assert.equal(ref, 'CUSTOM_MISTRAL_KEY')
  await assert.rejects(resolveKey({ get: () => ({ resolve: async () => { throw new Error('store unavailable') } }) }, ref), /store unavailable/)
  assert.equal(await resolveKey({ get: () => ({ resolve: async () => ({ value: 'test-key' }) }) }, ref), 'test-key')
  await assert.rejects(resolveKey({ get: () => ({ resolve: async () => ({ value: 'bad\nkey' }) }) }, ref), { code: 'INVALID_CREDENTIAL' })
})

for (const [status, code] of [[401, 'AUTH'], [403, 'AUTH'], [429, 'RATE_LIMIT'], [503, 'SERVER'], [422, 'INVALID_REQUEST']]) {
  test(`HTTP ${status} is classified without leaking its body`, async () => {
    const a = new MistralVibeAdapter(config, async () => 'test-key', async () => new Response('test-key secret-prompt', {
      status, headers: { 'retry-after': '2' },
    }))
    await assert.rejects(() => collect(a.stream(options)), error => {
      assert.equal(error.code, code)
      assert.equal(error.failure.status, status)
      assert.equal(error.failure.providerRetryAfterMs, 2000)
      assert.doesNotMatch(error.message, /test-key|secret-prompt/)
      return true
    })
  })
}

test('cancellation and timeout abort transport', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const a = new MistralVibeAdapter(() => ({ ...config(), timeoutMs: 20 }), async () => 'test-key', fetchImpl)
  await assert.rejects(() => collect(a.stream(options)), { code: 'TIMEOUT' })
  const controller = new AbortController()
  const pending = collect(a.stream({ ...options, signal: controller.signal }))
  controller.abort()
  await assert.rejects(pending, { code: 'ABORTED' })
})

test('early consumer exit cancels the reader and transport', async () => {
  let cancelled = false
  let signal
  const a = new MistralVibeAdapter(config, async () => 'test-key', async (_url, req) => {
    signal = req.signal
    return response([delta({ content: 'hello' }), end(), '[DONE]'], 1, () => { cancelled = true })
  })
  for await (const _chunk of a.stream(options)) break
  assert.equal(cancelled, true)
  assert.equal(signal.aborted, true)
})

test('credential lookup is bounded by cancellation and deadline without dispatch', async () => {
  let calls = 0
  const a = new MistralVibeAdapter(() => ({ ...config(), timeoutMs: 20 }),
    () => new Promise(() => {}), async () => { calls++; throw new Error('unexpected fetch') })
  await assert.rejects(() => collect(a.stream(options)), { code: 'TIMEOUT' })
  const controller = new AbortController()
  const pending = collect(a.stream({ ...options, signal: controller.signal }))
  setTimeout(() => controller.abort(), 1)
  await assert.rejects(pending, { code: 'ABORTED' })
  assert.equal(calls, 0)
})

test('real LlmRuntime dispatches tools and normalizes provider failures', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    let active = adapter(tools)
    await ctx.plugin({ name: 'test-provider', inject: ['llm'], apply(scope) {
      scope.llm.registerAdapter([PROVIDER], active)
    } })
    const out = await collect(ctx.llm.stream(options))
    assert.equal(out.finish.kind, 'tool-calls')
    assert.equal(out.blocks.length, 2)
    active.fetch = async () => new Response('private upstream error', { status: 429 })
    const failed = await collect(ctx.llm.stream(options))
    assert.equal(failed.finish.kind, 'error')
    assert.equal(failed.finish.failure.code, 'RATE_LIMIT')
    assert.equal(failed.finish.failure.status, 429)
  } finally { await ctx.fiber.dispose() }
})

test('wrong content type and oversized SSE event are rejected', async () => {
  const a = new MistralVibeAdapter(config, async () => 'test-key', async () => new Response('not SSE'))
  await assert.rejects(() => collect(a.stream(options)), { code: 'INVALID_RESPONSE' })
  const body = new Response(`data: ${'x'.repeat(1024 * 1024 + 1)}`).body
  await assert.rejects(async () => { for await (const _event of events(body)) {} }, { code: 'INVALID_RESPONSE' })
})

test('prepared call keeps model and credential configuration from one generation', async () => {
  let current = config()
  let ref
  let sent
  const a = new MistralVibeAdapter(() => current, async value => { ref = value; return 'test-key' }, async (_url, request) => {
    sent = JSON.parse(request.body)
    return response([delta({ content: 'ok' }), end(), '[DONE]'])
  })
  const call = await a.prepareCall(PROVIDER, options.model)
  current = { ...current, apiKeyEnv: 'OTHER_KEY', models: [] }
  await collect(call.stream(options))
  assert.equal(ref, 'MISTRAL_API_KEY')
  assert.equal(sent.reasoning_effort, 'high')
  assert.equal(call.model.reasoning.defaultEffort, 'high')
})

test('model levels and text-only capabilities are enforced before network I/O', async () => {
  const a = adapter([])
  for (const input of [
    { ...options, reasoningEffort: 'max' },
    { ...options, model: 'unknown-model', reasoningEffort: 'high' },
  ]) await assert.rejects(() => collect(a.stream(input)), { code: 'UNSUPPORTED_OPTION' })
  await assert.rejects(() => collect(a.stream({ ...options, messages: [{ role: 'user', content: [{ type: 'image', attachment: {} }] }] })), { code: 'UNSUPPORTED_CONTENT' })
  const info = await a.resolveModel(PROVIDER, 'unknown-model')
  assert.equal(info.id, 'unknown-model')
  assert.equal(info.context, undefined)
  assert.equal(info.reasoning, undefined)
  assert.equal(requestBody({ ...options, reasoningEffort: 'off' }, await a.resolveModel(PROVIDER, options.model)).reasoning_effort, 'none')
  assert.throws(() => settings(Config({ models: [{ id: 'x' }, { id: 'x' }] })), { code: 'INVALID_CONFIG' })
  assert.throws(() => settings(Config({ models: [{ id: 'x', reasoningEfforts: ['high'], defaultEffort: 'off' }] })), { code: 'INVALID_CONFIG' })
})
