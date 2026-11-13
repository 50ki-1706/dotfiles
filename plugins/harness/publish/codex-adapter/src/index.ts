/**
 * The Codex CLI adapter for the publish plugin.
 *
 * Codex CLI loads external tools as MCP servers over stdio, so this module
 * implements the {@link PublishHost} the core needs and exposes the core's
 * tools through MCP. It reads no `@deepseek-ai/*` package: the core and this
 * adapter run as an ordinary Node process that Codex starts and stops.
 *
 * Two differences from the DSH adapter shape the implementation:
 *
 * - **No session id.** An MCP tool call carries no session identity, so the
 *   server treats its whole lifetime as one session and resolves the
 *   workspace from `roots/list` (falling back to the process cwd).
 * - **No approval API.** Codex decides whether a tool call may run before the
 *   server sees it, so `authorize` records the request and returns. The
 *   `publish_sync_main` fast-forward approval is therefore advisory here.
 *
 * @module @publish/codex-adapter
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mountPublish } from '@publish/core'
import { loadResourcesFrom } from '@publish/core/resources'
import type { PublishPlugin } from '@publish/core'
import type { ResourceLoader } from '@publish/core/resources'
import type {
  ApprovalRequest,
  PermissionAction,
  PublishHost,
  PublishTool,
  ToolCall,
} from '@publish/core/types'
import { ERROR_CODES, serve } from './jsonrpc.ts'
import type { HandlerResult, Handlers } from './jsonrpc.ts'

/** The session id the adapter reports for every call; Codex supplies none. */
export const SESSION_ID = 'codex'

/** One MCP tool descriptor, as `tools/list` returns it. */
export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** What the MCP server needs from its environment. */
export interface ServerOptions {
  /** Workspace directory; defaults to the process cwd. */
  directory?: string
  /** Receives diagnostics; defaults to stderr. */
  log?: (message: string) => void
  /** Directory holding the bundle's instructions and skills; defaults to this package. */
  resources?: string
  /** Overrides the resource loader, for tests. */
  loadResources?: ResourceLoader
}

/** One running MCP server: its tools, its MCP handlers, and teardown. */
export interface PublishServer {
  tools: McpTool[]
  handlers: Handlers
  /** Resolve the workspace from MCP `roots/list`, when Codex reports one. */
  setRoots(roots: readonly string[]): void
  dispose(): Promise<void>
}

/** MCP's tool result shape. */
type ToolCallResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/**
 * Build the Codex host for the publish core.
 * @param workspace - resolves the workspace directory for each call.
 * @param log - receives advisory notes, such as a recorded approval request.
 * @returns the host the core calls.
 */
export function createCodexHost(
  workspace: () => string,
  log: (message: string) => void,
): PublishHost {
  const approvals: ApprovalRequest[] = []

  return {
    async authorize(action: PermissionAction, resources: string[], options) {
      const request: ApprovalRequest = {
        sessionID: options?.call?.sessionID ?? SESSION_ID,
        action,
        resources,
        ...options?.call === undefined ? {} : { callID: options.call.callID },
        decision: 'allow',
      }
      approvals.push(request)
      log(`publish: ${action} ${resources.join(' ')} (Codex decides tool approval)`)
    },

    async directory() {
      return workspace()
    },

    async skills() {
      // Codex resolves skills from its own catalog; the bundled instructions
      // name the skills the command needs and Codex loads them itself.
      return []
    },

    async deliver(_sessionID, prompt) {
      // MCP has no prompt channel that Codex consumes as a user turn, so the
      // instructions surface through the `publish` prompt and the tool
      // descriptions instead.
      log(`publish: admitted\n${prompt.text}`)
    },

    async reloadTools() {
      // MCP clients re-read `tools/list` on demand; nothing to do here.
    },

    observeApproval(listener) {
      // The core installs the fast-forward hook here. Codex decides approval
      // before the call reaches this process, so the hook can only observe.
      return () => {
        void listener
        void approvals
      }
    },
  }
}

/**
 * Project one core tool onto an MCP tool descriptor.
 * @param tool - the core tool.
 * @returns the descriptor `tools/list` returns.
 */
export function toMcpTool(tool: PublishTool): McpTool {
  return { name: tool.name, description: tool.description, inputSchema: tool.input }
}

/**
 * Build the MCP server over the publish core.
 * @param options - workspace, logging, and test overrides.
 * @returns the server's tools, handlers, and teardown.
 */
export async function createServer(options: ServerOptions = {}): Promise<PublishServer> {
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`))
  let directory = resolve(options.directory ?? process.cwd())

  // The bundle's resources sit beside this package's package.json, one level
  // above dist/.
  const resources = options.resources ?? fileURLToPath(new URL('..', import.meta.url))
  const mounted: PublishPlugin = await mountPublish(createCodexHost(() => directory, log), {
    loadResources: options.loadResources ?? loadResourcesFrom(resources),
  })

  const tools = mounted.tools.map(toMcpTool)
  const byName = new Map(mounted.tools.map(tool => [tool.name, tool]))

  /** Admit the binding once per server lifetime; later calls reuse it. */
  let admitted: Promise<void> | undefined
  const admit = async (call: ToolCall): Promise<void> => {
    admitted ??= mounted.command.execute(call.sessionID)
    try {
      await admitted
    } catch (error) {
      // A failed admission must be retried by the next call, not cached.
      admitted = undefined
      throw error
    }
  }

  const callTool = async (params: unknown): Promise<HandlerResult> => {
    const { name, arguments: args } = (params ?? {}) as { name?: unknown; arguments?: unknown }
    if (typeof name !== 'string') {
      return { error: { code: ERROR_CODES.invalidParams, message: 'tools/call requires a tool name' } }
    }
    const tool = byName.get(name)
    if (tool === undefined) {
      return { error: { code: ERROR_CODES.invalidParams, message: `Unknown tool: ${name}` } }
    }
    const call: ToolCall = { sessionID: SESSION_ID, callID: `${name}-${Date.now()}`, signal: new AbortController().signal }
    try {
      // Codex has no slash command, so the first tool call admits the binding
      // the way `/publish` does in a harness that has one.
      await admit(call)
      const value = await tool.execute(args ?? {}, call)
      const result: ToolCallResult = { content: [{ type: 'text', text: JSON.stringify(value) }] }
      return { result }
    } catch (error) {
      // A tool failure is a normal MCP result, not a protocol error: Codex
      // shows it to the model and the turn continues.
      const result: ToolCallResult = {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      }
      return { result }
    }
  }

  const handlers: Handlers = {
    initialize: () => ({
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'publish', version: '0.1.0' },
      },
    }),
    'tools/list': () => ({ result: { tools } }),
    'tools/call': callTool,
    'prompts/list': () => ({
      result: {
        prompts: [
          {
            name: 'publish',
            description: 'Inspect, commit, and publish the current changes with git-surgeon',
            arguments: [],
          },
        ],
      },
    }),
    'prompts/get': async () => ({
      result: {
        description: 'Publish the current changes',
        messages: [
          { role: 'user', content: { type: 'text', text: await mounted.instructions(true) } },
        ],
      },
    }),
  }

  return {
    tools,
    handlers,
    setRoots(roots) {
      const first = roots[0]
      if (first !== undefined) directory = resolve(first)
    },
    async dispose() {
      await mounted.dispose()
    },
  }
}

/**
 * Run the MCP server on stdin/stdout until the input closes.
 * @param options - workspace, logging, and test overrides.
 * @returns after the input stream closes.
 */
export async function main(options: ServerOptions = {}): Promise<void> {
  const server = await createServer(options)
  try {
    await serve(server.handlers, process.stdin, process.stdout)
  } finally {
    await server.dispose()
  }
}
