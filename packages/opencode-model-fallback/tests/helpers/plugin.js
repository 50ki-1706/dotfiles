import assert from "node:assert/strict"

import { createModelFallbackPlugin } from "opencode-model-fallback"

export const primary = "xai/primary-test#high"
export const fallback = "openai/fallback-test#max"
export const target = { providerID: "openai", id: "fallback-test", variant: "max" }
export const config = { threshold: 3, agents: { spec: { primary, fallbacks: [fallback] } } }

export async function setupPlugin(
  t,
  { plugin = createModelFallbackPlugin(config), model = primary, session = {}, storage = new Map() } = {},
) {
  const logs = t.mock.method(console, "info", () => {})
  const hooks = new Map()
  const toolHooks = new Map()
  const context = t.mock.fn(async () => [])
  const switchModel = session.switchModel ?? t.mock.fn(async () => {})
  await plugin.setup({
    storage,
    tool: { hook: (name, handler) => toolHooks.set(name, handler) },
    session: {
      hook: (name, handler) => hooks.set(name, handler),
      get: async () => ({ model }),
      context,
      switchModel,
      ...session,
    },
  })

  return {
    logs,
    context,
    switchModel,
    retry: async (overrides = {}) => {
      const event = {
        sessionID: "s",
        agent: "spec",
        model,
        error: { type: "provider.timeout" },
        attempt: 1,
        decision: { retry: false },
        ...overrides,
      }
      await hooks.get("retry")(event)
      return event
    },
    beforeTool: async (input, sessionID = "s", tool = "subagent") => {
      await toolHooks.get("execute.before")({ tool, sessionID, input })
      return input
    },
    afterTool: async (overrides = {}) => {
      const event = {
        tool: "subagent",
        status: "error",
        sessionID: "root",
        input: { agent: "spec" },
        error: new Error("Subagent failed (sessionID: child): connection timed out"),
        ...overrides,
      }
      await toolHooks.get("execute.after")(event)
      return event
    },
    compact: (sessionID = "s") => hooks.get("compaction")({ sessionID }),
  }
}

export function sessionStore(t, entries) {
  const sessions = new Map(Object.entries(entries))
  return {
    get: async ({ sessionID }) => {
      assert.ok(sessions.has(sessionID), `unknown session ${sessionID}`)
      return sessions.get(sessionID)
    },
    switchModel: t.mock.fn(async ({ sessionID, model }) => {
      sessions.set(sessionID, { ...sessions.get(sessionID), model })
    }),
  }
}
