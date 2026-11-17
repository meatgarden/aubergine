import { spawn } from 'node:child_process';

/**
 * The one place that starts Git. Two functions, because Git is used for two
 * things with different rules, and neither may be loosened for the other:
 *
 * - `runSourceGit`, for a library source: a stranger's repository, fetched
 *   into a folder of our own. Nothing of the owner's configuration is used
 *   to write files out, and there are limits on size.
 * - `runOwnerGit`, for a working copy: the owner's own repository, where
 *   their configuration is theirs and has to be used (their filters decide
 *   what the files in a checkout are). Hooks do not run for a command
 *   Aubergine starts, nothing prompts, and nothing reaches the network.
 *
 * Every argument is passed as an argument. No command line is put together
 * as text, and nothing a caller wrote is ever where Git reads an option.
 */

export interface Ran {
  code: number | null;
  out: string;
  err: string;
  timedOut: boolean;
  /** The output was longer than is kept, and the command was stopped there. */
  cut: boolean;
}

interface Start {
  env: NodeJS.ProcessEnv;
  cwd?: string | undefined;
  timeoutMs: number;
  /** A limit on the size of any file the command writes, in 512-byte blocks. */
  fileBlocks?: number;
  /** How much output is kept. With `stopAt`, the command is stopped when it has printed more. */
  keep: number;
  stopAtKeep?: boolean;
}

function start(bin: string, args: readonly string[], options: Start): Promise<Ran> {
  return new Promise((resolve) => {
    // Through `sh` only where a limit on file size is wanted (`ulimit -f`); nothing of a caller's is in the script.
    const child =
      options.fileBlocks !== undefined
        ? spawn('/bin/sh', ['-c', 'ulimit -f "$1" 2>/dev/null; shift; exec "$@"', 'sh', String(options.fileBlocks), bin, ...args], { env: options.env, cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
        : spawn(bin, [...args], { env: options.env, cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let err = '';
    let timedOut = false;
    let cut = false;
    const stop = (): void => {
      // The command and everything it started: it runs in a process group of its own for this.
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (options.stopAtKeep) {
        if (cut) return;
        chunks.push(chunk);
        size += chunk.length;
        if (size > options.keep) {
          cut = true;
          stop();
        }
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
      // The end is what is kept: drop from the front.
      while (chunks.length > 1 && size - (chunks[0] as Buffer).length >= options.keep) size -= (chunks.shift() as Buffer).length;
    });
    child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString('utf8')).slice(-20_000)));
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    const out = (): string => {
      const all = Buffer.concat(chunks);
      return (options.stopAtKeep ? all.subarray(0, options.keep) : all.subarray(Math.max(0, all.length - options.keep))).toString('utf8');
    };
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, out: out(), err: 'Git could not be started. Is it installed?', timedOut, cut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out: out(), err, timedOut, cut });
    });
  });
}

export const gitBin = (): string => process.env.AUBERGINE_GIT_BIN ?? 'git';

/* ---------- A library source: a stranger's repository ---------- */

/** The environment of the step that speaks to the network: the owner's own, plus what keeps Git from asking or wandering. */
export function networkEnv(address: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Never ask on a terminal; a prompt nobody sees would hang until the timeout.
    GIT_TERMINAL_PROMPT: '0',
    // Only these transports, whatever any configuration says (this overrides `protocol.*`). `file` only when the address is one.
    GIT_ALLOW_PROTOCOL: address.startsWith('file:') ? 'file' : 'https:ssh',
    // Large-file content is not downloaded.
    GIT_LFS_SKIP_SMUDGE: '1',
    // Not the user's editor, pager or askpass window.
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_PAGER: 'cat',
    GIT_OPTIONAL_LOCKS: '0',
  };
}

/** The environment of the step that writes files out: no configuration but ours, and no network at all. */
export function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: '/nonexistent',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    // Nothing may be fetched while writing files out: not a missing object, not a submodule.
    GIT_ALLOW_PROTOCOL: '',
    GIT_NO_LAZY_FETCH: '1',
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_PAGER: 'cat',
  };
}

/** Options given on every command line for a library source; the command line wins over every configuration file. */
const SOURCE_ALWAYS = [
  // No hook, wherever one might be configured to live.
  '-c', 'core.hooksPath=/dev/null',
  // No program that watches the file system.
  '-c', 'core.fsmonitor=false',
  // Links are written as small plain files holding the link's text.
  '-c', 'core.symlinks=false',
  // Malformed objects, and the known tricks with `.git` and `.gitmodules`, abort the fetch.
  '-c', 'transfer.fsckObjects=true',
  '-c', 'fetch.fsckObjects=true',
  // Submodules are never followed.
  '-c', 'submodule.recurse=false',
  '-c', 'fetch.recurseSubmodules=false',
  // The large-file filter, if the owner has it installed, does nothing here.
  '-c', 'filter.lfs.smudge=',
  '-c', 'filter.lfs.process=',
  '-c', 'filter.lfs.required=false',
  // No maintenance in the background after a fetch.
  '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false',
  '-c', 'advice.detachedHead=false',
];

/** One Git command on a library source. `env` is one of the two above. */
export function runSourceGit(args: readonly string[], env: NodeJS.ProcessEnv, limits: { timeoutSeconds: number; maxMegabytes: number }, cwd?: string, bin: string = gitBin()): Promise<Ran> {
  return start(bin, [...SOURCE_ALWAYS, ...args], { env, cwd, timeoutMs: limits.timeoutSeconds * 1000, fileBlocks: limits.maxMegabytes * 2048, keep: 20_000 });
}

/* ---------- The owner's own repository ---------- */

/**
 * The environment of a command on the owner's repository: the owner's own,
 * so that their configuration is used, without what would point Git at
 * another repository, and with nothing that asks or reaches out.
 */
export function ownerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // The server may itself have been started from inside a Git command; none of that applies to the folder we name.
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX', 'GIT_EXTERNAL_DIFF', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS']) delete env[name];
  return {
    ...env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_PAGER: 'cat',
    // No editor is ever opened; one that is asked for fails at once.
    GIT_EDITOR: 'false',
    // Reading must not write: `status` otherwise refreshes the index file as a side effect.
    GIT_OPTIONAL_LOCKS: '0',
    // Nothing Git itself does here may reach a network: not a missing object of a partial clone, not a submodule.
    GIT_ALLOW_PROTOCOL: '',
    GIT_NO_LAZY_FETCH: '1',
  };
}

/** Options given on every command line on the owner's repository; the command line wins over every configuration file. */
const OWNER_ALWAYS = [
  '--no-pager',
  '--no-optional-locks',
  // What a caller names is a path, never a pattern.
  '--literal-pathspecs',
  // No hook runs for a command Aubergine starts, wherever the repository says its hooks live.
  '-c', 'core.hooksPath=/dev/null',
  // No program that watches the file system is started.
  '-c', 'core.fsmonitor=false',
  // Submodules are neither entered nor updated.
  '-c', 'submodule.recurse=false',
  // No maintenance in the background.
  '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false',
  // Names are printed as they are; they are read with NUL between them.
  '-c', 'core.quotePath=false',
  '-c', 'color.ui=false',
  '-c', 'advice.detachedHead=false',
];

export interface OwnerGitOptions {
  timeoutSeconds?: number;
  /** How many bytes of output are kept; the command is stopped when it prints more, and the answer says it was cut. */
  maxOut?: number;
}

/** One Git command on the owner's repository, in `folder`. */
export function runOwnerGit(folder: string, args: readonly string[], options: OwnerGitOptions = {}, bin: string = gitBin()): Promise<Ran> {
  return start(bin, [...OWNER_ALWAYS, '-C', folder, ...args], { env: ownerEnv(), timeoutMs: (options.timeoutSeconds ?? 60) * 1000, keep: options.maxOut ?? 4_000_000, stopAtKeep: true });
}

/** `git --version`, for the doctor. Null when Git cannot be started. */
export async function gitVersion(bin: string = gitBin()): Promise<string | null> {
  const ran = await start(bin, ['--version'], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, timeoutMs: 10_000, keep: 2000 });
  const found = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(ran.out);
  return ran.code === 0 && found ? found[0] : null;
}
