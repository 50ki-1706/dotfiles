import { warning } from "./diagnostics.js"

export function createSubagentHooks({ session, chains, selections, diagnostics }) {
  async function before(event) {
    const input = event.input
    if (event.tool === "subagent" && typeof input?.sessionID === "string") {
      diagnostics.clear(input.sessionID)
    }
    if (
      event.tool !== "subagent" ||
      !input ||
      typeof input !== "object" ||
      input.model !== undefined ||
      input.sessionID !== undefined
    ) {
      return
    }
    const chain = chains.get(input.agent)
    if (!chain) return
    try {
      const current = await session.get({ sessionID: event.sessionID })
      const key = await selections.keyFor(event.sessionID, input.agent, current)
      await selections.withSelection(key, async () => {
        const index = await selections.indexFor(key, chain)
        if (index > 0) input.model = chain[index]
      })
    } catch (error) {
      warning("subagent selection", error)
    }
  }

  return { before, after: diagnostics.appendToToolError }
}
