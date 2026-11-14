import { type PublishSessions, type SyncApprovals } from './session.ts';
import type { Operations, PublishHost, PublishTool } from './types.ts';
export type ToolDependencies = {
    operations: Operations;
    sessions: PublishSessions;
    host: PublishHost;
    syncApprovals: SyncApprovals;
    /** Re-read at registration so a tool reload installs the latest schema. */
    getPrSchema(): Record<string, unknown>;
};
/** Build the publish tools, ready for any harness to register. */
export declare function createPublishTools(dependencies: ToolDependencies): PublishTool[];
