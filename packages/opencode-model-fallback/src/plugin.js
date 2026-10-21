import { classifyFailure } from "./failures.js"
import { sameModel } from "./models.js"
import { applySwitchResult, createState, reduceCompaction, reduceFailure } from "./policy.js"

function warning(action, error) {
  console.warn(
    `model fallback ${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  )
}

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
      const states = new Map()
      const stateFor = (sessionID) => states.get(sessionID) ?? createState()

      async function readContext(sessionID, action) {
        try {
          const context = await ctx.session.context({ sessionID })
          return { messages: Array.isArray(context) ? context : [], contextFailed: false }
        } catch (error) {
          warning(action, error)
          return { messages: [], contextFailed: true }
        }
      }

      ctx.session.hook("retry", async (event) => {
        try {
          const sessionID = event.sessionID
          if (typeof sessionID !== "string") return

          let session
          try {
            session = await ctx.session.get({ sessionID })
          } catch (error) {
            warning("session lookup", error)
            return
          }
          if (!sameModel(event.model, session.model)) return

          const failureType = classifyFailure(event.error)
          const chain = chains.get(event.agent) ?? []
          if (failureType !== "other" && !chain.some((model) => sameModel(model, event.model))) return

          const state = stateFor(sessionID)
          const context =
            failureType === "communication"
              ? await readContext(sessionID, "failure context lookup")
              : { messages: [], contextFailed: false }
          const result = reduceFailure(state, {
            event,
            sessionModel: session.model,
            chain,
            threshold,
            contextMessages: context.messages,
            contextFailed: context.contextFailed,
            now: Date.now(),
          })
          if (result.state !== state) states.set(sessionID, result.state)
          if (!result.requested) return

          try {
            await ctx.session.switchModel({ sessionID, model: result.requested.model })
            states.set(sessionID, applySwitchResult(result.state, result.requested, true))
          } catch (error) {
            warning("model switch", error)
          }
        } catch (error) {
          warning("retry hook", error)
        }
      })

      ctx.session.hook("compaction", async (event) => {
        try {
          const sessionID = event.sessionID
          if (typeof sessionID !== "string") return
          const state = stateFor(sessionID)
          const context = await readContext(sessionID, "compaction context lookup")
          const next = reduceCompaction(state, context)
          if (next !== state) states.set(sessionID, next)
        } catch (error) {
          warning("compaction hook", error)
        }
      })
    },
  }
}
