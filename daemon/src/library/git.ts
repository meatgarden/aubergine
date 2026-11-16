import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { gitAddressProblem } from '@aubergine/shared';

/**
 * Fetching a Git source into a folder of the data folder, and nothing else.
 *
 * Everything here is one seam (`LibraryFetcher`) with one implementation, so
 * that the rest of the library never starts a program, and so that a test
 * can put a stand-in here and say "nothing was fetched".
 *
 * What is fetched is never run. Two steps, with different rules:
 *
 * 1. Getting the commits, over the network, with the owner's own Git
 *    configuration: that is where their proxy, their credential helper and
 *    their ssh set-up are, and Aubergine neither stores nor asks for a
 *    credential. No hook can run (the cache has none and is told to look for
 *    none), only https, ssh and, when the address itself is one, file are
 *    spoken, nothing prompts, and there is a limit on time and on size.
 * 2. Writing the files out, with no network and with none of the owner's
 *    configuration: no filter, no hook and no helper the owner has
 *    configured is run on a stranger's content. Symbolic links are written
 *    as small plain files, and submodules are not fetched at all.
 */

export interface Fetched {
  /** The folder the files were written to. */
  root: string;
  /** The exact commit that was read. */
  commit: string;
  /** Whether the commit read before is still part of the history. Null when there was none before. */
  history: 'same' | 'grew' | 'rewritten' | 'cannot-tell' | null;
}

export class FetchRefusal extends Error {}

export interface LibraryFetcher {
  /** Fetches `address` into `cache` (a folder of its own in the data folder). `before`: the commit read last time. */
  fetch(address: string, cache: string, before: string | null): Promise<Fetched>;
  /** Removes what was fetched for a source. */
  forget(cache: string): Promise<void>;
}

export interface GitLimits {
  timeoutSeconds: number;
  maxMegabytes: number;
}

/** How far back history is read to tell whether a commit is still part of it. */
const HISTORY_DEPTH = 200;

interface Ran {
  code: number | null;
  out: string;
  err: string;
  timedOut: boolean;
}

/** The environment of the step that speaks to the network: the owner's own, plus what keeps Git from asking or wandering. */
function networkEnv(address: string): NodeJS.ProcessEnv {
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
function isolatedEnv(): NodeJS.ProcessEnv {
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

/** Options given on every command line; the command line wins over every configuration file. */
const ALWAYS = [
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

export class GitFetcher implements LibraryFetcher {
  constructor(
    private readonly limits: () => GitLimits,
    private readonly bin: string = process.env.AUBERGINE_GIT_BIN ?? 'git',
  ) {}

  /**
   * Runs one Git command. Through `sh` only to set a limit on the size of any file the command writes
   * (`ulimit -f`), which is what bounds a fetch; nothing of a caller's is in the script, every argument is
   * passed as an argument.
   */
  private run(args: readonly string[], env: NodeJS.ProcessEnv, cwd?: string): Promise<Ran> {
    const { timeoutSeconds, maxMegabytes } = this.limits();
    const blocks = String(maxMegabytes * 2048);
    return new Promise((resolve) => {
      const child = spawn('/bin/sh', ['-c', 'ulimit -f "$1" 2>/dev/null; shift; exec "$@"', 'sh', blocks, this.bin, ...ALWAYS, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let out = '';
      let err = '';
      let timedOut = false;
      child.stdout.on('data', (chunk: Buffer) => (out = (out + chunk.toString('utf8')).slice(-20_000)));
      child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk.toString('utf8')).slice(-20_000)));
      const timer = setTimeout(() => {
        timedOut = true;
        // The command and everything it started (ssh, a helper): it runs in a process group of its own for this.
        try {
          if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, timeoutSeconds * 1000);
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ code: null, out, err: 'Git could not be started. Is it installed?', timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, out, err, timedOut });
      });
    });
  }

  /** What went wrong, for the owner: the last lines Git said, without anything that looks like a credential. */
  private why(ran: Ran, doing: string): FetchRefusal {
    if (ran.timedOut) return new FetchRefusal(`${doing} took longer than ${this.limits().timeoutSeconds} seconds and was stopped. If it waits for a password, set up Git access for this address first: Aubergine never asks for one.`);
    const said = ran.err
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(-3)
      .join(' ')
      .replace(/\/\/[^/@\s]+@/g, '//')
      .slice(0, 400);
    // The limit on file size ends the writing program with a signal of its own (SIGXFSZ, number 25); Git reports that in words.
    if (/File size limit exceeded|file too large|died of signal 25|SIGXFSZ/i.test(ran.err) || ran.code === 153) return new FetchRefusal(`${doing} was stopped: the source is larger than ${this.limits().maxMegabytes} MB.`);
    return new FetchRefusal(`${doing} did not work${said ? `: ${said}` : '.'}`);
  }

  async fetch(address: string, cache: string, before: string | null): Promise<Fetched> {
    // Checked where the address is taken in, and again here, where it is used.
    const problem = gitAddressProblem(address);
    if (problem) throw new FetchRefusal(problem);
    const repo = path.join(cache, 'repo.git');
    const tree = path.join(cache, 'tree');
    await mkdir(cache, { recursive: true, mode: 0o700 });

    // A bare repository of our own, made from no template: it has no hooks folder to begin with.
    const init = await this.run(['init', '--quiet', '--bare', '--template=', repo], isolatedEnv());
    if (init.code !== 0) throw this.why(init, 'Preparing the cache');

    // The newest commit and nothing else: no tags, no submodules, and the address after `--`, so it is never an option.
    const net = networkEnv(address);
    const fetchArgs = (depth: number): string[] => ['--git-dir', repo, 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--force', `--depth=${depth}`, '--', address, '+HEAD:refs/aubergine/head'];
    const first = await this.run(fetchArgs(1), net);
    if (first.code !== 0) throw this.why(first, 'Fetching');
    const head = await this.run(['--git-dir', repo, 'rev-parse', '--verify', 'refs/aubergine/head^{commit}'], isolatedEnv());
    const commit = head.out.trim();
    if (head.code !== 0 || !/^[0-9a-f]{40,64}$/.test(commit)) throw this.why(head, 'Reading what was fetched');

    // Is the commit read last time still part of the history? Read back a bounded way to find out.
    let history: Fetched['history'] = null;
    if (before !== null && /^[0-9a-f]{40,64}$/.test(before)) {
      if (before === commit) history = 'same';
      else {
        const deeper = await this.run(fetchArgs(HISTORY_DEPTH), net);
        if (deeper.code !== 0) history = 'cannot-tell';
        else {
          const ancestor = await this.run(['--git-dir', repo, 'merge-base', '--is-ancestor', before, commit], isolatedEnv());
          if (ancestor.code === 0) history = 'grew';
          else {
            // Not found among what was read back: rewritten, unless the history is longer than what was read.
            const count = await this.run(['--git-dir', repo, 'rev-list', '--count', commit], isolatedEnv());
            history = Number(count.out.trim()) >= HISTORY_DEPTH ? 'cannot-tell' : 'rewritten';
          }
        }
      }
    }

    // The files, written out afresh, by a Git that knows none of the owner's configuration and may not reach anywhere.
    await rm(tree, { recursive: true, force: true });
    await mkdir(tree, { recursive: true, mode: 0o700 });
    const out = await this.run(['--git-dir', repo, '--work-tree', tree, 'checkout', '--quiet', '--force', commit, '--', '.'], isolatedEnv(), tree);
    if (out.code !== 0) throw this.why(out, 'Writing out what was fetched');
    return { root: tree, commit, history };
  }

  async forget(cache: string): Promise<void> {
    await rm(cache, { recursive: true, force: true });
  }
}
