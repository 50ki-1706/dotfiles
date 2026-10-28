// Nix verification gate for the nix-darwin dotfiles repository.
//
// Policy enforced (see .agents/skills/nix-verify/SKILL.md): after the agent
// declares completion, verification runs in strict order, each stage as one
// bare, single, foreground command:
//
//   1. `nix fmt`
//   2. `nix run home-manager -- build --flake .#koki`
//   3. `nix build .#darwinConfigurations.mac.system --out-link result-darwin`
//   4. A canonical `darwin-rebuild switch` command only from the main checkout
//      root /Users/koki/.dotfiles on branch main, after all three evidence
//      stages were produced there in the same session.
//
// The gate steers the agent with denials instead of rewriting commands, with
// exactly one exception: the execution-boundary interlock below.
//
// Rules:
// - The first stage unlocks only after an assistant record in the current turn
//   starts (first non-empty line) with "STATUS: COMPLETE" and its `agent`
//   matches the permission event agent, or the correlated execute.before agent
//   when the event has none. Missing identity fails closed. Details may follow;
//   tool parts, subagent outputs, and mid-text citations do not count.
// - Stage permission attempts must be bare exact commands. Allowed forms:
//   fmt = "nix fmt"; HM build = "nix run home-manager -- build --flake .#koki";
//   darwin build = "nix build .#darwinConfigurations.mac.system --out-link result-darwin";
//   switch = "sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac"
//   or "sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac".
//   Legacy home-manager switches are denied with migration guidance.
//   Wrapped or compound forms (env, &, bash -c, &&, pipes, redirects) are
//   denied with the separate-command guidance and never count as evidence.
// - Evidence is tied to (session, realpath of the checkout root), and records
//   the branch at completion. Switch additionally requires all evidence at the
//   main checkout root recorded on main, with the call rooted there while the
//   live branch is still main.
// - Any recognized mutation (rm/mv/cp/..., sed -i, perl -i, git mutations
//   including worktree/clone/restore/switch/revert, file redirects) clears the
//   whole session's evidence independently of stage matching. Edit-family and
//   worktree removal tool attempts clear it too. A fmt attempt clears it as
//   well, because fmt can change files; build and switch attempts do not clear.
// - Internal errors on matched attempts deny (fail-closed); unmatched
//   commands and other permission actions are left untouched.
//
// Execution-boundary interlock (the ONLY command-level rewrite; the branch
// can change while the human considers the switch approval): after approval
// and immediately before spawn, ctx.shell.hook("create.before") re-checks
// that the invocation cwd resolves to the realpath of /Users/koki/.dotfiles
// and that the branch there is main. On mismatch the invocation command is
// replaced with an echoing `false` so nothing is activated. This applies to
// recognized switch attempts only and never touches any other command.
//
// Historical v2.0.22 runtime shape (evidence preserved in .probe-shape/;
// the current pin is v2.1.4):
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
//   darwin-rebuild/nix-darwin and legacy home-manager switch attempts are
//   detected and denied; exotic re-encodings depend on the resources the
//   runtime scanner reports, which are captured from permission events.
// - Classification is heuristic text matching and can false-positive, e.g.
//   `echo "nix fmt"` counts as a fmt attempt, and any `>`/`>>` redirect to a
//   target other than /dev/null counts as a mutation. The git mutation check
//   is word-level: any command containing `git` plus a mutation subcommand
//   word anywhere clears evidence. Conservative false positives only clear
//   evidence or block a stage.
// - Backgrounded commands produce no evidence (their execute.after metadata
//   carries status "running").
// TODO(adversarial-spell-battery): capture the live L3 battery after this lands on
// main and fold confirmed exotic spellings into the scanners.

import { spawnSync as nodeSpawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const MAIN_ROOT = "/Users/koki/.dotfiles"
const BARE_FMT = "nix fmt"
const BARE_BUILD = "nix run home-manager -- build --flake .#koki"
const BARE_DARWIN_BUILD = "nix build .#darwinConfigurations.mac.system --out-link result-darwin"
const BARE_BOOTSTRAP_SWITCH =
  "sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac"
const BARE_DARWIN_SWITCH = "sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac"
const BARE_STAGES = new Map([
  [BARE_FMT, "fmt"],
  [BARE_BUILD, "build"],
  [BARE_DARWIN_BUILD, "darwinBuild"],
  [BARE_BOOTSTRAP_SWITCH, "switch"],
  [BARE_DARWIN_SWITCH, "switch"],
])
const EVIDENCE_FIELDS = new Map([
  [BARE_FMT, "fmtOk"],
  [BARE_BUILD, "buildOk"],
  [BARE_DARWIN_BUILD, "darwinBuildOk"],
])

const STATUS_RE = /^STATUS: COMPLETE/
const SWITCH_EXECUTABLE_RE =
  /(?:^|[\s;&|("'`(])(?:[^\s;&|"'`()<>]*\/)?(?:home-manager|darwin-rebuild)(?=$|[\s"'`])[^;&|\n]*?(?:^|[\s<>|;&])switch(?=$|[\s"'`<>;&|])/
const HOME_MANAGER_SWITCH_RE =
  /(?:^|[\s;&|("'`(])(?:[^\s;&|"'`()<>]*\/)?home-manager(?=$|[\s"'`])[^;&|\n]*?(?:^|[\s<>|;&])switch(?=$|[\s"'`<>;&|])/
const NIX_COMMAND_START_RE = /(?:^|[\s;&|("'`(])nix\b/g
const SWITCH_INSTALLABLE_RE = /\b(?:home-manager|darwin-rebuild|nix-darwin)\b/
const HOME_MANAGER_INSTALLABLE_RE = /\bhome-manager\b/
const FMT_RE = /(?:^|[\s;&|("'`(])nix\s+fmt\b/
const BUILD_RE = /(?:^|[\s;&|("'`(])nix\s+run\s+home-manager\s+--\s+build\b/
const DARWIN_BUILD_RE =
  /(?:^|[\s;&|("'`(])nix\s+build\b[^;&|]*#darwinConfigurations\.mac\.system(?:\s|$)/
const MUTATION_TOKEN_RE =
  /(?:^|[\s;&|("'`(])(?:rm|mv|cp|touch|tee|mkdir|rmdir|ln|truncate|dd|chmod|chown)(?:\s|$)/
const INPLACE_EDIT_RE = /(?:^|[\s;&|("'`(])(?:sed|perl)\s+-[a-zA-Z]*i/
const GIT_TOKEN_RE = /(?:^|[\s;&|("'`(])git\b/
const GIT_MUTATION_SUBCOMMAND_RE =
  /\b(?:apply|am|checkout|merge|pull|reset|restore|revert|stash|rebase|switch|cherry-pick|worktree|clone)\b/
const REDIRECT_RE = />>?/g
// OpenCode 2.1.4's optional worktree removal tool also uses the edit permission.
const EDIT_FAMILY = new Set(["edit", "write", "patch", "opencode_worktree_remove"])
const REQUIRED_TOOL_IDS = ["shell", "edit", "write", "patch"]

const CALL_TTL_MS = 5 * 60 * 1000
const CALL_LIMIT = 256

const DECLARE_MESSAGE = "先に実装完了宣言(先頭行 STATUS: COMPLETE)を出力してください。"
const FMT_DENY_MESSAGE = `${DECLARE_MESSAGE}その後、単一コマンドとして \`${BARE_FMT}\` を実行できます。`
const BUILD_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、このチェックアウトのルートで ` +
  `\`${BARE_FMT}\` → \`${BARE_BUILD}\` を順に実行してください。`
const BUILD_FMT_MESSAGE =
  `検証には、このチェックアウトのルートで単一コマンドの \`${BARE_FMT}\` を成功させておく必要があります。` +
  `\`${BARE_FMT}\` を実行してから \`${BARE_BUILD}\` を実行してください。`
const DARWIN_BUILD_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、このチェックアウトのルートで ` +
  `\`${BARE_FMT}\` → \`${BARE_BUILD}\` → \`${BARE_DARWIN_BUILD}\` を順に実行してください。`
const DARWIN_BUILD_ORDER_MESSAGE =
  `darwin 構成のビルド前に、このチェックアウトのルートで ` +
  `\`${BARE_FMT}\` と \`${BARE_BUILD}\` を成功させてください。`
const SWITCH_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、メインチェックアウト ${MAIN_ROOT} のルート・branch main で ` +
  `\`${BARE_FMT}\` → \`${BARE_BUILD}\` → \`${BARE_DARWIN_BUILD}\` を順に実行してください。`
const SWITCH_REVERIFY_MESSAGE =
  `メインチェックアウト ${MAIN_ROOT} のルート・branch main で ` +
  `\`${BARE_FMT}\` → \`${BARE_BUILD}\` → \`${BARE_DARWIN_BUILD}\` を順に再実行してください（マージ後のmainルートでの検証証拠が必要です）`
const SWITCH_IDENTITY_MESSAGE =
  `darwin-rebuild switch は ${MAIN_ROOT} のルート・branch main でのみ実行可能です。`
const SWITCH_ASK_MESSAGE =
  "nix-verify-gate: 前提（宣言・fmt・Home Manager build・darwin build・main ルート同一性）確認済。最終は人間の承認が必要です。"
const LEGACY_SWITCH_MESSAGE =
  `Home Manager の switch は廃止されました。nix-darwin の構成を検証し、\`${BARE_DARWIN_SWITCH}\` を使用してください。`
const COMPOUND_MESSAGE =
  "検証ステージは単一のベアコマンドとして個別に実行してください。順序: 実装完了宣言(先頭行 STATUS: COMPLETE) → " +
  `\`${BARE_FMT}\` → \`${BARE_BUILD}\` → \`${BARE_DARWIN_BUILD}\` → ` +
  `（メインチェックアウト ${MAIN_ROOT} のルート・branch main でのみ）\`${BARE_BOOTSTRAP_SWITCH}\` ` +
  `または \`${BARE_DARWIN_SWITCH}\`。`
const ERROR_MESSAGE =
  "nix-verify-gate の評価に失敗したため、この検証ステップを拒否します。単一コマンドで順序どおりに再実行してください。"
const NEUTRALIZE_COMMAND =
  `echo '[nix-verify-gate] darwin-rebuild switch を実行時に中止: 承認後の実行直前に ${MAIN_ROOT} ルート・branch main 判定が成立しませんでした' >&2; false`

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
        const command = typeof event.input?.command === "string" ? event.input.command : ""
        const evidenceField = EVIDENCE_FIELDS.get(command)
        if (!evidenceField) return
        if (event.result?.metadata?.exit !== 0) return
        const realpathCwd = pendingCall(event)?.realpathCwd ?? (await resolveCwd(ctx, event))
        if (!realpathCwd) return
        setEvidence(event.sessionID, realpathCwd, evidenceField, gitBranch(realpathCwd))
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
  if (plan.kind === "legacy-switch") {
    deny(event, LEGACY_SWITCH_MESSAGE)
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
  if (plan.kind === "darwinBuild") {
    if (!(await statusDeclared(ctx, event))) {
      deny(event, DARWIN_BUILD_DENY_MESSAGE)
      return
    }
    const realpathCwd = callEntry(event)?.realpathCwd
    if (
      !realpathCwd ||
      !hasEvidence(event.sessionID, realpathCwd, "fmtOk") ||
      !hasEvidence(event.sessionID, realpathCwd, "buildOk")
    ) {
      deny(event, DARWIN_BUILD_ORDER_MESSAGE)
      return
    }
    return
  }
  // Switch attempts: declaration, all build evidence at main, then identity.
  if (!(await statusDeclared(ctx, event))) {
    deny(event, SWITCH_DENY_MESSAGE)
    return
  }
  const mainRoot = deps.realpath(MAIN_ROOT)
  if (
    !mainRoot ||
    !hasEvidenceOnBranch(event.sessionID, mainRoot, "fmtOk", "main") ||
    !hasEvidenceOnBranch(event.sessionID, mainRoot, "buildOk", "main") ||
    !hasEvidenceOnBranch(event.sessionID, mainRoot, "darwinBuildOk", "main")
  ) {
    deny(event, SWITCH_REVERIFY_MESSAGE)
    return
  }
  const entry = takeCallEntry(event)
  if (!entry || entry.identityVerdict !== true || !isMainRoot(entry.realpathCwd)) {
    deny(event, SWITCH_IDENTITY_MESSAGE)
    return
  }
  event.effect = "ask"
  event.message = SWITCH_ASK_MESSAGE
}

// Priority per string: switch > fmt/build stage > mutation. Switch matching
// also checks normalized quoting/backslashes; stage patterns use the raw string
// and its backslash-stripped fixpoint variant.
function classify(command) {
  if (typeof command !== "string" || command.trim() === "") return "none"
  const variants = [command, stripBackslashes(command)]
  if (matchesSwitchText(command)) return "switch"
  for (const variant of variants) if (FMT_RE.test(variant)) return "fmt"
  for (const variant of variants) if (BUILD_RE.test(variant)) return "build"
  for (const variant of variants) if (DARWIN_BUILD_RE.test(variant)) return "darwinBuild"
  if (isMutation(command)) return "mutation"
  return "none"
}

// Mutations are detected independently of stage matching. The bare-stage
// exemption applies only when the trimmed command equals a bare stage form.
function isMutation(command) {
  if (typeof command !== "string") return false
  const trimmed = command.trim()
  if (BARE_STAGES.has(trimmed)) return false
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
  if (
    candidate !== null &&
    matchesHomeManagerSwitchText(candidate) &&
    stageResources.length === 1
  ) {
    return { kind: "legacy-switch" }
  }
  const stageKind = candidate === null ? undefined : BARE_STAGES.get(candidate)
  if (!stageKind) return { kind: "compound" }
  if (stageResources.length !== 1) return { kind: "compound" }
  if (isMutation(candidate) || resources.some((resource) => isMutation(resource))) {
    return { kind: "compound" }
  }
  return { kind: stageKind }
}

function isStage(kind) {
  return kind === "switch" || kind === "fmt" || kind === "build" || kind === "darwinBuild"
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

function hasEvidenceOnBranch(sessionID, realpathCwd, field, branch) {
  const evidence = pipeline.get(sessionID)?.get(realpathCwd)
  return evidence?.[field] === true && evidence[`${field}Branch`] === branch
}

function setEvidence(sessionID, realpathCwd, field, branch) {
  if (!sessionID || !realpathCwd) return
  let roots = pipeline.get(sessionID)
  if (!roots) {
    roots = new Map()
    pipeline.set(sessionID, roots)
  }
  const evidence = roots.get(realpathCwd) ?? {}
  evidence[field] = true
  evidence[`${field}Branch`] = branch
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
  return matchesSwitchTextWithPatterns(command, SWITCH_EXECUTABLE_RE, SWITCH_INSTALLABLE_RE)
}

function matchesHomeManagerSwitchText(command) {
  return matchesSwitchTextWithPatterns(command, HOME_MANAGER_SWITCH_RE, HOME_MANAGER_INSTALLABLE_RE)
}

function matchesSwitchTextWithPatterns(command, executablePattern, installablePattern) {
  if (typeof command !== "string") return false
  return switchTextVariants(command).some(
    (variant) =>
      executablePattern.test(variant) || matchesNixRunSwitch(variant, installablePattern),
  )
}

function switchTextVariants(command) {
  const unescaped = stripBackslashes(command)
  return [command, unescaped, unescaped.replaceAll(/["'`]/g, "")]
}

function matchesNixRunSwitch(command, installablePattern) {
  for (const match of command.matchAll(NIX_COMMAND_START_RE)) {
    const start = match.index + match[0].length
    const remainder = command.slice(start)
    const commandEnd = /[;&|\n]/.exec(remainder)?.index ?? remainder.length
    const nixArguments = remainder.slice(0, commandEnd)
    const run = /\brun\b/.exec(nixArguments)
    if (!run) continue

    const runArguments = nixArguments.slice(run.index + run[0].length)
    const runTokens = runArguments.trim().split(/[\s<>|;&]+/).filter(Boolean)
    const argumentSeparator = runTokens.indexOf("--")
    const installableTokens =
      argumentSeparator === -1 ? runTokens : runTokens.slice(0, argumentSeparator)
    if (installablePattern.test(installableTokens.join(" ")) && runTokens.includes("switch")) {
      return true
    }
  }
  return false
}

function mainRootLive(cwd) {
  if (typeof cwd !== "string" || cwd === "") return false
  return isMainRoot(deps.realpath(cwd))
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
