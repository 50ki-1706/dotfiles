import { constants } from 'node:fs';
import { lstat, mkdtemp, open, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseTemplate } from './template.js';
import { assertSafePath, run } from './runner.js';
import { inspectRepository, readIndexSnapshot, writeIndexSnapshot } from './transaction.js';
/** Directories searched for a pull request template, in precedence order. */
const TEMPLATE_DIRECTORIES = ['', '.github', 'docs'];
/** Accepted template file names, any of which is unambiguous when alone. */
const TEMPLATE_FILE_NAMES = ['PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md'];
/** Directories whose `.md` children are all candidate templates. */
const TEMPLATE_DIRECTORY_NAMES = ['PULL_REQUEST_TEMPLATE', 'pull_request_template'];
/** True when both observations describe the same file system entry. */
const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;
const isMissing = (error) => error.code === 'ENOENT';
/**
 * Collect the template candidates the repository declares.
 *
 * Every directory and file is read through the permission callback and re-stat
 * so a concurrent replacement cannot inject a different template.
 */
class TemplateDiscovery {
    #root;
    #permission;
    /** Stats recorded during discovery, keyed by repository-relative path. */
    #observed = new Map();
    candidates = [];
    constructor(root, permission) {
        this.#root = root;
        this.#permission = permission;
    }
    get observed() {
        return this.#observed;
    }
    /** Stat one repository-relative path after requesting read permission. */
    async #stat(label) {
        const path = join(this.#root, label);
        await this.#permission('read', [path]);
        try {
            const entry = await lstat(path);
            if (entry.isSymbolicLink())
                throw new Error(`Symlink in template discovery: ${label}`);
            this.#observed.set(label, entry);
            return entry;
        }
        catch (error) {
            if (isMissing(error))
                return undefined;
            throw error;
        }
    }
    /** Record every template file inside one of the candidate directories. */
    async #collectDirectory(children, label) {
        for (const child of children) {
            if (!child.toLowerCase().endsWith('.md'))
                continue;
            const path = `${label}/${child}`;
            assertSafePath(path);
            const entry = await this.#stat(path);
            if (!entry?.isFile())
                throw new Error(`Invalid template: ${path}`);
            this.candidates.push(path);
        }
    }
    async scan() {
        await this.#permission('read', [this.#root]);
        for (const directory of TEMPLATE_DIRECTORIES) {
            if (directory) {
                const entry = await this.#stat(directory);
                if (!entry)
                    continue;
                if (!entry.isDirectory())
                    throw new Error(`Invalid template directory: ${directory}`);
            }
            await this.#permission('read', [join(this.#root, directory)]);
            const names = await readdir(join(this.#root, directory));
            const prefix = directory ? `${directory}/` : '';
            for (const name of TEMPLATE_FILE_NAMES) {
                if (!names.includes(name))
                    continue;
                const label = `${prefix}${name}`;
                const entry = await this.#stat(label);
                if (!entry)
                    continue;
                if (!entry.isFile())
                    throw new Error(`Invalid template: ${label}`);
                this.candidates.push(label);
            }
            for (const name of TEMPLATE_DIRECTORY_NAMES) {
                if (!names.includes(name))
                    continue;
                const label = `${prefix}${name}`;
                const entry = await this.#stat(label);
                if (!entry)
                    continue;
                if (!entry.isDirectory())
                    throw new Error(`Invalid template directory: ${label}`);
                await this.#permission('read', [join(this.#root, label)]);
                await this.#collectDirectory(await readdir(join(this.#root, label)), label);
            }
        }
    }
}
/** Record the identity of every canonical parent directory of the template. */
async function canonicalParents(canonicalRoot, label, permission) {
    const parts = label.split('/');
    const parents = [canonicalRoot];
    for (let i = 1; i < parts.length; i++)
        parents.push(join(canonicalRoot, ...parts.slice(0, i)));
    await Promise.all(parents.map((parent) => permission('read', [parent])));
    return parents;
}
/**
 * Re-read the template file while asserting that its parents, inode, and
 * timestamps did not change, then parse the bytes.
 */
async function readVerifiedTemplate(path, source, permission) {
    const { canonicalParents: parents, identities, expected } = source;
    await permission('read', [path]);
    const before = await lstat(path);
    const discovered = expected.get(source.label);
    if (!before.isFile() || before.isSymbolicLink() || !discovered || !sameEntry(discovered, before)) {
        throw new Error('Invalid or replaced template file');
    }
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const check = async () => {
            const current = await lstat(path);
            const opened = await file.stat();
            if (!current.isFile() || current.isSymbolicLink() || !sameEntry(before, current) || !sameEntry(before, opened)
                || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs) {
                throw new Error('Template file changed');
            }
            for (let i = 0; i < parents.length; i++) {
                const currentParent = await lstat(parents[i]);
                if (!currentParent.isDirectory() || currentParent.isSymbolicLink() || !sameEntry(identities[i].info, currentParent)
                    || await realpath(parents[i]) !== identities[i].real) {
                    throw new Error('Template parent changed');
                }
            }
            if (await realpath(dirname(path)) !== identities[identities.length - 1].real) {
                throw new Error('Template parent changed');
            }
        };
        await check();
        const bytes = await file.readFile('utf8');
        await check();
        return parseTemplate(source.label, bytes);
    }
    finally {
        await file.close();
    }
}
/** Verify that the canonical path of the template stays inside the repository. */
async function verifyTemplateParents(source) {
    const { canonicalRoot, canonicalParents: parents, expected, rootInfo, permission } = source;
    const identities = await Promise.all(parents.map(async (parent) => {
        await permission('read', [parent]);
        const info = await lstat(parent);
        if (!info.isDirectory() || info.isSymbolicLink())
            throw new Error('Template parent is not a directory');
        const original = parent === canonicalRoot ? rootInfo : expected.get(relative(canonicalRoot, parent));
        if (!original || !sameEntry(original, info))
            throw new Error('Template parent changed');
        const real = await realpath(parent);
        const within = relative(canonicalRoot, real);
        if (within.startsWith('..') || resolve(canonicalRoot, within) !== real) {
            throw new Error('Template parent escapes repository');
        }
        return { info, real };
    }));
    if (!sameEntry(rootInfo, identities[0].info))
        throw new Error('Repository directory changed');
    return identities;
}
/** Discover one unambiguous GitHub pull request template within the repository. */
export async function discoverTemplate(root, permission) {
    const canonicalRoot = await realpath(root);
    const rootInfo = await lstat(canonicalRoot);
    const discovery = new TemplateDiscovery(root, permission);
    await discovery.scan();
    if (discovery.candidates.length > 1)
        throw new Error('Ambiguous pull request templates');
    const label = discovery.candidates[0];
    if (!label)
        return parseTemplate(null, '');
    const parents = await canonicalParents(canonicalRoot, label, permission);
    const identity = await verifyTemplateParents({
        label,
        canonicalRoot,
        canonicalParents: parents,
        expected: discovery.observed,
        rootInfo,
        permission,
    });
    return readVerifiedTemplate(join(canonicalRoot, label), {
        label,
        canonicalParents: parents,
        expected: discovery.observed,
        identities: identity,
    }, permission);
}
/** Publish failure carrying the state reached before it stopped. */
export class PublishError extends Error {
    state;
    constructor(message, state, cause) {
        super(message, { cause });
        this.state = state;
    }
}
/** Synchronization failure recording whether the merge may have started. */
export class SyncError extends Error {
    attempted;
    observed;
    constructor(message, attempted, observed, cause) {
        super(message, { cause });
        this.attempted = attempted;
        this.observed = observed;
    }
}
const SHA = /^[0-9a-f]{40,64}$/;
const CONVENTIONAL_SUBJECT = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?: \S[^\r\n]*$/;
/** GitHub remotes accepted for pull request creation. */
const GITHUB_ORIGIN = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/;
const PULL_REQUEST_URL = (repo) => `https://github.com/${repo}/pull/`;
const GIT_OPERATIONS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply', 'sequencer'];
/** Fast-forward a clean, bound checkout after approval. */
export async function syncMain(root, expected, targetHead, permission, signal) {
    let attempted = false;
    let scratch;
    let indexPath;
    let observed = null;
    const git = (args, p = permission) => run(root, 'git', args, p, { signal });
    const readIndex = async () => {
        await permission('read', [indexPath]);
        return readIndexSnapshot(indexPath);
    };
    const inspectSnapshot = async (bytes) => {
        const path = join(scratch, 'index');
        // Git status may refresh its own index, so all inspection uses a disposable copy.
        await writeIndexSnapshot(path, bytes);
        await permission('read', [path]);
        return inspectRepository(root, permission, signal, { GIT_INDEX_FILE: path });
    };
    const assertNoOperations = async () => {
        for (const name of GIT_OPERATIONS) {
            const path = resolve(root, (await git(['rev-parse', '--git-path', name])).trim());
            await permission('read', [path]);
            try {
                await lstat(path);
                throw new Error(`Git operation in progress: ${name}`);
            }
            catch (error) {
                if (isMissing(error))
                    continue;
                throw error;
            }
        }
    };
    const assertCleanAt = async (head, bytes) => {
        const state = await inspectSnapshot(bytes);
        if (resolve(state.root) !== resolve(root) || state.branch !== expected.branch || state.head !== head || state.status.length) {
            throw new Error('Repository root, branch, HEAD, or clean state changed');
        }
        await assertNoOperations();
        if (!(await readIndex()).bytes.equals(bytes.bytes))
            throw new Error('Index changed');
        return state;
    };
    try {
        if (!SHA.test(expected.head) || !SHA.test(targetHead) || !expected.branch || expected.branch.startsWith('-')) {
            throw new Error('Unsafe expected branch or HEAD');
        }
        await permission('read', [root]);
        scratch = await mkdtemp(join(tmpdir(), 'publish-sync-'));
        const actualRoot = (await git(['rev-parse', '--show-toplevel'])).trim();
        if (resolve(actualRoot) !== resolve(root))
            throw new Error('Repository root changed');
        indexPath = resolve(root, (await git(['rev-parse', '--git-path', 'index'])).trim());
        const initial = await readIndex();
        const beforeState = await assertCleanAt(expected.head, initial);
        const before = { root: beforeState.root, branch: beforeState.branch, head: beforeState.head };
        await git(['fetch', '--no-tags', 'origin', 'refs/heads/main']);
        const assertTarget = async () => {
            if ((await git(['rev-parse', '--verify', 'FETCH_HEAD'])).trim() !== targetHead) {
                throw new Error('Fetched main does not match target');
            }
            await git(['merge-base', '--is-ancestor', expected.head, targetHead]);
        };
        await assertTarget();
        await assertCleanAt(expected.head, initial);
        const mergePermission = async (action, resources) => {
            await permission(action, resources);
            await assertCleanAt(expected.head, initial);
            await assertTarget();
        };
        try {
            await git(['merge', '--ff-only', '--no-edit', targetHead], mergePermission);
            attempted = true;
        }
        catch (error) {
            attempted = error.commandStarted !== false;
            throw error;
        }
        const postIndex = await readIndex();
        const state = await assertCleanAt(targetHead, postIndex);
        await git(['merge-base', '--is-ancestor', expected.head, targetHead]);
        if (!(await readIndex()).bytes.equals(postIndex.bytes))
            throw new Error('Index changed during verification');
        return { before, state };
    }
    catch (error) {
        if (attempted && scratch && indexPath) {
            try {
                const bytes = await readIndex();
                const state = await inspectSnapshot(bytes);
                if (resolve(state.root) === resolve(root) && (await readIndex()).bytes.equals(bytes.bytes))
                    observed = state;
            }
            catch { /* The repository could not be safely observed. */ }
        }
        throw new SyncError(error instanceof Error ? error.message : String(error), attempted, observed, error);
    }
    finally {
        if (scratch)
            await rm(scratch, { recursive: true, force: true });
    }
}
/** Branch names acceptable to `git check-ref-format` and the remote. */
function assertSafeBranch(branch) {
    const invalid = !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)
        || branch.includes('..')
        || branch.includes('//')
        || branch.endsWith('/')
        || branch.endsWith('.')
        || branch.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'));
    if (invalid)
        throw new Error('Unsafe expected branch or HEAD');
}
/** Read the single fetch and push URL of `origin`, requiring them to agree. */
async function readOriginUrl(git) {
    const fetchUrls = (await git(['remote', 'get-url', '--all', 'origin'])).trim().split('\n');
    const pushUrls = (await git(['remote', 'get-url', '--push', '--all', 'origin'])).trim().split('\n');
    if (fetchUrls.length !== 1 || pushUrls.length !== 1 || !fetchUrls[0] || fetchUrls[0] !== pushUrls[0]) {
        throw new Error('Origin fetch and push URLs are ambiguous or differ');
    }
    return fetchUrls[0];
}
/** Resolve one remote ref to its single object name, or `undefined` when absent. */
async function remoteSha(git, ref) {
    const output = (await git(['ls-remote', '--refs', 'origin', ref])).trim();
    if (!output)
        return undefined;
    const lines = output.split('\n');
    const fields = lines[0].split(/\s+/);
    if (lines.length !== 1 || fields.length !== 2 || !SHA.test(fields[0]) || fields[1] !== ref) {
        throw new Error('Unexpected remote ref response');
    }
    return fields[0];
}
/**
 * Publish a clean, bound branch.
 *
 * The caller must serialize repository mutations and validate pull request
 * content first. Every state transition is recorded so a partial failure can
 * be reported and retried without duplicating effects.
 */
export async function publishBranch(root, expected, mode, request, permission, runner = run, signal, retry = {}) {
    const state = {
        phase: 'preflight',
        push: 'not-attempted',
        remoteVerified: false,
        pr: retry.createUncertain ? 'unknown' : 'not-attempted',
        outgoingCommitCount: null,
        head: expected.head,
    };
    try {
        if (mode !== 'main' && mode !== 'pr')
            throw new Error('Invalid publish mode');
        if (!SHA.test(expected.head))
            throw new Error('Unsafe expected branch or HEAD');
        assertSafeBranch(expected.branch);
        if ((mode === 'main') !== (expected.branch === 'main'))
            throw new Error('Branch does not match publish mode');
        const requiresPullRequest = mode === 'pr';
        if (requiresPullRequest && (typeof request.title !== 'string' || !request.title.trim() || /[\r\n]/.test(request.title)
            || typeof request.body !== 'string' || !request.body.trim())) {
            throw new Error('PR title and body are required');
        }
        const command = (executable, args) => runner(root, executable, args, permission, { signal });
        const git = (args) => command('git', args);
        const ref = `refs/heads/${expected.branch}`;
        /** Assert clean, bound, operation-free checkout before each irreversible step. */
        const assertBoundClean = async () => {
            const actualRoot = (await git(['rev-parse', '--show-toplevel'])).trim();
            const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
            const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
            const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
            if (resolve(actualRoot) !== resolve(root) || branch !== expected.branch || head !== expected.head || status) {
                throw new Error('Repository root, branch, HEAD, or clean state changed');
            }
            for (const name of GIT_OPERATIONS) {
                const path = resolve(root, (await git(['rev-parse', '--git-path', name])).trim());
                await permission('read', [path]);
                try {
                    await lstat(path);
                    throw new Error(`Git operation in progress: ${name}`);
                }
                catch (error) {
                    if (isMissing(error))
                        continue;
                    throw error;
                }
            }
        };
        await assertBoundClean();
        await git(['check-ref-format', '--branch', expected.branch]);
        const origin = await readOriginUrl(git);
        let binding;
        if (requiresPullRequest) {
            const match = origin.match(GITHUB_ORIGIN);
            if (!match)
                throw new Error('Origin must identify one GitHub repository');
            binding = { owner: match[1], slug: `${match[1]}/${match[2]}` };
        }
        const base = await remoteSha(git, 'refs/heads/main');
        if (!base)
            throw new Error('origin/main does not exist');
        state.base = base;
        await git(['fetch', '--no-tags', 'origin', 'refs/heads/main']);
        if ((await git(['rev-parse', '--verify', 'FETCH_HEAD'])).trim() !== base)
            throw new Error('origin/main changed during fetch');
        await git(['merge-base', '--is-ancestor', base, expected.head]);
        const subjectOutput = await git(['log', '--format=%s', `${base}..${expected.head}`]);
        const subjects = subjectOutput ? subjectOutput.replace(/\n$/, '').split('\n') : [];
        state.outgoingCommitCount = subjects.length;
        if (subjects.some((subject) => !CONVENTIONAL_SUBJECT.test(subject)))
            throw new Error('Non-conventional outgoing commit');
        if (requiresPullRequest && !subjects.length)
            throw new Error('No outgoing commits');
        await git(['diff', '--stat', base, expected.head, '--']);
        const remote = requiresPullRequest ? await remoteSha(git, ref) : base;
        if (remote && remote !== expected.head) {
            await git(['fetch', '--no-tags', 'origin', ref]);
            if ((await git(['rev-parse', '--verify', 'FETCH_HEAD'])).trim() !== remote)
                throw new Error('Remote branch changed during fetch');
            await git(['merge-base', '--is-ancestor', remote, expected.head]);
        }
        /** Find the single open pull request that matches origin, head, and base. */
        const findPull = async () => {
            const raw = await command('gh', [
                'pr', 'list', '--repo', binding.slug, '--state', 'open', '--head', expected.branch,
                '--limit', '100', '--json', 'url,baseRefName,headRefName,headRepositoryOwner',
            ]);
            const pulls = JSON.parse(raw);
            if (!Array.isArray(pulls) || pulls.length >= 100 || pulls.length > 1)
                throw new Error('Ambiguous open pull requests');
            if (!pulls.length)
                return undefined;
            const pull = pulls[0];
            const matches = pull.baseRefName === 'main'
                && pull.headRefName === expected.branch
                && pull.headRepositoryOwner?.login?.toLowerCase() === binding.owner.toLowerCase()
                && typeof pull.url === 'string'
                && pull.url.toLowerCase().startsWith(PULL_REQUEST_URL(binding.slug.toLowerCase()))
                && /\/pull\/\d+$/.test(pull.url);
            if (!matches)
                throw new Error('Open pull request does not match origin, head, or base');
            return pull.url;
        };
        const existing = requiresPullRequest ? await findPull() : undefined;
        if (requiresPullRequest) {
            state.pr = existing ? 'known' : retry.createUncertain ? 'unknown' : 'absent';
            if (existing) {
                state.prUrl = existing;
                retry.createUncertain = false;
            }
        }
        await assertBoundClean();
        if ((await remoteSha(git, 'refs/heads/main')) !== base)
            throw new Error('origin/main changed before push');
        if ((await remoteSha(git, ref)) !== remote)
            throw new Error('Remote branch changed before push');
        state.phase = 'push';
        state.push = 'already-up-to-date';
        if (remote !== expected.head) {
            try {
                await git(['push', '--no-follow-tags', 'origin', `HEAD:${ref}`]);
                state.push = 'pushed';
            }
            catch (error) {
                state.push = error?.commandStarted === false ? 'not-attempted' : 'unknown';
                throw error;
            }
        }
        state.phase = 'verify-remote';
        try {
            await assertBoundClean();
            if ((await remoteSha(git, ref)) !== expected.head)
                throw new Error('remote verification failed');
            state.remoteVerified = true;
            if (requiresPullRequest && (await remoteSha(git, 'refs/heads/main')) !== base)
                throw new Error('origin/main changed');
        }
        catch (error) {
            throw new Error(`Push ${state.push}; post-push verification failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!requiresPullRequest || existing) {
            state.phase = 'complete';
            return state;
        }
        state.phase = 'pr-preflight';
        try {
            await assertBoundClean();
            if ((await remoteSha(git, ref)) !== expected.head)
                throw new Error('Remote branch changed before PR creation');
            if ((await remoteSha(git, 'refs/heads/main')) !== base)
                throw new Error('origin/main changed before PR creation');
            const nowExisting = await findPull();
            if (nowExisting) {
                state.pr = 'known';
                state.prUrl = nowExisting;
                retry.createUncertain = false;
                state.phase = 'complete';
                return state;
            }
        }
        catch (error) {
            throw new Error(`Push ${state.push}; PR preflight failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (retry.createUncertain) {
            state.pr = 'unknown';
            throw new Error('Previous PR creation remains uncertain');
        }
        state.phase = 'pr-create';
        try {
            const created = (await command('gh', [
                'pr', 'create', '--repo', binding.slug, '--base', 'main', '--head', expected.branch,
                '--title', request.title, '--body', request.body,
            ])).trim();
            if (!created.toLowerCase().startsWith(PULL_REQUEST_URL(binding.slug.toLowerCase())) || !/\/pull\/\d+$/.test(created)) {
                throw new Error('Unexpected PR creation response');
            }
            state.pr = 'known';
            state.prUrl = created;
            state.phase = 'complete';
            return state;
        }
        catch (error) {
            const attempted = error?.commandStarted !== false;
            if (attempted) {
                retry.createUncertain = true;
                state.pr = 'unknown';
            }
            try {
                const recovered = await findPull();
                if (recovered) {
                    retry.createUncertain = false;
                    state.pr = 'known';
                    state.prUrl = recovered;
                    state.phase = 'complete';
                    return state;
                }
            }
            catch { /* Preserve the original failure and push status. */ }
            throw new Error(`Push ${state.push}; PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    catch (error) {
        throw new PublishError(error instanceof Error ? error.message : String(error), { ...state }, error);
    }
}
