import type { Permission } from './core/runner.ts';
import type { SyncApprovals, PublishSessions } from './session.ts';
import type { ApprovalDecision, ApprovalRequest, PublishHost, ToolCall } from './types.ts';

/** Executable command a fast-forward request must match exactly. */
const fastForwardCommand = (targetHead: string) => `git merge --ff-only --no-edit ${targetHead}`;

/** Permission bound to the `/publish` command invocation itself. */
export const commandPermission = (host: PublishHost): Permission => async (action, resources) => {
  await host.authorize(action, resources);
};

/** Permission bound to one tool call, so its approval is attributable. */
export const toolPermission = (host: PublishHost, call: ToolCall): Permission => async (action, resources) => {
  await host.authorize(action, resources, { call });
};

/**
 * Promote the exact pending fast-forward request to `ask`.
 *
 * The harness reports the tool call that raised the approval, so only the call
 * that queued the approval can be promoted.
 */
export function installFastForwardApproval(
  host: PublishHost,
  sessions: PublishSessions,
  approvals: SyncApprovals,
): () => void {
  return host.observeApproval((request: ApprovalRequest): ApprovalDecision | undefined => {
    const pending = [...approvals].find(
      ({ call }) => call.sessionID === request.sessionID && call.callID === request.callID,
    );
    if (!pending
      || request.decision === 'deny'
      || request.action !== 'shell'
      || request.resources.length !== 1
      || request.resources[0] !== fastForwardCommand(pending.targetHead)) {
      return undefined;
    }
    if (!sessions.isActive(request.sessionID, pending.entry)) {
      return { decision: 'deny', reason: 'Publish session replaced' };
    }
    const { state } = pending.entry;
    return {
      decision: 'ask',
      reason: `Fast-forward approval: ${state.root} (${state.branch}) ${state.head} → ${pending.targetHead}`,
    };
  });
}
