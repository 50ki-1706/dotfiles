/**
 * Scope and shipped-form checks.
 *
 * These are the guard rails around the shim: it must fix only its own route,
 * the stock adapter must still show the defect the shim works around, and the
 * artifact dsh loads must be compiled JavaScript that matches the sources.
 *
 * @module dsh-opendesign-toolcall-shim/tests/scope
 */

import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { RouteSplittingAdapter, resolveRoute } from '../dist/adapter/index.js'
import { fakeContext, memoryAuth, TEST_MODEL, TEST_ROUTE } from './helpers/drive.ts'
import { closeAllServers, mockServer } from './helpers/server.ts'
import { collidingIndexEvents, normalToolCallEvents } from './helpers/wire.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

after(closeAllServers)

/** Resolve the opendesign route's profiles from a scripted endpoint. */
function resolveProfilesFor(baseURL: string, provider: string) {
  const { resolveProfiles } = resolveProfilesModule
  return resolveProfiles({
    [provider]: {
      displayName: provider,
      api: 'openai-completions',
      baseURL: `${baseURL}/v1`,
      apiKeyEnv: 'OPENDESIGN_API_KEY',
      models: [{ id: TEST_MODEL, name: TEST_MODEL }],
    },
  }, 'deferred')
}

const resolveProfilesModule = await import('@deepseek-ai/dsh-llm-pi-ai/src/config.ts')

describe('scope', () => {
  it('the stock pi-ai adapter still merges colliding indexes (the bug this shim fixes)', async () => {
    const { PiAiAdapter } = await import('@deepseek-ai/dsh-llm-pi-ai')
    const server = await mockServer([{ events: collidingIndexEvents() }])
    const adapter = new PiAiAdapter({
      profiles: () => resolveProfilesFor(server.url, 'opendesign'),
      resolveApiKey: () => Promise.resolve('test-key'),
      auth: memoryAuth(),
    })
    const chunks: StreamChunk[] = []
    await assert.rejects(async () => {
      for await (const chunk of adapter.stream({
        provider: 'opendesign',
        model: TEST_MODEL,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'read three files' }] }],
      })) {
        chunks.push(chunk)
      }
    }, (error: unknown) => {
      // The reported failure: the concatenated arguments fail one strict
      // JSON.parse and the adapter throws MALFORMED_RESPONSE, which
      // DEFAULT_RETRYABLE_CODES does not cover, so the turn dies.
      assert.ok(error instanceof Error)
      assert.equal((error as { code?: string }).code, 'MALFORMED_RESPONSE')
      assert.match(error.message, /Unexpected non-whitespace character/)
      return true
    })
    await server.close()
  })

  it('the shim only claims the route it is configured for', async () => {
    const server = await mockServer([{ events: normalToolCallEvents() }])
    const ctx = fakeContext(server.url)
    assert.doesNotThrow(() => resolveRoute(ctx as never, TEST_ROUTE))
    assert.throws(
      () => resolveRoute(ctx as never, { settingsNamespace: 'llm-pi-ai', provider: 'mistral' }),
      /does not declare/,
    )
    await server.close()
  })
})

describe('route split', () => {
  it('sends the shim route to the id-keyed adapter and every other route to the stock one', () => {
    const calls: string[] = []
    const shim = {
      providerInfo: () => { calls.push('shim'); return { id: 'opendesign', name: 'opendesign' } },
      providerRetryPolicy: () => ({ mode: 'normal', maxRetries: 5, retryableCodes: ['MALFORMED_RESPONSE'], initialDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }),
      imageRequestTarget: () => ({ width: 1, height: 1, maxBytes: 1 }),
      imageRequestPricing: () => undefined,
      listModels: () => Promise.resolve([]),
      resolveModel: () => Promise.resolve({ provider: 'opendesign', id: 'm', name: 'm' }),
      prepareCall: () => Promise.resolve({ model: { provider: 'opendesign', id: 'm', name: 'm' }, stream: () => { throw new Error('unused') } }),
      stream: () => { throw new Error('unused') },
    }
    const stock = {
      providerInfo: () => { calls.push('stock'); return { id: 'mistral', name: 'mistral' } },
      providerRetryPolicy: () => ({ mode: 'normal', maxRetries: 5, retryableCodes: ['TRANSPORT'], initialDelayMs: 1, maxDelayMs: 2, jitterRatio: 0 }),
      imageRequestTarget: () => ({ width: 2, height: 2, maxBytes: 2 }),
      imageRequestPricing: () => undefined,
      listModels: () => Promise.resolve([]),
      resolveModel: () => Promise.resolve({ provider: 'mistral', id: 'm', name: 'm' }),
      prepareCall: () => Promise.resolve({ model: { provider: 'mistral', id: 'm', name: 'm' }, stream: () => { throw new Error('unused') } }),
      stream: () => { throw new Error('unused') },
    }
    const router = new RouteSplittingAdapter(shim, stock, 'opendesign')
    assert.equal(router.providerInfo('opendesign').name, 'opendesign')
    assert.equal(router.providerInfo('mistral').name, 'mistral')
    assert.deepEqual(router.providerRetryPolicy('opendesign')?.retryableCodes, ['MALFORMED_RESPONSE'])
    assert.deepEqual(router.providerRetryPolicy('mistral')?.retryableCodes, ['TRANSPORT'])
    assert.deepEqual(calls, ['shim', 'stock'])
  })
})

describe('shipped form', () => {
  it('ships compiled JavaScript, because Node refuses to strip types under node_modules', () => {
    // dsh installs profile plugins under <profile>/node_modules, where Node's
    // strip-only TypeScript support is disabled
    // (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). The sources are therefore
    // TypeScript compiled to dist/, and `main` must point at the compiled file.
    const sources = sourceFiles(join(root, 'src'))
    assert.ok(sources.length > 0, 'the TypeScript sources are present')
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { main?: string }
    assert.match(manifest.main ?? '', /\.js$/, 'main names a JavaScript file')
    assert.ok(existsSync(join(root, manifest.main ?? '')), `main exists: ${manifest.main}`)
    // Every source must have a compiled counterpart, so a stale dist cannot
    // ship a module the sources no longer describe.
    for (const file of sources) {
      const compiled = join(root, 'dist', file.replace(/\.ts$/, '.js'))
      assert.ok(existsSync(compiled), `compiled counterpart exists: ${compiled}`)
    }
  })
})

/**
 * Every `.ts` file under a directory, relative to it.
 * @param directory - the directory to walk.
 * @param prefix - the relative path so far.
 * @returns the relative paths of the TypeScript sources.
 */
function sourceFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(join(directory, entry.name), relative)
    return entry.name.endsWith('.ts') ? [relative] : []
  })
}
