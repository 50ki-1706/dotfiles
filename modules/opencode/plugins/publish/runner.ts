import { spawn } from 'node:child_process';

export type Permission = (action: 'shell' | 'read' | 'edit' | 'external_directory', resources: string[]) => Promise<void>;

const sensitive = /^(?:\.env(?!\.example$).*|.*\.(?:key|pem)|id_rsa.*)$/i;

export function assertSafePath(path: string): void {
  if (!path || path.includes('\0') || path.startsWith('/') || path.startsWith('-') || path.split('/').some((part) => !part || part === '.' || part === '..' || sensitive.test(part))) throw new Error('Sensitive or invalid path');
}

async function execute(
  cwd: string,
  executable: 'git' | 'git-surgeon' | 'gh',
  args: string[],
  options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<string> {
  if (args.some((arg) => arg.includes('\0'))) throw new Error('Invalid argument');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, options.env, { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_LITERAL_PATHSPECS: '1' });
  if (process.platform === 'win32') throw new Error('Publish requires POSIX process groups');
  if (options.signal?.aborted) throw new Error('Command aborted');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, env,
      shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let failure: Error | undefined;
    let bytes = 0;
    const terminate = (error: Error) => {
      failure ??= error;
      if (!child.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure = new AggregateError([failure, error], `${failure.message}; failed to signal process group: ${String(error)}`);
      }
    };
    const abort = () => terminate(new Error('Command aborted'));
    const timer = setTimeout(() => terminate(new Error(`${executable} timed out`)), options.timeout ?? 30_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (which: 'stdout' | 'stderr', chunk: Buffer) => {
      if (failure) return;
      bytes += chunk.length;
      if (bytes > 1_048_576) {
        terminate(new Error(`${executable} exceeded output limit`));
        return;
      }
      if (which === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk));
    child.once('error', (error) => { failure ??= error; });
    child.once('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${executable} exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
  });
}

export async function run(cwd: string, executable: 'git' | 'git-surgeon' | 'gh', args: string[], permission: Permission, options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; timeout?: number } = {}): Promise<string> {
  const quote = (arg: string) => /^[a-zA-Z0-9_./:=+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
  const tagged = (error: unknown, commandStarted: boolean) => Object.assign(error instanceof Error && Object.isExtensible(error) ? error : new Error(String(error), { cause: error }), { commandStarted });
  let commandStarted = false;
  try {
    await permission('shell', [[executable, ...args].map(quote).join(' ')]);
    commandStarted = true;
    return await execute(cwd, executable, args, options);
  } catch (error) {
    throw tagged(error, commandStarted);
  }
}

export async function authorizeHeadRecovery(cwd: string, permission: Permission): Promise<() => Promise<string>> {
  await permission('shell', ['git rev-parse --verify HEAD']);
  return () => execute(cwd, 'git', ['rev-parse', '--verify', 'HEAD']);
}

export function validateSelection(ids: unknown, message: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*(?::[1-9]\d*-[1-9]\d*)?$/.test(id))) {
    throw new Error('Invalid hunk selection');
  }
  const seen = new Set<string>();
  for (const id of ids) {
    const [base, range] = id.split(':');
    if (seen.has(base)) throw new Error('Duplicate hunk');
    seen.add(base);
    if (range) {
      const [start, end] = range.split('-').map(Number);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) throw new Error('Invalid line range');
    }
  }
  if (typeof message !== 'string' || !/^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-zA-Z0-9._/-]+\))?!?: \S[^\r\n]*$/.test(message)) {
    throw new Error('Invalid conventional commit message');
  }
}
