import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_SETTINGS, PAGE_WRITTEN_SETTINGS, Settings, settingRows, settingsJsonSchema } from '@aubergine/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_FILE } from '../settings';
import { UsageError, parseCommand } from './commands';
import { formatSettings, parseSettingsCommand, runSettingsCommand } from './settings';

const run = promisify(execFile);
const COMMAND = fileURLToPath(new URL('../../../bin/aubergine.mjs', import.meta.url));

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-settings-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parsing the settings commands', () => {
  it('reads path, schema and list, and list by itself', () => {
    expect(parseCommand(['settings'])).toEqual({ name: 'settings', words: [] });
    expect(parseCommand(['settings', 'path'])).toEqual({ name: 'settings', words: ['path'] });
    expect(parseSettingsCommand([])).toEqual({ action: 'list' });
    expect(parseSettingsCommand(['list'])).toEqual({ action: 'list' });
    expect(parseSettingsCommand(['path'])).toEqual({ action: 'path' });
    expect(parseSettingsCommand(['schema'])).toEqual({ action: 'schema' });
    expect(() => parseSettingsCommand(['set', 'theme'])).toThrow(UsageError);
    expect(() => parseSettingsCommand(['path', 'x'])).toThrow(/takes no arguments/);
  });
});

describe('every key with its value', () => {
  it('lists every key once, marks only what differs, and gives its default', () => {
    const text = formatSettings(Settings.parse({ font: { size: 15 } }));
    for (const row of settingRows()) expect(text.split('\n').filter((line) => line.slice(2).startsWith(`${row.key} `)), row.key).toHaveLength(1);
    const marked = text.split('\n').filter((line) => line.startsWith('* '));
    expect(marked).toEqual([expect.stringMatching(/^\* font\.size +15 +\(default: 13\)$/)]);
    expect(formatSettings(DEFAULT_SETTINGS).split('\n').filter((line) => line.startsWith('* '))).toEqual([]);
    expect(PAGE_WRITTEN_SETTINGS.every((key) => text.includes(key))).toBe(true);
  });

  it('prints what a file holds through showControl, and lists as given', () => {
    const text = formatSettings(Settings.parse({ agents: { claudeCommand: 'claude\u001b]0;x\u0007\u202e' }, access: { addresses: ['https://a.example.test', 42] }, shortcuts: { 'palette.toggle': 'Ctrl+K' } }));
    // eslint-disable-next-line no-control-regex -- control characters are what is looked for
    expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f\u202e]/);
    expect(text).toContain('claude␛]0;x␇<U+202E>');
    expect(text).toContain('2 entries: ["https://a.example.test",42]');
    expect(text).toContain('1 entry: {"palette.toggle":"Ctrl+K"}');
  });
});

describe('the command', () => {
  const output = async (words: string[]): Promise<{ code: number; out: string[]; warnings: string[] }> => {
    const out: string[] = [];
    const warnings: string[] = [];
    const code = await runSettingsCommand(parseSettingsCommand(words), { dataDir: dir, print: (text) => out.push(text), warn: (text) => warnings.push(text) });
    return { code, out, warnings };
  };

  it('says where the file is, prints the schema, and reads the file as the server does, writing nothing', async () => {
    expect(await output(['path'])).toEqual({ code: 0, out: [path.join(dir, SETTINGS_FILE)], warnings: [] });
    const schema = await output(['schema']);
    expect(JSON.parse(schema.out.join('\n'))).toEqual(settingsJsonSchema());
    // No file: the defaults.
    expect((await output(['list'])).out[0]).toBe(formatSettings(DEFAULT_SETTINGS));
    await writeFile(path.join(dir, SETTINGS_FILE), JSON.stringify({ $schema: './config.schema.json', theme: 'dark', shortcuts: { 'no.such': 'Ctrl+K' } }));
    const listed = await output(['list']);
    expect(listed.out[0]).toMatch(/^\* theme +dark +\(default: system\)$/m);
    expect(listed.warnings).toEqual([expect.stringMatching(/there is no command named "no\.such"/)]);
    expect(await readdir(dir)).toEqual([SETTINGS_FILE]);
  });

  it('runs without a server', async () => {
    const env = { ...process.env, AUBERGINE_DATA_DIR: dir, AUBERGINE_PORT: '1' };
    const { stdout } = await run(process.execPath, [COMMAND, 'settings', 'path'], { env });
    expect(stdout.trim()).toBe(path.join(dir, SETTINGS_FILE));
  });
});
