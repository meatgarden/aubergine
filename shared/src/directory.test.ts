import { describe, expect, it } from 'vitest';
import { MAX_DIRECTORY_BYTES, MAX_DIRECTORY_SERVERS, byOrganization, directoryAddressProblem, readDirectory } from './directory';

const file = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    aubergineDirectory: 1,
    name: 'Example Works',
    servers: [
      {
        label: 'Payments build',
        address: 'https://payments.example.test',
        organization: 'Payments',
        note: 'Ask the platform team for a code.',
      },
      { label: 'Shared', address: 'https://shared.example.test/' },
      {
        label: 'Payments review',
        address: 'https://review.example.test:8443',
        organization: 'Payments',
      },
      {
        label: 'Search',
        address: 'https://search.example.test',
        organization: 'Search',
      },
    ],
    ...over,
  });

describe('a directory file', () => {
  it('is read into servers with their origins', () => {
    const read = readDirectory(file());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.directory.name).toBe('Example Works');
    expect(read.directory.servers).toEqual([
      {
        label: 'Payments build',
        address: 'https://payments.example.test',
        organization: 'Payments',
        note: 'Ask the platform team for a code.',
      },
      {
        label: 'Shared',
        address: 'https://shared.example.test',
        organization: null,
        note: null,
      },
      {
        label: 'Payments review',
        address: 'https://review.example.test:8443',
        organization: 'Payments',
        note: null,
      },
      {
        label: 'Search',
        address: 'https://search.example.test',
        organization: 'Search',
        note: null,
      },
    ]);
  });

  it('leaves out what it does not know', () => {
    const read = readDirectory(
      file({
        later: { anything: true },
        servers: [
          {
            label: 'One',
            address: 'https://one.example.test',
            credential: 'made-up',
            code: 'AAAAA-AAAAA',
          },
        ],
      }),
    );
    expect(read).toEqual({
      ok: true,
      directory: {
        name: 'Example Works',
        servers: [
          {
            label: 'One',
            address: 'https://one.example.test',
            organization: null,
            note: null,
          },
        ],
      },
    });
  });

  it('is refused whole, with a sentence, when anything in it is wrong', () => {
    const one = (server: unknown): string =>
      file({
        servers: [{ label: 'Good', address: 'https://good.example.test' }, server],
      });
    const wrong: unknown[] = [
      undefined,
      42,
      '',
      'not json',
      '[]',
      'null',
      file({ aubergineDirectory: 2 }),
      file({ aubergineDirectory: '1' }),
      file({ name: '' }),
      file({ name: 'two\nlines' }),
      file({ name: 'turned ‮ round' }),
      file({ servers: 'none' }),
      file({
        servers: Array.from({ length: MAX_DIRECTORY_SERVERS + 1 }, (_, i) => ({
          label: `S${i}`,
          address: `https://s${i}.example.test`,
        })),
      }),
      one(null),
      one({ address: 'https://nameless.example.test' }),
      one({ label: 'A bell \u0007', address: 'https://bell.example.test' }),
      one({ label: 'Path', address: 'https://path.example.test/a' }),
      one({ label: 'Query', address: 'https://query.example.test/?a=1' }),
      one({
        label: 'Someone',
        address: 'https://someone:secret@user.example.test',
      }),
      one({ label: 'Plain', address: 'http://plain.example.test' }),
      one({ label: 'Script', address: 'javascript:alert(1)' }),
      one({ label: 'Twice', address: 'https://good.example.test/' }),
      one({
        label: 'Note',
        address: 'https://note.example.test',
        note: 'two\nlines',
      }),
      one({
        label: 'Organization',
        address: 'https://org.example.test',
        organization: 7,
      }),
      `"${'a'.repeat(MAX_DIRECTORY_BYTES)}"`,
    ];
    for (const text of wrong) {
      const read = readDirectory(text);
      expect(read.ok, String(text).slice(0, 80)).toBe(false);
      if (!read.ok) expect(read.problem).toMatch(/\.$/);
    }
  });

  it('never repeats a password in a refusal', () => {
    const read = readDirectory(
      file({
        servers: [
          {
            label: 'Someone',
            address: 'https://someone:made-up-secret@user.example.test',
          },
        ],
      }),
    );
    expect(JSON.stringify(read)).not.toContain('made-up-secret');
  });

  it('takes plain http only on this computer', () => {
    const read = readDirectory(file({ servers: [{ label: 'Here', address: 'http://127.0.0.1:4700' }] }));
    expect(read.ok).toBe(true);
  });
});

describe('where a directory may be', () => {
  it('is an https address of a file', () => {
    expect(directoryAddressProblem(' https://example.test/aubergine-directory.json ')).toEqual({
      ok: true,
      address: 'https://example.test/aubergine-directory.json',
    });
    expect(directoryAddressProblem('http://127.0.0.1:4700/directory.json').ok).toBe(true);
    expect(directoryAddressProblem('http://localhost:4700/directory.json').ok).toBe(true);
  });

  it('is nothing else', () => {
    for (const value of [
      null,
      7,
      '',
      'directory.json',
      '/directory.json',
      'http://example.test/d.json',
      'https://someone@example.test/d.json',
      'https://someone:secret@example.test/d.json',
      'https://example.test/d.json?token=made-up',
      'https://example.test/d.json#x',
      'https://example.test/a b.json',
      'file:///etc/hosts',
      'javascript:alert(1)',
      'data:application/json,{}',
      'https://',
      `https://example.test/${'a'.repeat(500)}`,
    ]) {
      expect(directoryAddressProblem(value).ok, String(value)).toBe(false);
    }
  });
});

describe('a directory by organization', () => {
  it('keeps the file’s order, with the servers of no organization last', () => {
    const read = readDirectory(
      file({
        servers: [{ label: 'Loose', address: 'https://loose.example.test' }, ...(JSON.parse(file()) as { servers: unknown[] }).servers],
      }),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(byOrganization(read.directory).map((g) => [g.organization, g.servers.map((s) => s.label)])).toEqual([
      ['Payments', ['Payments build', 'Payments review']],
      ['Search', ['Search']],
      [null, ['Loose', 'Shared']],
    ]);
  });
});

describe('a directory that asks who you are', () => {
  const AT = 'https://lists.example.test/aubergine-directory.json';
  const PAGE = 'http://127.0.0.1:4600';
  const REQUEST = 'abcdefgh12345678';
  const offer = (signIn: unknown, over: Record<string, unknown> = {}): string => JSON.stringify({ aubergineDirectory: 1, signIn, ...over });

  it('says where its sign-in page is, at its own origin', async () => {
    const { readSignInOffer } = await import('./directory');
    expect(readSignInOffer(offer('https://lists.example.test/sign-in'), AT)).toBe('https://lists.example.test/sign-in');
    expect(readSignInOffer(offer('https://lists.example.test/sign-in', { error: 'sign_in_needed', later: 1 }), AT)).toBe('https://lists.example.test/sign-in');
    for (const wrong of [
      undefined,
      '',
      'not json',
      '{"error":"sign_in_needed"}',
      offer('https://elsewhere.example.test/sign-in'),
      offer('https://lists.example.test:8443/sign-in'),
      offer('http://lists.example.test/sign-in'),
      offer('https://someone@lists.example.test/sign-in'),
      offer('https://lists.example.test/sign-in?next=https://elsewhere.example.test'),
      offer('https://lists.example.test/sign-in#x'),
      offer('javascript:alert(1)'),
      offer('/sign-in'),
      offer(7),
      offer('https://lists.example.test/sign-in', { aubergineDirectory: 2 }),
      `{"aubergineDirectory":1,"signIn":"https://lists.example.test/${'a'.repeat(5000)}"}`,
    ]) {
      expect(readSignInOffer(wrong, AT), String(wrong).slice(0, 90)).toBeNull();
    }
  });

  it('opens the window with the page’s origin and the name of the try, and nothing else', async () => {
    const { signInWindowAddress } = await import('./directory');
    expect(signInWindowAddress('https://lists.example.test/sign-in', PAGE, REQUEST)).toBe(`https://lists.example.test/sign-in?page=${encodeURIComponent(PAGE)}&request=${REQUEST}`);
    expect(signInWindowAddress('https://lists.example.test/sign-in?x=1', PAGE, REQUEST)).toBeNull();
    expect(signInWindowAddress('javascript:alert(1)', PAGE, REQUEST)).toBeNull();
    expect(signInWindowAddress('https://lists.example.test/sign-in', `${PAGE}/c/1`, REQUEST)).toBeNull();
    expect(signInWindowAddress('https://lists.example.test/sign-in', 'http://plain.example.test', REQUEST)).toBeNull();
    expect(signInWindowAddress('https://lists.example.test/sign-in', PAGE, 'short')).toBeNull();
    expect(signInWindowAddress('https://lists.example.test/sign-in', PAGE, `${REQUEST}&page=https://elsewhere.example.test`)).toBeNull();
  });

  it('takes a token only from a message for this very try', async () => {
    const { MAX_DIRECTORY_TOKEN, readSignedIn } = await import('./directory');
    const token = 'made-up-token-0123456789';
    expect(readSignedIn({ aubergineDirectory: 1, request: REQUEST, token }, REQUEST)).toBe(token);
    expect(readSignedIn({ aubergineDirectory: 1, request: REQUEST, token, later: true }, REQUEST)).toBe(token);
    for (const wrong of [
      null,
      token,
      { request: REQUEST, token },
      { aubergineDirectory: 2, request: REQUEST, token },
      { aubergineDirectory: 1, request: 'zzzzzzzz12345678', token },
      { aubergineDirectory: 1, token },
      { aubergineDirectory: 1, request: REQUEST },
      { aubergineDirectory: 1, request: REQUEST, token: 'short' },
      { aubergineDirectory: 1, request: REQUEST, token: 'with a space in it, long enough' },
      { aubergineDirectory: 1, request: REQUEST, token: 'two\nlines-0123456789abcdef' },
      { aubergineDirectory: 1, request: REQUEST, token: 'a'.repeat(MAX_DIRECTORY_TOKEN + 1) },
      { aubergineDirectory: 1, request: REQUEST, token: 7 },
    ]) {
      expect(readSignedIn(wrong, REQUEST), JSON.stringify(wrong)?.slice(0, 90)).toBeNull();
    }
    expect(readSignedIn({ aubergineDirectory: 1, request: '', token }, '')).toBeNull();
  });
});
