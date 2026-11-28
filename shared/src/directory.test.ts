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
