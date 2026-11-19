import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from '@aubergine/shared';
import { SETTINGS_FILE, SettingsFile, expandHome, loadSettings, shortcutProblems } from './settings';

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
    await file.setTheme('light');
    expect(JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'))).toEqual({ theme: 'light' });
    expect(file.value.theme).toBe('light');
    // A file of the owner's: what the server does not know, and what it does, stay.
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ theme: 'light', font: { size: 15 }, desktop: { app: 'command', command: 'made-up {file}' }, somethingOfMine: [1, 2] }));
    await file.setTheme('system');
    expect(JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'))).toEqual({ theme: 'system', font: { size: 15 }, desktop: { app: 'command', command: 'made-up {file}' }, somethingOfMine: [1, 2] });
    // A file that cannot be read as settings is not touched.
    await writeFile(path.join(dir, SETTINGS_FILE), 'not json');
    await expect(file.setTheme('dark')).rejects.toThrow(/Mend it by hand/);
    expect(await readFile(path.join(dir, SETTINGS_FILE), 'utf8')).toBe('not json');
  });
});

