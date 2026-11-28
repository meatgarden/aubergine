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
