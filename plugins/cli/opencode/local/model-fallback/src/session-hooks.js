import { warning } from "./diagnostics.js"
import { classifyFailure } from "./failures.js"
import { sameModel, switchTarget } from "./models.js"
import { applySwitchResult, createState, reduceCompaction, reduceFailure } from "./policy.js"

export function createSessionHooks({ session, chains, threshold, selections, diagnostics }) {
  const states = new Map()
  const stateFor = (sessionID) => states.get(sessionID) ?? createState()

  async function readContext(sessionID, action) {
    try {
      const context = await session.context({ sessionID })
      return { messages: Array.isArray(context) ? context : [], contextFailed: false }
    } catch (error) {
      warning(action, error)
      return { messages: [], contextFailed: true }
    }
  }

  async function retry(event) {
    try {
      const sessionID = event.sessionID
      if (typeof sessionID !== "string") return

      let current
      try {
        current = await session.get({ sessionID })
      } catch (error) {
        warning("session lookup", error)
        return
      }
      if (!sameModel(event.model, current.model)) return

      const failureType = classifyFailure(event.error)
      const chain = chains.get(event.agent) ?? []
      const index = chain.findIndex((model) => sameModel(model, event.model))
      if (failureType !== "other" && index < 0) return

      let key
      try {
        key = await selections.keyFor(sessionID, event.agent, current)
      } catch (error) {
        warning("parent session lookup", error)
      }

      await selections.withSelection(key ?? sessionID, async () => {
        // Recheck after waiting for another child's switch.
        current = await session.get({ sessionID })
        if (!sameModel(event.model, current.model)) return
        diagnostics.clear(sessionID)
        const state = stateFor(sessionID)
        const selected = key && failureType !== "other" ? await selections.indexFor(key, chain) : -1
        const remembered = selected > index && index >= 0
        const context =
          failureType === "communication" && !remembered
            ? await readContext(sessionID, "failure context lookup")
            : { messages: [], contextFailed: false }
        const result = remembered
          ? { state, requested: { index: selected, model: switchTarget(chain[selected]) } }
          : reduceFailure(state, {
              event,
              sessionModel: current.model,
              chain,
              threshold,
              contextMessages: context.messages,
              contextFailed: context.contextFailed,
              now: Date.now(),
            })
        if (result.state !== state) states.set(sessionID, result.state)
        if (!result.requested) {
          diagnostics.failure(event, current, {
            failureType,
            model: chain[index],
            nextModel: chain[index + 1],
            state,
            nextState: result.state,
            contextFailed: context.contextFailed,
          })
          return
        }

        const from = chain[index]
        const to = chain[result.requested.index]
        diagnostics.switching(event, current, {
          from,
          to,
          failureType,
          count: result.state.count,
          remembered,
        })
        try {
          await session.switchModel({ sessionID, model: result.requested.model })
        } catch (error) {
          warning("model switch", error)
          diagnostics.switchFailed(event, current, from, to)
          return
        }
        states.set(sessionID, applySwitchResult(result.state, result.requested, true))
        // Quota failures are terminal by default; switching alone does not resume a child.
        event.decision = { retry: true, delay: 0 }
        if (key) await selections.remember(key, to)
        diagnostics.switched(event, current, from, to)
      })
    } catch (error) {
      warning("retry hook", error)
    }
  }

  async function compaction(event) {
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
  }

  return { retry, compaction }
}
