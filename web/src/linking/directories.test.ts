import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDirectory } from '@aubergine/shared';
import { ApiError, directoryTextAt } from '../api';
import type { LinkedServer } from '../servers';
import { MAX_DIRECTORIES, checkDirectory, directoryFailureWords, directoryRows, fetchDirectory, readDirectories, removeDirectory } from './directories';

const PAGE = 'http://127.0.0.1:4600';
const WHERE = 'https://lists.example.test/aubergine-directory.json';
const at = '2026-06-01T09:00:00.000Z';
const text = JSON.stringify({
  aubergineDirectory: 1,
  name: 'Example Works',
  servers: [
    {
      label: 'Payments build',
      address: 'https://payments.example.test',
      organization: 'Payments',
    },
    { label: 'This one', address: PAGE, organization: 'Payments' },
    { label: 'Loose', address: 'https://loose.example.test' },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe('the directories this browser keeps', () => {
  it('are read tolerantly', () => {
    expect(readDirectories(null)).toEqual([]);
    expect(readDirectories('not json')).toEqual([]);
    expect(readDirectories('{}')).toEqual([]);
    const kept = readDirectories(JSON.stringify([{ address: WHERE, addedAt: at }, { address: WHERE, addedAt: at }, { address: 'http://plain.example.test/d.json', addedAt: at }, { address: 'https://x.example.test/d.json?token=made-up', addedAt: at }, { address: WHERE }, 7, null]));
    expect(kept).toEqual([{ address: WHERE, addedAt: at }]);
    const many = Array.from({ length: 9 }, (_, i) => ({
      address: `https://lists.example.test/${i}.json`,
      addedAt: at,
    }));
    expect(readDirectories(many)).toHaveLength(MAX_DIRECTORIES);
  });

  it('check an address before anything is asked', () => {
    expect(checkDirectory(` ${WHERE} `, [])).toEqual({
      ok: true,
      address: WHERE,
    });
    expect(checkDirectory('lists.example.test', []).ok).toBe(false);
    expect(checkDirectory(WHERE, [{ address: WHERE, addedAt: at }])).toEqual({
      ok: false,
      problem: 'That directory is here already.',
    });
    const full = Array.from({ length: MAX_DIRECTORIES }, (_, i) => ({
      address: `https://lists.example.test/${i}.json`,
      addedAt: at,
    }));
    expect(checkDirectory(WHERE, full).ok).toBe(false);
    expect(removeDirectory(full, full[0]!.address)).toHaveLength(MAX_DIRECTORIES - 1);
  });
});

describe('a directory’s rows', () => {
  it('say what this browser knows of each address', () => {
    const read = readDirectory(text);
    if (!read.ok) throw new Error(read.problem);
    const linked: LinkedServer = {
      id: 'abcd1234',
      label: 'Pay',
      address: 'https://payments.example.test',
      credential: 'aubd_made-up-credential',
      deviceId: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
      addedAt: at,
    };
    const groups = directoryRows(read.directory, [linked], PAGE);
    expect(groups.map((g) => g.organization)).toEqual(['Payments', null]);
    expect(groups[0]!.rows.map((r) => [r.server.label, r.host, r.linkedAs, r.own])).toEqual([
      ['Payments build', 'payments.example.test', 'Pay', false],
      ['This one', '127.0.0.1:4600', null, true],
    ]);
    // A row carries nothing of the linked server but what it is called here.
    expect(JSON.stringify(groups)).not.toContain('made-up-credential');
  });
});

describe('asking for a directory', () => {
  it('sends nothing of this browser, follows no redirect, and reads what comes', async () => {
    const fetched = vi.fn(async (_url: string, _init: RequestInit) => new Response(text, { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    vi.stubGlobal('location', { origin: PAGE });
    const known = await fetchDirectory(WHERE);
    expect(known.state).toBe('read');
    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0]!;
    expect(url).toBe(WHERE);
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['accept']);
    expect(init.body).toBeUndefined();
  });

  it('says one sentence for a file that is wrong, too large, missing or not answered', async () => {
    vi.stubGlobal('location', { origin: PAGE });
    vi.stubGlobal('fetch', async () => new Response('{"aubergineDirectory":1}', { status: 200 }));
    expect(await fetchDirectory(WHERE)).toMatchObject({
      state: 'failed',
      words: expect.stringContaining('not a directory'),
    });
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }));
    expect(await fetchDirectory(WHERE)).toEqual({
      state: 'failed',
      words: 'The directory’s address answered 404, not a file.',
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchDirectory(WHERE)).toMatchObject({
      state: 'failed',
      words: expect.stringContaining(`Access-Control-Allow-Origin for ${PAGE}`),
    });
    vi.stubGlobal('fetch', async () => new Response('x'.repeat(50), { status: 200 }));
    await expect(directoryTextAt(WHERE, 10)).rejects.toMatchObject({
      status: 413,
    });
    expect(directoryFailureWords(new ApiError(413, 'too_large', 'Too large.'), PAGE)).toBe('That directory is too large to read.');
  });
});

describe('a directory that asks who you are', () => {
  const SIGN_IN = 'https://lists.example.test/sign-in';
  const TOKEN = 'made-up-token-0123456789';
  const asks = (): Response => new Response(JSON.stringify({ aubergineDirectory: 1, signIn: SIGN_IN }), { status: 401 });

  /** A window of the page's, with what it was asked to open and a way to send it a message. */
  function fakeWindow(opens = true) {
    const listeners = new Set<(event: MessageEvent) => void>();
    const opened = { closed: false, close: vi.fn(() => void (opened.closed = true)) };
    const window = {
      open: vi.fn((_href: string, _target: string, _features: string) => (opens ? opened : null)),
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => void listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => void listeners.delete(listener),
      setInterval: (run: () => void, ms: number) => setInterval(run, ms),
      clearInterval: (timer: ReturnType<typeof setInterval>) => clearInterval(timer),
    };
    const say = (origin: string, source: unknown, data: unknown): void => {
      for (const listener of [...listeners]) listener({ origin, source, data } as MessageEvent);
    };
    return { window, opened, say, listening: () => listeners.size };
  }
  const requestOf = (fake: ReturnType<typeof fakeWindow>): string => new URL(fake.window.open.mock.calls[0]![0]).searchParams.get('request') ?? '';

  it('is said to ask, with where to sign in, and nothing is sent that was not given', async () => {
    const { fetchDirectory: fetchIt, forgetDirectoryToken } = await import('./directories');
    forgetDirectoryToken(WHERE);
    const fetched = vi.fn(async (_url: string, _init: RequestInit) => asks());
    vi.stubGlobal('fetch', fetched);
    vi.stubGlobal('location', { origin: PAGE });
    expect(await fetchIt(WHERE)).toEqual({ state: 'asks', signIn: SIGN_IN, again: false });
    expect(Object.keys(fetched.mock.calls[0]![1].headers as Record<string, string>)).toEqual(['accept']);
    // A 401 that names a sign-in somewhere else, or none: it asks, and this page does not know how.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ aubergineDirectory: 1, signIn: 'https://elsewhere.example.test/sign-in' }), { status: 401 }));
    expect(await fetchIt(WHERE)).toEqual({ state: 'asks', signIn: null, again: false });
    vi.stubGlobal('fetch', async () => new Response('{"error":"sign_in_needed"}', { status: 401 }));
    expect(await fetchIt(WHERE)).toEqual({ state: 'asks', signIn: null, again: false });
  });

  it('takes a token only from the window it opened, at the directory’s origin, for this try, and sends it to that directory alone', async () => {
    const { fetchDirectory: fetchIt, forgetDirectoryToken, holdsDirectoryToken, signInToDirectory } = await import('./directories');
    forgetDirectoryToken(WHERE);
    const fake = fakeWindow();
    vi.stubGlobal('window', fake.window);
    vi.stubGlobal('location', { origin: PAGE });
    const ended = signInToDirectory(WHERE, SIGN_IN);
    expect(fake.window.open).toHaveBeenCalledTimes(1);
    const [href, target, features] = fake.window.open.mock.calls[0]!;
    const opened = new URL(href);
    expect(`${opened.origin}${opened.pathname}`).toBe(SIGN_IN);
    expect([...opened.searchParams.keys()]).toEqual(['page', 'request']);
    expect(opened.searchParams.get('page')).toBe(PAGE);
    expect(target).toBe('_blank');
    expect(features).toContain('popup');
    const request = requestOf(fake);
    expect(request).toMatch(/^[a-z0-9]{24}$/);
    const message = { aubergineDirectory: 1, request, token: TOKEN };
    // From another origin, from another window, for another try, or not a token: not listened to.
    fake.say('https://elsewhere.example.test', fake.opened, message);
    fake.say(PAGE, fake.opened, message);
    fake.say('https://lists.example.test', {}, message);
    fake.say('https://lists.example.test', fake.opened, { ...message, request: 'zzzzzzzzzzzzzzzzzzzzzzzz' });
    fake.say('https://lists.example.test', fake.opened, { ...message, token: 'short' });
    expect(holdsDirectoryToken(WHERE)).toBe(false);
    fake.say('https://lists.example.test', fake.opened, message);
    expect(await ended).toBe('signed-in');
    expect(holdsDirectoryToken(WHERE)).toBe(true);
    expect(fake.opened.close).toHaveBeenCalled();
    expect(fake.listening()).toBe(0);

    // Sent as a bearer when that directory is read, and to no other address.
    const fetched = vi.fn(async (_url: string, _init: RequestInit) => new Response(text, { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    expect((await fetchIt(WHERE)).state).toBe('read');
    expect((fetched.mock.calls[0]![1].headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(fetched.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    await fetchIt('https://lists.example.test/another.json');
    await fetchIt('https://elsewhere.example.test/aubergine-directory.json');
    for (const call of fetched.mock.calls.slice(1)) expect(Object.keys(call[1].headers as Record<string, string>)).toEqual(['accept']);
    // Nowhere this browser keeps things.
    expect(JSON.stringify(readDirectories(JSON.stringify([{ address: WHERE, addedAt: at }])))).not.toContain(TOKEN);

    // No longer taken: it is forgotten, and the page says to sign in again.
    vi.stubGlobal('fetch', async () => asks());
    expect(await fetchIt(WHERE)).toEqual({ state: 'asks', signIn: SIGN_IN, again: true });
    expect(holdsDirectoryToken(WHERE)).toBe(false);
    expect(await fetchIt(WHERE)).toEqual({ state: 'asks', signIn: SIGN_IN, again: false });
  });

  it('says so when no window opened, when it was closed, and when the sign-in is not the directory’s own', async () => {
    const { holdsDirectoryToken, forgetDirectoryToken, signInEndedWords, signInToDirectory } = await import('./directories');
    forgetDirectoryToken(WHERE);
    vi.stubGlobal('location', { origin: PAGE });
    const blocked = fakeWindow(false);
    vi.stubGlobal('window', blocked.window);
    expect(await signInToDirectory(WHERE, SIGN_IN)).toBe('blocked');
    const elsewhere = fakeWindow();
    vi.stubGlobal('window', elsewhere.window);
    expect(await signInToDirectory(WHERE, 'https://elsewhere.example.test/sign-in')).toBe('refused');
    expect(await signInToDirectory(WHERE, 'javascript:alert(1)')).toBe('refused');
    expect(elsewhere.window.open).not.toHaveBeenCalled();
    vi.useFakeTimers();
    try {
      const closing = fakeWindow();
      vi.stubGlobal('window', closing.window);
      const ended = signInToDirectory(WHERE, SIGN_IN);
      closing.opened.closed = true;
      await vi.advanceTimersByTimeAsync(600);
      expect(await ended).toBe('closed');
      expect(closing.listening()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    expect(holdsDirectoryToken(WHERE)).toBe(false);
    for (const ended of ['blocked', 'closed', 'refused'] as const) expect(signInEndedWords(ended)).toMatch(/\.$/);
  });
});
