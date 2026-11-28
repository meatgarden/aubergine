import path from 'node:path';
import { CUSTOM_CSS_FILE, showControl } from '@aubergine/shared';
import { StylesheetWriteError, readStylesheet, writeStarter } from '../custom-css';
import { UsageError } from './commands';

/**
 * `aubergine css`: where your own stylesheet is, and a starter to begin from. The stylesheet is a file, not a route:
 * this reads and writes the data folder itself, with the server's own module, and starts nothing. Only `new` writes,
 * one file, never over one that is there and never through a link.
 */

export type CssCommand = { action: 'path' } | { action: 'new' };

export function parseCssCommand(words: readonly string[]): CssCommand {
  const [action, ...rest] = words;
  if (rest.length > 0) throw new UsageError(`css ${action ?? ''} takes no arguments`.replace('  ', ' '));
  if (action === undefined || action === 'path') return { action: 'path' };
  if (action === 'new') return { action: 'new' };
  throw new UsageError('css needs "path" or "new"');
}

export interface CssCommandDeps {
  /** The data folder, from `dataDir()`. */
  dataDir: string;
  print: (text: string) => void;
  warn: (text: string) => void;
}

export async function runCssCommand(command: CssCommand, deps: CssCommandDeps): Promise<number> {
  const file = path.join(deps.dataDir, CUSTOM_CSS_FILE);
  if (command.action === 'path') {
    deps.print(file);
    // Said beside the path, on the other stream, so that `$(aubergine css path)` stays a path.
    const reading = await readStylesheet(deps.dataDir);
    if (reading.kind === 'none') deps.warn('There is no stylesheet of your own there yet. aubergine css new writes one to start from.');
    if (reading.kind === 'problem') deps.warn(showControl(reading.problem));
    return 0;
  }
  try {
    const written = await writeStarter(deps.dataDir);
    deps.print(`Wrote ${written}: a comment listing the hooks (docs/hooks.md), and three examples, commented out. Change it, then press “Read it again” in Settings → Appearance, or reload the page.`);
    return 0;
  } catch (error) {
    if (!(error instanceof StylesheetWriteError)) throw error;
    deps.warn(error.message);
    return 1;
  }
}
