import type { Permission } from './runner.ts';
import type { SyncApprovals, PublishSessions } from './session.ts';
import type { PermissionEvaluation, PluginContext, ToolContext } from './types.ts';

/** Executable command a fast-forward request must match exactly. */
const fastForwardCommand = (targetHead: string) => `git merge --ff-only --no-edit ${targetHead}`;

export type PermissionProvider = {
  /** Permission bound to the `/publish` command invocation itself. */
  forSession(sessionID: string): Permission;
  /** Permission bound to one tool call, so its approval is attributable. */
  forToolCall(sessionID: string, context: ToolContext): Permission;
};

export function createPermissionProvider(ctx: PluginContext): PermissionProvider {
  return {
    forSession: (sessionID) => async (action, resources) => {
      await ctx.permission.assert({ sessionID, action, resources });
    },
    forToolCall: (sessionID, context) => async (action, resources) => {
      await ctx.permission.assert({
        sessionID,
        agent: context.agent,
        source: { type: 'tool', messageID: context.messageID, id: context.id },
        action,
        resources,
      });
    },
  };
}

/**
 * Promote the exact pending fast-forward request to `ask`.
 *
 * The runtime stores the command's own message ID and tool call ID on the
 * evaluation event, so only the call that queued the approval can be promoted.
 */
export function installFastForwardApproval(
  ctx: PluginContext,
  sessions: PublishSessions,
  approvals: SyncApprovals,
): void {
  ctx.permission.hook('evaluate', (event: PermissionEvaluation) => {
    const pending = [...approvals].find(
      ({ context }) => context.sessionID === event.sessionID
        && event.source?.messageID === context.messageID
        && event.source?.id === context.id,
    );
    if (!pending
      || event.effect === 'deny'
      || event.action !== 'shell'
      || (event.agent && event.agent !== pending.context.agent)
      || event.resources?.length !== 1
      || event.resources[0] !== fastForwardCommand(pending.targetHead)) {
      return;
    }
    if (!sessions.isActive(event.sessionID, pending.entry)) {
      event.effect = 'deny';
      event.message = 'Publish session replaced';
      return;
    }
    event.effect = 'ask';
    event.message = `Fast-forward approval: ${pending.entry.state.root} (${pending.entry.state.branch}) ${pending.entry.state.head} → ${pending.targetHead}`;
  });
}
