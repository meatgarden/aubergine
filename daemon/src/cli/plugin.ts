import path from 'node:path';
import { PLUGINS_FOLDER, PlainName, pluginIdProblem, pluginStanding, showControl, type PluginFound, type PluginStanding } from '@aubergine/shared';
import { PluginFolder, PluginWriteError, writePluginStarter } from '../plugins';
import { loadSettings } from '../settings';
import { UsageError } from './commands';

/**
 * `aubergine plugin`: the plugins in the data folder, where they are, and a starter to begin one from. It reads and
 * writes the data folder itself, with the server's own module, and starts nothing. Nothing here switches a plugin on:
 * that is the owner's, in Settings → Plugins or in the settings file by hand. Only `new` writes: one new folder, never
 * over anything that is there and never through a link.
 */

export type PluginCommand = { action: 'list' } | { action: 'path' } | { action: 'new'; id: string; name: string };

export function parsePluginCommand(words: readonly string[]): PluginCommand {
  const [action, ...rest] = words;
  if (action === undefined || action === 'list') {
    if (rest.length > 0) throw new UsageError('plugin list takes no arguments');
    return { action: 'list' };
  }
  if (action === 'path') {
    if (rest.length > 0) throw new UsageError('plugin path takes no arguments');
    return { action: 'path' };
  }
  if (action === 'new') {
    let id: string | undefined;
    let name: string | undefined;
    for (let i = 0; i < rest.length; i += 1) {
      const word = rest[i] as string;
      if (word === '--name') {
        name = rest[i + 1];
        if (name === undefined) throw new UsageError('--name needs a name');
        i += 1;
      } else if (word.startsWith('--name=')) name = word.slice('--name='.length);
      else if (word.startsWith('-')) throw new UsageError(`plugin new does not take ${word}`);
      else if (id === undefined) id = word;
      else throw new UsageError('plugin new takes one ID');
    }
    if (id === undefined) throw new UsageError('plugin new needs an ID: a lowercase letter, then lowercase letters, digits and hyphens');
    const wrong = pluginIdProblem(id);
    if (wrong) throw new UsageError(`plugin new: ${wrong.replace('its folder’s name', 'that')}`);
    const named = PlainName.safeParse(name ?? id);
    if (!named.success) throw new UsageError('--name is one line of plain text, at most 120 characters');
    return { action: 'new', id, name: named.data };
  }
  throw new UsageError('plugin needs "list", "path" or "new <id>"');
}

export interface PluginCommandDeps {
  /** The data folder, from `dataDir()`. */
  dataDir: string;
  print: (text: string) => void;
  warn: (text: string) => void;
}

const STANDING_WORDS: Record<PluginStanding, string> = {
  off: 'off',
  on: 'on',
  following: 'on, following changes',
  changed: 'changed since you switched it on: not loaded until you switch it on again',
  'not-loaded': 'not loaded',
};

const kilobytes = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/** One plugin in a line or two: its ID, name and version, its state, its files, and why it is not loaded. */
export function pluginLines(found: PluginFound, standing: PluginStanding): string[] {
  const size = found.files.reduce((sum, file) => sum + file.bytes, 0);
  const head = `${found.id}  ${showControl(found.name)}${found.manifest ? ` ${showControl(found.manifest.version)}` : ''}  ${STANDING_WORDS[standing]}  ${found.files.length} ${found.files.length === 1 ? 'file' : 'files'}, ${kilobytes(size)}`;
  return [head, ...(found.notLoaded ? [`  ${showControl(found.notLoaded)}`] : []), ...found.problems.map((problem) => `  ${showControl(problem)}`)];
}

export async function runPluginCommand(command: PluginCommand, deps: PluginCommandDeps): Promise<number> {
  const folder = path.join(deps.dataDir, PLUGINS_FOLDER);
  if (command.action === 'path') {
    deps.print(folder);
    return 0;
  }
  if (command.action === 'new') {
    try {
      const written = await writePluginStarter(deps.dataDir, command.id, command.name);
      deps.print(`Wrote ${written}: plugin.json, index.js and style.css, a starter that adds a section of the side panel, a command and a placeholder, using the plugin API alone (docs/plugins.md).`);
      deps.print('It is off. A plugin runs in the page as you, with everything the page can do: switch it on in Settings → Plugins once you have read it.');
      return 0;
    } catch (error) {
      if (!(error instanceof PluginWriteError)) throw error;
      deps.warn(error.message);
      return 1;
    }
  }
  const settings = await loadSettings(deps.dataDir);
  const answer = await new PluginFolder(deps.dataDir).answer(settings.plugins.on);
  if (answer.plugins.length === 0) deps.print(`There are no plugins in ${folder}. aubergine plugin new <id> writes one to start from.`);
  for (const found of answer.plugins) for (const line of pluginLines(found, pluginStanding(found, answer.on[found.id]))) deps.print(line);
  for (const problem of answer.problems) deps.warn(showControl(problem));
  return 0;
}
