#!/usr/bin/env node
/**
 * The `publish-mcp` entry point.
 *
 * Codex starts this process from `~/.codex/config.toml`:
 *
 * ```toml
 * [mcp_servers.publish]
 * command = "/path/to/publish-mcp"
 * args = []
 * ```
 *
 * The workspace is the process cwd, which Codex sets to the session's working
 * directory. Nothing else is required: the server reads no credentials and
 * runs no daemon.
 *
 * @module @publish/codex-adapter/main
 */

import { main } from './index.ts'

await main()
