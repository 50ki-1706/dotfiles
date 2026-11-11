import type { Permission } from './runner.ts';
import {
  baseHunkId,
  expectKeys,
  hunkSelectionField,
  objectSchema,
  pathListField,
  requireCommitSelection,
  requireHunkId,
  requirePullRequestTitle,
  requireSynchronizationHeads,
  requireUntrackedPaths,
  textField,
} from './input.ts';
import type { PermissionProvider } from './permissions.ts';
import {
  assertSameBinding,
  SESSION_REPLACED,
  type PublishSessions,
  type SyncApprovals,
} from './session.ts';
import { renderTemplate } from './template.ts';
import type {
  Operations,
  PluginContext,
  Registration,
  SessionEntry,
  ToolContext,
  ToolDefinition,
  ToolInputSchema,
} from './types.ts';
import { PublishError, SyncError } from './workflow.ts';

export type ToolDependencies = {
  operations: Operations;
  sessions: PublishSessions;
  permissions: PermissionProvider;
  syncApprovals: SyncApprovals;
  /** Re-read at registration so `tool.reload()` installs the latest schema. */
  getPrSchema(): ToolInputSchema;
};

const createdCounts = (count: number) => ({ invocationCreatedCount: count, count });

/** Commit verification failure that still carries the recorded commit state. */
type CommitStateError = Error & {
  commitStatus?: string;
  createdSha?: string | null;
  indexInstalled?: boolean;
  mismatches?: string[];
};

function reportCommitFailure(
  sessions: PublishSessions,
  context: ToolContext,
  entry: SessionEntry,
  error: unknown,
  requestedMessage: string,
): never {
  const status = (error as CommitStateError).commitStatus;
  if (!status) throw error;

  // The repository may hold a commit the model has not seen; revoke admission.
  sessions.release(context.sessionID, entry);
  const detail = error instanceof Error ? error.message : String(error);
  const createdSha = (error as CommitStateError).createdSha;
  const createdUnverified = createdSha ? { sha: createdSha, message: null, requestedMessage } : null;
  const commits = createdUnverified ? [...entry.commits, createdUnverified] : entry.commits;
  const { indexInstalled, mismatches } = error as CommitStateError;
  throw new Error(
    `Commit outcome requires /publish rerun: ${JSON.stringify({
      error: detail,
      commitStatus: status,
      indexInstalled,
      mismatches,
      commits,
      ...createdCounts(commits.length),
      createdUnverified,
      residualLastObserved: entry.state.status,
    })}`,
  );
}

function reportSyncFailure(
  sessions: PublishSessions,
  context: ToolContext,
  entry: SessionEntry,
  error: unknown,
  before: SessionEntry['state'],
): never {
  const attempted = error instanceof SyncError ? error.attempted : true;
  // A launched merge may have changed the checkout; require a new `/publish`.
  if (attempted) sessions.release(context.sessionID, entry);
  throw new Error(
    `Synchronization incomplete: ${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      attempted,
      before,
      observed: error instanceof SyncError ? error.observed : null,
      commits: entry.commits,
      ...createdCounts(entry.commits.length),
      reviewRequired: true,
    })}`,
  );
}

function reportPublishFailure(error: unknown, entry: SessionEntry, residual: string[]): never {
  const detail = error instanceof Error ? error.message : String(error);
  const observed = error instanceof PublishError
    ? error.state
    : { phase: 'unknown', push: 'unknown', remoteVerified: false, pr: 'unknown' };
  throw new Error(
    `Publish incomplete: ${JSON.stringify({
      ...observed,
      error: detail,
      commits: entry.commits,
      ...createdCounts(entry.commits.length),
      residualLastObserved: residual,
    })}`,
  );
}

/** Validate PR input against the bound template and render its body. */
function readPullRequestContent(
  entry: SessionEntry,
  mode: 'main' | 'pr',
  input: unknown,
): { title?: string; body?: string } {
  if (mode === 'main') {
    expectKeys(input, []);
    return {};
  }
  const hasTemplate = Boolean(entry.template.path);
  const fields = expectKeys(input, hasTemplate ? ['title', 'fingerprint', 'fields'] : ['title', 'fingerprint', 'body']);
  const title = requirePullRequestTitle(fields.title, entry.template.fingerprint, fields.fingerprint);
  const body = hasTemplate ? renderTemplate(entry.template, fields.fields) : fields.body;
  if (typeof body !== 'string' || !body.trim()) throw new Error('Invalid PR body');
  return { title, body };
}

/**
 * Re-check the binding, template, and clean state immediately before the
 * irreversible push or PR creation that was just approved.
 */
function createPublishRecheck(
  operations: Operations,
  entry: SessionEntry,
  context: ToolContext,
  mode: 'main' | 'pr',
  state: SessionEntry['state'],
  permission: Permission,
): Permission {
  const expectedPush = `git push --no-follow-tags origin HEAD:refs/heads/${state.branch}`;
  return async (action, resources) => {
    await permission(action, resources);
    const command = resources.length === 1 ? resources[0] : '';
    const isPush = command === expectedPush;
    const isCreate = mode === 'pr' && /^gh pr create(?: |$)/.test(command);
    if (action !== 'shell' || (!isPush && !isCreate)) return;
    if (mode === 'pr'
      && (await operations.discoverTemplate(state.root, permission)).fingerprint !== entry.template.fingerprint) {
      throw new Error('Template changed; rerun /publish');
    }
    const current = await operations.inspectRepository(state.root, permission, context.signal);
    assertSameBinding(entry, current);
    if (current.status.length) throw new Error('Repository is not clean; rerun /publish');
  };
}

/** Re-inspect hunks and fail if the snapshot the model reviewed is stale. */
async function requireFreshSnapshot(
  operations: Operations,
  entry: SessionEntry,
  context: ToolContext,
  permission: Permission,
): Promise<void> {
  if (!entry.snapshot) throw new Error('Run publish_inspect before showing or committing hunks');
  const snapshot = await operations.inspectHunks(entry.state.root, permission, entry.untracked, context.signal);
  assertSameBinding(entry, snapshot.state);
  if (JSON.stringify(snapshot) !== JSON.stringify(entry.snapshot)) {
    entry.snapshot = undefined;
    entry.shown.clear();
    throw new Error('Hunk snapshot changed; rerun publish_inspect');
  }
}

/** Register the publish tools on the runtime tool editor. */
export async function registerPublishTools(
  ctx: PluginContext,
  dependencies: ToolDependencies,
): Promise<Registration> {
  const { operations, sessions, permissions, syncApprovals } = dependencies;

  const tool = (
    name: string,
    description: string,
    input: ToolInputSchema,
    permission: 'read' | 'edit',
    execute: (input: unknown, context: ToolContext) => Promise<unknown>,
  ): ToolDefinition => ({
    name,
    description,
    input,
    options: { codemode: false, permission },
    execute: async (input, context) => ({ content: JSON.stringify(await execute(input, context)) }),
  });

  const permissionFor = (context: ToolContext) => permissions.forToolCall(context.sessionID, context);

  /** Run an action holding the repository lock for the bound entry. */
  const underLock = async <T>(
    context: ToolContext,
    entry: SessionEntry,
    action: () => Promise<T>,
  ): Promise<T> => sessions.serialize(entry.state.root, async () => {
    sessions.assertActive(context, entry);
    return action();
  });

  const inspect = async (input: unknown, context: ToolContext) => {
    const { untracked } = expectKeys(input, ['untracked']);
    requireUntrackedPaths(untracked);
    const entry = await sessions.bind(context);
    return underLock(context, entry, async () => {
      const snapshot = await operations.inspectHunks(entry.state.root, permissionFor(context), untracked, context.signal);
      assertSameBinding(entry, snapshot.state);
      entry.untracked = [...untracked];
      entry.state = snapshot.state;
      entry.snapshot = snapshot;
      entry.shown.clear();
      return snapshot;
    });
  };

  const show = async (input: unknown, context: ToolContext) => {
    const { id } = expectKeys(input, ['id']);
    const hunkId = requireHunkId(id);
    const entry = await sessions.bind(context);
    return underLock(context, entry, async () => {
      const permission = permissionFor(context);
      await requireFreshSnapshot(operations, entry, context, permission);
      const hunk = await operations.showHunk(entry.state.root, hunkId, permission, entry.untracked, context.signal);
      await requireFreshSnapshot(operations, entry, context, permission);
      entry.shown.add(hunkId);
      return hunk;
    });
  };

  const commit = async (input: unknown, context: ToolContext) => {
    const { ids, message } = expectKeys(input, ['ids', 'message']);
    const selection = requireCommitSelection(ids, message);
    const entry = await sessions.bind(context);
    return underLock(context, entry, async () => {
      const permission = permissionFor(context);
      await permission('edit', [entry.state.root]);
      await requireFreshSnapshot(operations, entry, context, permission);
      if (selection.ids.some((id) => !entry.shown.has(baseHunkId(id)))) {
        throw new Error('Show every selected hunk before committing');
      }
      try {
        const result = await operations.commitHunks(
          entry.state.root, selection.ids, selection.message, permission, entry.untracked, context.signal,
        );
        const unexpected = result.state.root !== entry.state.root
          || result.state.branch !== entry.state.branch
          || result.state.head !== result.sha;
        if (unexpected) {
          throw Object.assign(new Error(`Commit created (${result.sha}); unexpected commit state`), {
            createdSha: result.sha,
            commitStatus: 'created',
          });
        }
        entry.state = result.state;
        entry.commits.push({ sha: result.sha, message: result.message });
        entry.untracked = entry.untracked.filter((path) => result.state.status.includes(`?? ${path}`));
        entry.snapshot = undefined;
        entry.shown.clear();
        return { ...result, ...createdCounts(entry.commits.length), commits: entry.commits };
      } catch (error) {
        return reportCommitFailure(sessions, context, entry, error, selection.message);
      }
    });
  };

  const sync = async (input: unknown, context: ToolContext) => {
    const fields = expectKeys(input, ['expectedHead', 'targetHead']);
    const heads = requireSynchronizationHeads(fields.expectedHead, fields.targetHead);
    const entry = await sessions.bind(context);
    return underLock(context, entry, async () => {
      if (heads.expectedHead !== entry.state.head) throw new Error('Synchronization HEAD does not match publish binding');
      const permission = permissionFor(context);
      await permission('edit', [entry.state.root]);
      assertSameBinding(entry, await operations.inspectRepository(entry.state.root, permission, context.signal));
      const before = entry.state;
      const pending = { context, entry, targetHead: heads.targetHead };
      syncApprovals.add(pending);
      // A replaced session must not launch, or continue through, the merge.
      const syncPermission: Permission = async (action, resources) => {
        await permission(action, resources);
        if (!sessions.isActive(context.sessionID, entry)) throw new Error(SESSION_REPLACED);
      };
      try {
        const result = await operations.syncMain(
          before.root, { branch: before.branch, head: before.head }, heads.targetHead, syncPermission, context.signal,
        );
        const unexpected = !sessions.isActive(context.sessionID, entry)
          || result.state.root !== before.root
          || result.state.branch !== before.branch
          || result.state.head !== heads.targetHead
          || result.state.status.length > 0;
        if (unexpected) throw new Error('Unexpected synchronization result');
        entry.state = result.state;
        entry.untracked = [];
        entry.snapshot = undefined;
        entry.shown.clear();
        return { ...result, reviewRequired: true, commits: entry.commits, ...createdCounts(entry.commits.length) };
      } catch (error) {
        return reportSyncFailure(sessions, context, entry, error, before);
      } finally {
        syncApprovals.delete(pending);
      }
    });
  };

  const publish = (mode: 'main' | 'pr') => async (input: unknown, context: ToolContext) => {
    const entry = await sessions.bind(context);
    const request = readPullRequestContent(entry, mode, input);
    return underLock(context, entry, async () => {
      const permission = permissionFor(context);
      await permission('edit', [entry.state.root]);
      const state = await operations.inspectRepository(entry.state.root, permission, context.signal);
      assertSameBinding(entry, state);
      if ((mode === 'main') !== (state.branch === 'main')) throw new Error('Branch does not match publish mode');
      if (mode === 'pr'
        && (await operations.discoverTemplate(state.root, permission)).fingerprint !== entry.template.fingerprint) {
        throw new Error('Template changed; rerun /publish');
      }
      const publishPermission = createPublishRecheck(operations, entry, context, mode, state, permission);
      try {
        const result = await operations.publishBranch(
          state.root,
          { branch: state.branch, head: state.head },
          mode,
          mode === 'pr' ? { title: request.title, body: request.body } : {},
          publishPermission,
          undefined,
          context.signal,
          entry.retry,
        );
        return {
          ...result,
          commits: entry.commits,
          ...createdCounts(entry.commits.length),
          residual: state.status,
        };
      } catch (error) {
        return reportPublishFailure(error, entry, state.status);
      }
    });
  };

  return ctx.tool.transform((editor) => {
    editor.add(tool('publish_inspect', 'Inspect staged and final hunks; explicitly opt in safe untracked paths.', objectSchema({ untracked: pathListField }), 'read', inspect));
    editor.add(tool('publish_show', 'Show an inspected hunk.', objectSchema({ id: textField }), 'read', show));
    editor.add(tool('commit_hunks', 'Commit selected hunks with a Conventional Commit message.', objectSchema({ ids: hunkSelectionField, message: textField }), 'edit', commit));
    editor.add(tool('publish_sync_main', 'Fast-forward a clean bound branch to an exact origin/main SHA after human approval; inspect and show again afterwards.', objectSchema({ expectedHead: textField, targetHead: textField }), 'edit', sync));
    editor.add(tool('publish_main', 'Publish a clean main branch.', objectSchema({}), 'edit', publish('main')));
    editor.add(tool('publish_pr', 'Publish a clean branch and create or find a PR. Supply evidence, or explain why it does not apply.', dependencies.getPrSchema(), 'edit', publish('pr')));
  });
}
