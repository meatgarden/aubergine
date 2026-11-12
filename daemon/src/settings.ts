import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, Settings } from '@aubergine/shared';

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
    return Settings.parse(JSON.parse(text));
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

/** Expands a leading `~` to the home folder. */
export function expandHome(folder: string): string {
  if (folder === '~') return os.homedir();
  return folder.startsWith('~/') ? path.join(os.homedir(), folder.slice(2)) : folder;
}

/** Keeps the current settings at hand and re-reads the file when asked. */
export class SettingsFile {
  private current: Settings = DEFAULT_SETTINGS;
  private lastWarning: string | null = null;

  constructor(
    private readonly dir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  get value(): Settings {
    return this.current;
  }

  async reload(): Promise<Settings> {
    this.current = await loadSettings(this.dir, (message) => {
      // Say it once per distinct problem, not on every reload.
      if (message !== this.lastWarning) this.onWarning(message);
      this.lastWarning = message;
    });
    return this.current;
  }
}
