/**
 * Unit coverage of the pure JSON layer.
 *
 * @module dsh-opendesign-toolcall-shim/tests/json
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeInvalidArguments,
  jsonValueBoundaries,
  parseJsonObject,
  repairPartialJson,
  splitConcatenatedJson,
} from '../dist/json/index.js'

describe('json values', () => {
  it('parses exactly one object and nothing else', () => {
    assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 })
    assert.equal(parseJsonObject('[1,2]'), undefined, 'an array is not tool arguments')
    assert.equal(parseJsonObject('"text"'), undefined)
    assert.equal(parseJsonObject('   '), undefined)
    assert.equal(parseJsonObject('{"a":'), undefined)
  })
})

describe('json boundaries', () => {
  it('reports one offset per complete value', () => {
    assert.deepEqual(jsonValueBoundaries('{"a":1}'), [7])
    assert.deepEqual(jsonValueBoundaries('{"a":1}{"b":2}'), [7, 14])
    assert.deepEqual(jsonValueBoundaries('{"a":1} {"b":2}'), [7, 15])
  })

  it('ignores braces inside strings', () => {
    assert.deepEqual(jsonValueBoundaries('{"a":"}x{"}'), [11])
  })

  it('reports nothing for an incomplete value', () => {
    assert.deepEqual(jsonValueBoundaries('{"a":1'), [])
  })

  it('stops at a scalar, because arguments are objects', () => {
    assert.deepEqual(jsonValueBoundaries('{"a":1}5'), [7])
  })
})

describe('json split', () => {
  it('splits on }{ boundaries that are outside strings', () => {
    const split = splitConcatenatedJson('{"a":"x}y"}{"b":"x{y"}')
    assert.deepEqual(split?.map(entry => entry.value), [{ a: 'x}y' }, { b: 'x{y' }])
  })

  it('refuses to split a single object', () => {
    assert.equal(splitConcatenatedJson('{"a":1}'), undefined)
    assert.equal(splitConcatenatedJson('{"a":{"b":1}}'), undefined)
  })

  it('refuses to split when a fragment is not an object', () => {
    assert.equal(splitConcatenatedJson('{"a":1}{"b"'), undefined)
  })

  it('refuses to split when trailing text is not a value', () => {
    assert.equal(splitConcatenatedJson('{"a":1}{"b":2}garbage'), undefined)
  })
})

describe('json repair', () => {
  it('repairs a truncated string and a dangling container', () => {
    assert.deepEqual(repairPartialJson('{"a":"unfinished')?.value, { a: 'unfinished' })
    assert.deepEqual(repairPartialJson('{"a":{"b":1')?.value, { a: { b: 1 } })
    assert.deepEqual(repairPartialJson('{"a":1,')?.value, { a: 1 })
  })

  it('drops an incomplete trailing member', () => {
    assert.deepEqual(repairPartialJson('{"a":1,"b": tru')?.value, { a: 1 })
  })

  it('drops trailing garbage after a complete value', () => {
    assert.deepEqual(repairPartialJson('{"a":1},')?.value, { a: 1 })
  })

  it('escapes a raw control character inside a string', () => {
    assert.deepEqual(repairPartialJson('{"a":"line\nbreak"}')?.value, { a: 'line\nbreak' })
  })

  it('reports which move produced the value', () => {
    assert.equal(repairPartialJson('{"a":"unfinished')?.repair, 'truncated-string')
    assert.equal(repairPartialJson('{"a":1')?.repair, 'closed-open-containers')
    assert.equal(repairPartialJson('{"a":1,"b": tru')?.repair, 'truncated-token')
  })

  it('gives up on text that is not JSON at all', () => {
    assert.equal(repairPartialJson('not json at all'), undefined)
    assert.equal(repairPartialJson('   '), undefined)
  })
})

describe('json diagnostics', () => {
  it('names the failure the model has to correct', () => {
    assert.match(describeInvalidArguments(''), /empty/)
    assert.match(describeInvalidArguments('{"a":1}{"b":2}'), /concatenated/)
    assert.match(describeInvalidArguments('not json'), /not a single valid JSON object/)
  })
})
