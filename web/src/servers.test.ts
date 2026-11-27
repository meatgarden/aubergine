import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from '@aubergine/shared';
import { MAX_SERVERS, PAGE_SETTINGS, addServer, findByAddress, findServer, hostOf, newLinkId, readServers, removeServer, renameServer, serverAddressProblem, withPageSettings, type LinkedServer } from './servers';

const one: LinkedServer = {
  id: 'abcd1234',
  label: 'Cloud',
  address: 'https://aubergine.example.test',
  credential: 'aubd_made-up-credential',
  deviceId: '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
  addedAt: '2026-06-01T09:00:00.000Z',
};
const two: LinkedServer = { ...one, id: 'wxyz9876', label: 'Other', address: 'http://127.0.0.1:4700', deviceId: '0190aaaa-bbbb-7ccc-8ddd-ffffffffffff' };

describe('where a server may be', () => {
  it('is an origin: https, or plain http on this computer’s own names', () => {
    expect(serverAddressProblem('https://aubergine.example.test')).toEqual({ ok: true, origin: 'https://aubergine.example.test' });
    expect(serverAddressProblem(' https://Aubergine.Example.test/ ')).toEqual({ ok: true, origin: 'https://aubergine.example.test' });
    expect(serverAddressProblem('http://127.0.0.1:4700')).toEqual({ ok: true, origin: 'http://127.0.0.1:4700' });
    expect(serverAddressProblem('http://localhost:4700')).toEqual({ ok: true, origin: 'http://localhost:4700' });
  });

  it('refuses anything else, with a sentence', () => {
    for (const bad of ['http://aubergine.example.test', 'https://user:pass@aubergine.example.test', 'https://aubergine.example.test/path', 'https://aubergine.example.test/?q', 'javascript:alert(1)', 'file:///etc/passwd', 'aubergine.example.test', '', 42, null]) {
      const checked = serverAddressProblem(bad);
      expect(checked.ok, String(bad)).toBe(false);
      if (!checked.ok) expect(checked.problem).toMatch(/https/);
    }
  });
});

describe('the list as stored', () => {
  it('reads what was written', () => {
    expect(readServers(JSON.stringify([one, two]))).toEqual([one, two]);
  });

  it('is no list where what is stored is not one, and never throws', () => {
    for (const raw of [null, undefined, '', 'not json', '{"id":"abcd1234"}', '42', 'null', '[1,2,3]', '[null]', { length: 1 }]) {
      expect(readServers(raw)).toEqual([]);
    }
  });

  it('drops every entry that is wrong in any way, and keeps the others', () => {
    const hostile = [
      { ...one, id: 'ABCD1234' },
      { ...one, id: '../../x' },
      { ...one, id: 'abcd123' },
      { ...one, label: '' },
      { ...one, label: 'two\nlines' },
      { ...one, label: 'turns ‮ round' },
      { ...one, address: 'http://aubergine.example.test' },
      { ...one, address: 'https://aubergine.example.test/' },
      { ...one, address: 'https://x@aubergine.example.test' },
      { ...one, credential: 'aubt_an-api-token' },
      { ...one, credential: 'aubd_with a space' },
      { ...one, credential: 42 },
      { ...one, deviceId: 'not-an-id' },
      { ...one, addedAt: 'yesterday' },
      { ...one, credential: undefined },
    ];
    expect(readServers([...hostile, two])).toEqual([two]);
  });

  it('keeps the first of two with one name or one address', () => {
    expect(readServers([one, { ...two, id: one.id }])).toEqual([one]);
    expect(readServers([one, { ...two, address: one.address }])).toEqual([one]);
  });

  it('keeps only what it knows of an entry', () => {
    expect(readServers([{ ...one, extra: '<script>' }])).toEqual([one]);
  });

  it('is bounded', () => {
    const many = Array.from({ length: MAX_SERVERS + 5 }, (_, i) => ({ ...one, id: `server${String(i).padStart(2, '0')}`, address: `https://s${i}.example.test` }));
    expect(readServers(many)).toHaveLength(MAX_SERVERS);
  });
});

describe('changing the list', () => {
  it('adds one that passes, and refuses one whose name or address is there, or that is wrong', () => {
    expect(addServer([one], two)).toEqual([one, two]);
    expect(addServer([one], { ...two, id: one.id })).toEqual([one]);
    expect(addServer([one], { ...two, address: one.address })).toEqual([one]);
    expect(addServer([one], { ...two, credential: 'nope' })).toEqual([one]);
  });

  it('removes, renames and finds by name and by address', () => {
    expect(removeServer([one, two], one.id)).toEqual([two]);
    expect(renameServer([one, two], two.id, 'Renamed')).toEqual([one, { ...two, label: 'Renamed' }]);
    expect(renameServer([one], one.id, 'two\nlines')).toEqual([one]);
    expect(findServer([one, two], two.id)).toBe(two);
    expect(findServer([one, two], 'missing1')).toBeNull();
    expect(findServer([one], null)).toBeNull();
    expect(findByAddress([one, two], 'http://127.0.0.1:4700')).toBe(two);
    expect(hostOf(two)).toBe('127.0.0.1:4700');
  });
});

describe('a short name', () => {
  it('is eight lowercase letters and digits, unlike any in the list', () => {
    for (let i = 0; i < 50; i += 1) expect(newLinkId([one, two])).toMatch(/^[a-z0-9]{8}$/);
    // A stand-in for the random bytes: the first try gives a name that is taken, the second does not.
    const tries = [[0, 1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1, 0]];
    let made = 0;
    const random = (bytes: Uint8Array<ArrayBuffer>): Uint8Array => {
      const these = tries[Math.min(made++, 1)]!;
      return bytes.map((_, i) => these[i % 8]!);
    };
    expect(newLinkId([{ ...one, id: 'abcdefgh' }], random)).toBe('hgfedcba');
  });

  it('throws bytes of 252 and over away, so that no character comes up more often', () => {
    const random = (bytes: Uint8Array<ArrayBuffer>): Uint8Array => bytes.map((_, i) => (i % 2 === 0 ? 255 : 36 + 1));
    expect(newLinkId([], random)).toBe('bbbbbbbb');
  });
});

describe('what is about the page itself', () => {
  it('is the own server’s, and everything else is the server shown’s', () => {
    const own = Settings.parse({ theme: 'light', appearance: { light: 'solarized-light', dark: 'nord', cursor: 'bar', cursorBlink: false, colors: { accent: '#112233' } }, font: { family: 'Own Mono', size: 15 }, shortcuts: { 'canvas.next': 'Mod+J' }, away: { afterMinutes: 1 } });
    const shown = Settings.parse({ theme: 'dark', appearance: { light: 'gruvbox-light', dark: 'dracula', cursor: 'underline', colors: { accent: '#445566' } }, font: { family: 'Shown Mono', size: 11 }, away: { afterMinutes: 99 }, describe: { remind: false } });
    const drawn = withPageSettings(shown, own);
    expect([drawn.theme, drawn.appearance, drawn.font, drawn.shortcuts, drawn.shortcutsInAppWindow]).toEqual([own.theme, own.appearance, own.font, own.shortcuts, own.shortcutsInAppWindow]);
    // Every setting that is about the page is taken from the own server: the list and the function say the same.
    for (const key of PAGE_SETTINGS) expect(drawn[key], key).toEqual(own[key]);
    expect([drawn.away, drawn.describe, drawn.workflows]).toEqual([shown.away, shown.describe, shown.workflows]);
    expect(withPageSettings(DEFAULT_SETTINGS, null)).toBe(DEFAULT_SETTINGS);
    expect(withPageSettings(own, own)).toBe(own);
  });
});
