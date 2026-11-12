import { assertSafePath, validateSelection } from './core/runner.js';
/** Field schemas reused by the tool definitions. */
export const textField = { type: 'string', minLength: 1 };
export const pathListField = { type: 'array', items: { type: 'string' } };
export const hunkSelectionField = { type: 'array', items: { type: 'string' }, minItems: 1 };
const HUNK_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const SYNCHRONIZATION_HEAD = /^[a-f0-9]{40,64}$/;
/**
 * Build an object schema that accepts exactly the declared properties.
 *
 * The result is a JSON Schema object root, which is what a harness adapter
 * registers as the tool's parameters.
 */
export function objectSchema(properties) {
    return {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
    };
}
/**
 * Convert an object schema built by {@link objectSchema} into the per-property
 * map a harness's typed tool API declares.
 *
 * Keywords the harness's schema vocabulary does not share (`minLength`,
 * `minItems`) are dropped here; the core re-validates the same input when the
 * tool runs, so the model-facing schema stays a faithful but narrower contract.
 */
export function schemaProperties(schema) {
    const properties = (schema.properties ?? {});
    return Object.fromEntries(Object.entries(properties).map(([key, value]) => {
        const entry = value;
        const { minLength: _minLength, minItems: _minItems, ...rest } = entry;
        return [key, Object.hasOwn(schema, 'required') && schema.required.includes(key)
                ? { ...rest, required: true }
                : rest];
    }));
}
const isPlainObject = (value) => typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** Accept a plain object that has exactly the given own keys and nothing else. */
export function expectKeys(value, keys) {
    if (!isPlainObject(value)
        || Reflect.ownKeys(value).length !== keys.length
        || keys.some((key) => !Object.hasOwn(value, key))) {
        throw new Error('Invalid input keys');
    }
    return value;
}
/** Opted-in untracked paths must be unique, relative, and free of sensitive segments. */
export function requireUntrackedPaths(value) {
    if (!Array.isArray(value) || value.some((path) => typeof path !== 'string') || new Set(value).size !== value.length) {
        throw new Error('Invalid untracked paths');
    }
    for (const path of value)
        assertSafePath(path);
}
export function requireHunkId(value) {
    if (typeof value !== 'string' || !HUNK_ID.test(value))
        throw new Error('Invalid hunk ID');
    return value;
}
/** Hunk selections may carry a `:` line range; the base ID keys the shown set. */
export function baseHunkId(id) {
    return id.split(':')[0];
}
/** Validate a commit selection and keep its narrowed types. */
export function requireCommitSelection(ids, message) {
    validateSelection(ids, message);
    return { ids, message: message };
}
export function requireSynchronizationHeads(expectedHead, targetHead) {
    if (![expectedHead, targetHead].every((sha) => typeof sha === 'string' && SYNCHRONIZATION_HEAD.test(sha))) {
        throw new Error('Invalid synchronization HEAD');
    }
    return { expectedHead: expectedHead, targetHead: targetHead };
}
/** Title and template fingerprint must both still match the bound invocation. */
export function requirePullRequestTitle(title, fingerprint, submitted) {
    if (typeof title !== 'string' || !title.trim() || /[\r\n]/.test(title)
        || typeof submitted !== 'string' || submitted !== fingerprint) {
        throw new Error('Invalid title or template fingerprint');
    }
    return title;
}
