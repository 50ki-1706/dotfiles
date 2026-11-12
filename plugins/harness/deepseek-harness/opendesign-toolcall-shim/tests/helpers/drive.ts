/**
 * Driving the real adapter, and the context double it needs.
 *
 * The adapter is a pi-ai client, so the only things a test supplies are the
 * route profile and the endpoint; everything else (HTTP, SSE parsing, pi-ai
 * event translation, id-keyed assembly) is the production path.
 *
 * @module dsh-opendesign-toolcall-shim/tests/helpers/drive
 */

import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { IdKeyedPiAiAdapter } from '../../dist/adapter/index.js'
import { mockServer } from './server.ts'
import type { MockServer } from './server.ts'

/** The route profile every driven test uses. */
export const TEST_ROUTE = { settingsNamespace: 'llm-pi-ai', provider: 'opendesign' } as const

/** The model every driven test asks for. */
export const TEST_MODEL = 'deepseek-v4.1-flash'

/** What one driven call produced. */
export interface DrivenResult {
  chunks: StreamChunk[]
  assembler: BlockAssembler
  server: MockServer
}

/**
 * Drive the real adapter against one scripted response.
 * @param events - the SSE frames the server replays.
 * @returns the chunks, the assembled blocks, and the server.
 */
export async function drive(events: string[]): Promise<DrivenResult> {
  const server = await mockServer([{ events }])
  const adapter = new IdKeyedPiAiAdapter(fakeContext(server.url), TEST_ROUTE)
  const chunks: StreamChunk[] = []
  const assembler = new BlockAssembler()
  for await (const chunk of adapter.stream({
    provider: TEST_ROUTE.provider,
    model: TEST_MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'read three files' }] }],
    tools: [{ name: 'read_file', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } } } }],
  })) {
    chunks.push(chunk)
    assembler.push(chunk)
  }
  await server.close()
  return { chunks, assembler, server }
}

/**
 * An in-process credential store and an ambient context that finds nothing.
 * @returns the auth injection the stock adapter requires.
 */
export function memoryAuth() {
  return {
    credentials: {
      read: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
      modify: (_id: string, mutate: (value: undefined) => Promise<undefined>) => mutate(undefined),
      delete: () => Promise.resolve(),
    },
    authContext: {
      env: () => Promise.resolve(undefined),
      fileExists: () => Promise.resolve(false),
    },
  }
}

/**
 * A minimal context double.
 *
 * The adapter reads the settings document, the credential seam, and the header
 * waterfall, and touches nothing else.
 * @param baseURL - the scripted endpoint.
 * @returns a context-shaped object with those seams.
 */
export function fakeContext(baseURL: string): never {
  const section = {
    providers: {
      opendesign: {
        displayName: 'opendesign',
        api: 'openai-completions',
        baseURL: `${baseURL}/v1`,
        apiKeyEnv: 'OPENDESIGN_API_KEY',
        models: [{ id: TEST_MODEL, name: TEST_MODEL }],
      },
    },
  }
  return {
    // The adapter reads the route from its own row's configuration, exactly as
    // the plugin row supplies it.
    fiber: { config: section },
    get(name: string) {
      if (name === 'settings') {
        return { describe: () => [{ ns: 'llm-pi-ai', value: section }] }
      }
      if (name === 'credentials') {
        return {
          resolve: () => Promise.resolve({ value: 'test-key' }),
          readRecord: () => Promise.resolve(undefined),
          listRecords: () => Promise.resolve([]),
          modifyRecord: (_key: unknown, mutate: (value: undefined) => Promise<undefined>) => mutate(undefined),
          deleteRecord: () => Promise.resolve(),
        }
      }
      return undefined
    },
    waterfall(_event: string, _a: unknown, headers: Headers, next: () => Headers) {
      return next()
    },
    logger: { info() {}, warn() {}, error() {} },
    effect() {},
    on() {
      return () => {}
    },
    inject(_deps: string[], run: (child: unknown) => void) {
      run(this)
    },
  } as never
}
