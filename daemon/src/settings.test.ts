import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from '@aubergine/shared';
import { SETTINGS_FILE, SettingsFile, accessReport, webhookReport, appearanceOf, colorProblems, expandHome, loadSettings, shortcutProblems } from './settings';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-settings-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('settings file', () => {
  it('uses defaults when there is no file', async () => {
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads what the file sets and defaults the rest', async () => {
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', font: { size: 15 } }));
    const settings = await loadSettings(dir);
    expect(settings.theme).toBe('light');
    expect(settings.font).toEqual({ ...DEFAULT_SETTINGS.font, size: 15 });
  });

  it('ignores a broken or invalid file with a warning that names the problem', async () => {
    const warnings: string[] = [];
    await writeFile(path.join(dir, SETTINGS_FILE), '{ "theme": ');
    expect(await loadSettings(dir, (m) => warnings.push(m))).toEqual(DEFAULT_SETTINGS);
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'sepia' }));
    expect(await loadSettings(dir, (m) => warnings.push(m))).toEqual(DEFAULT_SETTINGS);
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toContain('theme');
  });

  it('picks up edits on reload and warns once per problem', async () => {
    const warnings: string[] = [];
    const file = new SettingsFile(dir, (m) => warnings.push(m));
    expect((await file.reload()).theme).toBe('system');
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light' }));
    expect((await file.reload()).theme).toBe('light');
    expect(file.value.theme).toBe('light');
    await writeFile(path.join(dir, SETTINGS_FILE), 'nope');
    await file.reload();
    await file.reload();
    expect(warnings).toHaveLength(1);
  });

  it('expands a leading ~', () => {
    expect(expandHome('~')).toBe(os.homedir());
    expect(expandHome('~/work')).toBe(path.join(os.homedir(), 'work'));
    expect(expandHome('/tmp/x')).toBe('/tmp/x');
  });
});

describe('keys in the settings file', () => {
  it('keeps the rest of the file when a key is wrong, and says what is wrong once', async () => {
    const warnings: string[] = [];
    const file = new SettingsFile(dir, (message) => warnings.push(message));
    await writeFile(
      path.join(dir, SETTINGS_FILE),
      JSON.stringify({ theme: 'light', shortcuts: { 'terminal.park': 'N', 'view.fit': 'Hyper+F', 'terminal.rename': 'X' } }),
    );
    const settings = await file.reload();
    expect(settings.theme).toBe('light');
    expect(settings.shortcuts['terminal.rename']).toBe('X');
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).toMatch(/config\.json: N is set for both "terminal.new" and "terminal.park"/);
    expect(warnings.join('\n')).toMatch(/"Hyper\+F" for "view.fit" is not a chord/);

    await file.reload();
    expect(warnings).toHaveLength(2);

    // Fixed, then broken again: it is said again.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ shortcuts: { 'terminal.park': 'X' } }));
    await file.reload();
    expect(warnings).toHaveLength(2);
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ shortcuts: { 'terminal.park': 'N' } }));
    await file.reload();
    expect(warnings).toHaveLength(3);
  });

  it('checks the app-window keys as they apply there', () => {
    const settings = Settings.parse({
      shortcuts: { 'canvas.new': 'Meta+T' },
      shortcutsInAppWindow: { 'canvas.go.1': 'Meta+1', 'canvas.go.2': 'Meta+W', nonsense: 'X' },
    });
    const problems = shortcutProblems(settings, 'mac');
    // Kept in a tab, so reported; free in an app window, so Meta+1 there is not.
    expect(problems.some((p) => /⌘T for "canvas.new" may not reach this page/.test(p))).toBe(true);
    expect(problems.some((p) => /⌘1/.test(p))).toBe(false);
    expect(problems.some((p) => /⌘W for "canvas.go.2" may not reach this page/.test(p))).toBe(true);
    expect(problems.some((p) => /shortcutsInAppWindow: there is no command named "nonsense"/.test(p))).toBe(true);
    expect(shortcutProblems(DEFAULT_SETTINGS, 'mac')).toEqual([]);
    expect(shortcutProblems(DEFAULT_SETTINGS, 'other')).toEqual([]);
  });
});

describe('the theme', () => {
  it('matches the system on a new install, and a file that says dark or light keeps meaning that', async () => {
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(Settings.parse({ theme: 'dark' }).theme).toBe('dark');
    expect(Settings.parse({ theme: 'light' }).theme).toBe('light');
    expect(Settings.safeParse({ theme: 'sepia' }).success).toBe(false);
  });

  it('is written as one key, and everything else in the file is left as it was', async () => {
    const file = new SettingsFile(dir);
    // No file yet: one is made, holding the one key.
    await file.setAppearance({ theme: 'light' });
    expect(JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'))).toEqual({ theme: 'light' });
    expect(file.value.theme).toBe('light');
    // A file of the owner's: what the server does not know, and what it does, stay.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', font: { size: 15 }, desktop: { app: 'command', command: 'made-up {file}' }, somethingOfMine: [1, 2] }));
    await file.setAppearance({ theme: 'system' });
    expect(JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'))).toEqual({ theme: 'system', font: { size: 15 }, desktop: { app: 'command', command: 'made-up {file}' }, somethingOfMine: [1, 2] });
    // A file that cannot be read as settings is not touched.
    await writeFile(path.join(dir, SETTINGS_FILE), 'not json');
    await expect(file.setAppearance({ theme: 'dark' })).rejects.toThrow(/Mend it by hand/);
    expect(await readFile(path.join(dir, SETTINGS_FILE), 'utf8')).toBe('not json');
  });
});

describe('how the page looks', () => {
  const read = async (): Promise<unknown> => JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'));
  const OWNERS = {
    theme: 'light',
    font: { family: 'Mono of mine', size: 15, somethingInFont: true },
    appearance: { light: 'solarized-light', dark: 'nord', cursor: 'bar', cursorBlink: false, colors: { accent: '#aa66cc', '[nord]': { bg: '#101010' } }, laterKey: 'kept' },
    desktop: { app: 'command', command: 'made-up {file}' },
    somethingOfMine: [1, 2],
  };

  it('writes each key alone, and leaves every other key of the file as it was', async () => {
    const file = new SettingsFile(dir);
    const changes = [
      [{ theme: 'dark' }, { theme: 'dark' }],
      [{ light: 'gruvbox-light' }, { appearance: { ...OWNERS.appearance, light: 'gruvbox-light' } }],
      [{ dark: 'dracula' }, { appearance: { ...OWNERS.appearance, dark: 'dracula' } }],
      [{ cursor: 'underline' }, { appearance: { ...OWNERS.appearance, cursor: 'underline' } }],
      [{ cursorBlink: true }, { appearance: { ...OWNERS.appearance, cursorBlink: true } }],
      [{ terminal: 'nord' }, { appearance: { ...OWNERS.appearance, terminal: 'nord' } }],
      [{ terminal: null }, { appearance: { ...OWNERS.appearance, terminal: null } }],
      [{ fontSize: 20 }, { font: { ...OWNERS.font, size: 20 } }],
      [{ fontFamily: 'Fira Code, monospace' }, { font: { ...OWNERS.font, family: 'Fira Code, monospace' } }],
    ] as const;
    for (const [change, differs] of changes) {
      await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify(OWNERS));
      await file.setAppearance(change);
      expect(await read(), JSON.stringify(change)).toEqual({ ...OWNERS, ...differs });
    }
    // Several at once, in one write.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify(OWNERS));
    await file.setAppearance({ theme: 'system', dark: 'dark', fontSize: 9 });
    expect(await read()).toEqual({ ...OWNERS, theme: 'system', appearance: { ...OWNERS.appearance, dark: 'dark' }, font: { ...OWNERS.font, size: 9 } });
    expect(appearanceOf(file.value)).toEqual({ theme: 'system', light: 'solarized-light', dark: 'dark', font: { family: 'Mono of mine', size: 9 }, cursor: 'bar', cursorBlink: false, terminal: null });
  });

  it('makes only what it needs where there is no file or no such part, and writes nothing for a change of nothing', async () => {
    const file = new SettingsFile(dir);
    await file.setAppearance({});
    await expect(readFile(path.join(dir, SETTINGS_FILE), 'utf8')).rejects.toThrow();
    await file.setAppearance({ dark: 'nord' });
    expect(await read()).toEqual({ appearance: { dark: 'nord' } });
    await file.setAppearance({ fontSize: 14 });
    expect(await read()).toEqual({ appearance: { dark: 'nord' }, font: { size: 14 } });
    // A part that is not an object is wrong anyway; it becomes one holding what was sent.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ appearance: 'dark please', font: [1] }));
    await file.setAppearance({ cursor: 'bar', fontFamily: 'Mono' });
    expect(await read()).toEqual({ appearance: { cursor: 'bar' }, font: { family: 'Mono' } });
    // A file that cannot be read is not touched, and a change of nothing does not even look.
    await writeFile(path.join(dir, SETTINGS_FILE), 'not json');
    await expect(file.setAppearance({ light: 'light' })).rejects.toThrow(/Mend it by hand/);
    await file.setAppearance({});
    expect(await readFile(path.join(dir, SETTINGS_FILE), 'utf8')).toBe('not json');
  });

  it('says each wrong color once, also one the schema drops by itself, and nothing of a hostile name but a short plain part', async () => {
    const warnings: string[] = [];
    const file = new SettingsFile(dir, (m) => warnings.push(m));
    const raw = JSON.stringify({ appearance: { colors: { accent: '#AA66CC', nope: '#000000', bg: 'red; }', '[sepia]': {}, '[nord]': { bg: '#12', 'text\u0007\u001b[31m': '#ffffff' } } } }).replace('"nope"', '"__proto__": { "bg": "#000000" }, "nope"');
    await writeFile(path.join(dir, SETTINGS_FILE), raw);
    await file.reload();
    await file.reload();
    expect(warnings, warnings.join("\n")).toHaveLength(6);
    expect(warnings.every((w) => w.includes('config.json: appearance.colors'))).toBe(true);
    expect(warnings.join('\n')).toContain('"__proto__" is not a color that can be set');
    expect([...warnings.join(' ')].every((c) => c >= ' ')).toBe(true);
    expect(colorProblems(JSON.parse(raw))).toHaveLength(6);
    // The colors that are right still count.
    expect(file.value.appearance.colors).toMatchObject({ accent: '#AA66CC' });
    expect(colorProblems({})).toEqual([]);
    expect(colorProblems({ appearance: 'x' })).toEqual([]);
    expect(colorProblems({ appearance: { colors: [1] } })).toEqual(['appearance.colors is not a list of colors by name: it is left out.']);
  });
});

describe('webhooks in the settings', () => {
  it('reports a wrong entry once, in words that repeat neither its address nor its secret, skips it, and never fails the file; the page\'s own writes leave them as they were', async () => {
    const webhooks = [
      { name: 'ops', address: 'https://hooks.example.test/in/PATHKEY-31?key=QUERYKEY-32', secret: 'made-up-secret-0123456789-abcdefghij' },
      { name: 'plain', address: 'http://plain.example.test/in/PATHKEY-33', secret: 'made-up-secret-0123456789-abcdefghij' },
      { name: 'short', address: 'https://hooks.example.test/in', secret: 'SHORTSECRET-34' },
    ];
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', webhooks }));
    const warnings: string[] = [];
    const file = new SettingsFile(dir, (m) => warnings.push(m));
    const settings = await file.reload();
    await file.reload();
    expect(settings.theme).toBe('light');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/webhooks: “plain”: its address is plain http on a host that is not this computer’s own; a webhook elsewhere is https\. It is skipped\.$/);
    expect(warnings[1]).toMatch(/webhooks: “short”: its "secret" is shorter than 32 characters.* It is skipped\.$/);
    for (const never of ['PATHKEY', 'QUERYKEY', 'SHORTSECRET', 'made-up-secret', 'plain.example.test']) expect(warnings.join('\n')).not.toContain(never);
    expect(await webhookReport(dir)).toEqual({ webhooks: [{ name: 'ops', host: 'hooks.example.test' }], problems: [expect.stringMatching(/plain http/), expect.stringMatching(/shorter than 32/)] });
    // A route that writes one key of the file leaves this list exactly as it was written.
    await file.setDescribeRemind(false);
    await file.setAppearance({ theme: 'dark' });
    expect((JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8')) as { webhooks: unknown }).webhooks).toEqual(webhooks);
    // Not a list: said, taken as empty, and the rest of the file still counts.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', webhooks: { ops: 'https://hooks.example.test/in' } }));
    expect((await file.reload()).theme).toBe('light');
    expect(warnings.at(-1)).toMatch(/webhooks: is not a list of at most 20 entries\. It is skipped\.$/);
    expect(await webhookReport(dir)).toEqual({ webhooks: [], problems: ['webhooks: is not a list of at most 20 entries.'] });
  });
});

describe('outside addresses in the settings', () => {
  it('reports a wrong entry once and skips it, and keeps the rest of the file', async () => {
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', access: { addresses: ['https://aubergine.example.test', 'http://plain.example.test', 'https://owner:pw@x.example.test'] } }));
    const warnings: string[] = [];
    const file = new SettingsFile(dir, (m) => warnings.push(m));
    const settings = await file.reload();
    await file.reload();
    expect(settings.theme).toBe('light');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/access\.addresses: "http:\/\/plain\.example\.test" is not https.*It is skipped\.$/);
    // The password is in the file; the sentence does not repeat the entry beyond saying what is wrong with it.
    expect(warnings[1]).toMatch(/user name or a password/);
    expect(warnings.join('\n')).not.toContain('pw');
    expect(await accessReport(dir)).toEqual({ addresses: ['https://aubergine.example.test'], pages: [], problems: [expect.stringMatching(/not https/), expect.stringMatching(/user name or a password/)] });
  });

  it('says so of a list that is not a list, and starts all the same', async () => {
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'dark', access: { addresses: 'https://aubergine.example.test' } }));
    const warnings: string[] = [];
    const settings = await loadSettings(dir, (m) => warnings.push(m));
    expect(settings.theme).toBe('dark');
    expect(settings.access.addresses).toEqual([]);
    expect(warnings).toEqual([expect.stringMatching(/access\.addresses: is not a list/)]);
    expect(await accessReport(path.join(dir, 'nothing-here'))).toEqual({ addresses: [], pages: [], problems: [] });
  });
});
