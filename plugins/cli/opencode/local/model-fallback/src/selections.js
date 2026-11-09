import { warning } from "./diagnostics.js"
import { sameModel } from "./models.js"

// Persist one selection per root conversation and agent, shared by all descendants.
export function createSelections({ session, storage }) {
  const selections = new Map()
  const pending = new Map()

  async function keyFor(sessionID, agent, current) {
    const seen = new Set()
    while (current.parentID) {
      if (seen.has(sessionID)) throw new Error("cyclic session ancestry")
      seen.add(sessionID)
      sessionID = current.parentID
      current = await session.get({ sessionID })
    }
    return JSON.stringify([sessionID, agent])
  }

  async function indexFor(key, chain) {
    let model = selections.get(key)
    if (model === undefined) {
      try {
        model = await storage.get(key)
        if (typeof model === "string") selections.set(key, model)
      } catch (error) {
        warning("selection lookup", error)
      }
    }
    return chain.findIndex((candidate) => sameModel(candidate, model))
  }

  async function remember(key, model) {
    selections.set(key, model)
    try {
      await storage.set(key, model)
    } catch (error) {
      warning("selection save", error)
    }
  }

  // Serialize reads and switches so concurrent children cannot move a selection backwards.
  async function withSelection(key, callback) {
    const previous = pending.get(key) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(callback)
    pending.set(key, current)
    try {
      return await current
    } finally {
      if (pending.get(key) === current) pending.delete(key)
    }
  }

  return { keyFor, indexFor, remember, withSelection }
}
