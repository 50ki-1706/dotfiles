import * as transaction from "./transaction.js";
import * as workflow from "./workflow.js";
import { objectSchema, textField } from "./input.js";
import { commandPermission, installFastForwardApproval } from "./permissions.js";
import { createAdmission, PublishSessions, SESSION_REPLACED } from "./session.js";
import { verifyRequiredSkills } from "./skills.js";
import { templateSchema } from "./template.js";
import { createPublishTools } from "./tools.js";
const defaultOperations = { ...transaction, ...workflow };
const DEFAULT_COMMAND = { name: 'publish', description: 'Inspect, commit, and publish with git-surgeon' };
/** PR schema for the discovered template: rendered fields or a free body. */
function pullRequestSchema(template) {
    const fingerprint = { type: 'string', const: template.fingerprint };
    return template.path
        ? objectSchema({ title: textField, fingerprint, fields: templateSchema(template) })
        : objectSchema({ title: textField, fingerprint, body: textField });
}
/**
 * Mount the publish plugin on a harness.
 *
 * The command admits a clean binding, verifies the bundled skills, installs the
 * template-specific `publish_pr` schema, then delivers the instructions prompt.
 * Tool calls stay blocked until the prompt is delivered, so the model never acts
 * on a binding whose admission failed.
 */
export async function mountPublish(host, options = {}) {
    const operations = options.operations ?? defaultOperations;
    const loadResources = options.loadResources;
    if (loadResources === undefined) {
        throw new Error('mountPublish requires loadResources: the bundle that ships the instructions and skills supplies them');
    }
    const commandName = options.command ?? DEFAULT_COMMAND;
    const sessions = new PublishSessions();
    const syncApprovals = new Set();
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
    const command = {
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
            // for each one before it reaches the prompt. A skill is read-only input,
            // so it is authorized as a read of the skill's name.
            for (const id of requiredSkills)
                await host.authorize('read', [id]);
            if (!generation.isCurrent())
                throw new Error(SESSION_REPLACED);
            prSchema = pullRequestSchema(template);
            await host.reloadTools();
            if (!generation.isCurrent())
                throw new Error(SESSION_REPLACED);
            const admission = createAdmission();
            const entry = {
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
            }
            catch (error) {
                sessions.release(sessionID, entry);
                admission.reject(error);
                throw error;
            }
        },
    };
    return {
        tools,
        command,
        instructions: async (includePrSkill) => (await loadResources(includePrSkill)).instructions,
        async dispose() {
            sessions.clear();
            syncApprovals.clear();
            unobserve();
        },
    };
}
