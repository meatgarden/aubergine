import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEvent, createInitialState, type ChangeEvent } from '@aubergine/shared';
import { ApiError, NotUnderstood, shownLink, targetGeneration } from '../api';
import { NOT_FOLLOWING, takeChange, takeWhole } from '../following';
import { SERVERS_KEY, type LinkedServer } from '../servers';
import { leavingWords, useApp } from '../store';
import { checkLink, linkFailureWords, noAnswerWords, projectsFailureWords } from './linking';

const PAGE = 'http://127.0.0.1:4600';
const cloud: LinkedServer = { id: 'abcd1234', label: 'Cloud', address: 'https://cloud.example.test', credential: 'aubd_made-up-credential', deviceId: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee', addedAt: '2026-06-01T09:00:00.000Z' };

/** A browser's storage, in memory. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

describe('the words of linking', () => {
  it('checks what was typed before anything is sent', () => {
    const fields = { address: 'https://cloud.example.test', label: 'Cloud', code: 'abcde-12345' };
    expect(checkLink(fields, PAGE, [])).toEqual({ ok: true, origin: 'https://cloud.example.test', label: 'Cloud', code: 'ABCDE12345' });
    expect(checkLink({ ...fields, address: 'http://cloud.example.test' }, PAGE, [])).toMatchObject({ ok: false, problem: expect.stringMatching(/https/) });
    expect(checkLink({ ...fields, address: PAGE }, PAGE, [])).toMatchObject({ ok: false, problem: expect.stringMatching(/own server/) });
    expect(checkLink(fields, PAGE, [cloud])).toEqual({ ok: false, problem: 'That server is linked already, as “Cloud”.' });
    expect(checkLink({ ...fields, label: 'two\nlines' }, PAGE, [])).toMatchObject({ ok: false, problem: expect.stringMatching(/one line/) });
    expect(checkLink({ ...fields, code: 'ILOU0-12345' }, PAGE, [])).toMatchObject({ ok: false, problem: expect.stringMatching(/ten letters/) });
  });

  it('says why linking did not work, in one sentence each', () => {
    expect(linkFailureWords(new ApiError(401, 'unauthorized', 'That code did not work.'), PAGE)).toBe('That code did not work.');
    expect(linkFailureWords(new ApiError(429, 'rate_limited', 'Too many', 17), PAGE)).toBe('Too many tries at a code there. Try again in 17 s.');
    // No answer at all: not reachable, or the browser held it back. Both are named, and this page's address is shown again.
    const none = linkFailureWords(new ApiError(0, 'network', 'No answer.'), PAGE);
    expect(none).toBe(noAnswerWords(PAGE));
    expect(none).toContain('not reachable');
    expect(none).toContain(`write ${PAGE} under access.pages`);
    expect(linkFailureWords(new NotUnderstood(), PAGE)).toMatch(/another version of Aubergine/);
  });

  it('gives a server whose projects could not be read one plain line in the menu', () => {
    expect(projectsFailureWords(new ApiError(0, 'network', 'No answer.'))).toBe('Could not be reached just now.');
    expect(projectsFailureWords(new TypeError('Failed to fetch'))).toBe('Could not be reached just now.');
    expect(projectsFailureWords(new ApiError(401, 'unauthorized', 'Missing or wrong credential for a linked page'))).toBe('No longer takes this page’s sign-in. Link it again, or unlink it.');
    expect(projectsFailureWords(new NotUnderstood())).toBe('Runs another version of Aubergine: not shown here.');
  });

  it('says why the own server is shown in place of a linked one', () => {
    expect(leavingWords('Cloud', 'version')).toMatch(/^“Cloud” runs another version of Aubergine/);
    expect(leavingWords('Cloud', 'refused')).toMatch(/no longer takes this page’s sign-in.*Link it again or unlink it/);
    expect(leavingWords('Cloud', 'unreachable')).toBe('“Cloud” could not be reached, so this page’s own server is shown.');
    expect(leavingWords('', 'unknown')).toBe('This browser has no server linked under that address, so this page’s own server is shown.');
  });
});

describe('showing another server', () => {
  beforeEach(() => {
    const storage = memoryStorage();
    storage.setItem(SERVERS_KEY, JSON.stringify([cloud]));
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => {
    useApp.getState().showServer(null);
    vi.unstubAllGlobals();
  });

  it('forgets everything of the server shown before, and nothing of it lands in the next one’s state', () => {
    const own = createInitialState(new Date('2026-06-01T09:00:00.000Z'));
    const canvasId = own.canvases[0]!.id;
    const rename: ChangeEvent = { type: 'canvas.updated', canvasId, changes: { name: 'Renamed on the own server' } };
    // The own server is followed, and a change of it waits for a whole state that has not come yet.
    let following = takeWhole(NOT_FOLLOWING, own, 'own epoch', 0);
    following = takeChange(following, rename, 3);
    useApp.setState({ following, whole: following.whole, app: following.whole, canvasId, selected: 'x', focus: { sessionId: 'x', tick: 1 }, drawer: { section: 'terminals', kind: 'notes', id: 'x' }, panel: 'tokens', viewingRun: 'r', closing: 'x', show: { sessionId: 'x', tick: 1 } });
    const before = targetGeneration();

    useApp.getState().showServer(cloud.id);
    const now = useApp.getState();
    expect(now.server).toBe(cloud.id);
    expect(shownLink()).toBe(cloud.id);
    expect(targetGeneration()).toBe(before + 1);
    expect(now.following).toBe(NOT_FOLLOWING);
    expect([now.whole, now.app, now.canvasId, now.selected, now.focus, now.drawer, now.panel, now.viewingRun, now.closing, now.show]).toEqual([null, null, null, null, null, null, null, null, null, null]);
    expect(now.phase).toBe('loading');
    expect(now.here).toBe(false);

    // The linked server's own whole state: what waited from the own server is not applied to it.
    const linked = createInitialState(new Date('2026-06-02T09:00:00.000Z'));
    const taken = takeWhole(now.following, linked, 'linked epoch', 1);
    expect(taken.whole).toBe(linked);
    expect(taken.whole?.canvases.map((c) => c.name)).toEqual(linked.canvases.map((c) => c.name));
    expect(applyEvent(own, rename).canvases[0]!.name).toBe('Renamed on the own server');
  });

  it('shows the own server, and says so, for a name this browser does not know', () => {
    useApp.getState().showServer('zzzz0000');
    expect(useApp.getState().server).toBeNull();
    expect(useApp.getState().said?.text).toBe(leavingWords('', 'unknown'));
  });
});
