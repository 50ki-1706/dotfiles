import * as transaction from './core/transaction.ts';
import * as workflow from './core/workflow.ts';
import { objectSchema, textField } from './input.ts';
import { commandPermission, installFastForwardApproval } from './permissions.ts';
import { loadBundledResources } from './resources.ts';
import { createAdmission, PublishSessions, SESSION_REPLACED, type SessionEntry, type SyncApprovals } from './session.ts';
import { verifyRequiredSkills } from './skills.ts';
import { templateSchema } from './core/template.ts';
import { createPublishTools } from './tools.ts';
import type { Operations, PluginOptions, PublishHost, PublishTool } from './types.ts';

const defaultOperations: Operations = { ...transaction, ...workflow };

const DEFAULT_COMMAND = { name: 'publish', description: 'Inspect, commit, and publish with git-surgeon' };

/** PR schema for the discovered template: rendered fields or a free body. */
function pullRequestSchema(template: SessionEntry['template']): Record<string, unknown> {
  const fingerprint = { type: 'string', const: template.fingerprint };
  return template.path
    ? objectSchema({ title: textField, fingerprint, fields: templateSchema(template) })
    : objectSchema({ title: textField, fingerprint, body: textField });
}

/** The `/publish` command as the harness adapter registers it. */
export type PublishCommand = {
  name: string;
  description: string;
  execute(sessionID: string): Promise<void>;
};

/** One mounted publish plugin: its tools, command, and teardown. */
export type PublishPlugin = {
  tools: PublishTool[];
  command: PublishCommand;
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
export async function mountPublish(host: PublishHost, options: PluginOptions = {}): Promise<PublishPlugin> {
  const operations = options.operations ?? defaultOperations;
  const loadResources = options.loadResources ?? loadBundledResources;
  const commandName = options.command ?? DEFAULT_COMMAND;
  const sessions = new PublishSessions();
  const syncApprovals: SyncApprovals = new Set();
  // Replaced on every admission; the harness reloads the tool schemas after it changes.
  let prSchema = objectSchema({ title: textField, fingerprint: textField, body: textField });

  const unobserve = installFastForwardApproval(host, sessions, syncApprovals);

  const tools = createPublishTools({
    operations,
    sessions,
    host,
    syncApprovals,
    getPrSchema: () => prSchema,
  });

  const command: PublishCommand = {
    name: commandName.name,
    description: commandName.description,
    async execute(sessionID) {
      const generation = sessions.begin(sessionID);
      const permission = commandPermission(host);
      const directory = await host.directory(sessionID);
      const state = await operations.inspectRepository(directory, permission);
      const includePrSkill = state.branch !== 'main';
      const resources = await loadResources(includePrSkill);
      const template = await operations.discoverTemplate(state.root, permission);
      const skills = await host.skills(directory);
      const requiredSkills = verifyRequiredSkills(skills, resources, includePrSkill);
      // The harness treats the bundled skills as trusted; record the approval
      // for each one before it reaches the prompt.
      for (const id of requiredSkills) await host.authorize('skill', [id]);

      if (!generation.isCurrent()) throw new Error(SESSION_REPLACED);

      prSchema = pullRequestSchema(template);
      await host.reloadTools();
      if (!generation.isCurrent()) throw new Error(SESSION_REPLACED);

      const admission = createAdmission();
      const entry: SessionEntry = {
        state,
        template,
        untracked: [],
        commits: [],
        admission: admission.promise,
        shown: new Set(),
        retry: {},
      };
      sessions.install(sessionID, entry);

      try {
        await host.deliver(sessionID, {
          text: resources.instructions,
          skills: requiredSkills,
        });
        admission.admit();
      } catch (error) {
        sessions.release(sessionID, entry);
        admission.reject(error);
        throw error;
      }
    },
  };

  return {
    tools,
    command,
    async dispose() {
      sessions.clear();
      syncApprovals.clear();
      unobserve();
    },
  };
}
