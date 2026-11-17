import { registerEnvironmentKind } from './kind';

/** What every session had before there were kinds: it works in the folder it was started in, with nothing between. */
registerEnvironmentKind({
  kind: 'full',
  title: 'In the folder itself',
  words: 'Works in your own folder, on your own files. Nothing keeps it apart from other terminals in the same folder.',
  nothingPrepared: true,
  offer: async () => ({ available: true, reason: null, notes: [] }),
  prepare: async ({ folder }) => ({ projectFolder: folder, folder, startFolder: folder, branch: null, startCommit: null }),
  changes: async () => ({ changed: 0, added: 0, removed: 0, commits: 0, uncommitted: 0, files: [], filesCut: false, onBranch: null, note: null }),
  difference: async (_environment, file) => ({ file: file.path, state: file.state, text: '', cut: false, notDrawn: 'Nothing is kept track of for a terminal that works in the folder itself.' }),
  broken: async () => null,
  endings: async () => [],
  end: async () => ({ removed: true, says: 'There was nothing to remove.' }),
  cleanUp: async () => {},
  size: async () => ({ bytes: null, atLeast: false }),
});
