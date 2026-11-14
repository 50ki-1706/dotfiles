/**
 * The OpenCode plugin API surface this adapter uses.
 *
 * Declared structurally instead of importing `@opencode-ai/plugin`: the adapter
 * is loaded by OpenCode at runtime, which supplies these objects, and a type
 * dependency would have to be vendored into the Nix build for no runtime gain.
 *
 * @module @publish/opencode-adapter/types
 */

/** Context the OpenCode runtime passes to every tool execution. */
export type ToolContext = {
  sessionID: string
  agent: string
  messageID: string
  id: string
  signal: AbortSignal
}

/** The schema shape OpenCode's tool registry accepts. */
export type ToolInputSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

/** One tool as this adapter registers it. */
export type ToolDefinition = {
  name: string
  description: string
  input: ToolInputSchema
  options: { codemode: false; permission: 'read' | 'edit' }
  execute(input: unknown, context: ToolContext): Promise<{ content: string }>
}

/** One command as this adapter registers it. */
export type CommandDefinition = {
  name: string
  description: string
  execute(invocation: CommandInvocation): Promise<void>
}

/** What the runtime passes when a command runs. */
export type CommandInvocation = {
  sessionID: string
  prompt: { text: string; skills?: { id: string }[] }
  delivery: unknown
}

/** A skill as the runtime catalog reports it. */
export type SkillEntry = { id: string; path: string; content: string }

/** A registration the runtime can dispose. */
export type Registration = { dispose(): Promise<void> }

/** An editor the runtime hands a transform callback. */
export type Editor<T> = { add(value: T): void }

/** Permission evaluation event emitted by the runtime before an action runs. */
export type PermissionEvaluation = {
  sessionID: string
  action: string
  resources?: string[]
  effect: string
  message?: string
  agent?: string
  source?: { messageID?: string; id?: string }
}

/** Minimal surface of the OpenCode plugin API used by this plugin. */
export type PluginContext = {
  command: { transform(callback: (editor: Editor<CommandDefinition>) => void): Promise<Registration> }
  tool: {
    transform(callback: (editor: Editor<ToolDefinition>) => void): Promise<Registration>
    reload(): Promise<void>
  }
  session: {
    get(input: { sessionID: string }): Promise<{ location: { directory: string } }>
    prompt(input: Record<string, unknown>): Promise<unknown>
  }
  skill: { list(input: { location: { directory: string } }): Promise<{ data: SkillEntry[] }> }
  permission: {
    assert(input: Record<string, unknown>): Promise<void>
    hook(name: 'evaluate', callback: (event: PermissionEvaluation) => void): void
  }
}
