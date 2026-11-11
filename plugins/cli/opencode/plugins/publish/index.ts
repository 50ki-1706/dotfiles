import * as transaction from './transaction.ts';
import * as workflow from './workflow.ts';
import { objectSchema, textField } from './input.ts';
import { createPermissionProvider, installFastForwardApproval } from './permissions.ts';
import { loadBundledResources, verifyRequiredSkills } from './resources.ts';
import { createAdmission, PublishSessions, SESSION_REPLACED, type SyncApprovals } from './session.ts';
import { templateSchema } from './template.ts';
import { registerPublishTools } from './tools.ts';
import type {
  CommandDefinition,
  Operations,
  PluginContext,
  PluginOptions,
  SessionEntry,
  ToolInputSchema,
} from './types.ts';

const defaultOperations: Operations = { ...transaction, ...workflow };

/** PR schema for the discovered template: rendered fields or a free body. */
function pullRequestSchema(template: SessionEntry['template']): ToolInputSchema {
  const fingerprint = { type: 'string', const: template.fingerprint };
  return template.path
    ? objectSchema({ title: textField, fingerprint, fields: templateSchema(template) })
    : objectSchema({ title: textField, fingerprint, body: textField });
}

/**
 * `/publish` command: admit a clean binding, verify bundled skills, install the
 * template-specific `publish_pr` schema, then deliver the instructions prompt.
 *
 * Tool calls stay blocked until the prompt is delivered, so the model never acts
 * on a binding whose admission failed.
 */
export function createPublishPlugin(options: PluginOptions = {}) {
  return {
    id: 'publish',
    async setup(ctx: PluginContext): Promise<() => Promise<void>> {
      const operations = options.operations ?? defaultOperations;
      const loadResources = options.loadResources ?? loadBundledResources;
      const sessions = new PublishSessions();
      const permissions = createPermissionProvider(ctx);
      const syncApprovals: SyncApprovals = new Set();
      // Replaced on every admission; `tool.reload()` installs the new value.
      let prSchema = objectSchema({ title: textField, fingerprint: textField, body: textField });

      installFastForwardApproval(ctx, sessions, syncApprovals);

      const toolRegistration = await registerPublishTools(ctx, {
        operations,
        sessions,
        permissions,
        syncApprovals,
        getPrSchema: () => prSchema,
      });

      const command: CommandDefinition = {
        name: 'publish',
        description: 'Inspect, commit, and publish with git-surgeon',
        async execute({ sessionID, prompt, delivery }) {
          const generation = sessions.begin(sessionID);
          const permission = permissions.forSession(sessionID);
          const { location } = await ctx.session.get({ sessionID });
          const directory = location.directory;
          const state = await operations.inspectRepository(directory, permission);
          const includePrSkill = state.branch !== 'main';
          const resources = await loadResources(includePrSkill);
          const template = await operations.discoverTemplate(state.root, permission);
          const skills = (await ctx.skill.list({ location: { directory } })).data;
          const requiredSkills = await verifyRequiredSkills(ctx, sessionID, skills, resources, includePrSkill);

          if (!generation.isCurrent()) throw new Error(SESSION_REPLACED);

          prSchema = pullRequestSchema(template);
          await ctx.tool.reload();
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

          // Required skills were verified above; keep other attachments in order.
          const managed = new Set(requiredSkills);
          const attachments = (prompt.skills ?? []).filter((skill) => !managed.has(skill.id));
          try {
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: `${resources.instructions}\n\n${prompt.text}`,
              skills: [...attachments, ...requiredSkills.map((id) => ({ id }))],
              delivery,
            });
            admission.admit();
          } catch (error) {
            sessions.release(sessionID, entry);
            admission.reject(error);
            throw error;
          }
        },
      };
      const commandRegistration = await ctx.command.transform((editor) => editor.add(command));

      return async () => {
        sessions.clear();
        syncApprovals.clear();
        await commandRegistration.dispose();
        await toolRegistration.dispose();
      };
    },
  };
}

export default createPublishPlugin();
