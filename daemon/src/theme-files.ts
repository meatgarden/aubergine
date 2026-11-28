import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { THEMES_FOLDER, THEME_FILES_MAX, THEME_FILE_MAX_BYTES, plain, readThemeFile, type ThemesAnswer, type UserTheme } from '@aubergine/shared';
import { readInside } from './repository-files';

/**
 * The owner's theme files: `themes/<id>.json` in the data folder. This module is the one place the folder is read, and
 * what a file holds is decided by `readThemeFile` in shared/. Only regular files directly in the folder are read, by
 * the same reader as a repository's files (`readInside`: no link followed, the folder itself included, at most
 * `THEME_FILE_MAX_BYTES` each), and at most `THEME_FILES_MAX` of them. Nothing in a file is run, and nothing is written
 * here. A file that cannot be read is reported and never stops the others.
 */

/** The theme files there are now, and what was wrong with them. */
export type ThemesNow = ThemesAnswer;

const NOTHING: ThemesNow = { themes: [], problems: [] };

/** Every theme in a folder of theme files, read afresh. A folder that is not there is no themes and no problem. */
export async function readThemeFolder(folder: string): Promise<ThemesNow> {
  const stats = await lstat(folder).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? null : error));
  if (stats === null) return NOTHING;
  if (stats instanceof Error) return { themes: [], problems: [`${THEMES_FOLDER}: the folder could not be looked at. No theme of your own is read.`] };
  // A link here could point anywhere on the machine: it is not followed.
  if (stats.isSymbolicLink()) return { themes: [], problems: [`${THEMES_FOLDER}: it is a link, and links are not followed. No theme of your own is read.`] };
  if (!stats.isDirectory()) return { themes: [], problems: [`${THEMES_FOLDER}: it is not a folder. No theme of your own is read.`] };
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return { themes: [], problems: [`${THEMES_FOLDER}: the folder could not be read. No theme of your own is read.`] };
  }
  const named = entries.filter((entry) => entry.name.endsWith('.json')).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const themes: UserTheme[] = [];
  const problems: string[] = [];
  if (named.length > THEME_FILES_MAX) problems.push(`${THEMES_FOLDER}: there are ${named.length} files; the first ${THEME_FILES_MAX} by name are read, and the rest are not.`);
  for (const entry of named.slice(0, THEME_FILES_MAX)) {
    const where = `${THEMES_FOLDER}/${plain(entry.name)}`;
    if (entry.isSymbolicLink()) {
      problems.push(`${where}: it is a link, and links are not followed. It is not read.`);
      continue;
    }
    if (!entry.isFile()) {
      problems.push(`${where}: it is not a regular file. It is not read.`);
      continue;
    }
    const read = await readInside(folder, entry.name, THEME_FILE_MAX_BYTES);
    if (!read.ok) {
      problems.push(`${where}: ${read.reason} It is not read.`);
      continue;
    }
    const reading = readThemeFile(entry.name.slice(0, -'.json'.length), read.bytes.toString('utf8'));
    if ('problem' in reading) problems.push(reading.problem);
    else {
      themes.push(reading.theme);
      problems.push(...reading.problems);
    }
  }
  return { themes, problems };
}

/** What the server asks of the theme files: what was read last, and reading them again. */
export interface Themes {
  readonly value: ThemesNow;
  reload(): Promise<ThemesNow>;
}

/** No theme files: a server started without a data folder, and the tests that do not look at themes. */
export const NO_THEMES: Themes = { value: NOTHING, reload: async () => NOTHING };

/**
 * The theme files of a data folder, kept at hand and read again when asked: when the server starts, whenever it reads
 * its settings file, and when the owner asks. A problem is said once, not on every reading.
 */
export class ThemeFolder implements Themes {
  private current: ThemesNow = NOTHING;
  private said = new Set<string>();

  constructor(
    private readonly dataDir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  get folder(): string {
    return path.join(this.dataDir, THEMES_FOLDER);
  }

  get value(): ThemesNow {
    return this.current;
  }

  async reload(): Promise<ThemesNow> {
    this.current = await readThemeFolder(this.folder);
    const now = new Set(this.current.problems);
    for (const problem of now) if (!this.said.has(problem)) this.onWarning(problem);
    this.said = now;
    return this.current;
  }
}
