@POLICY_SOURCE@

const CONFIG = @FALLBACK_CONFIG@

function messagesFromContext(context) {
  return Array.isArray(context) ? context : []
}

function warning(action, error) {
  console.warn(
    `model fallback ${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  )
}

export default {
  id: "model-fallback",
  async setup(ctx) {
    const states = new Map()
    const stateFor = (sessionID) => states.get(sessionID) ?? createState()

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

        const state = stateFor(sessionID)
        const communicationFailure = isCommunicationFailure(event.error?.type)
        const configured = CONFIG.agents[event.agent]
        const chain = configured ? [configured.primary, ...configured.fallbacks] : []
        if (communicationFailure && !chain.some((model) => sameModel(model, event.model))) return

        let contextMessages = []
        let contextFailed = false
        if (communicationFailure) {
          try {
            contextMessages = messagesFromContext(await ctx.session.context({ sessionID }))
          } catch (error) {
            contextFailed = true
            warning("failure context lookup", error)
          }
        }

        const result = reduceFailure(state, {
          event,
          sessionModel: session.model,
          chain,
          threshold: CONFIG.threshold,
          contextMessages,
          contextFailed,
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
        try {
          const context = await ctx.session.context({ sessionID })
          const next = reduceCompaction(state, { messages: messagesFromContext(context) })
          if (next !== state) states.set(sessionID, next)
        } catch (error) {
          warning("compaction context lookup", error)
          states.set(sessionID, reduceCompaction(state, { contextFailed: true }))
        }
      } catch (error) {
        warning("compaction hook", error)
      }
    })
  },
}
