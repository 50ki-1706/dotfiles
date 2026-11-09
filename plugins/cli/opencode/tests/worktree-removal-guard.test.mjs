import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../plugins/worktree-removal-guard.js", import.meta.url), "utf8")
const { default: plugin } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

async function harness() {
  const registrations = []
  await plugin.setup({ tool: { hook: (name, callback) => registrations.push({ name, callback }) } })
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].name, "execute.before")
  return registrations[0].callback
}

function event(tool, overrides = {}) {
  return {
    tool, sessionID: "session", agent: "spec", messageID: "message", id: "call",
    input: {}, ...overrides,
  }
}

test("registers the pinned SDK execute.before hook", async () => {
  assert.equal(plugin.id, "worktree-removal-guard")
  assert.equal(typeof await harness(), "function")
})

test("setup waits for asynchronous hook registration before becoming ready", async () => {
  let before
  let release
  let ready = false
  const registration = new Promise((resolve) => { release = resolve })
  const setup = plugin.setup({ tool: {
    async hook(name, callback) {
      assert.equal(name, "execute.before")
      await registration
      before = callback
    },
  } }).then(() => { ready = true })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(ready, false, "setup must remain pending until the hook is registered")
  assert.equal(before, undefined)
  release()
  await setup
  assert.equal(ready, true)
  assert.throws(() => before(event("opencode_worktree_remove")), /Automatic worktree removal is disabled/)
})

test("setup propagates asynchronous hook registration rejection", async () => {
  const failure = new Error("registration unavailable")
  await assert.rejects(plugin.setup({ tool: {
    async hook() { throw failure },
  } }), (error) => error === failure)
})

test("direct and Code Mode native calls reject every agent and force setting before the executor", async () => {
  const before = await harness()
  let executed = 0
  // Stub only the await-before-executor boundary; never invoke a real removal tool.
  async function invoke(request, route) {
    if (route === "codemode") await before(event("execute", { input: { code: "native call fixture" } }))
    await before(request)
    executed++
  }
  for (const route of ["direct", "codemode"]) {
    for (const agent of ["spec", "general", "explore", "plan_review", "build", "other"]) {
      for (const force of [undefined, false, true]) {
        const input = { directory: "PRIVATE_INPUT_SENTINEL", ...(force === undefined ? {} : { force }) }
        const request = event("opencode_worktree_remove", { agent, input, id: `${route}-${agent}-${force}` })
        await assert.rejects(() => invoke(request, route), (error) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /Automatic worktree removal is disabled/)
          assert.ok(!error.message.includes(input.directory))
          return true
        })
      }
    }
  }
  assert.equal(executed, 0)
})

test("unrelated tools and existing permission effects remain untouched", async () => {
  const before = await harness()
  for (const tool of ["edit", "write", "patch", "shell", "opencode_worktree_list", "execute",
    "worktree_remove", "opencode_worktree_remove_extra", "other_opencode_worktree_remove"]) {
    for (const effect of ["allow", "ask", "deny"]) {
      const request = Object.freeze(event(tool, { effect, input: Object.freeze({ value: 1 }) }))
      const original = structuredClone(request)
      assert.equal(await before(request), undefined)
      assert.deepEqual(request, original)
    }
  }
})

test("rejection reads no input or agent data and propagates without a swallowing catch", async () => {
  const before = await harness()
  const request = {
    tool: "opencode_worktree_remove",
    get input() { throw new Error("input must not be read") },
    get agent() { throw new Error("agent must not be read") },
  }
  assert.throws(() => before(request), /Automatic worktree removal is disabled/)
})
