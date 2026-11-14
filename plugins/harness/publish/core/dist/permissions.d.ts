import type { Permission } from './runner.ts';
import type { SyncApprovals, PublishSessions } from './session.ts';
import type { PublishHost, ToolCall } from './types.ts';
/** Executable command a fast-forward request must match exactly. */
export declare const fastForwardCommand: (targetHead: string) => string;
/** Permission bound to the `/publish` command invocation itself. */
export declare const commandPermission: (host: PublishHost) => Permission;
/** Permission bound to one tool call, so its approval is attributable. */
export declare const toolPermission: (host: PublishHost, call: ToolCall) => Permission;
/**
 * Promote the exact pending fast-forward request to `ask`.
 *
 * The harness reports the tool call that raised the approval, so only the call
 * that queued the approval can be promoted. The request must also carry the
 * fast-forward command as its own resource: an adapter that folds the action
 * and resources into a free-form reason cannot match here, which fails closed
 * to the harness's own decision rather than promoting anything.
 */
export declare function installFastForwardApproval(host: PublishHost, sessions: PublishSessions, approvals: SyncApprovals): () => void;
