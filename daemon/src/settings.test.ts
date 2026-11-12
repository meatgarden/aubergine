import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@aubergine/shared';
import { SETTINGS_FILE, SettingsFile, expandHome, loadSettings } from './settings';

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
