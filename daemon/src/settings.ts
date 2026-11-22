import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, Settings, accessEntries, resolveShortcuts, type Platform, type ThemeSetting } from '@aubergine/shared';

export const SETTINGS_FILE = 'config.json';

/**
 * Reads `config.json` from the data folder. A missing file means defaults.
 * A file that cannot be used is reported and ignored, so a typo never keeps
 * the canvas from starting.
 */
export async function loadSettings(dir: string, onWarning: (message: string) => void = () => {}): Promise<Settings> {
  const file = path.join(dir, SETTINGS_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SETTINGS;
    throw error;
  }
  try {
    const raw: unknown = JSON.parse(text);
    const settings = Settings.parse(raw);
    for (const problem of shortcutProblems(settings)) onWarning(`${file}: ${problem}`);
    for (const problem of accessProblems(raw, settings)) onWarning(`${file}: ${problem} It is skipped.`);
    return settings;
  } catch (error) {
    const detail =
      error instanceof SyntaxError
        ? error.message
        : ((error as { issues?: { path: PropertyKey[]; message: string }[] }).issues ?? [])
            .map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`)
            .join('; ');
    onWarning(`Ignoring ${file}: ${detail}. Using default settings.`);
    return DEFAULT_SETTINGS;
  }
}

/**
 * What is wrong with the keys in the settings: unknown commands, chords that
 * cannot be read, collisions, chords the browser keeps. The browser shows the
 * same list in its shortcut sheet. Checked for the system this server runs
 * on, which is where the browser is too.
 */
export function shortcutProblems(settings: Settings, platform: Platform = process.platform === 'darwin' ? 'mac' : 'other'): string[] {
  const { shortcuts, shortcutsInAppWindow } = settings;
  const inTab = resolveShortcuts({ platform, mode: 'tab', shortcuts }).problems.map((p) => p.message);
  // The app-window keys are checked as they apply there; what is already reported is not repeated.
  const inApp = resolveShortcuts({ platform, mode: 'app', shortcuts, shortcutsInAppWindow }).problems.map((p) => p.message);
  return [...new Set([...inTab, ...inApp])];
}

/**
 * What is wrong with `access` in the settings: each entry that is not an origin that can be used, and a list that is
 * not a list at all (which is then taken as empty). `raw` is the file as it was read, before defaults were applied.
 */
export function accessProblems(raw: unknown, settings: Settings): string[] {
  const problems: string[] = [];
  const access = raw !== null && typeof raw === 'object' ? (raw as { access?: unknown }).access : undefined;
  if (access !== undefined && (access === null || typeof access !== 'object' || Array.isArray(access))) problems.push('access: is not an object with "addresses" and "pages".');
  for (const kind of ['addresses', 'pages'] as const) {
    const list = access !== null && typeof access === 'object' ? (access as Record<string, unknown>)[kind] : undefined;
    if (list !== undefined && (!Array.isArray(list) || list.length > 20)) problems.push(`access.${kind}: is not a list of at most 20 origins.`);
    problems.push(...accessEntries(kind, settings.access[kind]).problems);
  }
  return problems;
}

/** The outside addresses the settings file names, as the server takes them at its start, and what is wrong with `access`. For `aubergine doctor`. */
export async function accessReport(dir: string): Promise<{ addresses: string[]; problems: string[] }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(dir, SETTINGS_FILE), 'utf8'));
  } catch {
    // No file, or one that is not JSON: the server starts with the defaults, and so no outside address.
    return { addresses: [], problems: [] };
  }
  const settings = Settings.safeParse(raw);
  if (!settings.success) return { addresses: [], problems: [] };
  return { addresses: accessEntries('addresses', settings.data.access.addresses).entries.map((entry) => entry.origin), problems: accessProblems(raw, settings.data) };
}

/** Expands a leading `~` to the home folder. */
export function expandHome(folder: string): string {
  if (folder === '~') return os.homedir();
  return folder.startsWith('~/') ? path.join(os.homedir(), folder.slice(2)) : folder;
}

/** The settings file is there and cannot be read as settings: it is left as it is. */
export class SettingsUnreadableError extends Error {
  constructor(file: string) {
    super(`${file} is not a file of settings that can be read (it is not a JSON object). Mend it by hand; it was not changed.`);
  }
}

/** Keeps the current settings at hand and re-reads the file when asked. */
export class SettingsFile {
  private current: Settings = DEFAULT_SETTINGS;
  private lastWarnings = new Set<string>();

  constructor(
    private readonly dir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  get value(): Settings {
    return this.current;
  }

  /**
   * Changes the file by what `change` makes of it and leaves everything else in it as it was: the file is the
   * owner's. A file that is not JSON is not touched: the owner is told to mend it.
   */
  private async write(change: (whole: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    const file = path.join(this.dir, SETTINGS_FILE);
    let whole: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SettingsUnreadableError(file);
      whole = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SyntaxError) throw new SettingsUnreadableError(file);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(this.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(change(whole), null, 2)}\n`);
    await rename(tmp, file);
    await this.reload();
  }

  /** Writes `describe.remind`: whether agents are reminded to describe their terminal. It names a yes or a no and nothing that is run. */
  async setDescribeRemind(value: boolean): Promise<void> {
    await this.write((whole) => {
      const describe = whole.describe !== null && typeof whole.describe === 'object' && !Array.isArray(whole.describe) ? (whole.describe as Record<string, unknown>) : {};
      return { ...whole, describe: { ...describe, remind: value } };
    });
  }

  /** Writes `desktop.openNew`: one of the two keys the page changes. */
  async setDesktopOpenNew(value: boolean): Promise<void> {
    await this.write((whole) => {
      const desktop = whole.desktop !== null && typeof whole.desktop === 'object' && !Array.isArray(whole.desktop) ? (whole.desktop as Record<string, unknown>) : {};
      return { ...whole, desktop: { ...desktop, openNew: value } };
    });
  }

  /** Writes `theme`: the other key the page changes. It names one of three choices and nothing that is run. */
  async setTheme(value: ThemeSetting): Promise<void> {
    await this.write((whole) => ({ ...whole, theme: value }));
  }

  async reload(): Promise<Settings> {
    const warnings = new Set<string>();
    this.current = await loadSettings(this.dir, (message) => {
      // Say it once per distinct problem, not on every reload.
      if (!this.lastWarnings.has(message)) this.onWarning(message);
      warnings.add(message);
    });
    this.lastWarnings = warnings;
    return this.current;
  }
}
