import type * as transaction from './transaction.ts';
import type * as workflow from './workflow.ts';
import type { Permission } from './runner.ts';
import type { RepositoryState } from './transaction.ts';
/** A commit created during one `/publish` invocation. */
export type Commit = {
    sha: string;
    message: string | null;
    /** Present when the commit exists but its message could not be verified. */
    requestedMessage?: string | undefined;
};
/**
 * One tool invocation as the harness presents it to the plugin.
 *
 * The harness adapter fills this from its own execution context; the publish
 * core never reads harness-specific fields.
 */
export type ToolCall = {
    sessionID: string;
    callID: string;
    /** Cancellation owned by the caller. */
    signal: AbortSignal;
};
/** One registered publish tool, independent of the harness's tool API. */
export type PublishTool = {
    name: string;
    description: string;
    /** JSON Schema for the tool input. */
    input: Record<string, unknown>;
    /** Whether the tool mutates the repository. */
    access: 'read' | 'edit';
    execute(input: unknown, call: ToolCall): Promise<unknown>;
};
/** Repository and workflow operations, injectable for tests. */
export type Operations = {
    inspectRepository: typeof transaction.inspectRepository;
    inspectHunks: typeof transaction.inspectHunks;
    showHunk: typeof transaction.showHunk;
    commitHunks(cwd: string, ids: string[], message: string, permission: Permission, untracked?: string[], signal?: AbortSignal): Promise<{
        sha: string;
        message: string;
        state: RepositoryState;
    }>;
    discoverTemplate: typeof workflow.discoverTemplate;
    publishBranch: typeof workflow.publishBranch;
    syncMain: typeof workflow.syncMain;
};
/** Resources loaded from beside the plugin entry point. */
export type Resources = {
    instructions: string;
    /** The bundled git-surgeon skill; absent when the harness resolves it itself. */
    officialSkill?: string | undefined;
    trustedSkillPath?: string | undefined;
    prSkill?: string | undefined;
    trustedPrSkillPath?: string | undefined;
};
/** A skill as the harness catalog reports it. */
export type SkillEntry = {
    id: string;
    path: string;
    content: string;
};
/** How the harness delivers the command prompt to the model. */
export type PromptDelivery = {
    /** Prompt text, prefixed by the bundled instructions. */
    text: string;
    /** Skill IDs the harness must attach to the prompt. */
    skills: string[];
};
/**
 * The harness surface the publish plugin needs.
 *
 * Each harness adapter implements this once; the plugin, its tools, and its
 * command stay the same across harnesses.
 */
export type PublishHost = {
    /**
     * Ask the user or policy for permission to run an action.
     *
     * `call` is present for a tool invocation so the approval is attributable,
     * and absent for the command itself.
     */
    authorize(action: PermissionAction, resources: string[], options?: {
        call?: ToolCall;
    }): Promise<void>;
    /** Resolve the working directory of one session. */
    directory(sessionID: string): Promise<string>;
    /** List the skills the harness catalog offers in `directory`. */
    skills(directory: string): Promise<SkillEntry[]>;
    /** Deliver the `/publish` instructions and required skills to the session. */
    deliver(sessionID: string, prompt: PromptDelivery): Promise<void>;
    /** Re-read the tool schemas after the template-specific PR schema changes. */
    reloadTools(): Promise<void>;
    /**
     * Observe approvals before they are decided.
     *
     * The listener returns a replacement decision, or `undefined` to leave the
     * harness's own decision unchanged.
     */
    observeApproval(listener: (request: ApprovalRequest) => ApprovalDecision | undefined): () => void;
};
/** Permission actions the publish core can request. */
export type PermissionAction = 'shell' | 'read' | 'edit' | 'external_directory';
/** One approval the harness is about to decide. */
export type ApprovalRequest = {
    sessionID: string;
    action: string;
    resources: string[];
    /** The tool call that raised the request, when the harness knows it. */
    callID?: string;
    /** The current decision, so a listener can leave an explicit denial alone. */
    decision: 'allow' | 'deny' | 'ask';
};
/** A replacement approval decision. */
export type ApprovalDecision = {
    decision: 'allow' | 'deny' | 'ask';
    reason?: string;
};
/** Plugin options, injectable for tests. */
export type PluginOptions = {
    loadResources?: (includePrSkill: boolean) => Promise<Resources>;
    operations?: Operations;
    /** Overrides the bundled command name and description. */
    command?: {
        name: string;
        description: string;
    };
};
