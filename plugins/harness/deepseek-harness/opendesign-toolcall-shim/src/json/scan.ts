/**
 * A single-pass cursor over a JSON-ish string.
 *
 * Every structural question the shim asks about argument text — where one
 * value ends and the next begins, which containers are still open, whether the
 * text stops inside a string — is answered by walking the same way: track
 * string state so a `}` inside a string literal is not structural, and track
 * container depth so nesting is not mistaken for a boundary. Writing that walk
 * once keeps the four callers from drifting apart on escape handling, which is
 * exactly the detail a hand-rolled second copy gets wrong.
 *
 * The cursor is deliberately not a parser: it reports structure, never values.
 *
 * @module dsh-opendesign-toolcall-shim/json/scan
 */

/** What one character of the input did to the cursor's state. */
export type CharClass =
  /** Inside a string literal, and not the character that ends it. */
  | 'string-body'
  /** The `"` that opens a string. */
  | 'string-open'
  /** The `"` that closes a string. */
  | 'string-close'
  /** A backslash inside a string, escaping the next character. */
  | 'escape'
  /** An opening `{` or `[`. */
  | 'container-open'
  /** A closing `}` or `]`. */
  | 'container-close'
  /** Any other character outside a string. */
  | 'plain'

/** One step of a walk: the character, where it is, and what it did. */
export interface JsonStep {
  /** The character itself. */
  readonly char: string
  /** Its offset in the walked text. */
  readonly index: number
  /** The structural role it played. */
  readonly role: CharClass
  /** Nesting depth *before* this character was consumed. */
  readonly depthBefore: number
  /** Whether the walk was inside a string *before* this character. */
  readonly inStringBefore: boolean
}

/**
 * Walk a JSON-ish string, reporting each character's structural role.
 *
 * This is the only place escape handling lives. A caller that needs a
 * different accumulation (offsets, a normalized copy, a depth) supplies its own
 * step function and reads the state it is handed.
 * @param text - the text to walk.
 * @param visit - called for every character. Returning `false` stops the walk.
 * @returns the cursor state after the walk.
 */
export function walkJson(text: string, visit: (step: JsonStep) => boolean | void): CursorState {
  const cursor = new CursorState()
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === undefined) break
    const step: JsonStep = {
      char,
      index,
      role: cursor.advance(char),
      depthBefore: cursor.depthBefore,
      inStringBefore: cursor.inStringBefore,
    }
    if (visit(step) === false) break
  }
  return cursor
}

/**
 * The structural state between two characters of a JSON-ish string.
 *
 * Exposed as a small class rather than a bag of locals so every caller shares
 * one definition of "inside a string" and "how deep".
 */
export class CursorState {
  /** Container nesting depth; 0 means top level. */
  depth = 0
  /** Whether the cursor is inside a string literal. */
  inString = false
  /** Whether the previous character was a backslash inside a string. */
  escaped = false
  /** Nesting depth before the most recently consumed character. */
  depthBefore = 0
  /** String state before the most recently consumed character. */
  inStringBefore = false

  /**
   * Consume one character and report its role.
   * @param char - the next character.
   * @returns the role the character played.
   */
  advance(char: string): CharClass {
    this.depthBefore = this.depth
    this.inStringBefore = this.inString
    if (this.inString) {
      if (this.escaped) {
        this.escaped = false
        return 'string-body'
      }
      if (char === '\\') {
        this.escaped = true
        return 'escape'
      }
      if (char === '"') {
        this.inString = false
        return 'string-close'
      }
      return 'string-body'
    }
    if (char === '"') {
      this.inString = true
      return 'string-open'
    }
    if (char === '{' || char === '[') {
      this.depth += 1
      return 'container-open'
    }
    if (char === '}' || char === ']') {
      this.depth -= 1
      return 'container-close'
    }
    return 'plain'
  }
}

/**
 * Whether a character is JSON whitespace.
 * @param char - the character to test.
 * @returns true for space, tab, and the two line breaks.
 */
export function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}
