/**
 * The commands plugins add: a registry of their own, beside the page's (`commands.ts`), so that a plugin's command is
 * never one of `COMMAND_IDS`. Each is named `plugin.<plugin ID>.<name>`, whatever the plugin asked for, and is listed
 * in the palette under its plugin's name. No key is bound to one: `shortcuts` in the settings names the page's commands
 * only. Added and taken away while the page runs; whoever lists them listens (`subscribeToPluginCommands`).
 */

export interface PluginCommand {
  /** `plugin.<plugin ID>.<name>`. */
  id: string;
  pluginId: string;
  /** The plugin's name, as its manifest says: the palette's heading for its commands. */
  pluginName: string;
  title: string;
  description: string;
  run: () => void;
}

/** A command's own name, after `plugin.<plugin ID>.`: lowercase letters, digits and hyphens. */
export const PLUGIN_COMMAND_NAME = /^[a-z][a-z0-9-]{0,39}$/;
export const pluginCommandId = (pluginId: string, name: string): string => `plugin.${pluginId}.${name}`;

const registry = new Map<string, PluginCommand>();
const listeners = new Set<() => void>();
let snapshot: PluginCommand[] = [];

function changed(): void {
  snapshot = [...registry.values()].sort((a, b) => a.pluginId.localeCompare(b.pluginId) || a.title.localeCompare(b.title));
  for (const listener of listeners) listener();
}

/** Adds a command; one of the same ID is replaced. Returns what takes it away again. */
export function addPluginCommand(command: PluginCommand): () => void {
  registry.set(command.id, command);
  changed();
  return () => {
    if (registry.get(command.id) === command) {
      registry.delete(command.id);
      changed();
    }
  };
}

/** Every plugin command, by plugin and title. The same array until one is added or taken away. */
export const pluginCommands = (): PluginCommand[] => snapshot;
export const pluginCommandById = (id: string): PluginCommand | undefined => registry.get(id);

export function subscribeToPluginCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs a plugin's command. What it throws is the plugin's: said as a notice, and the page carries on. */
export function runPluginCommand(id: string, onError: (message: string) => void): boolean {
  const command = registry.get(id);
  if (!command) return false;
  try {
    command.run();
  } catch (error) {
    onError(`${command.pluginName}: ${(error as Error)?.message ?? String(error)}`);
  }
  return true;
}
