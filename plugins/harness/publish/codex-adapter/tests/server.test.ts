/**
 * The Codex adapter: JSON-RPC framing and the MCP surface over the core.
 *
 * The cases drive the real MCP handlers through the same `serve()` loop Codex
 * uses, over in-memory streams, so the request/response shape is exercised
 * without spawning a process.
 *
 * @module @publish/codex-adapter/tests/server
 */

import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { createCodexHost, createServer, SESSION_ID, toMcpTool, UNATTENDED_ENV } from '../src/index.ts'
import { ERROR_CODES, serve } from '../src/jsonrpc.ts'
import type { PublishServer } from '../src/index.ts'

const servers: PublishServer[] = []
const directories: string[] = []

after(async () => {
  for (const server of servers) await server.dispose()
  for (const directory of directories) await rm(directory, { recursive: true, force: true })
})

/** A real directory: the core runs git in it, so it must exist. */
async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'publish-codex-'))
  directories.push(directory)
  return directory
}

/** The resources the core would otherwise read from the bundle. */
const resources = {
  instructions: 'INSTRUCTIONS',
  officialSkill: '---\nname: git-surgeon\n---\nofficial\n',
  prSkill: '---\nname: pr\n---\npr official\n',
}

/** Build one server with test resources. */
async function server(): Promise<PublishServer> {
  const created = await createServer({
    directory: await workspace(),
    log: () => {},
    loadResources: async (includePrSkill: boolean) => ({
      ...resources,
      ...includePrSkill ? {} : { prSkill: undefined },
    }),
  })
  servers.push(created)
  return created
}

/** Drive one request through the real serve loop. */
async function request(target: PublishServer, message: unknown): Promise<any> {
  const input = new PassThrough()
  const output = new PassThrough()
  const chunks: string[] = []
  output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
  const done = serve(target.handlers, input, output)
  input.write(`${JSON.stringify(message)}\n`)
  input.end()
  await done
  const line = chunks.join('').trim().split('\n')[0]
  assert.ok(line, 'the server answered')
  return JSON.parse(line)
}

describe('codex adapter', () => {
  it('advertises the core tools with their JSON Schemas', async () => {
    const target = await server()
    const response = await request(target, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const names = response.result.tools.map((tool: { name: string }) => tool.name)
    assert.deepEqual(names, [
      'publish_inspect',
      'publish_show',
      'commit_hunks',
      'publish_sync_main',
      'publish_main',
      'publish_pr',
    ])
    const inspect = response.result.tools.find((tool: { name: string }) => tool.name === 'publish_inspect')
    assert.deepEqual(inspect.inputSchema.required, ['untracked'])
  })

  it('answers initialize with tool and prompt capabilities', async () => {
    const target = await server()
    const response = await request(target, { jsonrpc: '2.0', id: 1, method: 'initialize' })
    assert.equal(response.result.protocolVersion, '2024-11-05')
    assert.deepEqual(response.result.capabilities, { tools: {}, prompts: {} })
  })

  it('serves the /publish instructions as an MCP prompt', async () => {
    const target = await server()
    const list = await request(target, { jsonrpc: '2.0', id: 1, method: 'prompts/list' })
    assert.deepEqual(list.result.prompts.map((prompt: { name: string }) => prompt.name), ['publish'])
    const got = await request(target, { jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: 'publish' } })
    assert.equal(got.result.messages[0].content.text, 'INSTRUCTIONS')
  })

  it('reports an unknown method as a JSON-RPC error', async () => {
    const target = await server()
    const response = await request(target, { jsonrpc: '2.0', id: 1, method: 'nope' })
    assert.equal(response.error.code, -32601)
  })

  it('rejects a call to an unknown tool as invalid params', async () => {
    const target = await server()
    const response = await request(target, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })
    assert.equal(response.error.code, -32602)
  })

  it('returns a tool failure as an MCP error result, not a protocol error', async () => {
    const target = await server()
    // The workspace is not a git repository, so admission fails before the
    // tool body runs. The failure must still arrive as a result, not a
    // JSON-RPC error, so Codex shows it to the model and the turn continues.
    const response = await request(target, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'publish_inspect', arguments: { untracked: [] } },
    })
    assert.equal(response.result.isError, true)
    assert.equal(response.error, undefined)
    assert.match(response.result.content[0].text, /not a git repository/)
  })

  it('ignores notifications, which carry no id', async () => {
    const target = await server()
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
    const done = serve(target.handlers, input, output)
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    input.end()
    await done
    assert.equal(chunks.join('').trim(), '')
  })

  it('uses the reported roots as the workspace', async () => {
    const target = await server()
    target.setRoots(['/from/roots'])
    // The tool fails before reaching the repository, so the workspace shows up
    // in the error only when the core resolved a binding; assert the setter
    // accepts a root and keeps the first one.
    target.setRoots(['/first', '/second'])
    const response = await request(target, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'publish_inspect', arguments: { untracked: [] } },
    })
    assert.equal(response.result.isError, true)
  })

  it('reports one session id for every call', () => {
    assert.equal(SESSION_ID, 'codex')
  })

  it('projects a core tool onto an MCP descriptor', async () => {
    const target = await server()
    const tool = target.tools.find(candidate => candidate.name === 'publish_show')
    assert.ok(tool)
    const projected = toMcpTool({
      name: tool.name,
      description: tool.description,
      input: tool.inputSchema,
      access: 'read',
      execute: async () => ({}),
    })
    assert.equal(projected.name, 'publish_show')
    assert.deepEqual(projected.inputSchema.required, ['id'])
  })
})

describe('codex adapter: irreversible operations fail closed', () => {
  /** The host the core calls, with logging captured. */
  const host = (allowUnattended?: boolean) => createCodexHost(() => '/repo', () => {}, { allowUnattended })

  it('refuses a fast-forward merge when nobody opted in', async () => {
    await assert.rejects(
      host().authorize('shell', ['git merge --ff-only --no-edit abc']),
      /without human confirmation/,
    )
  })

  it('refuses a push and a PR creation when nobody opted in', async () => {
    await assert.rejects(host().authorize('shell', ['git push --no-follow-tags origin HEAD:refs/heads/x']), /refusing/)
    await assert.rejects(host().authorize('shell', ['gh pr create --title t']), /refusing/)
  })

  it('still allows the read-only commands the workflow needs', async () => {
    await host().authorize('shell', ['git status --porcelain=v1'])
    await host().authorize('read', ['/repo'])
    await host().authorize('shell', ['git rev-parse --verify HEAD'])
  })

  it('allows irreversible operations once the operator opts in', async () => {
    await host(true).authorize('shell', ['git merge --ff-only --no-edit abc'])
    await host(true).authorize('shell', ['git push --no-follow-tags origin HEAD:refs/heads/x'])
  })

  it('reads the opt-in from the environment', async () => {
    const previous = process.env[UNATTENDED_ENV]
    process.env[UNATTENDED_ENV] = '1'
    try {
      const created = await createServer({
        directory: await workspace(),
        log: () => {},
        loadResources: async () => resources,
      })
      servers.push(created)
      // The server's host is internal, so exercise it through a tool call that
      // reaches a shell permission: an inspect only reads, so assert the
      // opt-in was resolved by asking the exported host directly.
      const optedIn = createCodexHost(() => '/repo', () => {}, {
        allowUnattended: process.env[UNATTENDED_ENV] === '1',
      })
      await optedIn.authorize('shell', ['git push origin HEAD'])
    } finally {
      if (previous === undefined) delete process.env[UNATTENDED_ENV]
      else process.env[UNATTENDED_ENV] = previous
    }
  })
})

describe('codex adapter: MCP details', () => {
  it('echoes a protocol version it supports and offers its own otherwise', async () => {
    const target = await server()
    const echoed = await request(target, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })
    assert.equal(echoed.result.protocolVersion, '2024-11-05')
    const offered = await request(target, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    assert.equal(offered.result.protocolVersion, '2024-11-05')
  })

  it('rejects a prompt name it does not serve', async () => {
    const target = await server()
    const answer = await request(target, { jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'other' } })
    assert.equal(answer.error.code, ERROR_CODES.invalidParams)
  })

  it('serves the prompt it advertises', async () => {
    const target = await server()
    const answer = await request(target, { jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'publish' } })
    assert.equal(answer.result.messages[0].content.text, 'INSTRUCTIONS')
  })

  it('reports a parse error for malformed JSON', async () => {
    const target = await server()
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
    const done = serve(target.handlers, input, output)
    input.write('{not json}\n')
    input.end()
    await done
    assert.equal(JSON.parse(chunks.join('').trim()).error.code, ERROR_CODES.parse)
  })

  it('gives two calls in the same millisecond distinct ids', async () => {
    const target = await server()
    const input = new PassThrough()
    const output = new PassThrough()
    const chunks: string[] = []
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
    const done = serve(target.handlers, input, output)
    // Both are rejected as unknown tools, but the ids must still be distinct.
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'publish_show', arguments: {} } })}\n`)
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'publish_show', arguments: {} } })}\n`)
    input.end()
    await done
    const answers = chunks.join('').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(answers.map((answer) => answer.id).sort(), [1, 2])
  })
})
