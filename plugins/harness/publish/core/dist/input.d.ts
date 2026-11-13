/** Field schemas reused by the tool definitions. */
export declare const textField: {
    readonly type: "string";
    readonly minLength: 1;
};
export declare const pathListField: {
    readonly type: "array";
    readonly items: {
        readonly type: "string";
    };
};
export declare const hunkSelectionField: {
    readonly type: "array";
    readonly items: {
        readonly type: "string";
    };
    readonly minItems: 1;
};
/**
 * Build an object schema that accepts exactly the declared properties.
 *
 * The result is a JSON Schema object root, which is what a harness adapter
 * registers as the tool's parameters.
 */
export declare function objectSchema(properties: Record<string, unknown>): Record<string, unknown>;
/**
 * Convert an object schema built by {@link objectSchema} into the per-property
 * map a harness's typed tool API declares.
 *
 * Keywords the harness's schema vocabulary does not share (`minLength`,
 * `minItems`) are dropped here; the core re-validates the same input when the
 * tool runs, so the model-facing schema stays a faithful but narrower contract.
 */
export declare function schemaProperties(schema: Record<string, unknown>): Record<string, unknown>;
/** Accept a plain object that has exactly the given own keys and nothing else. */
export declare function expectKeys(value: unknown, keys: readonly string[]): Record<string, unknown>;
/** Opted-in untracked paths must be unique, relative, and free of sensitive segments. */
export declare function requireUntrackedPaths(value: unknown): asserts value is string[];
export declare function requireHunkId(value: unknown): string;
/** Hunk selections may carry a `:` line range; the base ID keys the shown set. */
export declare function baseHunkId(id: string): string;
/** Validate a commit selection and keep its narrowed types. */
export declare function requireCommitSelection(ids: unknown, message: unknown): {
    ids: string[];
    message: string;
};
export declare function requireSynchronizationHeads(expectedHead: unknown, targetHead: unknown): {
    expectedHead: string;
    targetHead: string;
};
/** Title and template fingerprint must both still match the bound invocation. */
export declare function requirePullRequestTitle(title: unknown, fingerprint: string, submitted: unknown): string;
