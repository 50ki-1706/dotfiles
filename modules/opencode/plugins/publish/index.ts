import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as transaction from './transaction.ts';
import * as workflow from './workflow.ts';
import { assertSafePath, run, validateSelection, type Permission } from './runner.ts';
import { renderTemplate, templateSchema, type Template } from './template.ts';

type State = { root: string; branch: string; head: string; status: string[] };
type ToolContext = { sessionID: string; agent: string; messageID: string; id: string; signal: AbortSignal };
type Registration = { dispose(): Promise<void> };
type Editor = { add(value: any): void };
type Context = {
  command: { transform(callback: (editor: Editor) => void): Promise<Registration> };
  tool: { transform(callback: (editor: Editor) => void): Promise<Registration>; reload(): Promise<void> };
  session: { get(input: { sessionID: string }): Promise<{ location: { directory: string } }>; prompt(input: any): Promise<unknown> };
  skill: { list(input: { location: { directory: string } }): Promise<{ data: { id: string; path: string; content: string }[] }> };
  permission: { assert(input: any): Promise<void> };
};
type Operations = {
  inspectRepository: typeof transaction.inspectRepository;
  inspectHunks: typeof transaction.inspectHunks;
  showHunk: typeof transaction.showHunk;
  commitHunks: (cwd: string, ids: string[], message: string, permission: Permission, untracked?: string[], signal?: AbortSignal) => Promise<{ sha: string; message: string; state: State }>;
  discoverTemplate: typeof workflow.discoverTemplate;
  publishBranch: typeof workflow.publishBranch;
};
type Resources = { instructions: string; officialSkill: string; trustedSkillPath?: string; prSkill?: string; trustedPrSkillPath?: string };
type Options = { loadResources?: (includePrSkill: boolean) => Promise<Resources>; operations?: Operations };
type Snapshot = { state: State; hunks: string; stagedDiff: string };
type SessionState = { state: State; template: Template; untracked: string[]; commits: { sha: string; message: string }[]; admission: Promise<void>; snapshot?: Snapshot; shown: Set<string> };

const object = (value: unknown, keys: string[]): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('Invalid input keys');
  return value as Record<string, any>;
};
const schema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string', minLength: 1 };
const body = (content: string) => content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();

export function createPublishPlugin(options: Options = {}) {
  return {
    id: 'publish',
    async setup(ctx: Context) {
      const ops: Operations = options.operations ?? { ...transaction, ...workflow } as Operations;
      const sessions = new Map<string, SessionState>();
      const generations = new Map<string, object>();
      const locks = new Map<string, Promise<void>>();
      let currentSchema: Record<string, unknown> = schema({ title: string, fingerprint: string, body: string });
      const locked = async <T>(root: string, action: () => Promise<T>): Promise<T> => {
        const previous = locks.get(root) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>((resolve) => { release = resolve; });
        locks.set(root, next);
        await previous;
        try { return await action(); } finally { release(); if (locks.get(root) === next) locks.delete(root); }
      };
      const permission = (sessionID: string, context?: ToolContext): Permission => async (action, resources) => {
        await ctx.permission.assert({ sessionID, ...(context ? { agent: context.agent, source: { type: 'tool', messageID: context.messageID, id: context.id } } : {}), action, resources });
      };
      const bound = async (context: ToolContext) => {
        const entry = sessions.get(context.sessionID);
        if (!entry) throw new Error('Run /publish first');
        await entry.admission;
        if (sessions.get(context.sessionID) !== entry) throw new Error('Publish session replaced');
        return entry;
      };
      const same = (entry: SessionState, state: State) => {
        if (state.root !== entry.state.root || state.branch !== entry.state.branch || state.head !== entry.state.head) throw new Error('Repository binding changed; rerun /publish');
      };
      const fresh = async (entry: SessionState, context: ToolContext) => {
        if (!entry.snapshot) throw new Error('Run publish_inspect before showing or committing hunks');
        const snapshot = await ops.inspectHunks(entry.state.root, permission(context.sessionID, context), entry.untracked, context.signal);
        same(entry, snapshot.state);
        if (JSON.stringify(snapshot) !== JSON.stringify(entry.snapshot)) {
          entry.snapshot = undefined; entry.shown.clear();
          throw new Error('Hunk snapshot changed; rerun publish_inspect');
        }
      };
      const tool = (name: string, description: string, input: Record<string, unknown>, execute: (input: unknown, context: ToolContext) => Promise<unknown>) => ({ name, description, input, options: { codemode: false, permission: name === 'publish_inspect' || name === 'publish_show' ? 'read' : 'edit' }, execute: async (input: unknown, context: ToolContext) => ({ content: JSON.stringify(await execute(input, context)) }) });
      const toolRegistration = await ctx.tool.transform((editor) => {
        editor.add(tool('publish_inspect', 'Inspect staged and final hunks; explicitly opt in safe untracked paths.', schema({ untracked: { type: 'array', items: string } }), async (input, context) => {
          const { untracked } = object(input, ['untracked']);
          if (!Array.isArray(untracked) || untracked.some((path) => typeof path !== 'string') || new Set(untracked).size !== untracked.length) throw new Error('Invalid untracked paths');
          untracked.forEach(assertSafePath);
          const entry = await bound(context);
          return locked(entry.state.root, async () => {
            if (sessions.get(context.sessionID) !== entry) throw new Error('Publish session replaced');
            const result = await ops.inspectHunks(entry.state.root, permission(context.sessionID, context), untracked, context.signal);
            same(entry, result.state); entry.untracked = [...untracked]; entry.state = result.state; entry.snapshot = result; entry.shown.clear();
            return result;
          });
        }));
        editor.add(tool('publish_show', 'Show an inspected hunk.', schema({ id: string }), async (input, context) => {
          const { id } = object(input, ['id']);
          if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw new Error('Invalid hunk ID');
          const entry = await bound(context);
          return locked(entry.state.root, async () => {
            if (sessions.get(context.sessionID) !== entry) throw new Error('Publish session replaced');
            await fresh(entry, context);
            const result = await ops.showHunk(entry.state.root, id, permission(context.sessionID, context), entry.untracked, context.signal);
            await fresh(entry, context);
            entry.shown.add(id);
            return result;
          });
        }));
        editor.add(tool('commit_hunks', 'Commit selected hunks with a Conventional Commit message.', schema({ ids: { type: 'array', items: string, minItems: 1 }, message: string }), async (input, context) => {
          const { ids, message } = object(input, ['ids', 'message']); validateSelection(ids, message);
          const entry = await bound(context);
          return locked(entry.state.root, async () => {
            if (sessions.get(context.sessionID) !== entry) throw new Error('Publish session replaced');
            await permission(context.sessionID, context)('edit', [entry.state.root]);
            await fresh(entry, context);
            if (ids.some((id) => !entry.shown.has(id.split(':')[0]))) throw new Error('Show every selected hunk before committing');
            const p = permission(context.sessionID, context);
            try {
              const result = await ops.commitHunks(entry.state.root, ids, message, p, entry.untracked, context.signal);
              if (result.state.root !== entry.state.root || result.state.branch !== entry.state.branch || result.state.head !== result.sha) throw new Error(`Commit created (${result.sha}); unexpected commit state`);
              entry.state = result.state; entry.commits.push({ sha: result.sha, message: result.message });
              entry.snapshot = undefined; entry.shown.clear();
              return { ...result, count: entry.commits.length, commits: entry.commits };
            } catch (error) {
              if (sessions.get(context.sessionID) === entry) sessions.delete(context.sessionID);
              const detail = error instanceof Error ? error.message : String(error);
              const sha = detail.match(/Commit created \(([a-f0-9]{40,64})\)/)?.[1];
              const createdUnverified = sha ? { sha, message: null, requestedMessage: message } : null;
              const commits = createdUnverified ? [...entry.commits, createdUnverified] : entry.commits;
              throw new Error(`Commit outcome requires /publish rerun: ${JSON.stringify({ error: detail, commits, count: commits.length, createdUnverified, residualLastObserved: entry.state.status })}`);
            }
          });
        }));
        const publish = (mode: 'main' | 'pr') => async (input: unknown, context: ToolContext) => {
          const entry = await bound(context);
          const fields = object(input, mode === 'main' ? [] : entry.template.path ? ['title', 'fingerprint', 'fields'] : ['title', 'fingerprint', 'body']);
          if (mode === 'pr' && (typeof fields.title !== 'string' || !fields.title.trim() || /[\r\n]/.test(fields.title) || typeof fields.fingerprint !== 'string' || fields.fingerprint !== entry.template.fingerprint)) throw new Error('Invalid title or template fingerprint');
          const text = mode === 'pr' ? entry.template.path ? renderTemplate(entry.template, fields.fields) : fields.body : undefined;
          if (mode === 'pr' && (typeof text !== 'string' || !text.trim())) throw new Error('Invalid PR body');
          return locked(entry.state.root, async () => {
            if (sessions.get(context.sessionID) !== entry) throw new Error('Publish session replaced');
            const p = permission(context.sessionID, context); await p('edit', [entry.state.root]);
            const state = await ops.inspectRepository(entry.state.root, p, context.signal); same(entry, state);
            if ((mode === 'main') !== (state.branch === 'main')) throw new Error('Branch does not match publish mode');
            if (mode === 'pr' && (await ops.discoverTemplate(state.root, p)).fingerprint !== entry.template.fingerprint) throw new Error('Template changed; rerun /publish');
            const publishPermission: Permission = async (action, resources) => {
              await p(action, resources);
              const command = resources.length === 1 ? resources[0] : '';
              const isPush = command === `git push --no-follow-tags origin HEAD:refs/heads/${state.branch}`;
              const isCreate = mode === 'pr' && /^gh pr create(?: |$)/.test(command);
              if (action !== 'shell' || (!isPush && !isCreate)) return;
              if (mode === 'pr' && (await ops.discoverTemplate(state.root, p)).fingerprint !== entry.template.fingerprint) throw new Error('Template changed; rerun /publish');
              const current = await ops.inspectRepository(state.root, p, context.signal);
              same(entry, current);
              if (current.status.length) throw new Error('Repository is not clean; rerun /publish');
            };
            try {
              const result = await ops.publishBranch(state.root, { branch: state.branch, head: state.head }, mode, mode === 'pr' ? { title: fields.title, body: text } : {}, publishPermission, run, context.signal);
              return { ...result, commits: entry.commits, count: entry.commits.length, residual: state.status };
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              throw new Error(`Publish incomplete: ${JSON.stringify({ error: detail, commits: entry.commits, count: entry.commits.length, residualLastObserved: state.status, push: 'unknown; see error' })}`);
            }
          });
        };
        editor.add(tool('publish_main', 'Publish a clean main branch.', schema({}), publish('main')));
        editor.add(tool('publish_pr', 'Publish a clean branch and create or find a PR. Supply evidence, or explain why it does not apply.', currentSchema, publish('pr')));
      });
      const commandRegistration = await ctx.command.transform((editor) => editor.add({ name: 'publish', description: 'Inspect, commit, and publish with git-surgeon', async execute({ sessionID, prompt, delivery }: { sessionID: string; prompt: { text: string; skills?: { id: string }[] }; delivery: unknown }) {
        sessions.delete(sessionID);
        const generation = {}; generations.set(sessionID, generation);
        const session = await ctx.session.get({ sessionID }); const directory = session.location.directory; const p = permission(sessionID);
        const state = await ops.inspectRepository(directory, p);
        const includePrSkill = state.branch !== 'main';
        const resources: Resources = await (options.loadResources?.(includePrSkill) ?? Promise.all([readFile(new URL('./instructions.md', import.meta.url), 'utf8'), readFile(new URL('./official-skill.md', import.meta.url), 'utf8'), includePrSkill ? readFile(new URL('./pr-skill.md', import.meta.url), 'utf8') : Promise.resolve(undefined)]).then(([instructions, officialSkill, prSkill]) => ({ instructions, officialSkill, prSkill })));
        const template = await ops.discoverTemplate(state.root, p);
        const skills = (await ctx.skill.list({ location: { directory } })).data;
        const required = [{ id: 'git-surgeon', content: resources.officialSkill, trusted: resources.trustedSkillPath }, ...(includePrSkill ? [{ id: 'pr', content: resources.prSkill, trusted: resources.trustedPrSkillPath }] : [])];
        for (const skill of required) {
          const matches = skills.filter((entry) => entry.id === skill.id);
          const trusted = skill.trusted ?? join(homedir(), '.config/opencode/skills', skill.id, 'SKILL.md');
          if (matches.length !== 1 || !skill.content || !body(skill.content) || resolve(matches[0].path) !== resolve(trusted) || matches[0].content.trim() !== body(skill.content)) throw new Error(`Missing or untrusted ${skill.id} skill`);
          await ctx.permission.assert({ sessionID, action: 'skill', resources: [skill.id] });
        }
        if (generations.get(sessionID) !== generation) throw new Error('Publish session replaced');
        currentSchema = template.path ? schema({ title: string, fingerprint: { type: 'string', const: template.fingerprint }, fields: templateSchema(template) }) : schema({ title: string, fingerprint: { type: 'string', const: template.fingerprint }, body: string });
        await ctx.tool.reload();
        if (generations.get(sessionID) !== generation) throw new Error('Publish session replaced');
        let admit!: () => void; let reject!: (error: unknown) => void;
        const admission = new Promise<void>((resolve, fail) => { admit = resolve; reject = fail; });
        admission.catch(() => {});
        const entry: SessionState = { state, template, untracked: [], commits: [], admission, shown: new Set() }; sessions.set(sessionID, entry);
        try {
          await ctx.session.prompt({ ...prompt, sessionID, text: `${resources.instructions}\n\n${prompt.text}`, skills: [...(prompt.skills ?? []).filter((skill) => !required.some((entry) => entry.id === skill.id)), ...required.map(({ id }) => ({ id }))], delivery });
          admit();
        } catch (error) { if (sessions.get(sessionID) === entry) sessions.delete(sessionID); reject(error); throw error; }
      } }));
      return async () => { sessions.clear(); generations.clear(); await commandRegistration.dispose(); await toolRegistration.dispose(); };
    },
  };
}
export default createPublishPlugin();
