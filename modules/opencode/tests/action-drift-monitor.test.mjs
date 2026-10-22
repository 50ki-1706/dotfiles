// Tests the generated action-drift monitor against its deployed replacement.
//
// Run after `nix run home-manager -- build --flake .#koki`:
//   node --test modules/opencode/tests/action-drift-monitor.test.mjs
//
// No OpenCode process, real hook, MCP server, or Figma call is used. The mock
// captures the permission.evaluate callback and feeds it plain events. This
// complements the Nix tests for configured pre-check denies; it does not claim
// that the hook can bypass a configured deny (OpenCode checks that first).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const MONITOR_PATH = resolve(
  ROOT,
  "result/home-files/.config/opencode/plugins/action-drift-monitor.js",
)
const BUILD_INSTRUCTION = "nix run home-manager -- build --flake .#koki"

// Keep this list explicit. The generated-baseline assertion below locks the
// monitor's concrete Figma membership to exactly these eight names and rejects
// a figma* entry; callback tests then prove known effects survive and unknown
// actions are forced to deny.
const FIGMA_ACTIONS = [
  "figma_add_code_connect_map",
  "figma_get_code_connect_map",
  "figma_get_design_context",
  "figma_get_figjam",
  "figma_get_metadata",
  "figma_get_screenshot",
  "figma_get_variable_defs",
  "figma_whoami",
]

async function loadMonitor() {
  let source
  try {
    source = readFileSync(MONITOR_PATH, "utf8")
  } catch {
    assert.fail(`generated monitor not found at ${MONITOR_PATH}; run: ${BUILD_INSTRUCTION}`)
  }
  assert.ok(
    !source.includes("@BASELINE_ACTIONS@"),
    `generated monitor still contains @BASELINE_ACTIONS@; run: ${BUILD_INSTRUCTION}`,
  )

  const knownMatch = source.match(/^const KNOWN_ACTIONS = new Set\((\[.*\])\)$/m)
  assert.ok(knownMatch, "generated monitor must define KNOWN_ACTIONS as a JSON array literal")
  const knownActions = JSON.parse(knownMatch[1])
  const knownFigmaActions = knownActions.filter((action) => action.startsWith("figma_"))
  assert.deepEqual(
    [...knownFigmaActions].sort(),
    [...FIGMA_ACTIONS].sort(),
    "generated monitor Figma baseline must match the approved eight actions exactly",
  )
  assert.equal(
    knownActions.includes("figma*"),
    false,
    "generated monitor must not contain a figma* baseline entry",
  )

  // A data URL avoids relying on a package.json "type" near the generated file.
  const encoded = Buffer.from(source, "utf8").toString("base64")
  const { default: plugin } = await import(`data:text/javascript;base64,${encoded}`)
  let evaluate
  await plugin.setup({
    permission: {
      hook(name, callback) {
        assert.equal(name, "evaluate")
        evaluate = callback
      },
    },
  })
  assert.equal(typeof evaluate, "function", "monitor must register permission.evaluate")
  return evaluate
}

test("generated action-drift-monitor", async (t) => {
  const evaluate = await loadMonitor()

  await t.test("all eight known Figma actions keep an allow effect", async () => {
    for (const action of FIGMA_ACTIONS) {
      const event = { action, effect: "allow" }
      await evaluate(event)
      assert.equal(event.effect, "allow", action)
    }
  })

  await t.test("a known Figma action keeps an explicit deny", async () => {
    const event = { action: "figma_get_metadata", effect: "deny" }
    await evaluate(event)
    assert.equal(event.effect, "deny")
  })

  await t.test("unknown Figma and new actions are forced to deny", async () => {
    for (const action of [
      "figma_generate_figma_design",
      "figma_generate_image",
      "figma_html_to_figma",
      "figma_send_code_to_figma",
      "figma_upload_assets",
      "figma_use_figma",
      "figma_weave_run_model",
      "figma_weave_run_tool",
      "figma_weave_upload_asset",
      "figma_delete_node",
      "figma_upload_file",
      "figma_unreviewed_tool",
      "new_upstream_tool",
    ]) {
      const event = { action, effect: "allow" }
      await evaluate(event)
      assert.equal(event.effect, "deny", action)
      assert.match(event.message, new RegExp(action))
    }
  })
})
