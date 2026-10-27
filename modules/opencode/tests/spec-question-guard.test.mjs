// Hook-level regression tests using OpenCode v2 Session.Message shapes. These
// verify the narrow presentation gate, not model compliance or live execution.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../plugins/spec-question-guard.js", import.meta.url), "utf8")
const { default: plugin } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const text = (value, agent = "spec") => ({
  type: "assistant", agent, content: [{ type: "text", text: value }],
})
const PLAN = "## 実装計画\n### 対象範囲\n設定を修正し、すぐに実装します。\n### 検証方法\nテストを実行します。\n### リスク\n既存の動作への影響を確認します。"
function review(status = "COMPLETE", overrides = {}) {
  return {
    type: "assistant", agent: "spec", content: [{
      type: "tool", name: "subagent", state: {
        status: "completed",
        input: { agent: "plan_review", description: "Plan review: harness", background: false },
        content: [{ type: "text", text: `<subagent sessionID="child" state="completed">\nSTATUS: ${status}\n## summary\nReviewed.\n</subagent>` }],
        metadata: { sessionID: "child", status: "completed" },
        ...overrides,
      },
    }],
  }
}
async function harness(messages, context = async () => messages) {
  let evaluate
  await plugin.setup({
    permission: { hook: (name, fn) => { assert.equal(name, "evaluate"); evaluate = fn } },
    session: { context },
  })
  return async (action = "edit", overrides = {}) => {
    const event = { agent: "spec", sessionID: "parent", action, resources: ["*"], effect: "allow", ...overrides }
    await evaluate(event)
    return event
  }
}

async function effectFor(messages, action, overrides) {
  const run = await harness(messages)
  return (await run(action, overrides)).effect
}

test("successful review blocks continuation until a visible plan", async () => {
  const run = await harness([review()])
  for (const action of ["edit", "shell", "question", "subagent"]) {
    const event = await run(action, { resources: action === "subagent" ? ["general"] : ["*"] })
    assert.equal(event.effect, "deny", action)
    assert.match(event.message, /承認や Y の返答を待たず/)
  }
})

test("plan unlocks implementation immediately without a user approval message", async () => {
  const run = await harness([review(), text(PLAN)])
  for (const action of ["edit", "shell", "question", "subagent"]) {
    assert.equal((await run(action, { resources: ["general"] })).effect, "allow", action)
  }
  assert.equal((await run("edit", { effect: "deny" })).effect, "deny", "does not override other denials")
  assert.equal((await run("shell", { effect: "ask" })).effect, "ask", "retains tool authorization")
})

test("plan before a pending tool in the same response starts implementation without ending the turn", async () => {
  for (const name of ["edit", "subagent"]) {
    const pendingTool = { type: "tool", name, state: { status: "running", input: {
      ...(name === "subagent" ? { agent: "general", background: true } : { path: "config.json" }),
    } } }
    const message = { ...text(PLAN), content: [...text(PLAN).content, pendingTool] }
    const run = await harness([review(), message])
    assert.equal((await run(name, { resources: name === "subagent" ? ["general"] : ["config.json"] })).effect, "allow")
  }
})

test("initial evidence gathering and genuine questions remain available", async () => {
  const run = await harness([{ type: "user", text: "調査してください" }])
  for (const action of ["read", "shell", "question", "subagent"]) {
    assert.equal((await run(action, { resources: ["general"] })).effect, "allow", action)
  }
})

test("read-only evidence, explore, review and other agents are unaffected", async () => {
  const run = await harness([review()])
  assert.equal((await run("read")).effect, "allow")
  for (const agent of ["explore", "plan_review"]) {
    assert.equal((await run("subagent", { resources: [agent] })).effect, "allow")
  }
  assert.equal((await run("edit", { agent: "general" })).effect, "allow")
})

test("implementation and design reviews never require a new plan", async () => {
  for (const description of ["Implementation review: harness", "Design review: harness"]) {
    const run = await harness([review("COMPLETE", { input: { agent: "plan_review", description } })])
    assert.equal((await run("shell")).effect, "allow")
  }
})

test("requires plan after the latest completed plan review", async () => {
  assert.equal(await effectFor([review(), text(PLAN), review()]), "deny")
  assert.equal(await effectFor([review(), text(PLAN), review("PARTIAL")]), "allow")
})

test("uses the last completed plan review within one assistant message", async () => {
  for (const [first, last, expected] of [
    ["PARTIAL", "COMPLETE", "deny"],
    ["COMPLETE", "PARTIAL", "allow"],
  ]) {
    const message = {
      ...review(), content: [...review(first).content, ...review(last).content],
    }
    assert.equal(await effectFor([message]), expected)
  }
})

test("running, errored and background-start tool results do not replace completed evidence", async () => {
  for (const extra of [
    review("COMPLETE", { status: "running" }),
    review("COMPLETE", { status: "error" }),
    review("COMPLETE", { metadata: { sessionID: "child", status: "running" } }),
  ]) {
    assert.equal(await effectFor([review(), text(PLAN), extra]), "allow")
  }
})

test("new user request clears a stale review, synthetic messages do not", async () => {
  assert.equal(await effectFor([review(), { type: "user", text: "別件を調査してください" }], "shell"), "allow")
  assert.equal(await effectFor([review(), { type: "synthetic", text: "worker complete" }], "shell"), "deny")
})

test("rejects plans after tools, wrong agents, wrong order, or empty sections", async () => {
  const invalid = [
    { ...text(PLAN), content: [{ type: "tool", name: "read" }, ...text(PLAN).content] },
    { ...text(PLAN), content: [
      { type: "text", text: "## 実装計画\n### 対象範囲\n設定を修正します。" },
      { type: "tool", name: "edit" },
      { type: "text", text: "### 検証方法\nテストします。\n### リスク\n動作を確認します。" },
    ] },
    text(PLAN, "general"),
    text(PLAN.replace("### 対象範囲", "### リスク")),
    text(PLAN.replace("設定を修正し、すぐに実装します。", "")),
  ]
  for (const candidate of invalid) {
    assert.equal(await effectFor([review(), candidate]), "deny")
  }
})

test("parses wrapped status strictly and fails closed for malformed review content", async () => {
  for (const value of ["", "Intro\nSTATUS: COMPLETE", "STATUS: COMPLETED", "STATUS: PARTIAL\nSTATUS: COMPLETE"]) {
    const run = await harness([review("COMPLETE", { content: [{ type: "text", text: value }] })])
    assert.equal((await run()).effect, value.startsWith("STATUS: PARTIAL\n") ? "allow" : "deny")
  }
  const run = await harness([review("COMPLETE", { content: [{ type: "text", text: '<subagent sessionID="s" state="completed">STATUS: COMPLETE</subagent>' }] })])
  assert.equal((await run()).effect, "deny", "inline wrapper still requires plan")
})

test("context failures affect only guarded actions", async (t) => {
  t.mock.method(console, "warn", () => {})
  const run = await harness([], async () => { throw new Error("unavailable") })
  assert.equal((await run()).effect, "deny")
  assert.equal((await run("read")).effect, "allow")
  assert.equal((await run("question", { agent: "general" })).effect, "allow")
})
