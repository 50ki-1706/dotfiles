// Action drift monitor for the closed-world permission matrix.
//
// The baseline is generated at deploy time (modules/opencode/default.nix) from
// modules/opencode/actions.nix: core asserted actions, the `opencode` namespace
// tools, and the live-captured MCP tool names. Any permission.evaluate event
// for an action outside the baseline is denied (fail-closed), so a new upstream
// tool cannot silently execute before the drift is reviewed and approved.
//
// Update flow: `nix run .#opencodeActionCheck` -> review -> edit actions.nix ->
// build -> verify -> switch (only on explicit user request).
//
// Only the permission.evaluate hook is used. No storage, no rpc, no throwing.

const KNOWN_ACTIONS = new Set(@BASELINE_ACTIONS@)

function driftMessage(action) {
  return (
    `未知の action '${action}' を検出（fail-closed）。` +
    "`nix run .#opencodeActionCheck` で drift を確認し、ユーザー承認後に actions.nix を更新 → build → 検証 → switch は明示依頼時のみ。"
  )
}

export default {
  id: "action-drift-monitor",
  async setup(ctx) {
    ctx.permission.hook("evaluate", async (event) => {
      try {
        if (typeof event.action !== "string") return
        if (KNOWN_ACTIONS.has(event.action)) return
        event.effect = "deny"
        event.message = driftMessage(event.action)
        console.warn(`action drift monitor denied unknown action: ${event.action}`)
      } catch (error) {
        try {
          event.effect = "deny"
          event.message = "action drift monitor 内部エラーのため拒否（fail-closed）。"
        } catch {
          // Never throw from a permission hook.
        }
        console.warn(`action drift monitor failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  },
}
