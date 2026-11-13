import type { PluginOptions, PublishHost, PublishTool } from './types.ts';
/** The `/publish` command as the harness adapter registers it. */
export type PublishCommand = {
    name: string;
    description: string;
    execute(sessionID: string): Promise<void>;
};
/** One mounted publish plugin: its tools, command, instructions, and teardown. */
export type PublishPlugin = {
    tools: PublishTool[];
    command: PublishCommand;
    /** The `/publish` instructions, for a harness that surfaces them itself. */
    instructions(includePrSkill: boolean): Promise<string>;
    dispose(): Promise<void>;
};
/**
 * Mount the publish plugin on a harness.
 *
 * The command admits a clean binding, verifies the bundled skills, installs the
 * template-specific `publish_pr` schema, then delivers the instructions prompt.
 * Tool calls stay blocked until the prompt is delivered, so the model never acts
 * on a binding whose admission failed.
 */
export declare function mountPublish(host: PublishHost, options?: PluginOptions): Promise<PublishPlugin>;
