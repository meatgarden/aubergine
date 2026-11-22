import { describe, expect, it } from 'vitest';
import { aboutDevice, ago, callerWords, countdownWords, deviceWords, devicesInOrder, signInAddress } from './words';

const NOW = Date.parse('2026-06-10T12:00:00.000Z');
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const device = (change: Partial<Parameters<typeof deviceWords>[0]> = {}): Parameters<typeof deviceWords>[0] & { name: string; createdAt: string } => ({
  name: 'Phone',
  kind: 'browser',
  origin: null,
  createdAt: at(3 * DAY),
  lastUsedAt: null,
  revokedAt: null,
  ...change,
});

describe('the words of a device', () => {
  it('says when it was added and when it was last used, or that it never was', () => {
    expect(deviceWords(device(), NOW, false)).toEqual({ name: 'Phone', known: ['added 3 days ago', 'never used'], chip: null, thisDevice: false });
    expect(deviceWords(device({ lastUsedAt: at(5 * MIN) }), NOW, true)).toEqual({ name: 'Phone', known: ['added 3 days ago', 'last used 5 min ago'], chip: null, thisDevice: true });
  });

  it('has a chip only when it no longer works', () => {
    expect(deviceWords(device({ revokedAt: at(MIN) }), NOW, false).chip).toBe('revoked');
    expect(deviceWords(device({ createdAt: at(200 * DAY), lastUsedAt: at(91 * DAY) }), NOW, false).chip).toBe('unused for 90 days');
    expect(deviceWords(device({ createdAt: at(200 * DAY), lastUsedAt: at(89 * DAY) }), NOW, false).chip).toBeNull();
  });

  it('names the host of a page, and nothing that cannot be read as one', () => {
    expect(deviceWords(device({ kind: 'page', origin: 'https://board.example.test' }), NOW, false).known).toEqual(['added 3 days ago', 'never used', 'board.example.test']);
    expect(deviceWords(device({ kind: 'page', origin: 'not an address' }), NOW, false).known).toHaveLength(2);
    expect(deviceWords(device({ kind: 'browser', origin: 'https://x.example.test' }), NOW, false).known).toHaveLength(2);
  });

  it('says how long ago in a few words', () => {
    expect([ago(at(10_000), NOW), ago(at(59 * MIN), NOW), ago(at(3 * 60 * MIN), NOW), ago(at(DAY), NOW), ago(at(40 * DAY), NOW), ago(at(400 * DAY), NOW), ago('never', NOW)]).toEqual([
      'just now',
      '59 min ago',
      '3 h ago',
      'yesterday',
      '40 days ago',
      'over a year ago',
      'at a time not known',
    ]);
  });

  it('lists the ones that work first, newest first', () => {
    const list = [device({ name: 'old', createdAt: at(9 * DAY) }), device({ name: 'gone', createdAt: at(DAY), revokedAt: at(MIN) }), device({ name: 'new', createdAt: at(DAY) })];
    expect(devicesInOrder(list, NOW).map((d) => d.name)).toEqual(['new', 'old', 'gone']);
  });
});

describe('how long a code still works', () => {
  it('counts down in minutes and seconds, and ends in one sentence', () => {
    const expires = new Date(NOW + 3 * MIN).toISOString();
    expect(countdownWords(expires, NOW)).toEqual({ words: 'Works once, for 3:00 more', over: false });
    expect(countdownWords(expires, NOW + 2 * MIN + 55_500)).toEqual({ words: 'Works once, for 0:05 more', over: false });
    expect(countdownWords(expires, NOW + 3 * MIN)).toEqual({ words: 'This code has run out', over: true });
    expect(countdownWords('not a time', NOW).over).toBe(true);
  });

  it('puts the code after the # of an outside address', () => {
    expect(signInAddress('https://aubergine.example.test', 'ABCDEFGHJK')).toBe('https://aubergine.example.test/#pair=ABCDEFGHJK');
    expect(signInAddress('https://aubergine.example.test/', 'ABCDEFGHJK')).toBe('https://aubergine.example.test/#pair=ABCDEFGHJK');
  });
});

describe('who an activity line is by', () => {
  const names: Record<string, string> = { d1: 'Phone' };
  const deviceName = (id: string): string | null => names[id] ?? null;
  const sessionName = (): string | null => 'api';
  type Line = Parameters<typeof callerWords>[0];
  const line = (caller: NonNullable<Line['caller']>, change: Partial<Line> = {}): Line => ({ caller, tokenName: '', byDeviceId: null, fromSessionId: null, ...change });

  it('says the owner, the owner on a device, a device not known, or a sign-in with a code', () => {
    expect(callerWords(line('owner'), deviceName, sessionName)).toBe('Owner');
    expect(callerWords(line('device', { byDeviceId: 'd1' }), deviceName, sessionName)).toBe('Owner, on Phone');
    expect(callerWords(line('device', { byDeviceId: 'gone' }), deviceName, sessionName)).toBe('A device');
    expect(callerWords(line('device'), deviceName, sessionName)).toBe('A device');
    expect(callerWords(line('pairing'), deviceName, sessionName)).toBe('Sign-in with a code');
  });

  it('says what it said before for a token and the command line', () => {
    expect(callerWords(line('token', { tokenName: 'build bot' }), deviceName, sessionName)).toBe('build bot');
    expect(callerWords(line('owner-cli'), deviceName, sessionName)).toBe('you, from the command line');
    expect(callerWords(line('owner-cli', { fromSessionId: 's1' }), deviceName, sessionName)).toBe('you, from the command line (it says: inside “api”)');
  });

  it('names the device a line is about', () => {
    expect(aboutDevice({ deviceId: 'd1', deviceName: 'Tablet' }, deviceName)).toBe('device “Tablet”');
    expect(aboutDevice({ deviceId: 'd1', deviceName: null }, deviceName)).toBe('device “Phone”');
    expect(aboutDevice({ deviceId: 'gone', deviceName: null }, deviceName)).toBe('a device');
    expect(aboutDevice({ deviceId: null, deviceName: null }, deviceName)).toBeNull();
  });
});
