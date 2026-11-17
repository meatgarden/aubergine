import { describe, expect, it } from 'vitest';
import { COPY_BRANCH, COPY_NAME, bytesWords, copyNames, countsWords, plainSlug, shortPart, whereWords, type EnvironmentDetail, type SessionEnvironment } from './environment';

const ID = '01900000-0000-7000-8000-0000009a1b2c';

describe('the names made for a working copy', () => {
  it('are made from letters, digits and dashes, whatever the session is called', () => {
    const names = ['Fix the retry', 'a/b/../c', '...', '-rf --force', 'tab\there\nand a line', 'x'.repeat(200), 'ünïcödé ✓', '', '   ', '\u0000\u001b[2J', '$(rm -rf ~)', '`id`', 'refs/heads/main', 'HEAD', '@{-1}', 'a..b', 'ends.lock', 'white space‮turned'];
    for (const name of names) {
      const made = copyNames(name, ID);
      expect(made.folder, JSON.stringify(name)).toMatch(COPY_NAME);
      expect(made.branch, JSON.stringify(name)).toMatch(COPY_BRANCH);
      expect(made.branch).toBe(`aubergine/${made.folder}`);
      expect(made.folder.length).toBeLessThanOrEqual(47);
      expect(made.folder).not.toMatch(/[^a-z0-9-]/);
    }
    expect(copyNames('Fix the retry', ID).folder).toBe('fix-the-retry-9a1b2c');
    expect(copyNames('-rf --force', ID).folder).toBe('rf-force-9a1b2c');
    expect(copyNames('...', ID).folder).toBe('terminal-9a1b2c');
    expect(plainSlug('ünïcödé ✓')).toBe('unicode');
    expect(plainSlug('x'.repeat(200))).toBe('x'.repeat(40));
  });

  it('differ for two sessions of one name, by the end of an ID', () => {
    expect(copyNames('same', '01900000-0000-7000-8000-000000aaaaaa').folder).not.toBe(copyNames('same', '01900000-0000-7000-8000-000000bbbbbb').folder);
    expect(shortPart(ID)).toBe('9a1b2c');
    expect(shortPart('zz')).toBe('000000');
  });
});

describe('what a session is told about where it works', () => {
  const copy: SessionEnvironment = { id: ID, kind: 'working-copy', title: 'In its own working copy', words: 'Kept apart.', sessionId: ID, sessionName: 'one', projectFolder: '/home/someone/project', folder: '/home/someone/data/copies/one-9a1b2c', startFolder: '/home/someone/data/copies/one-9a1b2c', branch: 'aubergine/one-9a1b2c', startCommit: 'ab12'.repeat(10), createdAt: '2026-05-01T10:00:00.000Z', changes: { changed: 2, added: 1, removed: 0, commits: 1, uncommitted: 1, at: '2026-05-01T10:05:00.000Z' }, broken: null };
  const detail = (environment: SessionEnvironment | null): EnvironmentDetail => ({ kind: environment?.kind ?? 'full', title: environment?.title ?? 'In the folder itself', words: 'x', environment, files: [], filesCut: false, onBranch: null, note: null });

  it('says, for a working copy, where it is, its branch, to commit there, and what to leave alone', () => {
    const text = whereWords(detail(copy));
    expect(text).toContain('This session works in its own working copy.');
    expect(text).toContain('Folder: /home/someone/data/copies/one-9a1b2c');
    expect(text).toContain('Branch: aubergine/one-9a1b2c  (made for this session; it started from commit ab12ab12ab12)');
    expect(text).toContain('Commit it here, on this branch');
    expect(text).toContain('Do not change to another branch here');
    expect(text).toContain("Do not work in /home/someone/project: that is your owner's own checkout");
    expect(text).toContain('Do not merge, rebase or push unless your owner asks');
    expect(text).toContain('Since it started: 2 changed, 1 added, in 1 commit; 1 not committed yet.');
    // Kept apart, and never more than that.
    expect(text).not.toMatch(/sandbox|isolat|locked|secure|\bsafe\b/i);
  });

  it('says so plainly for a session that works in the folder itself, and for a copy that is broken', () => {
    expect(whereWords(detail(null))).toContain('works in the folder it was started in');
    expect(whereWords(detail({ ...copy, broken: 'Its folder is gone.' }))).toContain('It cannot be used as it is: Its folder is gone.\nStop, and tell your owner.');
  });

  it('puts counts and sizes in a few words', () => {
    expect(countsWords({ changed: 0, added: 0, removed: 0 })).toBe('nothing changed');
    expect(countsWords({ changed: 1, added: 0, removed: 2 })).toBe('1 changed, 2 removed');
    expect(bytesWords(512)).toBe('512 B');
    expect(bytesWords(812_000)).toBe('812 kB');
    expect(bytesWords(1_400_000_000)).toBe('1.4 GB');
  });
});
