/**
 * Model-facing diagnostics for arguments that could not be used.
 *
 * When neither splitting nor repair recovers a call, the tool layer reports
 * `INVALID_ARGS` and the model corrects itself on the next step. The model can
 * only correct what it can understand, so the message names the specific
 * failure instead of a generic parse error.
 *
 * @module dsh-opendesign-toolcall-shim/json/diagnose
 */

import { jsonValueBoundaries } from './split.ts'

/**
 * Describe why a raw argument string could not be used.
 * @param raw - the raw argument string.
 * @returns a short explanation naming the failure.
 */
export function describeInvalidArguments(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'the tool arguments were empty'
  if (trimmed.startsWith('{') && trimmed.endsWith('}') && jsonValueBoundaries(trimmed).length > 1) {
    return 'the tool arguments contained several concatenated JSON objects'
  }
  return 'the tool arguments were not a single valid JSON object'
}
