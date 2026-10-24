import assert from "node:assert/strict"
import gate, { deps } from "../modules/opencode/plugins/nix-verify-gate.js"

const MAIN_ROOT = "/Users/koki/.dotfiles"
const WORKTREE_ROOT = "/virtual/worktree"
const FMT = "nix fmt"
const HM_BUILD = "nix run home-manager -- build --flake .#koki"
const DARWIN_BUILD = "nix build .#darwinConfigurations.mac.system --out-link result-darwin"
const BOOTSTRAP_SWITCH =
  "sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac"
const DARWIN_SWITCH = "sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac"
const DECLARE_MESSAGE = "先に実装完了宣言(先頭行 STATUS: COMPLETE)を出力してください。"
const FMT_DENY_MESSAGE = `${DECLARE_MESSAGE}その後、単一コマンドとして \`${FMT}\` を実行できます。`
const BUILD_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、このチェックアウトのルートで ` +
  `\`${FMT}\` → \`${HM_BUILD}\` を順に実行してください。`
const BUILD_FMT_MESSAGE =
  `検証には、このチェックアウトのルートで単一コマンドの \`${FMT}\` を成功させておく必要があります。` +
  `\`${FMT}\` を実行してから \`${HM_BUILD}\` を実行してください。`
const DARWIN_BUILD_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、このチェックアウトのルートで ` +
  `\`${FMT}\` → \`${HM_BUILD}\` → \`${DARWIN_BUILD}\` を順に実行してください。`
const DARWIN_BUILD_ORDER_MESSAGE =
  `darwin 構成のビルド前に、このチェックアウトのルートで ` +
  `\`${FMT}\` と \`${HM_BUILD}\` を成功させてください。`
const SWITCH_DENY_MESSAGE =
  `${DECLARE_MESSAGE}その後、メインチェックアウト ${MAIN_ROOT} のルート・branch main で ` +
  `\`${FMT}\` → \`${HM_BUILD}\` → \`${DARWIN_BUILD}\` を順に実行してください。`
const SWITCH_REVERIFY_MESSAGE =
  `メインチェックアウト ${MAIN_ROOT} のルート・branch main で ` +
  `\`${FMT}\` → \`${HM_BUILD}\` → \`${DARWIN_BUILD}\` を順に再実行してください（マージ後のmainルートでの検証証拠が必要です）`
const SWITCH_IDENTITY_MESSAGE =
  `darwin-rebuild switch は ${MAIN_ROOT} のルート・branch main でのみ実行可能です。`
const LEGACY_SWITCH_MESSAGE =
  `Home Manager の switch は廃止されました。nix-darwin の構成を検証し、\`${DARWIN_SWITCH}\` を使用してください。`
const COMPOUND_MESSAGE =
  `検証ステージは単一のベアコマンドとして個別に実行してください。順序: 実装完了宣言(先頭行 STATUS: COMPLETE) → ` +
  `\`${FMT}\` → \`${HM_BUILD}\` → \`${DARWIN_BUILD}\` → ` +
  `（メインチェックアウト ${MAIN_ROOT} のルート・branch main でのみ）\`${BOOTSTRAP_SWITCH}\` または \`${DARWIN_SWITCH}\`。`
const NEUTRALIZE_COMMAND =
  `echo '[nix-verify-gate] darwin-rebuild switch を実行時に中止: 承認後の実行直前に ${MAIN_ROOT} ルート・branch main 判定が成立しませんでした' >&2; false`
const LEGACY_SWITCHES = [
  "nix run home-manager -- switch --flake .#koki",
  "home-manager switch --flake .#koki",
  "nix run home-manager -- --flake .#koki switch",
  "/Users/koki/.nix-profile/bin/home-manager switch --flake .#koki",
  "env /Users/koki/.nix-profile/bin/home-manager switch --flake .#koki",
]
const AGENT = "gate-test-agent"

const originalDeps = { ...deps }
let currentBranch = "main"
let sessionNumber = 0
let callNumber = 0

deps.realpath = (target) => {
  if (target === MAIN_ROOT || target === WORKTREE_ROOT) return target
  return null
}
deps.spawnSync = (_command, args) => {
  const repo = args[args.indexOf("-C") + 1]
  return { status: 0, stdout: repo === MAIN_ROOT ? currentBranch : "feature" }
}

function assertDenied(event, message) {
  assert.equal(event.effect, "deny", `expected deny for ${message}`)
}

function assertDeniedMessage(event, message, expectedMessage) {
  assertDenied(event, message)
  assert.equal(event.message, expectedMessage, `unexpected denial message for ${message}`)
}

function assertAsk(event, message) {
  assert.equal(event.effect, "ask", `expected ask for ${message}`)
}

async function makeHarness({ directory = MAIN_ROOT, declared = true } = {}) {
  const sessionID = `gate-test-${++sessionNumber}`
  const hooks = { tool: {}, session: {}, permission: {}, shell: {} }
  const ctx = {
    tool: {
      hook: (name, callback) => {
        hooks.tool[name] = callback
      },
      list: async () => ["shell", "edit", "write", "patch"].map((id) => ({ id })),
    },
    session: {
      hook: (name, callback) => {
        hooks.session[name] = callback
      },
      get: async () => ({ location: { directory } }),
      context: async () =>
        declared
          ? [
              { type: "user", text: "test" },
              {
                type: "assistant",
                agent: AGENT,
                content: [{ type: "text", text: "STATUS: COMPLETE" }],
              },
            ]
          : [{ type: "user", text: "test" }],
    },
    permission: {
      hook: (name, callback) => {
        hooks.permission[name] = callback
      },
    },
    shell: {
      hook: (name, callback) => {
        hooks.shell[name] = callback
      },
    },
  }

  await gate.setup(ctx)

  return {
    sessionID,
    hooks,
    async run(command, options = {}) {
      const messageID = `message-${++callNumber}`
      const id = `tool-${callNumber}`
      const executeEvent = {
        tool: "shell",
        sessionID,
        messageID,
        id,
        agent: AGENT,
        input: { command, workdir: options.workdir ?? "." },
      }
      await hooks.tool["execute.before"](executeEvent)

      const permissionEvent = {
        action: "shell",
        sessionID,
        agent: AGENT,
        resources: options.resources ?? [command],
        effect: options.initialEffect ?? "allow",
        source: { messageID, id },
      }
      await hooks.permission.evaluate(permissionEvent)

      const shouldComplete = options.complete ?? permissionEvent.effect !== "deny"
      if (shouldComplete) {
        await hooks.tool["execute.after"]({
          ...executeEvent,
          status: "completed",
          result: {
            metadata: {
              exit: options.exit ?? 0,
              ...(options.background ? { status: "running" } : {}),
            },
          },
        })
      }
      return permissionEvent
    },
    interlock(command, cwd) {
      const event = { command, cwd }
      hooks.shell["create.before"](event)
      return event.command
    },
  }
}

async function recordAllBuildEvidence(harness) {
  for (const command of [FMT, HM_BUILD, DARWIN_BUILD]) {
    const event = await harness.run(command)
    assert.notEqual(event.effect, "deny", `expected build stage to pass: ${command}`)
  }
}

async function testExactSwitchesRequireFullEvidence() {
  for (const command of [BOOTSTRAP_SWITCH, DARWIN_SWITCH]) {
    currentBranch = "main"
    const harness = await makeHarness()
    await recordAllBuildEvidence(harness)
    assertAsk(await harness.run(command), command)
  }
}

async function testDeclarationAndEvidenceOrder() {
  currentBranch = "main"
  const undeclared = await makeHarness({ declared: false })
  assertDeniedMessage(await undeclared.run(FMT), "fmt without declaration", FMT_DENY_MESSAGE)
  assertDeniedMessage(
    await undeclared.run(HM_BUILD),
    "HM build without declaration",
    BUILD_DENY_MESSAGE,
  )
  assertDeniedMessage(
    await undeclared.run(DARWIN_BUILD),
    "darwin build without declaration",
    DARWIN_BUILD_DENY_MESSAGE,
  )
  assertDeniedMessage(
    await undeclared.run(BOOTSTRAP_SWITCH),
    "switch without declaration",
    SWITCH_DENY_MESSAGE,
  )

  const missingFmt = await makeHarness()
  assertDeniedMessage(await missingFmt.run(HM_BUILD), "HM build before fmt", BUILD_FMT_MESSAGE)
  assertDeniedMessage(
    await missingFmt.run(DARWIN_BUILD),
    "darwin build before fmt and HM build",
    DARWIN_BUILD_ORDER_MESSAGE,
  )
  assertDeniedMessage(
    await missingFmt.run(DARWIN_SWITCH),
    "switch without build evidence",
    SWITCH_REVERIFY_MESSAGE,
  )

  for (const [failedCommand, nextCommand] of [
    [FMT, HM_BUILD],
    [HM_BUILD, DARWIN_BUILD],
    [DARWIN_BUILD, BOOTSTRAP_SWITCH],
  ]) {
    const harness = await makeHarness()
    if (failedCommand !== FMT) {
      const fmt = await harness.run(FMT)
      assert.notEqual(fmt.effect, "deny")
    }
    if (failedCommand === DARWIN_BUILD) {
      const hmBuild = await harness.run(HM_BUILD)
      assert.notEqual(hmBuild.effect, "deny")
    }
    const failed = await harness.run(failedCommand, { exit: 1 })
    assert.notEqual(failed.effect, "deny", `stage should be permitted before it fails: ${failedCommand}`)
    assertDenied(await harness.run(nextCommand), `failed ${failedCommand} must not produce evidence`)
    assertDenied(await harness.run(DARWIN_SWITCH), `failed ${failedCommand} must not permit a switch`)
  }

  for (const [backgroundCommand, nextCommand] of [
    [FMT, HM_BUILD],
    [HM_BUILD, DARWIN_BUILD],
    [DARWIN_BUILD, DARWIN_SWITCH],
  ]) {
    const harness = await makeHarness()
    if (backgroundCommand !== FMT) {
      assert.notEqual((await harness.run(FMT)).effect, "deny")
    }
    if (backgroundCommand === DARWIN_BUILD) {
      assert.notEqual((await harness.run(HM_BUILD)).effect, "deny")
    }
    const background = await harness.run(backgroundCommand, { background: true })
    assert.notEqual(background.effect, "deny")
    assertDenied(
      await harness.run(nextCommand),
      `background ${backgroundCommand} must not produce evidence`,
    )
    assertDenied(
      await harness.run(BOOTSTRAP_SWITCH),
      `background ${backgroundCommand} must not permit a switch`,
    )
  }

  const wrongOrder = await makeHarness()
  assertDenied(await wrongOrder.run(HM_BUILD), "wrong order HM build")
  assertDenied(await wrongOrder.run(DARWIN_BUILD), "wrong order darwin build")
  assertDenied(await wrongOrder.run(BOOTSTRAP_SWITCH), "wrong order switch")
}

async function testRootBranchAndInterlock() {
  currentBranch = "main"
  const wrongRoot = await makeHarness()
  await recordAllBuildEvidence(wrongRoot)
  assertDeniedMessage(
    await wrongRoot.run(DARWIN_SWITCH, { workdir: WORKTREE_ROOT }),
    "switch from a linked worktree",
    SWITCH_IDENTITY_MESSAGE,
  )

  const wrongBranch = await makeHarness()
  await recordAllBuildEvidence(wrongBranch)
  currentBranch = "feature"
  assertDenied(await wrongBranch.run(DARWIN_SWITCH), "switch from a non-main branch")
  currentBranch = "main"

  const interlock = await makeHarness()
  assert.equal(interlock.interlock(DARWIN_SWITCH, MAIN_ROOT), DARWIN_SWITCH)
  currentBranch = "feature"
  assert.equal(interlock.interlock(DARWIN_SWITCH, MAIN_ROOT), NEUTRALIZE_COMMAND)
  currentBranch = "main"
  assert.equal(interlock.interlock(BOOTSTRAP_SWITCH, WORKTREE_ROOT), NEUTRALIZE_COMMAND)
  for (const command of [
    LEGACY_SWITCHES[2],
    LEGACY_SWITCHES[3],
    LEGACY_SWITCHES[4],
    "/run/current-system/sw/bin/darwin-rebuild switch --flake /Users/koki/.dotfiles#mac",
  ]) {
    assert.equal(interlock.interlock(command, WORKTREE_ROOT), NEUTRALIZE_COMMAND)
  }
}

async function testEvidenceRequiresMainBranchProvenance() {
  currentBranch = "feature"
  const staleEvidence = await makeHarness()
  await recordAllBuildEvidence(staleEvidence)
  currentBranch = "main"
  assertDenied(
    await staleEvidence.run(DARWIN_SWITCH),
    "evidence recorded off main must not permit a later main switch",
  )

  currentBranch = "main"
  const mainEvidence = await makeHarness()
  await recordAllBuildEvidence(mainEvidence)
  assertAsk(await mainEvidence.run(DARWIN_SWITCH), "main-branch evidence permits exact switch ask")
}

async function testLegacySwitchesAreDeniedWithMigrationMessage() {
  currentBranch = "main"
  const harness = await makeHarness()
  await recordAllBuildEvidence(harness)
  for (const command of LEGACY_SWITCHES) {
    const event = await harness.run(command)
    assertDeniedMessage(event, command, LEGACY_SWITCH_MESSAGE)
  }
}

async function testNonCanonicalSwitchesAreDenied() {
  currentBranch = "main"
  const harness = await makeHarness()
  await recordAllBuildEvidence(harness)
  const nonCanonical = [
    "darwin-rebuild switch",
    "sudo darwin-rebuild switch",
    "sudo darwin-rebuild switch --flake .#mac",
    "nix run nix-darwin -- switch",
    "sudo nix run nix-darwin -- switch",
    "nix run .#darwin-rebuild -- switch --flake .#mac",
    "sudo nix run .#darwin-rebuild -- switch --flake .#mac",
    "sudo nix run --impure /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac",
    "nix run --impure .#darwin-rebuild -- switch --flake .#mac",
    "/run/current-system/sw/bin/darwin-rebuild switch --flake /Users/koki/.dotfiles#mac",
    BOOTSTRAP_SWITCH.slice("sudo ".length),
    DARWIN_SWITCH.slice("sudo ".length),
  ]
  for (const command of nonCanonical) {
    const event = await harness.run(command)
    assertDenied(event, command)
    assert.notEqual(event.effect, "ask", `non-canonical switch must not ask: ${command}`)
  }

  const gluedRedirect =
    "sudo nix run /Users/koki/.dotfiles#darwin-rebuild -- switch>/dev/null --flake /Users/koki/.dotfiles#mac"
  const gluedRedirectEvent = await harness.run(gluedRedirect, { initialEffect: "allow" })
  assertDenied(gluedRedirectEvent, `switch redirect from allow: ${gluedRedirect}`)
  assert.notEqual(
    gluedRedirectEvent.effect,
    "ask",
    `redirected switch must not ask: ${gluedRedirect}`,
  )
}

async function testWrappersAndMutationDoNotProvideEvidence() {
  currentBranch = "main"
  const buildHarness = await makeHarness()
  assert.notEqual((await buildHarness.run(FMT)).effect, "deny")
  assert.notEqual((await buildHarness.run(HM_BUILD)).effect, "deny")
  const buildWrappers = [
    `env ${DARWIN_BUILD}`,
    `bash -c '${DARWIN_BUILD}'`,
    `${DARWIN_BUILD} && true`,
    `${DARWIN_BUILD} | cat`,
    `${DARWIN_BUILD} > build.log`,
  ]
  for (const [index, command] of buildWrappers.entries()) {
    const event = await buildHarness.run(command)
    if (index === 0) assertDeniedMessage(event, command, COMPOUND_MESSAGE)
    else assertDenied(event, command)
  }
  assertDenied(await buildHarness.run(BOOTSTRAP_SWITCH), "wrapped darwin build must not be evidence")

  const switchHarness = await makeHarness()
  await recordAllBuildEvidence(switchHarness)
  const switchWrappers = [
    `env ${DARWIN_SWITCH}`,
    `bash -c '${DARWIN_SWITCH}'`,
    `${DARWIN_SWITCH} && true`,
    `${DARWIN_SWITCH} | cat`,
    `${DARWIN_SWITCH} > switch.log`,
    "sudo darwin-rebuild switch --flake .#mac",
  ]
  for (const command of switchWrappers) assertDenied(await switchHarness.run(command), command)

  const mutationHarness = await makeHarness()
  await recordAllBuildEvidence(mutationHarness)
  assert.notEqual((await mutationHarness.run("touch gate-test-mutation")).effect, "deny")
  assertDenied(await mutationHarness.run(BOOTSTRAP_SWITCH), "mutation must clear evidence")
}

async function testUnrelatedSudoRemainsDenied() {
  const harness = await makeHarness()
  for (const command of ["sudo ls", "sudo brew install foo", "sudo nix run nixpkgs#hello"]) {
    const event = await harness.run(command, { initialEffect: "deny" })
    assert.equal(event.effect, "deny", `unrelated sudo must remain denied: ${command}`)
    assert.notEqual(event.effect, "ask", `unrelated sudo must not ask: ${command}`)
    assert.notEqual(event.effect, "allow", `unrelated sudo must not allow: ${command}`)
  }
}

async function testMutatingToolsInvalidateEvidence() {
  currentBranch = "main"
  for (const tool of ["edit", "write", "patch", "opencode_worktree_remove"]) {
    const harness = await makeHarness()
    await recordAllBuildEvidence(harness)
    await harness.hooks.tool["execute.before"]({
      tool,
      sessionID: harness.sessionID,
      messageID: `message-${++callNumber}`,
      id: `tool-${callNumber}`,
      agent: AGENT,
      input: {},
    })
    assertDenied(await harness.run(HM_BUILD), `${tool} must invalidate fmt evidence`)
    assertDenied(await harness.run(DARWIN_SWITCH), `${tool} must invalidate switch evidence`)
    await recordAllBuildEvidence(harness)
    assertAsk(await harness.run(DARWIN_SWITCH), `${tool} permits switch after full revalidation`)
  }

  const readOnly = await makeHarness()
  await recordAllBuildEvidence(readOnly)
  await readOnly.hooks.tool["execute.before"]({
    tool: "opencode_worktree_list",
    sessionID: readOnly.sessionID,
    input: {},
  })
  assertAsk(await readOnly.run(DARWIN_SWITCH), "listing worktrees preserves verification evidence")
}

try {
  await testExactSwitchesRequireFullEvidence()
  await testDeclarationAndEvidenceOrder()
  await testRootBranchAndInterlock()
  await testEvidenceRequiresMainBranchProvenance()
  await testLegacySwitchesAreDeniedWithMigrationMessage()
  await testNonCanonicalSwitchesAreDenied()
  await testWrappersAndMutationDoNotProvideEvidence()
  await testMutatingToolsInvalidateEvidence()
  await testUnrelatedSudoRemainsDenied()
  console.log("check-nix-verify-gate: all tests passed")
} finally {
  deps.realpath = originalDeps.realpath
  deps.spawnSync = originalDeps.spawnSync
}
