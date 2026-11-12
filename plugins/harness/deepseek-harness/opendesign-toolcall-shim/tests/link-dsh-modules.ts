/**
 * Test-only module resolution for the shim's unit tests.
 *
 * The shim's source imports `@deepseek-ai/*` packages that the running dsh
 * installation supplies at load time. The tests run outside that installation,
 * so this script links the running dsh's own `node_modules` into the plugin
 * directory before the test files load and removes the links afterwards.
 *
 * Set `SHIM_KEEP_LINKS=1` to leave the links in place, which is what the build
 * step needs: `tsrs` typechecks against these packages, and it runs in a
 * separate process from the tests.
 *
 * Nothing here is loaded by dsh itself: the plugin's `main` is `dist/index.js`.
 *
 *   node --import ./tests/link-dsh-modules.ts --test tests/*.test.ts
 *
 * @module dsh-opendesign-toolcall-shim/tests/link-dsh-modules
 */

import { existsSync, mkdirSync, rmdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Packages the shim's source and tests import. */
const PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-config-editor',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-timeout',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-util-values',
  '@earendil-works/pi-ai',
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
const linked: string[] = []
for (const name of PACKAGES) {
  const target = join(modulesDir, name)
  if (existsSync(target)) continue
  const origin = join(source, name)
  if (!existsSync(origin)) continue
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(origin, target, 'junction')
  linked.push(target)
}

// `tsrs` typechecks against these packages in a separate process, so the build
// step asks for the links to outlive this one.
if (process.env.SHIM_KEEP_LINKS === '1') {
  process.exit(0)
}

// Only remove what this script created, so a developer's own install survives.
process.on('exit', () => {
  for (const target of linked) {
    try { rmSync(target, { recursive: true, force: true }) } catch { /* best effort */ }
  }
  // Remove only directories this script created and only while they are empty,
  // so a developer's own install is never touched.
  for (const directory of [
    join(modulesDir, '@deepseek-ai'),
    join(modulesDir, '@earendil-works'),
    join(modulesDir, '@types'),
    modulesDir,
  ]) {
    try { if (existsSync(directory)) rmdirSync(directory) } catch { /* not empty: leave it */ }
  }
})
