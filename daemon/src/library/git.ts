import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { gitAddressProblem } from '@aubergine/shared';
import { gitBin, isolatedEnv, networkEnv, runSourceGit, type Ran } from '../git/run';

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

export class GitFetcher implements LibraryFetcher {
  constructor(
    private readonly limits: () => GitLimits,
    private readonly bin: string = gitBin(),
  ) {}

  /** Runs one Git command, by the rules for a library source. Git itself is started in one place: `git/run.ts`. */
  private run(args: readonly string[], env: NodeJS.ProcessEnv, cwd?: string): Promise<Ran> {
    return runSourceGit(args, env, this.limits(), cwd, this.bin);
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
