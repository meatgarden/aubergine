import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    expect((await file.reload()).theme).toBe('dark');
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
    expect(problems.some((p) => /⌘T for "canvas.new" will not reach this page/.test(p))).toBe(true);
    expect(problems.some((p) => /⌘1/.test(p))).toBe(false);
    expect(problems.some((p) => /⌘W for "canvas.go.2" will not reach this page/.test(p))).toBe(true);
    expect(problems.some((p) => /shortcutsInAppWindow: there is no command named "nonsense"/.test(p))).toBe(true);
    expect(shortcutProblems(DEFAULT_SETTINGS, 'mac')).toEqual([]);
    expect(shortcutProblems(DEFAULT_SETTINGS, 'other')).toEqual([]);
  });
});
