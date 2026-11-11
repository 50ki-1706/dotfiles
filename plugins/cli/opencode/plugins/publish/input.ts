import { assertSafePath, validateSelection } from './runner.ts';
import type { ToolInputSchema } from './types.ts';

/** Field schemas reused by the tool definitions. */
export const textField = { type: 'string', minLength: 1 } as const;
export const pathListField = { type: 'array', items: { type: 'string' } } as const;
export const hunkSelectionField = { type: 'array', items: { type: 'string' }, minItems: 1 } as const;

const HUNK_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const SYNCHRONIZATION_HEAD = /^[a-f0-9]{40,64}$/;

/** Build an object schema that accepts exactly the declared properties. */
export function objectSchema(properties: Record<string, unknown>): ToolInputSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Accept a plain object that has exactly the given own keys and nothing else. */
export function expectKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)
    || Reflect.ownKeys(value).length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Invalid input keys');
  }
  return value;
}

/** Opted-in untracked paths must be unique, relative, and free of sensitive segments. */
export function requireUntrackedPaths(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((path) => typeof path !== 'string') || new Set(value).size !== value.length) {
    throw new Error('Invalid untracked paths');
  }
  for (const path of value) assertSafePath(path);
}

export function requireHunkId(value: unknown): string {
  if (typeof value !== 'string' || !HUNK_ID.test(value)) throw new Error('Invalid hunk ID');
  return value;
}

/** Hunk selections may carry a `:` line range; the base ID keys the shown set. */
export function baseHunkId(id: string): string {
  return id.split(':')[0];
}

/** Validate a commit selection and keep its narrowed types. */
export function requireCommitSelection(ids: unknown, message: unknown): { ids: string[]; message: string } {
  validateSelection(ids, message);
  return { ids, message: message as string };
}

export function requireSynchronizationHeads(expectedHead: unknown, targetHead: unknown): { expectedHead: string; targetHead: string } {
  if (![expectedHead, targetHead].every((sha) => typeof sha === 'string' && SYNCHRONIZATION_HEAD.test(sha))) {
    throw new Error('Invalid synchronization HEAD');
  }
  return { expectedHead: expectedHead as string, targetHead: targetHead as string };
}

/** Title and template fingerprint must both still match the bound invocation. */
export function requirePullRequestTitle(title: unknown, fingerprint: string, submitted: unknown): string {
  if (typeof title !== 'string' || !title.trim() || /[\r\n]/.test(title)
    || typeof submitted !== 'string' || submitted !== fingerprint) {
    throw new Error('Invalid title or template fingerprint');
  }
  return title;
}
