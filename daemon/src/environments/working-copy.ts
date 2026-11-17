import { existsSync } from 'node:fs';
import path from 'node:path';
import { copyNames, type Ending } from '@aubergine/shared';
import { GitProblem, addCopy, brokenWhy, changesIn, commitsNowhereElse, differenceOf, locate, removeFolder, sizeOf, takeAway, uncommitted } from '../git/copies';
import { registerEnvironmentKind } from './kind';

/**
 * A working copy: a second checkout of the repository the folder is in, in a
 * folder of Aubergine's own, on a branch made for it, starting from the
 * commit the owner has checked out. Two agents with a working copy each do
 * not touch each other's files, and what each changed can be read apart.
 *
 * It keeps work apart and is nothing more: the agent runs as the owner and
 * can reach every file the owner can, the owner's checkout included.
 */

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

registerEnvironmentKind({
  kind: 'working-copy',
  title: 'In its own working copy',
  words: 'Kept apart: its own copy of the files, on its own branch. Not a lock: it runs as you and can still reach your other files.',

  offer: async (folder) => {
    const found = await locate(folder);
    if (!found.ok) return { available: false, reason: found.reason, notes: [] };
    const notes = [`It starts from the commit your checkout is on${found.at.branch ? ` (${found.at.branch})` : ''}, on a new branch of its own.`];
    const mine = await uncommitted(found.at.root).catch(() => null);
    const count = mine ? mine.tracked + mine.untracked : 0;
    if (count > 0) notes.push(`${plural(count, 'file in your checkout has', 'files in your checkout have')} changes that are in no commit. They are not carried over, and they are not touched: commit them first if the new terminal should have them.`);
    notes.push('Files Git ignores or does not track are not in a new working copy: installed dependencies, local settings, environment files. A project that needs an install step needs it again there.');
    return { available: true, reason: null, notes };
  },

  prepare: async ({ id, folder, sessionName, keptIn }) => {
    const found = await locate(folder);
    if (!found.ok) throw new GitProblem(found.reason);
    const names = copyNames(sessionName, id);
    const copy = path.join(path.resolve(keptIn), names.folder);
    await addCopy({ root: found.at.root, copiesRoot: keptIn, folder: copy, branch: names.branch, commit: found.at.commit });
    // The same place inside the copy that the owner was in, where the commit has it.
    const inside = path.resolve(copy, found.at.prefix);
    return { projectFolder: found.at.root, folder: copy, startFolder: existsSync(inside) ? inside : copy, branch: names.branch, startCommit: found.at.commit };
  },

  changes: async (environment) => {
    const read = await changesIn(environment.folder, environment.startCommit ?? '');
    const moved = read.onBranch !== environment.branch;
    return { ...read, note: moved ? `It is ${read.onBranch ? `on the branch ${read.onBranch}` : 'on no branch'} now, not on the one made for it (${environment.branch}).` : null };
  },

  difference: (environment, file) => differenceOf(environment.folder, environment.startCommit ?? '', file),

  broken: (environment) => brokenWhy(environment.projectFolder, environment.folder),

  endings: async (environment) => {
    const whole = (await brokenWhy(environment.projectFolder, environment.folder)) === null;
    const forget: Ending = { choice: 'forget', label: 'Forget it', says: 'Aubergine stops listing it. Nothing is removed: what is left of its folder and its branch stays where it is.', available: true, reason: null, asksAgain: null };
    if (!whole) {
      // What is left of it can still be taken away, where the repository is there to ask.
      const commits = existsSync(environment.projectFolder) ? await commitsNowhereElse(environment.projectFolder, environment.folder, environment.branch) : 0;
      const discard: Ending = {
        choice: 'discard',
        label: 'Discard what is left',
        says: 'Removes what is left of its folder, and its branch.',
        available: existsSync(environment.projectFolder),
        reason: existsSync(environment.projectFolder) ? null : 'Its repository cannot be found, so its branch cannot be removed.',
        asksAgain: commits > 0 ? `Its branch holds ${plural(commits, 'commit that is', 'commits that are')} on no other branch. Discarding loses ${commits === 1 ? 'it' : 'them'} for good. Discard anyway?` : null,
      };
      return [forget, discard];
    }
    const pending = await uncommitted(environment.folder);
    const loose = pending.tracked + pending.untracked;
    const commits = await commitsNowhereElse(environment.projectFolder, environment.folder, environment.branch);
    const lost = [commits > 0 ? plural(commits, 'commit that is on no other branch', 'commits that are on no other branch') : '', loose > 0 ? plural(loose, 'file with work that is in no commit', 'files with work that is in no commit') : ''].filter((part) => part !== '');
    return [
      {
        choice: 'keep-branch',
        label: 'Keep the branch, remove the folder',
        says: `The folder goes; the branch ${environment.branch} stays in your repository with every commit on it. Nothing is merged.`,
        available: loose === 0,
        reason: loose === 0 ? null : `${plural(loose, 'file holds', 'files hold')} work that is in no commit, and would be lost with the folder. Commit there first, or keep everything.`,
        asksAgain: null,
      },
      { choice: 'keep', label: 'Keep everything', says: 'The folder and the branch stay as they are. It stays in the list of working copies, where you can decide later.', available: true, reason: null, asksAgain: null },
      {
        choice: 'discard',
        label: 'Discard both',
        says: 'Removes the folder and the branch.',
        available: true,
        reason: null,
        asksAgain: lost.length > 0 ? `This working copy holds ${lost.join(' and ')}. That work exists nowhere else, and discarding loses it for good. Discard anyway?` : null,
      },
    ];
  },

  end: async (environment, choice, keptIn) => {
    if (choice === 'keep-branch') {
      await removeFolder({ root: environment.projectFolder, copiesRoot: keptIn, folder: environment.folder });
      return { removed: true, says: `The folder is removed. The branch ${environment.branch} is in your repository.` };
    }
    if (choice === 'discard') {
      await takeAway({ root: environment.projectFolder, copiesRoot: keptIn, folder: environment.folder, branch: environment.branch });
      return { removed: true, says: 'The folder and the branch are removed.' };
    }
    if (choice === 'forget') return { removed: true, says: 'It is no longer listed. Nothing was removed.' };
    return { removed: false, says: 'Everything is kept.' };
  },

  cleanUp: (environment, keptIn) => takeAway({ root: environment.projectFolder, copiesRoot: keptIn, folder: environment.folder, branch: environment.branch }),

  size: (environment) => sizeOf(environment.folder),
});
