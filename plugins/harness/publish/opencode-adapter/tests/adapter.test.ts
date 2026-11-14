/**
 * The OpenCode adapter: the PublishHost built on the OpenCode plugin API.
 *
 * The cases drive the adapter's own `setup()` against a fake runtime that
 * records what the plugin registers, so the mapping from the core's host
 * vocabulary onto OpenCode's is what is under test.
 *
 * @module @publish/opencode-adapter/tests/adapter
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublishPlugin, toApprovalRequest } from '../src/adapter.ts'
import type {
  CommandDefinition,
  PermissionEvaluation,
  PluginContext,
  ToolContext,
  ToolDefinition,
} from '../src/types.ts'

/** A fake OpenCode runtime that records registrations and permission asks. */
function runtime(directory: string) {
  const tools: ToolDefinition[] = []
  const commands: CommandDefinition[] = []
  const asserted: Record<string, unknown>[] = []
  const hooks: ((event: PermissionEvaluation) => void)[] = []
  const prompts: Record<string, unknown>[] = []
  let reloads = 0

  const ctx: PluginContext = {
    command: {
      async transform(callback) {
        callback({ add: (value) => commands.push(value) })
        return { dispose: async () => {} }
      },
    },
    tool: {
      async transform(callback) {
        callback({ add: (value) => tools.push(value) })
        return { dispose: async () => {} }
      },
      async reload() {
        reloads += 1
      },
    },
    session: {
      async get() {
        return { location: { directory } }
      },
      async prompt(input) {
        prompts.push(input)
        return undefined
      },
    },
    skill: {
      async list() {
        return { data: catalog }
      },
    },
    permission: {
      async assert(input) {
        asserted.push(input)
      },
      hook(_name, callback) {
        hooks.push(callback)
      },
    },
  }

  return {
    ctx,
    tools,
    commands,
    asserted,
    prompts,
    get reloads() {
      return reloads
    },
    /** Fire one permission evaluation through the registered hook. */
    evaluate(event: PermissionEvaluation): PermissionEvaluation {
      for (const hook of hooks) hook(event)
      return event
    },
  }
}

/** The resources the core would otherwise read from the bundle. */
const resources = {
  instructions: 'INSTRUCTIONS',
  officialSkill: '---\nname: git-surgeon\n---\nofficial\n',
  prSkill: '---\nname: pr\n---\npr official\n',
}

/**
 * The skill catalog the fake runtime reports.
 *
 * The core verifies each bundled skill against the catalog by body text, so a
 * fake that reports nothing would fail admission before anything is tested.
 */
const catalog = [
  // The runtime reports the skill body without its front matter, and the core
  // compares that body against the bundled copy.
  { id: 'git-surgeon', path: '/trusted/git-surgeon/SKILL.md', content: 'official' },
  { id: 'pr', path: '/trusted/pr/SKILL.md', content: 'pr official' },
]

/** Build the plugin with test resources. */
function plugin() {
  return createPublishPlugin({
    loadResources: async (includePrSkill) => ({
      ...resources,
      ...includePrSkill ? {} : { prSkill: undefined },
    }),
  })
}

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  },
})

/**
 * A real repository: the core runs git in it, so it must be one.
 *
 * The branch is `main`, so `/publish` does not require the `pr` skill.
 */
async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'publish-opencode-'))
  git(directory, 'init', '-q', '-b', 'main')
  await writeFile(join(directory, 'a.txt'), 'one\n')
  git(directory, 'add', '.')
  git(directory, 'commit', '-qm', 'chore: init')
  return directory
}

describe('opencode adapter', () => {
  it('registers every publish tool and the /publish command', async () => {
    const directory = await workspace()
    try {
      const r = runtime(directory)
      await plugin().setup(r.ctx)
      assert.deepEqual(r.tools.map((tool) => tool.name), [
        'publish_inspect',
        'publish_show',
        'commit_hunks',
        'publish_sync_main',
        'publish_main',
        'publish_pr',
      ])
      assert.deepEqual(r.commands.map((command) => command.name), ['publish'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports the tool access the runtime gates on', async () => {
    const directory = await workspace()
    try {
      const r = runtime(directory)
      await plugin().setup(r.ctx)
      const byName = new Map(r.tools.map((tool) => [tool.name, tool]))
      assert.equal(byName.get('publish_inspect')?.options.permission, 'read')
      assert.equal(byName.get('publish_show')?.options.permission, 'read')
      assert.equal(byName.get('commit_hunks')?.options.permission, 'edit')
      assert.equal(byName.get('publish_sync_main')?.options.permission, 'edit')
      assert.equal(byName.get('publish_main')?.options.permission, 'edit')
      assert.equal(byName.get('publish_pr')?.options.permission, 'edit')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('exposes publish_pr with the no-template body schema before /publish runs', async () => {
    const directory = await workspace()
    try {
      const r = runtime(directory)
      await plugin().setup(r.ctx)
      const pr = r.tools.find((tool) => tool.name === 'publish_pr')
      assert.ok(pr)
      assert.deepEqual(pr.input.required, ['title', 'fingerprint', 'body'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('asks permission with the core action and resources', async () => {
    const directory = await workspace()
    try {
      const r = runtime(directory)
      await plugin().setup(r.ctx)
      // /publish inspects the repository, which asks to read the root.
      await r.commands[0]?.execute({ sessionID: 's', prompt: { text: 'go' }, delivery: undefined })
      assert.ok(r.asserted.length > 0)
      assert.ok(r.asserted.every((ask) => typeof ask.action === 'string'))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('delivers the instructions with the required skill ids', async () => {
    const directory = await workspace()
    try {
      const r = runtime(directory)
      await plugin().setup(r.ctx)
      await r.commands[0]?.execute({ sessionID: 's', prompt: { text: 'go' }, delivery: undefined })
      const prompt = r.prompts[0]
      assert.ok(prompt)
      assert.equal(prompt.text, 'INSTRUCTIONS')
      // `main` needs only the git-surgeon skill; the `pr` skill is for branches.
      assert.deepEqual(prompt.skills, [{ id: 'git-surgeon' }])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('opencode adapter: fast-forward promotion', () => {
  it('maps an evaluation onto the core vocabulary', () => {
    const allow = toApprovalRequest({ sessionID: 's', action: 'shell', resources: ['git status'], effect: 'allow' })
    assert.deepEqual(allow, { sessionID: 's', action: 'shell', resources: ['git status'], decision: 'allow' })

    const ask = toApprovalRequest({
      sessionID: 's', action: 'shell', resources: ['git merge --ff-only x'], effect: 'ask',
      source: { id: 'call-1' },
    })
    assert.equal(ask.decision, 'ask')
    assert.equal(ask.callID, 'call-1')

    const deny = toApprovalRequest({ sessionID: 's', action: 'shell', effect: 'deny' })
    assert.equal(deny.decision, 'deny')
    assert.deepEqual(deny.resources, [])
  })

  it('raises the merge ask to ask, which is what forces a human decision', async () => {
    const origin = await mkdtemp(join(tmpdir(), 'publish-opencode-origin-'))
    const directory = await workspace()
    try {
      git(origin, 'init', '-q', '--bare', '-b', 'main')
      git(directory, 'remote', 'add', 'origin', origin)
      git(directory, 'push', '-q', 'origin', 'main')
      const head = git(directory, 'rev-parse', 'HEAD').trim()
      // A second commit on origin/main is the fast-forward target.
      await writeFile(join(directory, 'b.txt'), 'two\n')
      git(directory, 'add', '.')
      git(directory, 'commit', '-qm', 'chore: second')
      const target = git(directory, 'rev-parse', 'HEAD').trim()
      git(directory, 'push', '-q', 'origin', 'main')
      git(directory, 'reset', '-q', '--hard', head)

      const r = runtime(directory)
      await plugin().setup(r.ctx)
      await r.commands[0]?.execute({ sessionID: 's', prompt: { text: 'go' }, delivery: undefined })

      const tool = r.tools.find((entry) => entry.name === 'publish_sync_main')
      assert.ok(tool)
      const context: ToolContext = {
        sessionID: 's', agent: 'a', messageID: 'm', id: 'call-1', signal: new AbortController().signal,
      }
      // The core asks for the merge through the permission hook. In OpenCode
      // the hook mutates the event, so the effect the runtime sees is what
      // decides whether the merge runs.
      const effects: string[] = []
      const originalAssert = r.ctx.permission.assert
      r.ctx.permission.assert = async (input) => {
        const event: PermissionEvaluation = {
          sessionID: String(input.sessionID),
          action: String(input.action),
          resources: (input.resources as string[] | undefined) ?? [],
          effect: 'allow',
          ...typeof input.source === 'object' && input.source !== null
            ? { source: input.source as { id?: string } }
            : {},
        }
        r.evaluate(event)
        effects.push(event.effect)
        return originalAssert(input)
      }

      await tool.execute({ expectedHead: head, targetHead: target }, context)

      // The merge ask is the one carrying the exact command; the promotion
      // raised it from an automatic allow to `ask`.
      const mergeIndex = effects.length - 1
      assert.ok(mergeIndex >= 0)
      assert.ok(
        effects.includes('ask'),
        `the merge ask must be promoted to ask; saw ${JSON.stringify(effects)}`,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(origin, { recursive: true, force: true })
    }
  })
})
