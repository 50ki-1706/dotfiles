/**
 * Test-only module resolution for the publish plugin's tests.
 *
 * The plugin's DSH adapter imports `@deepseek-ai/*` packages that the running
 * dsh installation supplies at load time. The tests run outside that
 * installation, so this script links the running dsh's own `node_modules` into
 * the plugin directory before the test files load.
 *
 * The links stay in place after the run, so the build step's `tsrs` typecheck
 * can resolve the same packages from a separate process, and a sibling test
 * file that is still importing never loses them mid-run.
 *
 * Nothing here is loaded by dsh itself: the plugin's `main` is `dist/index.js`.
 *
 *   node --import ./tests/link-dsh-modules.ts --test tests/*.test.ts
 *
 * @module dsh-publish/tests/link-dsh-modules
 */

import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Packages the plugin's source and tests import. */
const PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-loop',
  '@deepseek-ai/dsh-agent-loop-testkit',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-projection',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-tool-executor-native',
  '@deepseek-ai/dsh-user-approval',
  '@deepseek-ai/dsh-util-values',
  '@deepseek-ai/dsh-working-directory',
  // The compiler's type gate (`tsrs -p tsconfig.json`) resolves `types: ["node"]`
  // from here; the dsh installation ships it, so the build needs no install.
  '@types/node',
]

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)))
const modulesDir = join(pluginDir, 'node_modules')

/**
 * Find the running dsh installation's `node_modules`.
 * @returns the directory holding `@deepseek-ai/dsh-llm`, or undefined.
 */
function dshModulesDir(): string | undefined {
  const candidates = [
    process.env.DSH_INSTALL_MODULES,
    // The nix package layout: <store>/libexec/dsh/node_modules.
    ...(process.env.DSH_INSTALL_ROOT === undefined ? [] : [join(process.env.DSH_INSTALL_ROOT, 'node_modules')]),
  ]
  for (const candidate of candidates) {
    if (candidate !== undefined && existsSync(join(candidate, '@deepseek-ai', 'dsh-llm'))) return candidate
  }
  return undefined
}

const source = dshModulesDir()
if (source === undefined) {
  throw new Error(
    'tests/link-dsh-modules: set DSH_INSTALL_MODULES to the running dsh installation\'s node_modules'
    + ' (the directory containing @deepseek-ai/dsh-llm)',
  )
}

mkdirSync(modulesDir, { recursive: true })
for (const name of PACKAGES) {
  const target = join(modulesDir, name)
  if (existsSync(target)) continue
  const origin = join(source, name)
  if (!existsSync(origin)) continue
  mkdirSync(dirname(target), { recursive: true })
  try {
    symlinkSync(origin, target, 'junction')
  } catch (error) {
    // The test runner loads this module once per test file, so a sibling
    // process may have created the same link between the check and the call.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

// The links are left in place: the test runner loads this module once per test
// file, so removing them on exit would break a sibling file that is still
// resolving its imports. `node_modules/` is ignored by the plugin's .gitignore.
