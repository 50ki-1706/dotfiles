/**
 * Ambient type augmentations the adapter relies on.
 *
 * Several dsh services declare their `Context` members through module
 * augmentation in their own packages, so a typecheck only sees
 * `ctx.workingDirectory`, `ApprovalRequestEvent`, and friends when those
 * packages are imported. This module imports them for their side effects and
 * re-exports nothing.
 *
 * @module dsh-publish/dsh-types
 */
export {};
