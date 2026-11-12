/**
 * Unit coverage of the guard layer.
 *
 * @module dsh-opendesign-toolcall-shim/tests/guard
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { guardEffect, inspectArguments, recoveryNote } from '../dist/guard/index.js'

describe('guard decision', () => {
  it('leaves a parsed object untouched', () => {
    assert.deepEqual(inspectArguments({ a: 1 }), { kind: 'untouched' })
  })

  it('leaves a valid argument string untouched', () => {
    assert.deepEqual(inspectArguments('{"a":1}'), { kind: 'untouched' })
  })

  it('splits concatenated objects and reports the ignored calls', () => {
    const outcome = inspectArguments('{"a":1}{"b":2}{"c":3}')
    assert.equal(outcome.kind, 'split')
    assert.deepEqual(outcome.kind === 'split' ? outcome.arguments : undefined, { a: 1 })
    assert.equal(outcome.kind === 'split' ? outcome.ignored : 0, 2)
  })

  it('repairs a truncated object', () => {
    const outcome = inspectArguments('{"a":1,"b":')
    assert.equal(outcome.kind, 'repaired')
    assert.deepEqual(outcome.kind === 'repaired' ? outcome.arguments : undefined, { a: 1 })
  })

  it('leaves unrecoverable arguments untouched', () => {
    assert.deepEqual(inspectArguments('not json at all'), { kind: 'untouched' })
  })
})

describe('guard notes', () => {
  it('explains a split to the model', () => {
    assert.match(recoveryNote(inspectArguments('{"a":1}{"b":2}')) ?? '', /concatenated/)
  })

  it('explains a repair to the model', () => {
    assert.match(recoveryNote(inspectArguments('{"a":"unf')) ?? '', /repaired/)
  })

  it('says nothing when nothing was recovered', () => {
    assert.equal(recoveryNote({ kind: 'untouched' }), undefined)
  })
})

describe('guard effect', () => {
  it('returns an effect body that registers one listener', () => {
    // ctx.on returns the effect's disposer; the guard hands that back so the
    // caller's ctx.effect() owns the listener's lifetime.
    let registered = 0
    const ctx = {
      on: () => { registered += 1; return () => {} },
      logger: { warn() {} },
    }
    const body = guardEffect(ctx as never)
    assert.equal(registered, 0, 'nothing is registered until the effect runs')
    body()
    assert.equal(registered, 1)
  })

  it('writes recovered arguments back and still delegates', async () => {
    let listener: ((exec: unknown, next: () => Promise<unknown>) => Promise<unknown>) | undefined
    const ctx = {
      on: (_event: string, handler: typeof listener) => { listener = handler; return () => {} },
      logger: { warn() {} },
    }
    guardEffect(ctx as never)()
    assert.ok(listener !== undefined)
    const exec = { name: 'read_file', arguments: '{"a":1}{"b":2}' }
    let delegated = false
    await listener(exec, () => { delegated = true; return Promise.resolve({ kind: 'allow' }) })
    assert.deepEqual(exec.arguments, { a: 1 }, 'the first object is dispatched')
    assert.equal(delegated, true, 'other policy listeners still run')
  })

  it('never fails the call when inspection throws', async () => {
    let listener: ((exec: unknown, next: () => Promise<unknown>) => Promise<unknown>) | undefined
    const ctx = {
      on: (_event: string, handler: typeof listener) => { listener = handler; return () => {} },
      logger: { warn() {} },
    }
    guardEffect(ctx as never)()
    assert.ok(listener !== undefined)
    // A getter that throws stands in for any inspection failure.
    const exec = Object.defineProperty({ name: 'read_file' }, 'arguments', {
      get() { throw new Error('boom') },
    })
    const decision = await listener(exec, () => Promise.resolve({ kind: 'allow' }))
    assert.deepEqual(decision, { kind: 'allow' })
  })
})
