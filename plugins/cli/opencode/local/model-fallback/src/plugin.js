import { createDiagnostics } from "./diagnostics.js"
import { createSelections } from "./selections.js"
import { createSessionHooks } from "./session-hooks.js"
import { createSubagentHooks } from "./subagent-hooks.js"

/**
 * Create an OpenCode plugin with caller-supplied model chains.
 * @param {{ threshold: number, agents: Record<string, { primary: string, fallbacks: string[] }> }} config
 */
export function createModelFallbackPlugin({ threshold, agents }) {
  const chains = new Map(
    Object.entries(agents).map(([agent, { primary, fallbacks }]) => [agent, [primary, ...fallbacks]]),
  )

  return {
    id: "model-fallback",
    async setup(ctx) {
      const selections = createSelections(ctx)
      const diagnostics = createDiagnostics(threshold)
      const options = { session: ctx.session, chains, threshold, selections, diagnostics }
      const sessionHooks = createSessionHooks(options)
      const subagentHooks = createSubagentHooks(options)

      await ctx.session.hook("retry", sessionHooks.retry)
      await ctx.tool.hook("execute.after", subagentHooks.after)
      await ctx.tool.hook("execute.before", subagentHooks.before)
      await ctx.session.hook("compaction", sessionHooks.compaction)
    },
  }
}
