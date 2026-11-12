/**
 * Acceptance cases: the four behaviours the shim exists to provide.
 *
 * Each case drives the real adapter against synthetic SSE, so the whole
 * production path — HTTP, SSE parsing, pi-ai event translation, id-keyed
 * assembly — is exercised. Nothing here reaches the network.
 *
 * @module dsh-opendesign-toolcall-shim/tests/acceptance
 */

import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inspectArguments, recoveryNote } from '../dist/guard/index.js'
import { describeInvalidArguments, parseJsonObject } from '../dist/json/index.js'
import { drive } from './helpers/drive.ts'
import { closeAllServers } from './helpers/server.ts'
import {
  collidingIndexEvents,
  concatenatedArgumentsEvents,
  fragmentedToolCallEvents,
  normalToolCallEvents,
  plainTextEvents,
  truncatedArgumentsEvents,
  unrecoverableArgumentsEvents,
} from './helpers/wire.ts'

after(closeAllServers)

/** The tool-call blocks one driven result produced. */
function toolCallsOf(blocks: ReturnType<typeof collectBlocks>) {
  return blocks.filter(block => block.type === 'tool-call')
}

function collectBlocks(assembler: Awaited<ReturnType<typeof drive>>['assembler']) {
  return assembler.blocks()
}

describe('acceptance', () => {
  it('case 1 — colliding indexes with distinct ids assemble into separate calls', async () => {
    const { chunks, assembler } = await drive(collidingIndexEvents())
    const toolCalls = toolCallsOf(collectBlocks(assembler))
    assert.equal(toolCalls.length, 3, 'three calls, not one merged call')
    assert.deepEqual(
      toolCalls.map(block => block.type === 'tool-call' ? block.id : ''),
      ['call_a', 'call_b', 'call_c'],
    )
    assert.deepEqual(
      toolCalls.map(block => block.type === 'tool-call' ? block.arguments : ''),
      ['{"path":"/tmp/a.txt"}', '{"path":"/tmp/b.txt"}', '{"path":"/tmp/c.txt"}'],
    )
    // The regression this shim exists to prevent: no concatenated arguments.
    for (const block of toolCalls) {
      if (block.type !== 'tool-call') continue
      assert.equal(parseJsonObject(block.arguments) !== undefined, true, `arguments of ${block.id} parse as one object`)
    }
    assert.deepEqual(assembler.finish, { kind: 'tool-calls' })
    assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1)
  })

  it('case 2 — concatenated arguments are split and the turn continues', async () => {
    const { assembler } = await drive(concatenatedArgumentsEvents())
    const [block] = toolCallsOf(collectBlocks(assembler))
    assert.ok(block !== undefined && block.type === 'tool-call')
    // The adapter keeps the raw text; the guard is what recovers it.
    assert.equal(block.arguments, '{"path":"/tmp/a.txt"}{"path":"/tmp/b.txt"}')
    assert.equal(assembler.finish.kind, 'tool-calls', 'the turn is not aborted')
    const outcome = inspectArguments(block.arguments)
    assert.equal(outcome.kind, 'split')
    assert.equal(outcome.kind === 'split' ? outcome.count : 0, 2)
    assert.deepEqual(outcome.kind === 'split' ? outcome.arguments : undefined, { path: '/tmp/a.txt' })
    assert.match(recoveryNote(outcome) ?? '', /concatenated/)
  })

  it('case 3 — truncated arguments never abort the turn', async () => {
    const { assembler } = await drive(truncatedArgumentsEvents())
    const [block] = toolCallsOf(collectBlocks(assembler))
    assert.ok(block !== undefined && block.type === 'tool-call')
    assert.equal(assembler.finish.kind, 'tool-calls', 'no MALFORMED_RESPONSE error finish')
    assert.notEqual(assembler.finish.kind, 'error')
    const outcome = inspectArguments(block.arguments)
    assert.equal(outcome.kind, 'repaired')
    assert.deepEqual(outcome.kind === 'repaired' ? outcome.arguments : undefined, {
      path: '/tmp/x',
      content: 'unfinished',
    })
  })

  it('case 3b — unrecoverable arguments stay raw so the tool reports INVALID_ARGS', async () => {
    const { assembler } = await drive(unrecoverableArgumentsEvents())
    const [block] = toolCallsOf(collectBlocks(assembler))
    assert.ok(block !== undefined && block.type === 'tool-call')
    assert.equal(assembler.finish.kind, 'tool-calls')
    assert.equal(block.arguments, 'not json at all')
    assert.equal(inspectArguments(block.arguments).kind, 'untouched')
    assert.match(describeInvalidArguments(block.arguments), /not a single valid JSON object/)
  })

  it('case 4 — a normal tool call is byte-identical to the stock behaviour', async () => {
    const { chunks, assembler } = await drive(normalToolCallEvents())
    const toolCalls = toolCallsOf(collectBlocks(assembler))
    assert.deepEqual(toolCalls.map(block => block.type === 'tool-call' ? [block.id, block.name, block.arguments] : []), [
      ['call_a', 'read_file', '{"path":"/tmp/a.txt"}'],
      ['call_b', 'read_file', '{"path":"/tmp/b.txt"}'],
    ])
    // usage then finish, exactly one of each, in that order.
    const usageIndex = chunks.findIndex(chunk => chunk.type === 'usage')
    const finishIndex = chunks.findIndex(chunk => chunk.type === 'finish')
    assert.ok(usageIndex >= 0 && finishIndex === usageIndex + 1, 'usage immediately precedes finish')
    assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 1)
    assert.deepEqual(chunks[usageIndex], {
      type: 'usage',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    })
    assert.deepEqual(assembler.finish, { kind: 'tool-calls' })
  })

  it('case 4b — fragmented argument deltas accumulate onto one call', async () => {
    const { assembler } = await drive(fragmentedToolCallEvents())
    const toolCalls = toolCallsOf(collectBlocks(assembler))
    assert.equal(toolCalls.length, 1)
    const [block] = toolCalls
    assert.ok(block !== undefined && block.type === 'tool-call')
    assert.deepEqual(parseJsonObject(block.arguments), { path: '/tmp/x', content: 'hi' })
  })

  it('case 4c — a plain text response is unchanged', async () => {
    const { assembler } = await drive(plainTextEvents())
    assert.deepEqual(assembler.blocks(), [{ type: 'text', text: 'hello' }])
    assert.deepEqual(assembler.finish, { kind: 'stop' })
  })
})
