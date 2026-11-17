import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { COPY_BRANCH, COPY_NAME, DIFFERENCE_MAX_BYTES, FILES_MAX, type Difference, type EnvironmentFile } from '@aubergine/shared';
import { readInside } from '../repository-files';
import { runOwnerGit, type Ran } from './run';

/**
 * Working copies, in Git's words: linked worktrees of the owner's
 * repository, each on a branch made for it. Everything here goes through
 * `runOwnerGit`, so: no hook runs for any of it, nothing prompts, nothing
 * reaches a network, and reading writes nothing.
 *
 * What does run is what the owner configured to decide the content of
 * files: a filter (clean, smudge, process) named in their configuration is
 * run by Git when a working copy is written out and when its files are
 * compared, as it is for the owner's own `git status`. A repository cannot
 * bring such a program with it: the program is named in configuration, and
 * configuration is not part of what is cloned.
 *
 * Never used here: merge, rebase, push, pull, fetch, stash, commit, reset,
 * switch or checkout in the owner's checkout.
 */

export class GitProblem extends Error {}

/** The oldest Git this works with: `rev-parse --path-format` arrived in 2.31. */
export const GIT_MINIMUM = [2, 31] as const;
export const gitNewEnough = (version: string): boolean => {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > GIT_MINIMUM[0] || (major === GIT_MINIMUM[0] && minor >= GIT_MINIMUM[1]);
};

const HASH = /^[0-9a-f]{40,64}$/;

/** The last thing Git said, cut short, for a sentence to the owner. */
function said(ran: Ran): string {
  if (ran.timedOut) return 'Git took too long and was stopped.';
  return ran.err
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(-2)
    .join(' ')
    .slice(0, 300);
}

export interface Located {
  /** The top of the checkout the folder is in. */
  root: string;
  /** The folder, from that top: empty at the top itself, else ending in `/`. */
  prefix: string;
  /** The commit that is checked out there. */
  commit: string;
  /** The branch that is checked out there; null when none is. */
  branch: string | null;
}

/** Where a folder is in a repository, or why a working copy cannot be made from it. Reads only. */
export async function locate(folder: string): Promise<{ ok: true; at: Located } | { ok: false; reason: string }> {
  if (!existsSync(folder)) return { ok: false, reason: 'That folder does not exist.' };
  const bare = await runOwnerGit(folder, ['rev-parse', '--is-bare-repository']);
  if (bare.code === null) return { ok: false, reason: 'Git could not be started. A working copy needs Git.' };
  if (bare.code !== 0) {
    // Git's own sentence where it has one worth passing on (a repository owned by someone else, for example).
    const why = said(bare);
    return { ok: false, reason: /not a git repository/i.test(why) || why === '' ? 'This folder is not in a Git repository.' : `Git will not read this folder: ${why}` };
  }
  if (bare.out.trim() === 'true') return { ok: false, reason: 'This is a bare repository: it has no checkout to make a working copy beside.' };
  const inside = await runOwnerGit(folder, ['rev-parse', '--is-inside-work-tree']);
  if (inside.out.trim() !== 'true') return { ok: false, reason: "This folder is inside a repository's own files, not in its checkout." };
  const where = await runOwnerGit(folder, ['rev-parse', '--path-format=absolute', '--show-toplevel']);
  const prefix = await runOwnerGit(folder, ['rev-parse', '--show-prefix']);
  const root = where.out.replace(/\n$/, '');
  if (where.code !== 0 || prefix.code !== 0 || !path.isAbsolute(root) || root.includes('\n')) return { ok: false, reason: `Git could not say where this repository is${said(where) ? `: ${said(where)}` : '.'}` };
  const head = await runOwnerGit(folder, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const commit = head.out.trim();
  if (head.code !== 0 || !HASH.test(commit)) return { ok: false, reason: 'This repository has no commit yet: there is nothing for a working copy to start from.' };
  const branch = await runOwnerGit(folder, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  return { ok: true, at: { root, prefix: prefix.out.replace(/\n$/, ''), commit, branch: branch.code === 0 ? branch.out.trim() : null } };
}

/** The entries of `status --porcelain=v2 -z`: each path once, with whether Git tracks it. */
function statusEntries(out: string): { path: string; tracked: boolean }[] {
  const parts = out.split('\0');
  const entries: { path: string; tracked: boolean }[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] as string;
    if (part.startsWith('? ')) entries.push({ path: part.slice(2), tracked: false });
    else if (part.startsWith('1 ')) entries.push({ path: part.split(' ').slice(8).join(' '), tracked: true });
    else if (part.startsWith('u ')) entries.push({ path: part.split(' ').slice(10).join(' '), tracked: true });
    else if (part.startsWith('2 ')) {
      entries.push({ path: part.split(' ').slice(9).join(' '), tracked: true });
      // A rename is followed by the name it had.
      index += 1;
    }
  }
  return entries;
}

/**
 * What in a checkout is in no commit: files Git tracks that differ, and files it does not track (ignored ones
 * left out). Reads only: the index file is not refreshed.
 */
export async function uncommitted(folder: string): Promise<{ tracked: number; untracked: number; paths: Set<string> }> {
  const status = await runOwnerGit(folder, ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=all']);
  if (status.code !== 0) throw new GitProblem(`Git could not read what changed${said(status) ? `: ${said(status)}` : '.'}`);
  const entries = statusEntries(status.out);
  return { tracked: entries.filter((e) => e.tracked).length, untracked: entries.filter((e) => !e.tracked).length, paths: new Set(entries.map((e) => e.path)) };
}

/** Whether a path is a folder made here, directly inside the folder all copies are kept in. */
function ours(copiesRoot: string, folder: string): boolean {
  return path.dirname(folder) === path.resolve(copiesRoot) && COPY_NAME.test(path.basename(folder));
}

/**
 * Makes a working copy: a linked worktree at `folder`, on a new branch, from `commit`. If it fails part of the
 * way, what was made is taken away again: the folder, the worktree's entry, and the branch, which did not exist
 * before. The owner's checkout is not touched either way.
 */
export async function addCopy(input: { root: string; copiesRoot: string; folder: string; branch: string; commit: string }): Promise<void> {
  const { root, copiesRoot, folder, branch, commit } = input;
  // Made here from a strict alphabet, and checked again where they are used.
  if (!COPY_BRANCH.test(branch) || !ours(copiesRoot, folder) || !HASH.test(commit)) throw new GitProblem('That is not a name a working copy can have.');
  if (existsSync(folder)) throw new GitProblem('A folder of that name is already there.');
  const exists = await runOwnerGit(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (exists.code === 0) throw new GitProblem(`The repository already has a branch named ${branch}.`);
  await mkdir(copiesRoot, { recursive: true, mode: 0o700 });
  // `--no-track`: the new branch follows nothing. The folder and the commit come after `--`, so neither is ever read as an option.
  const added = await runOwnerGit(root, ['worktree', 'add', '--quiet', '--no-track', '-b', branch, '--', folder, commit], { timeoutSeconds: 300 });
  if (added.code === 0) return;
  await takeAway({ root, copiesRoot, folder, branch });
  throw new GitProblem(`The working copy could not be made${said(added) ? `: ${said(added)}` : '.'}`);
}

/** Removes a working copy's folder, its entry in the repository and its branch, whatever state they are in. Only what was made here. */
export async function takeAway(input: { root: string; copiesRoot: string; folder: string; branch: string | null }): Promise<void> {
  const { root, copiesRoot, folder, branch } = input;
  if (!ours(copiesRoot, folder)) throw new GitProblem('That folder was not made by Aubergine.');
  if (existsSync(root)) await runOwnerGit(root, ['worktree', 'remove', '--force', '--force', '--', folder]);
  await rm(folder, { recursive: true, force: true });
  if (branch !== null && COPY_BRANCH.test(branch) && existsSync(root)) {
    // With the folder gone, Git may still hold the entry; it is dropped for this one folder, and no other.
    await dropEntry(root, folder);
    await runOwnerGit(root, ['branch', '--quiet', '-D', '--', branch]);
  }
}

/** Drops the repository's entry for a working copy whose folder is gone. Only that one: other stale entries are the owner's. */
async function dropEntry(root: string, folder: string): Promise<void> {
  const list = await runOwnerGit(root, ['worktree', 'list', '--porcelain', '-z']);
  if (list.code !== 0 || !list.out.split('\0').includes(`worktree ${folder}`)) return;
  // `remove` works on an entry whose folder is missing; forced, because there is nothing to check for cleanliness.
  await runOwnerGit(root, ['worktree', 'remove', '--force', '--', folder]);
}

/** Removes the folder of a working copy and keeps its branch. Git refuses when anything in it is in no commit. */
export async function removeFolder(input: { root: string; copiesRoot: string; folder: string }): Promise<void> {
  if (!ours(input.copiesRoot, input.folder)) throw new GitProblem('That folder was not made by Aubergine.');
  const removed = await runOwnerGit(input.root, ['worktree', 'remove', '--', input.folder]);
  if (removed.code !== 0) throw new GitProblem(`The folder was not removed${said(removed) ? `: ${said(removed)}` : '.'}`);
}

export interface Changes {
  files: EnvironmentFile[];
  filesCut: boolean;
  changed: number;
  added: number;
  removed: number;
  commits: number;
  uncommitted: number;
  onBranch: string | null;
}

/**
 * What differs in a working copy from the commit it started from, committed or not. Names and states only.
 * No program a configuration names for showing differences is run (`--no-ext-diff`, `--no-textconv`), and
 * submodules are not looked into.
 */
export async function changesIn(folder: string, start: string): Promise<Changes> {
  if (!HASH.test(start)) throw new GitProblem('That is not a commit.');
  const diff = await runOwnerGit(folder, ['diff', '--name-status', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', start, '--']);
  if (diff.code !== 0) throw new GitProblem(`Git could not compare the working copy with where it started${said(diff) ? `: ${said(diff)}` : '.'}`);
  const pending = await uncommitted(folder);
  const files: EnvironmentFile[] = [];
  const parts = diff.out.split('\0');
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const letter = (parts[index] as string)[0];
    const file = parts[index + 1] as string;
    files.push({ path: file, state: letter === 'A' ? 'added' : letter === 'D' ? 'removed' : 'changed', committed: !pending.paths.has(file) });
  }
  // Files Git does not track yet are new files all the same. Ignored ones are left out.
  const known = new Set(files.map((file) => file.path));
  const untracked = await runOwnerGit(folder, ['ls-files', '--others', '--exclude-standard', '-z']);
  for (const file of untracked.out.split('\0')) if (file !== '' && !known.has(file)) files.push({ path: file, state: 'added', committed: false });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const count = await runOwnerGit(folder, ['rev-list', '--count', `${start}..HEAD`]);
  const branch = await runOwnerGit(folder, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  return {
    files: files.slice(0, FILES_MAX),
    filesCut: files.length > FILES_MAX,
    changed: files.filter((f) => f.state === 'changed').length,
    added: files.filter((f) => f.state === 'added').length,
    removed: files.filter((f) => f.state === 'removed').length,
    commits: count.code === 0 ? Number(count.out.trim()) || 0 : 0,
    uncommitted: files.filter((f) => !f.committed).length,
    onBranch: branch.code === 0 ? branch.out.trim() : null,
  };
}

/** A file larger than this is not drawn at all. */
const DRAW_MAX_BYTES = 2_000_000;

/** The difference of one file against the start, as text, bounded. `file` is one of the files `changesIn` listed. */
export async function differenceOf(folder: string, start: string, file: EnvironmentFile): Promise<Difference> {
  const none = (notDrawn: string): Difference => ({ file: file.path, state: file.state, text: '', cut: false, notDrawn });
  const size = await lstat(path.join(folder, file.path)).then(
    (stat) => (stat.isFile() ? stat.size : stat.isSymbolicLink() ? 0 : -1),
    () => null,
  );
  if (size !== null && size < 0) return none('This is not a file.');
  if (size !== null && size > DRAW_MAX_BYTES) return none('This file is too large to draw here.');
  const tracked = await runOwnerGit(folder, ['ls-files', '--error-unmatch', '--', file.path]);
  if (tracked.code !== 0 && file.state === 'added') {
    // Not known to Git yet: its content is the whole difference. Read with bounds, and never through a link.
    // Its size was looked at above; this reads all of it, and what is given is cut below.
    const read = await readInside(folder, file.path, DRAW_MAX_BYTES);
    if (!read.ok) return none(read.reason.replace(/ (in|of) the source/, ' there'));
    if (read.bytes.includes(0)) return none('This file is not text.');
    const cut = read.bytes.length > DIFFERENCE_MAX_BYTES;
    const text = read.bytes.subarray(0, DIFFERENCE_MAX_BYTES).toString('utf8');
    return { file: file.path, state: file.state, text: [`+++ ${file.path} (new, not yet known to Git)`, ...text.replace(/\n$/, '').split('\n').map((line) => `+${line}`)].join('\n'), cut, notDrawn: null };
  }
  const diff = await runOwnerGit(folder, ['diff', '--no-color', '--no-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--unified=3', start, '--', file.path], { maxOut: DIFFERENCE_MAX_BYTES, timeoutSeconds: 20 });
  if (diff.timedOut) return none('Comparing this file took too long.');
  if (diff.code !== 0 && !diff.cut) throw new GitProblem(`Git could not compare this file${said(diff) ? `: ${said(diff)}` : '.'}`);
  if (/^Binary files .* differ$/m.test(diff.out) && !/^@@ /m.test(diff.out)) return none('This file is not text.');
  return { file: file.path, state: file.state, text: diff.out.replace(/\n$/, ''), cut: diff.cut, notDrawn: null };
}

/** How many commits a working copy holds that are on no other branch, tag or remote: work that exists nowhere else. */
export async function commitsNowhereElse(root: string, folder: string, branch: string | null): Promise<number> {
  const short = branch !== null && COPY_BRANCH.test(branch) ? branch : null;
  const others = [...(short ? [`--exclude=${short}`] : []), '--branches', '--tags', '--remotes'];
  const inCopy = existsSync(folder);
  // What the copy has checked out, and its branch, less everything any other branch, tag or remote holds.
  const tips = [...(inCopy ? ['HEAD'] : []), ...(short ? [`refs/heads/${short}`] : [])];
  if (tips.length === 0) return 0;
  const count = await runOwnerGit(inCopy ? folder : root, ['rev-list', '--count', ...tips, '--not', ...others]);
  return count.code === 0 ? Number(count.out.trim()) || 0 : 0;
}

/** Why a working copy cannot be used any more, in a sentence; null while it is whole. */
export async function brokenWhy(root: string, folder: string): Promise<string | null> {
  if (!existsSync(folder)) return 'Its folder is gone: it was deleted or moved by hand. Its branch may still be in the repository.';
  if (!existsSync(root)) return 'The repository it was made from is no longer where it was. If it was moved, `git worktree repair` there can connect the two again.';
  const inside = await runOwnerGit(folder, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || inside.out.trim() !== 'true') return 'Git no longer finds its repository from its folder. If the repository was moved, `git worktree repair` there can connect the two again.';
  return null;
}

/** What a folder takes on disk, by walking it. Stops after a set number of entries and says so. */
export async function sizeOf(folder: string, maxEntries = 60_000): Promise<{ bytes: number | null; atLeast: boolean }> {
  if (!existsSync(folder)) return { bytes: null, atLeast: false };
  let bytes = 0;
  let seen = 0;
  const pending = [folder];
  while (pending.length > 0) {
    const dir = pending.pop() as string;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if ((seen += 1) > maxEntries) return { bytes, atLeast: true };
      const stat = await lstat(path.join(dir, name)).catch(() => null);
      if (!stat) continue;
      bytes += stat.size;
      if (stat.isDirectory()) pending.push(path.join(dir, name));
    }
  }
  return { bytes, atLeast: false };
}
