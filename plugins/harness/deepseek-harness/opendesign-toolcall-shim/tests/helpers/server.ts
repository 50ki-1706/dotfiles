/**
 * A local HTTP server that replays scripted OpenAI-compatible SSE.
 *
 * The acceptance tests drive the real adapter against this, which is the same
 * technique deepseek-ai/deepseek-harness#7581 uses. Nothing here reaches the
 * network.
 *
 * @module dsh-opendesign-toolcall-shim/tests/helpers/server
 */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/** One scripted SSE response: `data:` frames in order. */
export interface ScriptedResponse {
  events?: string[]
  status?: number
  body?: string
}

/** A running scripted server. */
export interface MockServer {
  url: string
  requests: unknown[]
  close(): Promise<void>
}

/** Servers to close when the suite ends. */
const servers: Server[] = []

/**
 * Start a local server that replays one scripted response per request.
 * @param script - responses in request order; a request past the end gets a 500.
 * @returns the base URL and the recorded request bodies.
 */
export async function mockServer(script: ScriptedResponse[]): Promise<MockServer> {
  const requests: unknown[] = []
  const pending = [...script]
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push(body.length === 0 ? undefined : JSON.parse(body))
      const behavior = pending.shift() ?? { status: 500, body: '{"error":"script exhausted"}' }
      if (behavior.status !== undefined && behavior.status !== 200) {
        response.writeHead(behavior.status, { 'content-type': 'application/json' })
        response.end(behavior.body ?? '{}')
        return
      }
      if (behavior.body !== undefined) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(behavior.body)
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.flushHeaders()
      for (const event of behavior.events ?? []) response.write(`data: ${event}\n\n`)
      response.end()
    })
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      await new Promise<void>(resolve => {
        server.close(() => { resolve() })
        server.closeAllConnections()
      })
    },
  }
}

/** Close every server this module started. */
export async function closeAllServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => { resolve() })
    server.closeAllConnections()
  })))
}
