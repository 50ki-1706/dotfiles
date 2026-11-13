/** Executable command a fast-forward request must match exactly. */
const fastForwardCommand = (targetHead) => `git merge --ff-only --no-edit ${targetHead}`;
/** Permission bound to the `/publish` command invocation itself. */
export const commandPermission = (host) => async (action, resources) => {
    await host.authorize(action, resources);
};
/** Permission bound to one tool call, so its approval is attributable. */
export const toolPermission = (host, call) => async (action, resources) => {
    await host.authorize(action, resources, { call });
};
/**
 * Promote the exact pending fast-forward request to `ask`.
 *
 * The harness reports the tool call that raised the approval, so only the call
 * that queued the approval can be promoted.
 */
export function installFastForwardApproval(host, sessions, approvals) {
    return host.observeApproval((request) => {
        const pending = [...approvals].find(({ call }) => call.sessionID === request.sessionID && call.callID === request.callID);
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
