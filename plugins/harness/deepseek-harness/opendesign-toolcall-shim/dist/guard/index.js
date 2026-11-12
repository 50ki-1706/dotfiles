/**
 * Pre-dispatch advisory guard for tool arguments that arrived damaged.
 *
 * The guard is the second of the shim's two recovery points: the adapter keeps
 * a damaged call alive, and this decides whether its arguments can be recovered
 * before the tool body sees them.
 *
 * - `inspect.ts` decides what to do with one call's arguments.
 * - `effect.ts` registers that decision on the `tools/pre-execute` waterfall.
 *
 * @module dsh-opendesign-toolcall-shim/guard
 */
export { describeRecovery, guardEffect } from './effect.js';
export { inspectArguments, recoveryNote } from './inspect.js';
