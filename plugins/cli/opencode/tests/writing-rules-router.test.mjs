import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

const run = promisify(execFile)
const rules = {
  javascript: { filenames: ["package.json"], extensions: [".js", ".ts"] },
  python: { filenames: ["pyproject.toml"], extensions: [".py"] },
  go: { filenames: ["go.mod"], extensions: [".go"] },
  rust: { filenames: ["Cargo.toml"], extensions: [".rs"] },
}
for (const [name, rule] of Object.entries(rules)) {
  rule.text = readFileSync(new URL(`../prompts/languages/${name}.md`, import.meta.url), "utf8")
}
const names = Object.keys(rules)
// The optional path exercises the actual Nix-rendered plugin with its complete language registry.
const source = readFileSync(process.env.WRITING_RULES_PLUGIN ??
  new URL("../plugins/writing-rules-router.js", import.meta.url), "utf8")
  .replace("@LANGUAGE_RULES@", JSON.stringify(rules))
const { default: plugin } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const marker = "writing-rules-router"

async function project(t, files, git = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "writing-rules-router-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const [filename, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true })
    await writeFile(path.join(directory, filename), content)
  }
  if (git) await run("git", ["init", "--quiet", directory])
  return directory
}

async function harness(directory) {
  let context
  const state = { directory, lookups: 0 }
  await plugin.setup({ session: {
    hook(name, callback) {
      assert.equal(name, "context")
      context = callback
    },
    async get({ sessionID }) {
      assert.equal(sessionID, "session")
      state.lookups++
      if (state.error) throw state.error
      return { location: { directory: state.directory } }
    },
  } })
  return {
    state,
    async apply(overrides = {}) {
      const event = { agent: "spec", sessionID: "session", system: [{ type: "text", text: "existing" }], ...overrides }
      await context(event)
      return event
    },
  }
}

function selected(event) {
  const own = event.system.filter((part) => part.metadata?.[marker])
  assert.ok(own.length <= 1, "never duplicates the routed system part")
  const text = own[0]?.text ?? ""
  return names.filter((name) => text.includes(rules[name].text))
}

for (const [filename, language] of [
  ["package.json", "javascript"], ["pyproject.toml", "python"],
  ["go.mod", "go"], ["Cargo.toml", "rust"],
  ["src/main.ts", "javascript"], ["src/main.py", "python"],
  ["src/main.go", "go"], ["src/main.rs", "rust"],
]) {
  test(`${filename} selects only ${language} without reading its contents`, async (t) => {
    // Invalid manifest contents keep detection independent of parsers and project-supplied text.
    const directory = await project(t, { [filename]: "not a valid manifest; NEVER_INJECT_THIS" })
    const result = await (await harness(directory)).apply()
    assert.deepEqual(selected(result), [language])
    assert.equal(result.system[0].text, "existing")
    assert.ok(!JSON.stringify(result.system).includes("NEVER_INJECT_THIS"))
  })
}

test("polyglot projects receive each detected language once", async (t) => {
  const directory = await project(t, { "api/go.mod": "", "web/package.json": "", "web/index.ts": "" }, true)
  const session = await harness(directory)
  for (const agent of ["spec", "general"]) {
    const first = await session.apply({ agent })
    const repeated = await session.apply({ agent, system: first.system })
    assert.deepEqual(selected(repeated), ["javascript", "go"])
    assert.equal(repeated.system.length, 2)
  }
})

test("all detected languages route identically regardless of discovery order", async (t) => {
  const first = await project(t, {
    "a/main.rs": "", "b/main.go": "", "c/main.py": "", "d/main.ts": "",
  }, true)
  const second = await project(t, {
    "a/main.ts": "", "b/main.py": "", "c/main.go": "", "d/main.rs": "",
  }, true)
  const firstResult = await (await harness(first)).apply()
  const secondResult = await (await harness(second)).apply()
  assert.deepEqual(selected(firstResult), names)
  assert.deepEqual(selected(secondResult), names)
  assert.equal(
    firstResult.system.find((part) => part.metadata?.[marker]).text,
    secondResult.system.find((part) => part.metadata?.[marker]).text,
  )
})

test("Git routing respects ignores and excludes deleted files, dependencies and symlinks", async (t) => {
  const directory = await project(t, {
    "go.mod": "", ".gitignore": "ignored/\n", "ignored/tool.py": "",
    "node_modules/pkg/index.js": "", "target/generated.rs": "", "deleted.py": "",
  }, true)
  await run("git", ["-C", directory, "add", "--", "deleted.py"])
  await unlink(path.join(directory, "deleted.py"))
  await symlink(path.join(directory, "go.mod"), path.join(directory, "linked.py"))
  assert.deepEqual(selected(await (await harness(directory)).apply()), ["go"])
})

test("non-Git routing skips generated directories and never follows directory symlinks", async (t) => {
  const external = await project(t, { "Cargo.toml": "" })
  const directory = await project(t, {
    "src/main.py": "", ".venv/lib/helper.py": "", "vendor/module.go": "",
    "dist/bundle.js": "", "build/generated.rs": "", ".env.private/tool.go": "",
  })
  await symlink(external, path.join(directory, "linked"))
  assert.deepEqual(selected(await (await harness(directory)).apply()), ["python"])
})

test("nested workspace selects only its own sources", async (t) => {
  const directory = await project(t, { "web/package.json": "", "api/go.mod": "" }, true)
  const session = await harness(path.join(directory, "api"))
  assert.deepEqual(selected(await session.apply()), ["go"])
})

test("new files, removed languages and workspace moves take effect on the next request", async (t) => {
  const directory = await project(t, { "main.py": "" }, true)
  const other = await project(t, { "Cargo.toml": "" })
  const session = await harness(directory)
  const python = await session.apply()
  assert.deepEqual(selected(python), ["python"])
  await writeFile(path.join(directory, "go.mod"), "")
  assert.deepEqual(selected(await session.apply()), ["python", "go"])
  await unlink(path.join(directory, "main.py"))
  assert.deepEqual(selected(await session.apply({ system: python.system })), ["go"])
  session.state.directory = other
  assert.deepEqual(selected(await session.apply()), ["rust"])
})

test("unsupported agents and unknown-language projects receive no language rules", async (t) => {
  const directory = await project(t, { "Cargo.toml": "" })
  const session = await harness(directory)
  for (const agent of ["explore", "plan_review", "build", "plan"]) {
    assert.deepEqual(selected(await session.apply({ agent })), [])
  }
  assert.equal(session.state.lookups, 0)
  session.state.directory = await project(t, { "main.nix": "", "README.md": "" })
  assert.deepEqual(selected(await session.apply()), [])
})

test("lookup failures remove stale routed rules and preserve the existing prompt", async (t) => {
  t.mock.method(console, "warn", () => {})
  const directory = await project(t, { "go.mod": "" })
  const session = await harness(directory)
  const previous = await session.apply()
  session.state.error = new Error("session unavailable")
  const result = await session.apply({ system: previous.system })
  assert.deepEqual(selected(result), [])
  assert.deepEqual(result.system, [{ type: "text", text: "existing" }])
})
