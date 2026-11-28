import { lstat } from 'node:fs/promises';
import path from 'node:path';
import {
  COLOR_THEMES,
  THEMES_FOLDER,
  THEME_FILE_MAX_BYTES,
  readThemeFile,
  showControl,
  starterThemeFile,
  themeIdProblem,
  themeNameProblem,
  themeOf,
  type ThemeOf,
  type UserTheme,
} from '@aubergine/shared';
import { readInside, writeInside } from '../repository-files';
import { readThemeFolder } from '../theme-files';
import { UsageError, takeOption } from './commands';

/**
 * `aubergine theme`: the color themes there are (the built-in ones and the owner's theme files), what is wrong with a
 * file, where the folder is, and a new file to start from. The theme files are files, not a route: this reads the folder
 * itself, with the server's own reader, and starts nothing. Only `new` writes, one file, never over one that is there and
 * never through a link.
 */

export type ThemeCommand = { action: 'list' } | { action: 'path' } | { action: 'check'; file: string } | { action: 'new'; id: string; from: string | null; name: string | null };

export function parseThemeCommand(words: readonly string[]): ThemeCommand {
  const [action, ...rest] = words;
  if (action === undefined || action === 'list' || action === 'ls') {
    if (rest.length > 0) throw new UsageError('theme list takes no arguments');
    return { action: 'list' };
  }
  if (action === 'path') {
    if (rest.length > 0) throw new UsageError('theme path takes no arguments');
    return { action: 'path' };
  }
  if (action === 'check') {
    if (rest.length !== 1) throw new UsageError('theme check needs one file: aubergine theme check <file>');
    return { action: 'check', file: rest[0] as string };
  }
  if (action === 'new') {
    const from = takeOption(rest, '--from');
    const name = takeOption(from.rest, '--name');
    if (name.rest.length !== 1 || (name.rest[0] as string).startsWith('--')) throw new UsageError('theme new needs one ID: aubergine theme new <id> [--from <theme>] [--name <name>]');
    return { action: 'new', id: name.rest[0] as string, from: from.value, name: name.value };
  }
  throw new UsageError('theme needs "list", "check <file>", "new <id>" or "path"');
}

export interface ThemeCommandDeps {
  /** The data folder, from `dataDir()`. */
  dataDir: string;
  print: (text: string) => void;
  warn: (text: string) => void;
}

/** The themes there are, one line each under their kind, and what is wrong with the files, every word through `showControl`. Pure. */
export function formatThemes(themes: readonly UserTheme[], problems: readonly string[]): string {
  const lines: string[] = [];
  const row = (theme: ThemeOf): string => `  ${theme.id.padEnd(22)}${theme.own ? `yours, over ${theme.base}`.padEnd(28) : 'comes with Aubergine'.padEnd(28)}${showControl(theme.name)}`;
  for (const kind of ['light', 'dark'] as const) {
    if (lines.length > 0) lines.push('');
    lines.push(kind === 'light' ? 'Light' : 'Dark');
    for (const theme of COLOR_THEMES.filter((one) => one.kind === kind)) lines.push(row(themeOf(theme.id, themes) as ThemeOf));
    for (const theme of [...themes].sort((a, b) => a.name.localeCompare(b.name)).filter((one) => one.kind === kind)) {
      const shown = themeOf(theme.id, themes);
      if (shown) lines.push(row(shown));
    }
  }
  if (themes.length === 0) lines.push('', `No theme of your own yet. aubergine theme new <id> writes a file to start from.`);
  if (problems.length > 0) lines.push('', 'Not read, or skipped:', ...problems.map((problem) => `  ${showControl(problem)}`));
  return lines.join('\n');
}

/** A name for a new theme from its ID: "harbor-night" is "Harbor night". */
const nameFromId = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replace(/-/g, ' ');

export async function runThemeCommand(command: ThemeCommand, deps: ThemeCommandDeps): Promise<number> {
  const folder = path.join(deps.dataDir, THEMES_FOLDER);
  switch (command.action) {
    case 'path':
      deps.print(folder);
      return 0;
    case 'list': {
      const { themes, problems } = await readThemeFolder(folder);
      deps.print(formatThemes(themes, problems));
      return 0;
    }
    case 'check': {
      const file = path.resolve(command.file);
      const base = path.basename(file);
      if (!base.endsWith('.json')) {
        deps.warn(`${showControl(base)}: a theme file's name ends in .json.`);
        return 1;
      }
      const read = await readInside(path.dirname(file), base, THEME_FILE_MAX_BYTES);
      if (!read.ok) {
        deps.warn(`${showControl(command.file)}: ${read.reason}`);
        return 1;
      }
      const reading = readThemeFile(base.slice(0, -'.json'.length), read.bytes.toString('utf8'));
      if ('problem' in reading) {
        deps.warn(showControl(reading.problem));
        return 1;
      }
      const lines = [`${showControl(reading.theme.name)}: a ${reading.theme.kind} theme over ${reading.theme.base}, ${Object.keys(reading.theme.colors).length} of its colors its own.`];
      if (reading.problems.length > 0) lines.push('Skipped:', ...reading.problems.map((problem) => `  ${showControl(problem)}`));
      else lines.push('Nothing in it is wrong.');
      deps.print(lines.join('\n'));
      return reading.problems.length > 0 ? 1 : 0;
    }
    case 'new': {
      const wrong = themeIdProblem(command.id);
      if (wrong) {
        deps.warn(`${showControl(command.id)}: ${wrong.replace(/^its name/, 'the ID')}`.replace(', then .json.', '.'));
        return 1;
      }
      const name = command.name ?? nameFromId(command.id);
      const wrongName = themeNameProblem(name);
      if (wrongName) {
        deps.warn(`--name: ${wrongName}`);
        return 1;
      }
      const { themes } = await readThemeFolder(folder);
      const from = themeOf(command.from ?? 'dark', themes);
      if (!from) {
        deps.warn(`${showControl(command.from ?? '')} names no theme. aubergine theme list says which there are.`);
        return 1;
      }
      const target = path.join(folder, `${command.id}.json`);
      if (await lstat(target).then(() => true, () => false)) {
        deps.warn(`There is already a file named ${command.id}.json in ${folder}. Nothing was written: choose another ID, or change that file.`);
        return 1;
      }
      // A theme file of the owner's to start from is copied whole: its base, and every color as it is drawn.
      const text = starterThemeFile(name, from);
      try {
        await writeInside(deps.dataDir, `${THEMES_FOLDER}/${command.id}.json`, text);
      } catch (error) {
        deps.warn(`Nothing was written: ${(error as Error).message}`);
        return 1;
      }
      deps.print(
        [
          `Wrote ${target}: ${from.kind === 'light' ? 'a light' : 'a dark'} theme over ${from.base}, every color as ${showControl(from.name)} has it.`,
          'Change the colors you want, and remove the ones you do not; what is left out is the base’s. "terminal" sets a terminal’s own colors (docs/themes.md).',
          'Then press Read themes again in Settings → Appearance, or start the server again, and choose it there.',
        ].join('\n'),
      );
      return 0;
    }
  }
}
