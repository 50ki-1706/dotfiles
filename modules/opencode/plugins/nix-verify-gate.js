// Nix verification gate for the home-manager dotfiles repository.
//
// Policy enforced (see .agents/skills/nix-verify/SKILL.md): after the agent
// declares completion, verification runs in strict order, each stage as one
// bare, single, foreground command:
//
//   1. `nix fmt`
//   2. `nix run home-manager -- build --flake .#koki`
//   3. `nix run home-manager -- switch --flake .#koki` only from the main
//      checkout root /Users/koki/.dotfiles on branch main, and only after fmt
//      and build evidence was produced at that root in the same session.
//
// The gate steers the agent with denials instead of rewriting commands, with
// exactly one exception: the execution-boundary interlock below.
//
// Rules:
// - The first stage unlocks only after an assistant record in the current turn
//   starts (first non-empty line) with "STATUS: COMPLETE" and its `agent`
//   matches the expected agent. Details may follow on the same line or on
//   later lines. Tool parts, subagent outputs, and mid-text citations do not
//   count.
// - Stage permission attempts must be bare exact commands. Allowed forms:
//   fmt = "nix fmt"; build = "nix run home-manager -- build --flake .#koki";
//   switch = "nix run home-manager -- switch --flake .#koki" or
//   "home-manager switch --flake .#koki" (both pin the verified flake target;
//   an unbound `home-manager switch` without --flake is not accepted).
//   Wrapped or compound forms (env, &, bash -c, &&, pipes, redirects) are
//   denied with the separate-command guidance and never count as evidence.
// - Evidence is tied to (session, realpath of the checkout root): fmt and
//   build must succeed at the root containing the change. Switch additionally
//   requires evidence at the main checkout root and the call rooted there.
// - Any recognized mutation (rm/mv/cp/..., sed -i, perl -i, git mutations
//   including worktree/clone/restore/switch/revert, file redirects) clears the
//   whole session's evidence independently of stage matching. Edit-family tool
//   attempts clear it too. A fmt attempt clears it as well, because fmt can
//   change files; build and switch attempts do not clear.
// - Internal errors on matched attempts deny (fail-closed); unmatched
//   commands and other permission actions are left untouched.
//
// Execution-boundary interlock (the ONLY command-level rewrite; the branch
// can change while the human considers the switch approval): after approval
// and immediately before spawn, ctx.shell.hook("create.before") re-checks
// that the invocation cwd resolves to the realpath of /Users/koki/.dotfiles
// and that the branch there is main. On mismatch the invocation command is
// replaced with an echoing `false` so nothing is activated. This applies to
// in-session switch attempts only and never touches any other command.
//
// Pinned runtime shape (verified; evidence preserved in .probe-shape/):
// @opencode/client@2.0.22 dist/promise/generated/types.d.ts:3300
// (SessionMessageInfo union), :2529-2542 (SessionMessageUser carries `text`
// and `type:"user"`), :3232-3245 (SessionMessageAssistant carries
// `type:"assistant"`, required `agent`, and `content`), :841-845
// (assistant text part is {type:"text",text}); and the source schema
// @opencode/schema@2.0.22 dist/session-message.d.ts:1378 (Info union), :1658
// (`type:"user"`), :1736 (`type:"assistant"` with `agent`), :578-579
// (`type:"text"` part with `text`). Records discriminate by `type`; there is
// no `role` field. statusDeclared scans exactly this shape.
//
// Tool ids observed live on opencode v2.0.22 via `ctx.tool.list()`: the shell
// tool id is "shell"; the edit family ids are "edit", "write", and "patch".
// Other builtin ids observed: read, glob, grep, question, subagent, skill,
// webfetch, websearch (MCP tools appear namespaced, e.g. chrome-devtools_*,
// graphify_*, opencode_*). setup() re-reads ctx.tool.list() and warns when an
// expected id is missing.
//
// Limitations:
// - Attempt gating, not execution forcing: the gate observes tool calls and
//   permission evaluations, it cannot make the agent run a command. The
//   create.before interlock is the only execution-boundary control.
// - Guard, not lock: manual terminal use is out of scope. Non-canonical
//   `home-manager switch` spellings are detected and forced to "ask"; exotic
//   re-encodings depend on the resources the runtime scanner reports, which
//   are captured from permission events at runtime.
// - Classification is heuristic text matching and can false-positive, e.g.
//   `echo "nix fmt"` counts as a fmt attempt, and any `>`/`>>` redirect to a
//   target other than /dev/null counts as a mutation. The git mutation check
//   is word-level: any command containing `git` plus a mutation subcommand
//   word anywhere clears evidence. Conservative false positives only clear
//   evidence or block a stage.
// - Backgrounded commands produce no evidence (their execute.after metadata
//   carries status "running").
// - Agent identity is fail-closed: the expected agent is the permission event
//   agent, else the agent recorded on the correlated tool call from
//   execute.before. A declaration counts only from an assistant record whose
//   `agent` matches; when neither source has an agent id the attempt is
//   treated as undeclared and denied.
// - The declaration line must START with "STATUS: COMPLETE" (prefix match on
//   the first non-empty line), so detail after it on the same line is fine.
//
// TODO: capture the live adversarial spell-battery (L3) after this lands on
// main and fold confirmed exotic spellings into the scanners.

import { spawnSync as nodeSpawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const MAIN_ROOT = "/Users/koki/.dotfiles"
const BARE_FMT = "nix fmt"
const BARE_BUILD = "nix run home-manager -- build --flake .#koki"
const BARE_SWITCH = "nix run home-manager -- switch --flake .#koki"
const BARE_STAGES = new Map([
  [BARE_FMT, "fmt"],
  [BARE_BUILD, "build"],
  [BARE_SWITCH, "switch"],
  ["home-manager switch --flake .#koki", "switch"],
])

const STATUS_RE = /^STATUS: COMPLETE/
const SWITCH_RE =
  /(?:^|[\s;&|("'`(])(?:nix\s+run\s+home-manager\s+--\s+switch|home-manager\s+switch)(?:\s|$)/
const FMT_RE = /(?:^|[\s;&|("'`(])nix\s+fmt\b/
const BUILD_RE = /(?:^|[\s;&|("'`(])nix\s+run\s+home-manager\s+--\s+build\b/
const MUTATION_TOKEN_RE =
  /(?:^|[\s;&|("'`(])(?:rm|mv|cp|touch|tee|mkdir|rmdir|ln|truncate|dd|chmod|chown)(?:\s|$)/
const INPLACE_EDIT_RE = /(?:^|[\s;&|("'`(])(?:sed|perl)\s+-[a-zA-Z]*i/
const GIT_TOKEN_RE = /(?:^|[\s;&|("'`(])git\b/
const GIT_MUTATION_SUBCOMMAND_RE =
  /\b(?:apply|am|checkout|merge|pull|reset|restore|revert|stash|rebase|switch|cherry-pick|worktree|clone)\b/
const REDIRECT_RE = />>?/g
const EDIT_FAMILY = new Set(["edit", "write", "patch"])
const REQUIRED_TOOL_IDS = ["shell", "edit", "write", "patch"]

const CALL_TTL_MS = 5 * 60 * 1000
const CALL_LIMIT = 256

const DECLARE_MESSAGE = "先に実装完了宣言(先頭行 STATUS: COMPLETE)を出力してください。"
const FMT_DENY_MESSAGE =
  DECLARE_MESSAGE + "その後、単一コマンドとして `nix fmt` を実行できます。"
const BUILD_DENY_MESSAGE =
  DECLARE_MESSAGE +
  "その後、このチェックアウトのルートで `nix fmt` → `nix run home-manager -- build --flake .#koki` を順に実行してください。"
const BUILD_FMT_MESSAGE =
  "検証には、このチェックアウトのルートで単一コマンドの `nix fmt` を成功させておく必要があります。" +
  "`nix fmt` を実行してから `nix run home-manager -- build --flake .#koki` を実行してください。"
const SWITCH_DENY_MESSAGE =
  DECLARE_MESSAGE +
  "その後、メインチェックアウト /Users/koki/.dotfiles のルートで `nix fmt` → `nix run home-manager -- build --flake .#koki` を順に実行してください。"
const SWITCH_REVERIFY_MESSAGE =
  "メインチェックアウト /Users/koki/.dotfiles のルートで `nix fmt` → `nix run home-manager -- build --flake .#koki` を順に再実行してください（マージ後のmainルートでの検証証拠が必要です）"
const SWITCH_IDENTITY_MESSAGE =
  "switch は /Users/koki/.dotfiles のルート・branch main でのみ実行可能です。"
const SWITCH_ASK_MESSAGE =
  "nix-verify-gate: 前提（宣言・fmt・build・main ルート同一性）確認済。最終は人間の承認が必要です。"
const COMPOUND_MESSAGE =
  "検証ステージは単一のベアコマンドとして個別に実行してください。順序: 実装完了宣言(先頭行 STATUS: COMPLETE) → " +
  "`nix fmt` → `nix run home-manager -- build --flake .#koki` → （メインチェックアウト /Users/koki/.dotfiles のルート・branch main でのみ）" +
  "`nix run home-manager -- switch --flake .#koki`。"
const ERROR_MESSAGE =
  "nix-verify-gate の評価に失敗したため、この検証ステップを拒否します。単一コマンドで順序どおりに再実行してください。"
const NEUTRALIZE_COMMAND =
  "echo '[nix-verify-gate] switch を実行時に中止: 承認後の実行直前に /Users/koki/.dotfiles ルート・branch main 判定が成立しませんでした' >&2; false"

// Overridable seams for tests; production code only.
export const deps = {
  realpath(target) {
    try {
      return fs.realpathSync(target)
    } catch {
      return null
    }
  },
  spawnSync(...args) {
    return nodeSpawnSync(...args)
  },
}

// Verification evidence per session and realpath of the checkout root.
const pipeline = new Map()
// Pending tool-call identity per `${sessionID}:${messageID}:${id}`, TTL and
// size capped, consumed once for switch attempts.
const calls = new Map()
// In-memory session directory cache; invalidated on prompt admission.
const sessionDirectories = new Map()

export default {
  id: "nix-verify-gate",
  async setup(ctx) {
    await warnMissingToolIds(ctx)

    ctx.tool.hook("execute.before", async (event) => {
      try {
        if (event.tool === "shell") {
          const command = typeof event.input?.command === "string" ? event.input.command : ""
          const kind = classify(command)
          // Clears run synchronously before any await so a failing session
          // lookup cannot skip them; stage and mutation checks are separate.
          if (kind === "fmt" || isMutation(command)) clearPipeline(event.sessionID)
          try {
            const realpathCwd = await resolveCwd(ctx, event)
            rememberCall(event, {
              realpathCwd,
              command,
              agent: event.agent,
              identityVerdict: kind === "switch" ? isMainRoot(realpathCwd) : undefined,
            })
          } catch (error) {
            console.warn(`nix-verify-gate cwd lookup failed: ${errorMessage(error)}`)
          }
        } else if (EDIT_FAMILY.has(event.tool)) {
          clearPipeline(event.sessionID)
        }
      } catch (error) {
        console.warn(`nix-verify-gate hook failed: ${errorMessage(error)}`)
      }
    })

    ctx.tool.hook("execute.after", async (event) => {
      try {
        if (event.tool !== "shell" || event.status !== "completed") return
        if (event.result?.metadata?.status === "running") return
        const command = typeof event.input?.command === "string" ? event.input.command.trim() : ""
        if (command !== BARE_FMT && command !== BARE_BUILD) return
        if (event.result?.metadata?.exit !== 0) return
        const realpathCwd = pendingCall(event)?.realpathCwd ?? (await resolveCwd(ctx, event))
        if (!realpathCwd) return
        setEvidence(event.sessionID, realpathCwd, command === BARE_FMT ? "fmtOk" : "buildOk")
        deleteCall(event)
      } catch (error) {
        console.warn(`nix-verify-gate hook failed: ${errorMessage(error)}`)
      }
    })

    ctx.session.hook("prompt", (event) => {
      try {
        clearPipeline(event.sessionID)
        sessionDirectories.delete(event.sessionID)
        deleteSessionCalls(event.sessionID)
      } catch (error) {
        console.warn(`nix-verify-gate hook failed: ${errorMessage(error)}`)
      }
    })

    // Execution-boundary interlock: recheck main root and branch after the
    // human approval and immediately before spawn; neutralize on mismatch.
    ctx.shell.hook("create.before", (event) => {
      try {
        if (!matchesSwitchText(event?.command)) return
        if (mainRootLive(event?.cwd)) return
        event.command = NEUTRALIZE_COMMAND
      } catch (error) {
        try {
          if (matchesSwitchText(event?.command)) event.command = NEUTRALIZE_COMMAND
        } catch {}
        console.warn(`nix-verify-gate interlock failed: ${errorMessage(error)}`)
      }
    })

    ctx.permission.hook("evaluate", async (event) => {
      let matched = false
      try {
        if (event.action !== "shell") return
        const resources = shellResources(event)
        if (resources.length === 0) return
        const plan = planFor(resources, callEntry(event)?.command)
        if (plan.kind === "none") return
        matched = true
        await applyPlan(event, plan, ctx)
      } catch (error) {
        if (matched) deny(event, ERROR_MESSAGE)
        console.warn(`nix-verify-gate failed: ${errorMessage(error)}`)
      }
    })
  },
}

async function applyPlan(event, plan, ctx) {
  if (plan.kind === "compound") {
    deny(event, COMPOUND_MESSAGE)
    return
  }
  if (plan.kind === "fmt") {
    if (await statusDeclared(ctx, event)) return
    deny(event, FMT_DENY_MESSAGE)
    return
  }
  if (plan.kind === "build") {
    if (!(await statusDeclared(ctx, event))) {
      deny(event, BUILD_DENY_MESSAGE)
      return
    }
    const realpathCwd = callEntry(event)?.realpathCwd
    if (!realpathCwd || !hasEvidence(event.sessionID, realpathCwd, "fmtOk")) {
      deny(event, BUILD_FMT_MESSAGE)
      return
    }
    return
  }
  // Switch attempts: declaration, then main-root evidence, then identity.
  if (!(await statusDeclared(ctx, event))) {
    deny(event, SWITCH_DENY_MESSAGE)
    return
  }
  const mainRoot = deps.realpath(MAIN_ROOT)
  if (
    !mainRoot ||
    !hasEvidence(event.sessionID, mainRoot, "fmtOk") ||
    !hasEvidence(event.sessionID, mainRoot, "buildOk")
  ) {
    deny(event, SWITCH_REVERIFY_MESSAGE)
    return
  }
  const entry = takeCallEntry(event)
  if (!entry || entry.identityVerdict !== true) {
    deny(event, SWITCH_IDENTITY_MESSAGE)
    return
  }
  event.effect = "ask"
  event.message = SWITCH_ASK_MESSAGE
}

// Priority per string: switch > fmt/build stage > mutation. Stage patterns
// run on the raw string and on its backslash-stripped fixpoint variant.
function classify(command) {
  if (typeof command !== "string" || command.trim() === "") return "none"
  const variants = [command, stripBackslashes(command)]
  for (const variant of variants) if (SWITCH_RE.test(variant)) return "switch"
  for (const variant of variants) if (FMT_RE.test(variant)) return "fmt"
  for (const variant of variants) if (BUILD_RE.test(variant)) return "build"
  if (isMutation(command)) return "mutation"
  return "none"
}

// Mutations are detected independently of stage matching. The bare-stage
// exemption applies only when the trimmed command equals a bare stage form.
function isMutation(command) {
  if (typeof command !== "string") return false
  const trimmed = command.trim()
  if (trimmed === BARE_FMT || trimmed === BARE_BUILD || trimmed === BARE_SWITCH) return false
  return [command, stripBackslashes(command)].some((variant) => mutationVariant(variant))
}

function mutationVariant(text) {
  if (MUTATION_TOKEN_RE.test(text)) return true
  if (INPLACE_EDIT_RE.test(text)) return true
  if (GIT_TOKEN_RE.test(text) && GIT_MUTATION_SUBCOMMAND_RE.test(text)) return true
  return hasFileRedirect(text)
}

function hasFileRedirect(command) {
  REDIRECT_RE.lastIndex = 0
  let match
  while ((match = REDIRECT_RE.exec(command)) !== null) {
    const rest = command.slice(match.index + match[0].length)
    const target = /^\s*([^\s;&|()<>]+)/.exec(rest)
    if (!target) continue
    if (target[1].startsWith("/dev/null")) continue
    if (/^&\d*$/.test(target[1])) continue
    return true
  }
  return false
}

function stripBackslashes(text) {
  let current = text
  for (let round = 0; round < 4; round++) {
    const next = current.replaceAll("\\", "")
    if (next === current) return current
    current = next
  }
  return current
}

// A stage attempt passes the gate only when the whole command is one of the
// bare stage forms; anything else (env, &, bash -c, &&, pipes, redirects) is
// compound. Classification still scans resources to detect the attempt.
function planFor(resources, rawCommand) {
  const stageResources = resources.filter((resource) => isStage(classify(resource)))
  if (stageResources.length === 0) return { kind: "none" }
  const candidate =
    typeof rawCommand === "string"
      ? rawCommand
      : stageResources.length === 1
        ? stageResources[0]
        : null
  const stageKind = candidate === null ? undefined : BARE_STAGES.get(stripBackslashes(candidate).trim())
  if (!stageKind) return { kind: "compound" }
  if (stageResources.length !== 1) return { kind: "compound" }
  if (isMutation(candidate) || resources.some((resource) => isMutation(resource))) {
    return { kind: "compound" }
  }
  return { kind: stageKind }
}

function isStage(kind) {
  return kind === "switch" || kind === "fmt" || kind === "build"
}

// True when an assistant record after the last user record starts (first
// non-empty line) with "STATUS: COMPLETE" and its `agent` matches the expected
// agent. Unknown expected identity is treated as undeclared (fail-closed).
async function statusDeclared(ctx, event) {
  const agent = expectedAgent(event)
  if (typeof agent !== "string" || agent === "") return false
  const messages = await ctx.session.context({ sessionID: event.sessionID })
  if (!Array.isArray(messages)) return false
  let lastUserIndex = -1
  messages.forEach((message, index) => {
    if (message?.type === "user") lastUserIndex = index
  })
  for (let index = lastUserIndex + 1; index < messages.length; index++) {
    const message = messages[index]
    if (message?.type !== "assistant" || message.agent !== agent) continue
    const parts = Array.isArray(message.content) ? message.content : []
    for (const part of parts) {
      if (part?.type !== "text" || typeof part.text !== "string") continue
      if (STATUS_RE.test(firstLine(part.text))) return true
    }
  }
  return false
}

// Expected agent for a declaration: the permission event agent, else the
// agent recorded on the correlated tool call from execute.before.
function expectedAgent(event) {
  if (typeof event.agent === "string" && event.agent !== "") return event.agent
  const entry = callEntry(event)
  if (entry && typeof entry.agent === "string" && entry.agent !== "") return entry.agent
  return undefined
}

function firstLine(text) {
  const trimmed = text.replace(/^\s+/, "")
  const newline = trimmed.indexOf("\n")
  return newline === -1 ? trimmed : trimmed.slice(0, newline)
}

function shellResources(event) {
  if (!Array.isArray(event.resources)) return []
  return event.resources.filter((resource) => typeof resource === "string" && resource !== "")
}

function hasEvidence(sessionID, realpathCwd, field) {
  return pipeline.get(sessionID)?.get(realpathCwd)?.[field] === true
}

function setEvidence(sessionID, realpathCwd, field) {
  if (!sessionID || !realpathCwd) return
  let roots = pipeline.get(sessionID)
  if (!roots) {
    roots = new Map()
    pipeline.set(sessionID, roots)
  }
  const evidence = roots.get(realpathCwd) ?? {}
  evidence[field] = true
  roots.set(realpathCwd, evidence)
}

function clearPipeline(sessionID) {
  if (sessionID) pipeline.delete(sessionID)
}

async function resolveCwd(ctx, event) {
  const base = await sessionDirectory(ctx, event.sessionID)
  if (!base) return null
  const workdir = event.input?.workdir
  const resolved =
    typeof workdir === "string" && workdir.trim() !== "" ? path.resolve(base, workdir) : base
  return deps.realpath(resolved)
}

async function sessionDirectory(ctx, sessionID) {
  if (!sessionID) return null
  if (sessionDirectories.has(sessionID)) return sessionDirectories.get(sessionID)
  const session = await ctx.session.get({ sessionID })
  const directory = session?.location?.directory
  if (typeof directory !== "string") return null
  sessionDirectories.set(sessionID, directory)
  return directory
}

function matchesSwitchText(command) {
  if (typeof command !== "string") return false
  return SWITCH_RE.test(command) || SWITCH_RE.test(stripBackslashes(command))
}

function mainRootLive(cwd) {
  if (typeof cwd !== "string" || cwd === "") return false
  const resolved = deps.realpath(cwd)
  const mainRoot = deps.realpath(MAIN_ROOT)
  if (!resolved || !mainRoot || resolved !== mainRoot) return false
  return gitBranch(MAIN_ROOT) === "main"
}

function isMainRoot(realpathCwd) {
  if (!realpathCwd) return false
  return realpathCwd === deps.realpath(MAIN_ROOT) && gitBranch(MAIN_ROOT) === "main"
}

function gitBranch(repository) {
  const result = deps.spawnSync("git", ["-C", repository, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
    timeout: 5000,
  })
  if (!result || result.error || result.status !== 0) return null
  return typeof result.stdout === "string" ? result.stdout.trim() : null
}

function rememberCall(event, value) {
  const key = callKeyForToolEvent(event)
  if (!key) return
  calls.set(key, { ...value, expiresAt: Date.now() + CALL_TTL_MS })
  pruneCalls()
}

// Pending entry for a tool event (execute.before/after carry messageID and id).
function pendingCall(event) {
  const key = callKeyForToolEvent(event)
  return key ? calls.get(key) : undefined
}

// Pending entry for a permission event (identity lives under source).
function callEntry(event) {
  const key = callKeyForPermission(event)
  return key ? calls.get(key) : undefined
}

function takeCallEntry(event) {
  const key = callKeyForPermission(event)
  if (!key) return undefined
  const entry = calls.get(key)
  calls.delete(key)
  return entry
}

function deleteCall(event) {
  const key = callKeyForToolEvent(event)
  if (key) calls.delete(key)
}

function callKeyForToolEvent(event) {
  return callKey(event.sessionID, event.messageID, event.id)
}

function callKeyForPermission(event) {
  return callKey(event.sessionID, event.source?.messageID, event.source?.id)
}

function deleteSessionCalls(sessionID) {
  if (!sessionID) return
  const prefix = `${sessionID}:`
  for (const key of calls.keys()) if (key.startsWith(prefix)) calls.delete(key)
}

function callKey(sessionID, messageID, id) {
  if (!sessionID || messageID === undefined || id === undefined) return null
  return `${sessionID}:${messageID}:${id}`
}

function pruneCalls() {
  const now = Date.now()
  for (const [key, entry] of calls) if (entry.expiresAt <= now) calls.delete(key)
  while (calls.size > CALL_LIMIT) calls.delete(calls.keys().next().value)
}

async function warnMissingToolIds(ctx) {
  try {
    const tools = await ctx.tool.list()
    if (!Array.isArray(tools)) return
    const ids = new Set(tools.map((tool) => tool?.id).filter((id) => typeof id === "string"))
    const missing = REQUIRED_TOOL_IDS.filter((id) => !ids.has(id))
    if (missing.length > 0) {
      console.warn(`nix-verify-gate: expected tool ids not found: ${missing.join(", ")}`)
    }
  } catch (error) {
    console.warn(`nix-verify-gate: tool id check failed: ${errorMessage(error)}`)
  }
}

function deny(event, message) {
  event.effect = "deny"
  event.message = message
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
