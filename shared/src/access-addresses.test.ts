import { describe, expect, it } from 'vitest';
import { accessEntries, accessProblem } from './access-addresses';
import { DEVICE_UNUSED_DAYS, PAIRING_ALPHABET, deviceStatus, readPairingCode, showPairingCode } from './devices';
import { Settings } from './settings';

const ok = (kind: 'addresses' | 'pages', value: unknown): string => {
  const checked = accessProblem(kind, value);
  if (!checked.ok) throw new Error(checked.problem);
  return checked.origin;
};
const problem = (kind: 'addresses' | 'pages', value: unknown): string => {
  const checked = accessProblem(kind, value);
  if (checked.ok) throw new Error(`${String(value)} was taken as ${checked.origin}`);
  return checked.problem;
};

describe('an outside address', () => {
  it('is an https origin, tidied as a browser writes it', () => {
    expect(ok('addresses', 'https://aubergine.example.test')).toBe('https://aubergine.example.test');
    expect(ok('addresses', 'https://aubergine.example.test/')).toBe('https://aubergine.example.test');
    // Upper case is tidied away, as a browser does in Origin.
    expect(ok('addresses', 'https://Aubergine.EXAMPLE.test')).toBe('https://aubergine.example.test');
    // A port is part of the origin; the usual one is left out, as in Origin.
    expect(ok('addresses', 'https://aubergine.example.test:8443')).toBe('https://aubergine.example.test:8443');
    expect(ok('addresses', 'https://aubergine.example.test:443')).toBe('https://aubergine.example.test');
    expect(accessProblem('addresses', 'https://aubergine.example.test:8443')).toMatchObject({ host: 'aubergine.example.test:8443' });
    // A name in another script is the name a browser sends: its ASCII form.
    expect(ok('addresses', 'https://bücher.example.test')).toBe('https://xn--bcher-kva.example.test');
  });

  it('is refused with a sentence for anything more or less than an origin', () => {
    expect(problem('addresses', '')).toMatch(/empty/);
    expect(problem('addresses', '   ')).toMatch(/empty/);
    expect(problem('addresses', 42)).toMatch(/every entry is a text/);
    expect(problem('addresses', null)).toMatch(/every entry is a text/);
    expect(problem('addresses', 'aubergine.example.test')).toMatch(/not an address/);
    expect(problem('addresses', 'https://aubergine.example.test/canvas')).toMatch(/has a path/);
    expect(problem('addresses', 'https://aubergine.example.test/?')).toMatch(/query or a fragment/);
    expect(problem('addresses', 'https://aubergine.example.test?x=1')).toMatch(/query or a fragment/);
    expect(problem('addresses', 'https://aubergine.example.test/#pair')).toMatch(/query or a fragment/);
    expect(problem('addresses', 'https://owner:secret@aubergine.example.test')).toMatch(/user name or a password/);
    expect(problem('addresses', 'https://@aubergine.example.test')).toMatch(/user name or a password/);
    expect(problem('addresses', 'http://aubergine.example.test')).toMatch(/not https/);
    expect(problem('addresses', 'ws://aubergine.example.test')).toMatch(/not an https address/);
    expect(problem('addresses', 'https://aubergine.example.test.')).toMatch(/ends its host with a dot/);
    expect(problem('addresses', ' https://aubergine.example.test')).toMatch(/space/);
    expect(problem('addresses', 'https://aubergine.example.test\\x')).toMatch(/backslash/);
    // This computer's own names are where the server already answers, and only from here.
    expect(problem('addresses', 'https://localhost')).toMatch(/this computer's own name/);
    expect(problem('addresses', 'https://127.0.0.1:4600')).toMatch(/this computer's own name/);
    expect(problem('addresses', 'https://[::1]')).toMatch(/this computer's own name/);
    // Every sentence says where it is.
    expect(problem('addresses', 'http://x.example.test')).toMatch(/^access\.addresses: /);
  });

  it('keeps the ones that pass, once each, and says what is wrong with the rest', () => {
    const { entries, problems } = accessEntries('addresses', ['https://a.example.test', 'https://A.example.test/', 'http://b.example.test', 'https://c.example.test']);
    expect(entries.map((entry) => entry.origin)).toEqual(['https://a.example.test', 'https://c.example.test']);
    expect(problems).toHaveLength(1);
  });
});

describe('a page that may show this server', () => {
  it('is https, or plain http only on this computer', () => {
    expect(ok('pages', 'https://laptop.example.test')).toBe('https://laptop.example.test');
    expect(ok('pages', 'http://127.0.0.1:4600')).toBe('http://127.0.0.1:4600');
    expect(ok('pages', 'http://localhost:4600')).toBe('http://localhost:4600');
    expect(problem('pages', 'http://laptop.example.test')).toMatch(/plain http/);
    expect(problem('pages', 'http://127.0.0.1:4600/c/x')).toMatch(/has a path/);
    expect(problem('pages', 'https://a:b@laptop.example.test')).toMatch(/user name/);
  });
});

describe('the settings', () => {
  it('have no outside address unless one is written, and a list that is not a list counts as empty', () => {
    expect(Settings.parse({}).access).toEqual({ addresses: [], pages: [] });
    expect(Settings.parse({ access: { addresses: ['https://a.example.test'] } }).access).toEqual({ addresses: ['https://a.example.test'], pages: [] });
    // The rest of the file still counts.
    expect(Settings.parse({ theme: 'light', access: { addresses: 'https://a.example.test' } })).toMatchObject({ theme: 'light', access: { addresses: [] } });
    expect(Settings.parse({ theme: 'dark', access: 'everyone' })).toMatchObject({ theme: 'dark', access: { addresses: [], pages: [] } });
  });
});

describe('pairing codes and devices', () => {
  it('reads a code with or without its dash, in either case, and nothing else', () => {
    expect(PAIRING_ALPHABET).toHaveLength(32);
    expect(new Set(PAIRING_ALPHABET).size).toBe(32);
    for (const lookalike of 'ILOU') expect(PAIRING_ALPHABET).not.toContain(lookalike);
    expect(showPairingCode('ABCDE12345')).toBe('ABCDE-12345');
    expect(readPairingCode('ABCDE-12345')).toBe('ABCDE12345');
    expect(readPairingCode('abcde12345')).toBe('ABCDE12345');
    expect(readPairingCode(' abcde-12345 ')).toBe('ABCDE12345');
    for (const wrong of ['', 'ABCDE-1234', 'ABCDE123456', 'ABCD-E12345', 'ABCDE-1234O', 'ABCDE--1234', 'ÄBCDE12345']) expect(readPairingCode(wrong), wrong).toBeNull();
  });

  it('says a device is active, revoked, or unused after 90 days', () => {
    const made = '2026-01-01T00:00:00.000Z';
    const day = 24 * 60 * 60 * 1000;
    const at = (days: number): number => Date.parse(made) + days * day;
    expect(deviceStatus({ createdAt: made, lastUsedAt: null, revokedAt: null }, at(1))).toBe('active');
    expect(deviceStatus({ createdAt: made, lastUsedAt: null, revokedAt: null }, at(DEVICE_UNUSED_DAYS) - 1)).toBe('active');
    expect(deviceStatus({ createdAt: made, lastUsedAt: null, revokedAt: null }, at(DEVICE_UNUSED_DAYS) + 1)).toBe('unused');
    expect(deviceStatus({ createdAt: made, lastUsedAt: new Date(at(60)).toISOString(), revokedAt: null }, at(DEVICE_UNUSED_DAYS + 30))).toBe('active');
    expect(deviceStatus({ createdAt: made, lastUsedAt: null, revokedAt: made }, at(1))).toBe('revoked');
  });
});
