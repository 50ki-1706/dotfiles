import type { Permission } from './runner.ts';
import type { SyncApprovals, PublishSessions } from './session.ts';
import type { PublishHost, ToolCall } from './types.ts';
/** Permission bound to the `/publish` command invocation itself. */
export declare const commandPermission: (host: PublishHost) => Permission;
/** Permission bound to one tool call, so its approval is attributable. */
export declare const toolPermission: (host: PublishHost, call: ToolCall) => Permission;
/**
 * Promote the exact pending fast-forward request to `ask`.
 *
 * The harness reports the tool call that raised the approval, so only the call
 * that queued the approval can be promoted.
 */
export declare function installFastForwardApproval(host: PublishHost, sessions: PublishSessions, approvals: SyncApprovals): () => void;
