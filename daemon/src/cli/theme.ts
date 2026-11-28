import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { AubergineError, createClient, type Client } from '@aubergine/client';
import {
  COLOR_THEMES,
  SESSION_ENV,
  THEME_ID,
  baseName,
  type ThemeProposalRow,
  type ThemeRow,
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

export type ThemeCommand =
  | { action: 'list' }
  | { action: 'path' }
  | { action: 'check'; file: string }
  | { action: 'new'; id: string; from: string | null; name: string | null }
  /** Sends a theme file's text, for the owner to read: from inside a terminal. */
  | { action: 'propose'; file: string; id: string | null; why: string | null }
  /** Inside a terminal: what became of its own proposals. For the owner: every one that waits. */
  | { action: 'proposals' };

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
  if (action === 'propose') {
    const id = takeOption(rest, '--id');
    const why = takeOption(id.rest, '--why');
    if (why.rest.length !== 1 || (why.rest[0] as string).startsWith('--')) throw new UsageError('theme propose needs one file: aubergine theme propose <file> [--id <id>] [--why "<one line>"]');
    return { action: 'propose', file: why.rest[0] as string, id: id.value, why: why.value };
  }
  if (action === 'proposals') {
    if (rest.length > 0) throw new UsageError('theme proposals takes no arguments');
    return { action: 'proposals' };
  }
  throw new UsageError('theme needs "list", "check <file>", "new <id>", "propose <file>", "proposals" or "path"');
}

export interface ThemeCommandDeps {
  /** The data folder, from `dataDir()`. */
  dataDir: string;
  print: (text: string) => void;
  warn: (text: string) => void;
  /** The environment: inside an Aubergine terminal it names the terminal and holds its own credential. Left out: none. */
  env?: NodeJS.ProcessEnv;
  /** Calls made as the owner, for the owner's list of what waits. */
  owner?: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  /** Where a file named without a folder is: the current folder. */
  cwd?: string;
}

/** The client of a program inside a terminal, with that terminal's own credential; null outside one. */
function sessionClient(env: NodeJS.ProcessEnv): { client: Client; sessionId: string } | null {
  const url = env[SESSION_ENV.url];
  const sessionId = env[SESSION_ENV.sessionId];
  const token = env[SESSION_ENV.token];
  return url && sessionId && token ? { client: createClient({ baseUrl: url, token }), sessionId } : null;
}

/** The themes as a terminal is told of them, one line each under their kind. Pure. */
export function formatThemeRows(rows: readonly ThemeRow[]): string {
  const lines: string[] = [];
  for (const kind of ['light', 'dark'] as const) {
    if (lines.length > 0) lines.push('');
    lines.push(kind === 'light' ? 'Light' : 'Dark');
    for (const row of rows.filter((one) => one.kind === kind)) lines.push(`  ${row.id.padEnd(22)}${(row.own ? `yours, over ${row.base}` : 'comes with Aubergine').padEnd(28)}${showControl(row.name)}`);
  }
  lines.push('', 'A theme of your own is proposed, not written: aubergine theme propose <file>. Your owner reads it first.');
  return lines.join('\n');
}

const STATE_WORDS: Record<ThemeProposalRow['state'], string> = { waiting: 'waits for the owner', accepted: 'accepted: it is a theme file now', declined: 'declined' };

/** Proposals and what became of them, one line each, every word from elsewhere through `showControl`. Pure. */
export function formatProposals(rows: readonly ThemeProposalRow[], withWho: boolean): string {
  if (rows.length === 0) return withWho ? 'No color theme waits to be read.' : 'This terminal has proposed no color theme, or what became of it is no longer kept.';
  return rows
    .map((row) => {
      const who = !withWho ? '' : row.proposedBy.kind === 'session' ? `, from a terminal (${row.proposedBy.sessionId})` : row.proposedBy.kind === 'token' ? `, from the token "${row.proposedBy.name}"` : ', from you';
      const what = row.state === 'waiting' && row.kind && row.base ? ` (${row.kind}, over ${baseName(row.base)}${row.problems.length > 0 ? `, ${row.problems.length} skipped` : ''})` : '';
      const why = row.why ? `\n    why: "${row.why}"` : '';
      return showControl(`${row.themeId}  ${row.name}${what}${who}: ${STATE_WORDS[row.state]}, ${row.at}${why}`);
    })
    .join('\n');
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
  const inside = sessionClient(deps.env ?? {});
  const said = async (work: () => Promise<number>): Promise<number> => {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof AubergineError)) throw error;
      // Said plainly, for whoever typed it: an agent reads this and acts on it.
      deps.warn(showControl(error.code === 'network' ? `The Aubergine server is not answering on ${deps.env?.[SESSION_ENV.url] ?? 'its address'}.` : error.message));
      return 1;
    }
  };
  switch (command.action) {
    case 'path':
      deps.print(folder);
      return 0;
    case 'list': {
      // Inside a terminal: what the server says there is, with the terminal's own credential.
      if (inside) {
        const found = inside;
        return said(async () => {
          const rows: ThemeRow[] = [];
          for await (const row of found.client.each.listSessionThemes({ sessionId: found.sessionId })) rows.push(row);
          deps.print(formatThemeRows(rows));
          return 0;
        });
      }
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
      // Inside a terminal the file is written into the current folder, to be proposed: nothing is written into the theme files from there.
      const into = inside ? (deps.cwd ?? process.cwd()) : folder;
      const target = path.join(into, `${command.id}.json`);
      if (await lstat(target).then(() => true, () => false)) {
        deps.warn(`There is already a file named ${command.id}.json in ${into}. Nothing was written: choose another ID, or change that file.`);
        return 1;
      }
      // A theme file of the owner's to start from is copied whole: its base, and every color as it is drawn.
      const text = starterThemeFile(name, from);
      try {
        if (inside) await writeInside(into, `${command.id}.json`, text, false);
        else await writeInside(deps.dataDir, `${THEMES_FOLDER}/${command.id}.json`, text);
      } catch (error) {
        deps.warn(`Nothing was written: ${(error as Error).message}`);
        return 1;
      }
      if (inside) {
        deps.print(
          [
            `Wrote ${target}: ${from.kind === 'light' ? 'a light' : 'a dark'} theme over ${from.base}, every color as ${showControl(from.name)} has it.`,
            'Change the colors you want, and remove the ones you do not; what is left out is the base’s (docs/themes.md). Then:',
            `  aubergine theme check ${command.id}.json`,
            `  aubergine theme propose ${command.id}.json --why "<one line on why>"`,
            'It is not used until your owner has read it and accepted it.',
          ].join('\n'),
        );
        return 0;
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
    case 'propose': {
      if (!inside) {
        deps.warn(`A theme is proposed from inside an Aubergine terminal, for its owner to read. Your own goes straight into ${folder}: write it there (aubergine theme new <id>), then press Read themes again in Settings → Appearance.`);
        return 1;
      }
      const file = path.resolve(deps.cwd ?? process.cwd(), command.file);
      const base = path.basename(file);
      const id = command.id ?? (base.endsWith('.json') ? base.slice(0, -'.json'.length) : base);
      if (!THEME_ID.test(id)) {
        deps.warn(`${showControl(id)}: a theme's ID is a lowercase letter, then up to 39 lowercase letters, digits and hyphens. Name the file so, or give --id.`);
        return 1;
      }
      const read = await readInside(path.dirname(file), base, THEME_FILE_MAX_BYTES);
      if (!read.ok) {
        deps.warn(`${showControl(command.file)}: ${read.reason}`);
        return 1;
      }
      const found = inside;
      return said(async () => {
        const row = await found.client.proposeSessionTheme({ sessionId: found.sessionId, body: { id, text: read.bytes.toString('utf8'), ...(command.why !== null ? { why: command.why } : {}) } });
        deps.print(
          showControl(
            [
              `Proposed "${row.name}" as the theme ${row.themeId}: a ${row.kind ?? ''} theme over ${baseName(row.base ?? '')}.${row.problems.length > 0 ? ` ${row.problems.length === 1 ? 'One of its entries is' : `${row.problems.length} of its entries are`} skipped:\n${row.problems.map((problem) => `  ${problem}`).join('\n')}` : ''}`,
              'It is drawn nowhere until your owner has read it and accepted it, and accepting does not choose it. Nothing tells you when it is decided: ask with aubergine theme proposals.',
            ].join('\n'),
          ),
        );
        return 0;
      });
    }
    case 'proposals': {
      if (inside) {
        const found = inside;
        return said(async () => {
          const rows: ThemeProposalRow[] = [];
          for await (const row of found.client.each.listSessionThemeProposals({ sessionId: found.sessionId })) rows.push(row);
          deps.print(formatProposals(rows, false));
          return 0;
        });
      }
      if (!deps.owner) {
        deps.warn('The proposals are read from the server, and this command was given no way to reach it.');
        return 1;
      }
      const rows: ThemeProposalRow[] = await deps.owner(async (client) => {
        const all: ThemeProposalRow[] = [];
        for await (const row of client.each.listThemeProposals()) if (row.state === 'waiting') all.push(row);
        return all;
      });
      deps.print(formatProposals(rows, true));
      if (rows.length > 0) deps.print('\nRead each one in the browser, under Review: it shows the theme, its colors and its whole text. Accepting writes its file; it chooses nothing.');
      return 0;
    }
  }
}
