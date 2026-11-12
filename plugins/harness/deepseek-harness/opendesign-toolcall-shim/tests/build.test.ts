/**
 * The type gate.
 *
 * `tsrs` is a Rust port of tsc; it is the project's type gate. The check is
 * skipped when the binary is absent so the suite still runs on a machine that
 * only has the committed dist/, but it reports that it skipped rather than
 * silently passing.
 *
 * @module dsh-opendesign-toolcall-shim/tests/build
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

describe('build', () => {
  it('typechecks clean', (t) => {
    const tsrs = process.env.TSRS ?? 'tsrs'
    const probe = spawnSync(tsrs, ['--version'], { encoding: 'utf8' })
    if (probe.error !== undefined) {
      // No compiler on this machine: dist/ is committed, so the rest of the
      // suite still validates behaviour.
      t.diagnostic(`skipped: ${tsrs} is not available`)
      return
    }
    const built = spawnSync(tsrs, ['-p', 'tsconfig.json', '--noEmit'], { cwd: root, encoding: 'utf8' })
    assert.equal(built.status, 0, `typecheck failed:\n${built.stdout}${built.stderr}`)
  })
})
