/**
 * Unit coverage of the wire layer: index reassignment and SSE framing.
 *
 * @module dsh-opendesign-toolcall-shim/tests/wire
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ToolCallIndexRewriter, rewriteSseBlock, rewriteSsePayload } from '../dist/wire/index.js'
import { normalToolCallEvents, toolCallChunk } from './helpers/wire.ts'

/** Read the index of the first tool call out of a rewritten payload. */
function firstIndex(payload: string): number | undefined {
  const chunk = JSON.parse(payload) as { choices: { delta: { tool_calls: { index: number }[] } }[] }
  return chunk.choices[0]?.delta.tool_calls[0]?.index
}

describe('index rewriter', () => {
  it('reassigns a colliding index and follows the call on later frames', () => {
    const rewriter = new ToolCallIndexRewriter()
    const first = rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{"p":1}' }]), rewriter)
    const second = rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_b', name: 'read_file', arguments: '{"p":2}' }]), rewriter)
    const third = rewriteSsePayload(toolCallChunk([{ index: 1, id: 'call_c', name: 'read_file', arguments: '{"p":3}' }]), rewriter)
    assert.deepEqual([first, second, third].map(firstIndex), [0, 1, 2])
    assert.equal(rewriter.stats.reassignedCalls, 2)
  })

  it('leaves a well-formed response byte-identical', () => {
    const rewriter = new ToolCallIndexRewriter()
    for (const frame of normalToolCallEvents()) {
      assert.equal(rewriteSsePayload(frame, rewriter), frame)
    }
    assert.equal(rewriter.stats.rewrittenFrames, 0)
  })

  it('keeps an id-less continuation on the index it names', () => {
    const rewriter = new ToolCallIndexRewriter()
    rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{"p":' }]), rewriter)
    rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_b', name: 'read_file', arguments: '{"q":' }]), rewriter)
    // The continuation names index 0, which call_a still owns.
    const continuation = toolCallChunk([{ index: 0, arguments: '1}' }])
    assert.equal(rewriteSsePayload(continuation, rewriter), continuation)
  })

  it('leaves non-chunk payloads and [DONE] alone', () => {
    const rewriter = new ToolCallIndexRewriter()
    assert.equal(rewriteSsePayload('[DONE]', rewriter), '[DONE]')
    assert.equal(rewriteSsePayload('not json', rewriter), 'not json')
  })
})

describe('sse framing', () => {
  it('rewrites one data line inside a block', () => {
    const rewriter = new ToolCallIndexRewriter()
    rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{}' }]), rewriter)
    const block = `data: ${toolCallChunk([{ index: 0, id: 'call_b', name: 'read_file', arguments: '{}' }])}`
    assert.equal(firstIndex(rewriteSseBlock(block, rewriter).slice('data: '.length)), 1)
  })

  it('leaves a block with several data lines alone', () => {
    const rewriter = new ToolCallIndexRewriter()
    rewriteSsePayload(toolCallChunk([{ index: 0, id: 'call_a', name: 'read_file', arguments: '{}' }]), rewriter)
    const frame = toolCallChunk([{ index: 0, id: 'call_b', name: 'read_file', arguments: '{}' }])
    const block = `data: ${frame}\ndata: ${frame}`
    assert.equal(rewriteSseBlock(block, rewriter), block)
  })
})
