/**
 * Unit coverage of the stream layer: id-keyed assembly and terminal mapping.
 *
 * @module dsh-opendesign-toolcall-shim/tests/stream
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { IdKeyedToolCallAssembler, mapStopReason } from '../dist/stream/index.js'
import { piDone, piToolDelta, piToolEnd, piToolStart } from './helpers/pi-events.ts'

describe('id-keyed assembler', () => {
  it('keeps a repeated id as one call and a fresh id as a new one', () => {
    const assembler = new IdKeyedToolCallAssembler()
    // pi-ai resolves each delta to a content index; the partial at that index
    // carries the call's id, which is what the assembler keys on.
    assembler.push(piToolStart(0, 'call_a', 'read_file'))
    assembler.push(piToolDelta(0, '{"path":', 'call_a'))
    assembler.push(piToolStart(1, 'call_b', 'read_file'))
    assembler.push(piToolDelta(1, '{"path":"/b"}', 'call_b'))
    assembler.push(piToolDelta(0, '"/a"}', 'call_a'))
    assembler.push(piToolEnd(0, 'call_a'))
    assembler.push(piToolEnd(1, 'call_b'))
    assembler.push(piDone())
    const result = assembler.result()
    assert.deepEqual(result.toolCalls, [
      { id: 'call_a', name: 'read_file', arguments: '{"path":"/a"}' },
      { id: 'call_b', name: 'read_file', arguments: '{"path":"/b"}' },
    ])
    assert.deepEqual(result.chunks.filter(chunk => chunk.type === 'finish'), [
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('falls back to the stream index only for id-less deltas', () => {
    const assembler = new IdKeyedToolCallAssembler()
    // A provider that never names its calls gives the assembler only the
    // stream index, which is then the only identity available.
    assembler.push(piToolStart(0, '', 'read_file'))
    assembler.push(piToolDelta(0, '{"path":"/a"}'))
    assembler.push(piToolStart(1, '', 'read_file'))
    assembler.push(piToolDelta(1, '{"path":"/b"}'))
    assembler.push(piDone())
    const result = assembler.result()
    assert.equal(result.toolCalls.length, 2)
    assert.deepEqual(result.toolCalls.map(call => call.arguments), ['{"path":"/a"}', '{"path":"/b"}'])
  })

  it('keeps a toolUse finish even when arguments are invalid', () => {
    const assembler = new IdKeyedToolCallAssembler()
    assembler.push(piToolStart(0, 'call_a', 'read_file'))
    assembler.push(piToolDelta(0, '{"path":"unterminated'))
    assembler.push(piToolEnd(0, 'call_a'))
    assembler.push(piDone())
    const result = assembler.result()
    assert.deepEqual(result.chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })
    assert.equal(result.toolCalls[0]?.arguments, '{"path":"unterminated')
  })

  it('synthesizes an id when the provider never named the call', () => {
    const assembler = new IdKeyedToolCallAssembler()
    assembler.push(piToolStart(0, '', 'read_file'))
    assembler.push(piToolDelta(0, '{"a":1}'))
    assembler.push(piDone())
    assert.equal(assembler.result().toolCalls[0]?.id, 'call-0')
  })
})

describe('terminal mapping', () => {
  it('reports an empty completed response as EMPTY_RESPONSE', () => {
    const reason = mapStopReason({
      stopReason: 'stop',
      content: [],
      model: 'deepseek-v4.1-flash',
    } as never)
    assert.equal(reason.kind, 'error')
    assert.equal(reason.kind === 'error' ? reason.failure.code : '', 'EMPTY_RESPONSE')
  })

  it('maps length to max-tokens and aborted to ABORTED', () => {
    assert.deepEqual(
      mapStopReason({ stopReason: 'length', content: [], model: 'm' } as never),
      { kind: 'max-tokens' },
    )
    const aborted = mapStopReason({ stopReason: 'aborted', content: [], model: 'm' } as never)
    assert.equal(aborted.kind === 'aborted' ? aborted.failure.code : '', 'ABORTED')
  })

  it('never produces MALFORMED_RESPONSE', () => {
    for (const stopReason of ['stop', 'length', 'toolUse', 'aborted', 'pending', 'deferred', 'error']) {
      const reason = mapStopReason({ stopReason, content: [{ type: 'text', text: 'x' }], model: 'm' } as never)
      assert.notEqual(reason.kind === 'error' ? reason.failure.code : '', 'MALFORMED_RESPONSE')
    }
  })
})
