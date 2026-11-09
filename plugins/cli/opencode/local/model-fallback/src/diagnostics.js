export function warning(action, error) {
  console.warn(
    `model fallback ${action} failed: ${error instanceof Error ? error.message : String(error)}`,
  )
}

function retryStatus(decision) {
  return decision?.retry
    ? "OpenCode will retry automatically."
    : "OpenCode's current retry decision is to stop this call."
}

function progress(count, threshold) {
  return ((count - 1) % threshold) + 1
}

export function createDiagnostics(threshold) {
  const latest = new Map()

  function report(event, session, message, resume = false) {
    const text = `[model-fallback] session=${event.sessionID} agent=${event.agent}: ${message}`
    console.info(text)
    latest.set(event.sessionID, { parentID: session.parentID, agent: event.agent, text, resume })
  }

  function failure(event, session, { failureType, model, nextModel, state, nextState, contextFailed }) {
    if (failureType === "other") return
    let message
    if (failureType === "communication" && contextFailed && nextState === state) {
      message = `Communication failure on ${model} was not counted because context lookup failed; count remains ${state.count}/${threshold}.`
    } else if (!nextModel) {
      message = `${failureType} failure on ${model}; fallback chain exhausted, no further model is configured.`
    } else {
      const count = progress(nextState.count, threshold)
      message = `Communication failure ${count}/${threshold} on ${model}; ${threshold - count} more consecutive failure(s) before switching to ${nextModel}.`
    }
    report(
      event,
      session,
      `${message} ${retryStatus(event.decision)}`,
      Boolean(nextModel && nextState !== state && nextState.pendingTerminal),
    )
  }

  function switching(event, session, { from, to, failureType, count, remembered }) {
    const activeThreshold = failureType === "quota" ? 1 : threshold
    const reason = remembered
      ? "Using a remembered fallback for this conversation"
      : `${failureType} failure ${progress(count, activeThreshold)}/${activeThreshold}`
    report(event, session, `${reason} on ${from}; switching to ${to}.`)
  }

  function switchFailed(event, session, from, to) {
    report(
      event,
      session,
      `Switch to ${to} failed; model remains ${from}. ${retryStatus(event.decision)}`,
    )
  }

  function switched(event, session, from, to) {
    report(event, session, `Switched from ${from} to ${to}; retrying immediately.`)
  }

  function appendToToolError(event) {
    if (event.tool !== "subagent" || event.status !== "error") return
    try {
      if (typeof event.error?.message !== "string") return
      const childID = event.error.message.match(/^Subagent failed \(sessionID: ([^)]+)\):/)?.[1]
      const diagnostic = latest.get(childID)
      if (
        !diagnostic ||
        diagnostic.parentID !== event.sessionID ||
        diagnostic.agent !== event.input?.agent
      ) {
        return
      }
      const guidance = diagnostic.resume
        ? `Resume this child with subagent using agent="${diagnostic.agent}" and sessionID="${childID}" to preserve its failure count and reach the fallback threshold.`
        : "Check the fallback status above before deciding how to continue."
      event.error.message += `\n\nLast recorded fallback status:\n${diagnostic.text}\nThis subagent call has ended; no automatic retry is still running. ${guidance}`
    } catch (error) {
      warning("subagent diagnostic", error)
    }
  }

  return {
    clear: (sessionID) => latest.delete(sessionID),
    failure,
    switching,
    switchFailed,
    switched,
    appendToToolError,
  }
}
