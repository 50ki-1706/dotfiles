/**
 * The OpenCode plugin API surface this adapter uses.
 *
 * Declared structurally instead of importing `@opencode-ai/plugin`: the adapter
 * is loaded by OpenCode at runtime, which supplies these objects, and a type
 * dependency would have to be vendored into the Nix build for no runtime gain.
 *
 * @module @publish/opencode-adapter/types
 */
export {};
