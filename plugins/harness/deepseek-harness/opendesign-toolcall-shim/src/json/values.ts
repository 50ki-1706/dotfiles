/**
 * The JSON value shapes the shim treats as tool arguments, plus the two
 * predicates everything else in `json/` is built on.
 *
 * Tool arguments are always a single JSON object. Anything else — an array, a
 * scalar, a concatenation of objects — is not arguments and must be handled by
 * the recovery moves rather than passed through.
 *
 * @module dsh-opendesign-toolcall-shim/json/values
 */

/** A JSON object as produced by a tool call; anything else is not tool arguments. */
export type JsonObject = Record<string, unknown>

/** One complete JSON value recovered from a concatenated argument string. */
export interface SplitJsonValue {
  /** The literal source text of this value, exactly as the model emitted it. */
  readonly text: string
  /** The parsed value. */
  readonly value: JsonObject
}

/** Which repair move produced a value, for diagnostics. */
export type RepairKind =
  | 'escaped-control-characters'
  | 'trailing-garbage'
  | 'closed-open-containers'
  | 'truncated-string'
  | 'truncated-token'

/** Outcome of repairing a truncated or damaged argument string. */
export interface RepairedJson {
  /** The repaired source text that parses successfully. */
  readonly text: string
  /** The parsed value. */
  readonly value: JsonObject
  /** Which repair move produced the value. */
  readonly repair: RepairKind
}

/**
 * Whether a parsed value is a plain JSON object usable as tool arguments.
 * @param value - any parsed JSON value.
 * @returns true for a non-null, non-array object.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse one complete JSON object without any repair.
 * @param text - the candidate argument string.
 * @returns the parsed object, or `undefined` when the text is not exactly one object.
 */
export function parseJsonObject(text: string): JsonObject | undefined {
  if (text.trim().length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  return isJsonObject(parsed) ? parsed : undefined
}
