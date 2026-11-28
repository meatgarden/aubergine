import path from 'node:path';
import { entriesWords, sameSetting, settingGroups, settingValue, settingWords, showControl, type Settings } from '@aubergine/shared';
import { SETTINGS_FILE, loadSettings, settingsSchemaText } from '../settings';
import { UsageError } from './commands';

/**
 * `aubergine settings`: where the settings file is, its schema, and every key with its value now. The settings are a
 * file, not a route: this reads the file itself, as the server does, and starts nothing. It writes nothing either.
 */

export type SettingsCommand = { action: 'path' } | { action: 'schema' } | { action: 'list' };

export function parseSettingsCommand(words: readonly string[]): SettingsCommand {
  const [action, ...rest] = words;
  if (rest.length > 0) throw new UsageError(`settings ${action ?? ''} takes no arguments`.replace('  ', ' '));
  if (action === undefined || action === 'list' || action === 'ls') return { action: 'list' };
  if (action === 'path' || action === 'schema') return { action };
  throw new UsageError('settings needs "path", "schema" or "list"');
}

/**
 * Every key of the settings, one line each under its top-level key: the key, its value now and, where that is not the
 * default, a mark at the start and the default at the end. A list or a map is said by how many entries it holds, then
 * whole. Every value is printed through `showControl`: a file may hold anything. Pure.
 */
export function formatSettings(settings: Settings): string {
  const lines: string[] = [];
  const groups = settingGroups();
  const width = Math.max(...groups.flatMap((group) => group.rows.map((row) => row.key.length)));
  for (const group of groups) {
    if (lines.length > 0) lines.push('');
    lines.push(group.key);
    for (const row of group.rows) {
      const value = settingValue(settings, row.key);
      const differs = !sameSetting(value, row.default);
      // A list or a map is printed whole after its count: the entries are what was written, as given.
      const now = showControl(row.kind === 'value' || entriesWords(value) === 'no entries' ? settingWords(row, value) : `${entriesWords(value)}: ${JSON.stringify(value)}`);
      lines.push(`${differs ? '*' : ' '} ${row.key.padEnd(width)}  ${now}${differs ? `   (default: ${showControl(settingWords(row, row.default))})` : ''}`);
    }
  }
  lines.push('', 'A line marked * is not the default.');
  return lines.join('\n');
}

export interface SettingsCommandDeps {
  /** The data folder, from `dataDir()`. */
  dataDir: string;
  print: (text: string) => void;
  /** What is wrong in the file, as the server would say it when it starts. */
  warn: (text: string) => void;
}

export async function runSettingsCommand(command: SettingsCommand, deps: SettingsCommandDeps): Promise<number> {
  switch (command.action) {
    case 'path':
      deps.print(path.join(deps.dataDir, SETTINGS_FILE));
      return 0;
    case 'schema':
      deps.print(settingsSchemaText().trimEnd());
      return 0;
    case 'list': {
      const settings = await loadSettings(deps.dataDir, (message) => deps.warn(showControl(message)));
      deps.print(formatSettings(settings));
      return 0;
    }
  }
}
