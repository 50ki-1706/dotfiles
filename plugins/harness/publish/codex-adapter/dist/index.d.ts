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
import type { ResourceLoader } from '@publish/core/resources';
import type { PublishHost, PublishTool } from '@publish/core/types';
import type { Handlers } from './jsonrpc.ts';
/** The session id the adapter reports for every call; Codex supplies none. */
export declare const SESSION_ID = "codex";
/** One MCP tool descriptor, as `tools/list` returns it. */
export interface McpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
/** What the MCP server needs from its environment. */
export interface ServerOptions {
    /** Workspace directory; defaults to the process cwd. */
    directory?: string;
    /** Receives diagnostics; defaults to stderr. */
    log?: (message: string) => void;
    /** Directory holding the bundle's instructions and skills; defaults to this package. */
    resources?: string;
    /** Overrides the resource loader, for tests. */
    loadResources?: ResourceLoader;
    /**
     * Allow irreversible operations (merge, push, PR creation) without a human
     * confirmation. Defaults to the `PUBLISH_MCP_ALLOW_UNATTENDED` environment
     * variable, so an operator has to opt in explicitly.
     */
    allowUnattended?: boolean;
}
/** One running MCP server: its tools, its MCP handlers, and teardown. */
export interface PublishServer {
    tools: McpTool[];
    handlers: Handlers;
    /** Resolve the workspace from MCP `roots/list`, when Codex reports one. */
    setRoots(roots: readonly string[]): void;
    dispose(): Promise<void>;
}
/** Environment variable that lets the Codex host run irreversible operations unattended. */
export declare const UNATTENDED_ENV = "PUBLISH_MCP_ALLOW_UNATTENDED";
/**
 * Build the Codex host for the publish core.
 * @param workspace - resolves the workspace directory for each call.
 * @param log - receives advisory notes, such as a recorded approval request.
 * @param options - `allowUnattended` opts in to irreversible operations.
 * @returns the host the core calls.
 */
export declare function createCodexHost(workspace: () => string, log: (message: string) => void, options?: {
    allowUnattended?: boolean;
}): PublishHost;
/**
 * Project one core tool onto an MCP tool descriptor.
 * @param tool - the core tool.
 * @returns the descriptor `tools/list` returns.
 */
export declare function toMcpTool(tool: PublishTool): McpTool;
/**
 * Build the MCP server over the publish core.
 * @param options - workspace, logging, and test overrides.
 * @returns the server's tools, handlers, and teardown.
 */
export declare function createServer(options?: ServerOptions): Promise<PublishServer>;
/**
 * Run the MCP server on stdin/stdout until the input closes.
 * @param options - workspace, logging, and test overrides.
 * @returns after the input stream closes.
 */
export declare function main(options?: ServerOptions): Promise<void>;
