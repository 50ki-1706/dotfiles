## JavaScript and TypeScript comments

- Put JSDoc immediately before the declaration: `/** ... */`, with ` * ` before each content line.
  Start with a useful contract summary, then a blank ` *` line before tags. Omit a summary that only
  repeats the name. Use only tags that add information or serve the project's tooling.
- Order tags as `@param` in declaration order, `@returns`, `@throws`, then `@example`.
  Formats: `@param {Type} name - Meaning or constraint`, `@returns {Type} Meaning`, and
  `@throws {ErrorType} Condition`. In TypeScript, omit type braces from `@param` and `@returns`;
  retain types in JavaScript when needed for documentation or type checking.
- Distinguish synchronous exceptions from promise rejections. Do not add empty tags, redundant
  `@returns {void}`, or examples that merely repeat the signature. Test callbacks need no JSDoc;
  use test names and the shared rules for scenario comments.

Example for a function that validates synchronously and returns a promise:

```js
/**
 * Accepts whole milliseconds because the wire protocol cannot represent fractions.
 *
 * @param {number} timeoutMs - Integer between 1 and 30000, inclusive.
 * @returns {Promise<Response>} Resolves on acknowledgement; rejects on transport failure.
 * @throws {RangeError} Synchronously if timeoutMs is outside the accepted range.
 */
```
