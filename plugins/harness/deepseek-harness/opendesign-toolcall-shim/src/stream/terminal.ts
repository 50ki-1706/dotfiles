/**
 * Mapping pi-ai's terminal facts onto the harness stream protocol.
 *
 * Two mappings live here, and both are places where the shim deliberately
 * differs from the stock translator:
 *
 * - {@link mapUsage} is a straight conversion.
 * - {@link mapStopReason} never turns a completed tool call with invalid
 *   arguments into an error. The stock path throws `MALFORMED_RESPONSE`, which
 *   is not a default-retryable code, so the turn dies
 *   (deepseek-ai/deepseek-harness#7581). Here the call is kept, its raw text
 *   reaches the tool layer, and the tool reports `INVALID_ARGS` — the same
 *   tolerant policy the agent loop's `parseArguments()` uses.
 *
 * @module dsh-opendesign-toolcall-shim/stream/terminal
 */

import type { FinishReason, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, Usage as PiUsage } from '@earendil-works/pi-ai'

/**
 * Map pi-ai usage to harness counts. pi-ai folds reasoning into `output` and
 * reports cache zeros rather than absence.
 * @param usage - cumulative usage from the terminal pi-ai event.
 * @returns harness counts with pi-ai's exact total.
 */
export function mapUsage(usage: PiUsage): TokenUsage {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
    ...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
    ...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {},
  }
}

/**
 * Map a terminal pi-ai message to a harness finish reason.
 *
 * Unlike the stock translator this never turns a completed tool call with
 * invalid arguments into an error: the call is kept and its raw text reaches
 * the tool layer.
 * @param message - the terminal assistant message.
 * @returns the harness finish reason.
 */
export function mapStopReason(message: AssistantMessage): FinishReason {
  switch (message.stopReason) {
    case 'stop':
      if (message.content.length === 0) {
        return {
          kind: 'error',
          failure: {
            message: `model "${message.model}" returned a completed response with no content`,
            code: 'EMPTY_RESPONSE',
          },
        }
      }
      return { kind: 'stop' }
    case 'length':
      return { kind: 'max-tokens' }
    case 'toolUse':
      return { kind: 'tool-calls' }
    case 'aborted':
      return {
        kind: 'aborted',
        failure: { message: message.errorMessage ?? 'pi-ai stream aborted', code: 'ABORTED' },
      }
    default:
      return {
        kind: 'error',
        failure: {
          message: message.errorMessage ?? `pi-ai stream for model "${message.model}" ended ${String(message.stopReason)}`,
          code: 'PI_AI_ERROR',
        },
      }
  }
}
