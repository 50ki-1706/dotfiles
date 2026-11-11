import type * as transaction from './transaction.ts';
import type * as workflow from './workflow.ts';
import type { Permission } from './runner.ts';
import type { Template } from './template.ts';
import type { RepositoryState } from './transaction.ts';

/** Context the OpenCode runtime passes to every tool execution. */
export type ToolContext = {
  sessionID: string;
  agent: string;
  messageID: string;
  id: string;
  signal: AbortSignal;
};

/** A commit created during one `/publish` invocation. */
export type Commit = {
  sha: string;
  message: string | null;
  /** Present when the commit exists but its message could not be verified. */
  requestedMessage?: string;
};

/** Inspection result that later show and commit calls are validated against. */
export type RepositorySnapshot = { state: RepositoryState; hunks: string; stagedDiff: string };

/** State bound to one `/publish` command invocation. */
export type SessionEntry = {
  state: RepositoryState;
  template: Template;
  untracked: string[];
  commits: Commit[];
  /** Settles once the command prompt is delivered; rejects on delivery failure. */
  admission: Promise<void>;
  snapshot?: RepositorySnapshot;
  /** Hunk base IDs already shown for the current snapshot. */
  shown: Set<string>;
  retry: workflow.PublishRetry;
};

export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input: ToolInputSchema;
  options: { codemode: false; permission: 'read' | 'edit' };
  execute(input: unknown, context: ToolContext): Promise<{ content: string }>;
};

export type Editor<T> = { add(value: T): void };
export type Registration = { dispose(): Promise<void> };

type CommandInvocation = { sessionID: string; prompt: { text: string; skills?: { id: string }[] }; delivery: unknown };

export type CommandDefinition = {
  name: string;
  description: string;
  execute(invocation: CommandInvocation): Promise<void>;
};

export type SkillEntry = { id: string; path: string; content: string };

/** Resources loaded from beside the plugin entry point. */
export type Resources = {
  instructions: string;
  officialSkill: string;
  trustedSkillPath?: string;
  prSkill?: string;
  trustedPrSkillPath?: string;
};

/** Repository and workflow operations, injectable for tests. */
export type Operations = {
  inspectRepository: typeof transaction.inspectRepository;
  inspectHunks: typeof transaction.inspectHunks;
  showHunk: typeof transaction.showHunk;
  commitHunks(
    cwd: string,
    ids: string[],
    message: string,
    permission: Permission,
    untracked?: string[],
    signal?: AbortSignal,
  ): Promise<{ sha: string; message: string; state: RepositoryState }>;
  discoverTemplate: typeof workflow.discoverTemplate;
  publishBranch: typeof workflow.publishBranch;
  syncMain: typeof workflow.syncMain;
};

export type PluginOptions = {
  loadResources?: (includePrSkill: boolean) => Promise<Resources>;
  operations?: Operations;
};

/** Minimal surface of the OpenCode plugin API used by this plugin. */
export type PluginContext = {
  command: { transform(callback: (editor: Editor<CommandDefinition>) => void): Promise<Registration> };
  tool: {
    transform(callback: (editor: Editor<ToolDefinition>) => void): Promise<Registration>;
    reload(): Promise<void>;
  };
  session: {
    get(input: { sessionID: string }): Promise<{ location: { directory: string } }>;
    prompt(input: Record<string, unknown>): Promise<unknown>;
  };
  skill: { list(input: { location: { directory: string } }): Promise<{ data: SkillEntry[] }> };
  permission: {
    assert(input: Record<string, unknown>): Promise<void>;
    hook(name: 'evaluate', callback: (event: PermissionEvaluation) => void): void;
  };
};

/** Permission evaluation event emitted by the runtime before an action runs. */
export type PermissionEvaluation = {
  sessionID: string;
  action: string;
  resources?: string[];
  effect: string;
  message?: string;
  agent?: string;
  source?: { messageID?: string; id?: string };
};
