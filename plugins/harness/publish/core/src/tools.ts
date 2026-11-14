import type { Permission } from './runner.ts';
import { renderTemplate } from './template.ts';
import { PublishError, SyncError } from './workflow.ts';
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
import { toolPermission } from './permissions.ts';
import {
  assertSameBinding,
  SESSION_REPLACED,
  type PublishSessions,
  type SessionEntry,
  type SyncApprovals,
} from './session.ts';
import type { Operations, PublishHost, PublishTool, ToolCall } from './types.ts';

export type ToolDependencies = {
  operations: Operations;
  sessions: PublishSessions;
  host: PublishHost;
  syncApprovals: SyncApprovals;
  /** Re-read at registration so a tool reload installs the latest schema. */
  getPrSchema(): Record<string, unknown>;
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
  call: ToolCall,
  entry: SessionEntry,
  error: unknown,
  requestedMessage: string,
): never {
  const status = (error as CommitStateError).commitStatus;
  if (!status) throw error;

  // The repository may hold a commit the model has not seen; revoke admission.
  sessions.release(call.sessionID, entry);
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
  call: ToolCall,
  entry: SessionEntry,
  error: unknown,
  before: SessionEntry['state'],
): never {
  const attempted = error instanceof SyncError ? error.attempted : true;
  // A launched merge may have changed the checkout; require a new `/publish`.
  if (attempted) sessions.release(call.sessionID, entry);
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
  call: ToolCall,
  mode: 'main' | 'pr',
  state: SessionEntry['state'],
  permission: Permission,
): Permission {
  const expectedPush = `git push --no-follow-tags origin HEAD:refs/heads/${state.branch}`;
  return async (action, resources) => {
    await permission(action, resources);
    const command = resources.length === 1 ? resources[0] ?? '' : '';
    const isPush = command === expectedPush;
    const isCreate = mode === 'pr' && /^gh pr create(?: |$)/.test(command);
    if (action !== 'shell' || (!isPush && !isCreate)) return;
    if (mode === 'pr'
      && (await operations.discoverTemplate(state.root, permission)).fingerprint !== entry.template.fingerprint) {
      throw new Error('Template changed; rerun /publish');
    }
    const current = await operations.inspectRepository(state.root, permission, call.signal);
    assertSameBinding(entry, current);
    if (current.status.length) throw new Error('Repository is not clean; rerun /publish');
  };
}

/** Re-inspect hunks and fail if the snapshot the model reviewed is stale. */
async function requireFreshSnapshot(
  operations: Operations,
  entry: SessionEntry,
  call: ToolCall,
  permission: Permission,
): Promise<void> {
  if (!entry.snapshot) throw new Error('Run publish_inspect before showing or committing hunks');
  const snapshot = await operations.inspectHunks(entry.state.root, permission, entry.untracked, call.signal);
  assertSameBinding(entry, snapshot.state);
  if (JSON.stringify(snapshot) !== JSON.stringify(entry.snapshot)) {
    entry.snapshot = undefined;
    entry.shown.clear();
    throw new Error('Hunk snapshot changed; rerun publish_inspect');
  }
}

/** Build the publish tools, ready for any harness to register. */
export function createPublishTools(dependencies: ToolDependencies): PublishTool[] {
  const { operations, sessions, host, syncApprovals } = dependencies;

  const permissionFor = (call: ToolCall) => toolPermission(host, call);

  /** Run an action holding the repository lock for the bound entry. */
  const underLock = async <T>(
    call: ToolCall,
    entry: SessionEntry,
    action: () => Promise<T>,
  ): Promise<T> => sessions.serialize(entry.state.root, async () => {
    sessions.assertActive(call, entry);
    return action();
  });

  const inspect = async (input: unknown, call: ToolCall) => {
    const { untracked } = expectKeys(input, ['untracked']);
    requireUntrackedPaths(untracked);
    const entry = await sessions.bind(call);
    return underLock(call, entry, async () => {
      const snapshot = await operations.inspectHunks(entry.state.root, permissionFor(call), untracked, call.signal);
      assertSameBinding(entry, snapshot.state);
      entry.untracked = [...untracked];
      entry.state = snapshot.state;
      entry.snapshot = snapshot;
      entry.shown.clear();
      return snapshot;
    });
  };

  const show = async (input: unknown, call: ToolCall) => {
    const { id } = expectKeys(input, ['id']);
    const hunkId = requireHunkId(id);
    const entry = await sessions.bind(call);
    return underLock(call, entry, async () => {
      const permission = permissionFor(call);
      await requireFreshSnapshot(operations, entry, call, permission);
      const hunk = await operations.showHunk(entry.state.root, hunkId, permission, entry.untracked, call.signal);
      await requireFreshSnapshot(operations, entry, call, permission);
      entry.shown.add(hunkId);
      return hunk;
    });
  };

  const commit = async (input: unknown, call: ToolCall) => {
    const { ids, message } = expectKeys(input, ['ids', 'message']);
    const selection = requireCommitSelection(ids, message);
    const entry = await sessions.bind(call);
    return underLock(call, entry, async () => {
      const permission = permissionFor(call);
      await permission('edit', [entry.state.root]);
      await requireFreshSnapshot(operations, entry, call, permission);
      if (selection.ids.some((id) => !entry.shown.has(baseHunkId(id)))) {
        throw new Error('Show every selected hunk before committing');
      }
      try {
        const result = await operations.commitHunks(
          entry.state.root, selection.ids, selection.message, permission, entry.untracked, call.signal,
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
        return reportCommitFailure(sessions, call, entry, error, selection.message);
      }
    });
  };

  const sync = async (input: unknown, call: ToolCall) => {
    const fields = expectKeys(input, ['expectedHead', 'targetHead']);
    const heads = requireSynchronizationHeads(fields.expectedHead, fields.targetHead);
    const entry = await sessions.bind(call);
    return underLock(call, entry, async () => {
      if (heads.expectedHead !== entry.state.head) throw new Error('Synchronization HEAD does not match publish binding');
      const permission = permissionFor(call);
      await permission('edit', [entry.state.root]);
      assertSameBinding(entry, await operations.inspectRepository(entry.state.root, permission, call.signal));
      const before = entry.state;
      const pending = { call, entry, targetHead: heads.targetHead };
      syncApprovals.add(pending);
      // A replaced session must not launch, or continue through, the merge.
      const syncPermission: Permission = async (action, resources) => {
        await permission(action, resources);
        if (!sessions.isActive(call.sessionID, entry)) throw new Error(SESSION_REPLACED);
      };
      try {
        const result = await operations.syncMain(
          before.root, { branch: before.branch, head: before.head }, heads.targetHead, syncPermission, call.signal,
        );
        const unexpected = !sessions.isActive(call.sessionID, entry)
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
        return reportSyncFailure(sessions, call, entry, error, before);
      } finally {
        syncApprovals.delete(pending);
      }
    });
  };

  const publish = (mode: 'main' | 'pr') => async (input: unknown, call: ToolCall) => {
    const entry = await sessions.bind(call);
    const request = readPullRequestContent(entry, mode, input);
    return underLock(call, entry, async () => {
      const permission = permissionFor(call);
      await permission('edit', [entry.state.root]);
      const state = await operations.inspectRepository(entry.state.root, permission, call.signal);
      assertSameBinding(entry, state);
      if ((mode === 'main') !== (state.branch === 'main')) throw new Error('Branch does not match publish mode');
      if (mode === 'pr'
        && (await operations.discoverTemplate(state.root, permission)).fingerprint !== entry.template.fingerprint) {
        throw new Error('Template changed; rerun /publish');
      }
      const publishPermission = createPublishRecheck(operations, entry, call, mode, state, permission);
      try {
        const result = await operations.publishBranch(
          state.root,
          { branch: state.branch, head: state.head },
          mode,
          mode === 'pr' ? { title: request.title, body: request.body } : {},
          publishPermission,
          undefined,
          call.signal,
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

  return [
    {
      name: 'publish_inspect',
      description: 'Inspect staged and final hunks; explicitly opt in safe untracked paths.',
      input: objectSchema({ untracked: pathListField }),
      access: 'read',
      execute: inspect,
    },
    {
      name: 'publish_show',
      description: 'Show an inspected hunk.',
      input: objectSchema({ id: textField }),
      access: 'read',
      execute: show,
    },
    {
      name: 'commit_hunks',
      description: 'Commit selected hunks with a Conventional Commit message.',
      input: objectSchema({ ids: hunkSelectionField, message: textField }),
      access: 'edit',
      execute: commit,
    },
    {
      name: 'publish_sync_main',
      description: 'Fast-forward a clean bound branch to an exact origin/main SHA after human approval; inspect and show again afterwards.',
      input: objectSchema({ expectedHead: textField, targetHead: textField }),
      access: 'edit',
      execute: sync,
    },
    {
      name: 'publish_main',
      description: 'Publish a clean main branch.',
      input: objectSchema({}),
      access: 'edit',
      execute: publish('main'),
    },
    {
      name: 'publish_pr',
      description: 'Publish a clean branch and create or find a PR. Supply evidence, or explain why it does not apply.',
      get input() {
        return dependencies.getPrSchema();
      },
      access: 'edit',
      execute: publish('pr'),
    },
  ];
}
