import { z } from 'zod';
import {
  ChordError,
  belongsToTerminal,
  chordId,
  formatChord,
  isPlainKey,
  keptByBrowser,
  parseChord,
  type Chord,
  type Platform,
  type WindowMode,
} from './chords';

/**
 * Every command that can have a key. What each one does lives with the web
 * app; the names live here so the settings file can be checked against them.
 */
export const COMMAND_IDS = [
  'palette.toggle',
  'terminal.new',
  'agent.new',
  'frame.new',
  'canvas.new',
  'canvas.next',
  'canvas.previous',
  'canvas.go.1',
  'canvas.go.2',
  'canvas.go.3',
  'canvas.go.4',
  'canvas.go.5',
  'canvas.go.6',
  'canvas.go.7',
  'canvas.go.8',
  'canvas.go.9',
  'canvas.rename',
  'focus.left',
  'focus.right',
  'focus.up',
  'focus.down',
  'select.left',
  'select.right',
  'select.up',
  'select.down',
  'terminal.enter',
  'terminal.leave',
  'terminal.park',
  'terminal.rename',
  'terminal.moveToCanvas',
  'parked.restoreLast',
  'parked.open',
  'notes.toggle',
  'attention.next',
  'outside.open',
  'view.fit',
  'view.actualSize',
  'shortcuts.show',
  'panels.close',
] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

const isCommandId = (text: string): text is CommandId => (COMMAND_IDS as readonly string[]).includes(text);

type Defaults = Partial<Record<CommandId, readonly string[]>>;

/** Keys that work only while no terminal or text field has focus. The same everywhere. */
const PLAIN_DEFAULTS: Defaults = {
  'terminal.new': ['N'],
  'agent.new': ['C'],
  'frame.new': ['G'],
  'canvas.new': ['T'],
  'canvas.previous': ['['],
  'canvas.next': [']'],
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`canvas.go.${i + 1}`, [String(i + 1)]])),
  'canvas.rename': ['Shift+R'],
  'select.left': ['ArrowLeft'],
  'select.right': ['ArrowRight'],
  'select.up': ['ArrowUp'],
  'select.down': ['ArrowDown'],
  'terminal.enter': ['Enter'],
  'terminal.park': ['P'],
  'terminal.rename': ['R'],
  'terminal.moveToCanvas': ['M'],
  'parked.restoreLast': ['U'],
  'parked.open': ['Shift+P'],
  'notes.toggle': ['E'],
  'attention.next': ['W'],
  'outside.open': ['O'],
  'view.fit': ['F'],
  'view.actualSize': ['0'],
  'shortcuts.show': ['?'],
  'panels.close': ['Escape'],
};

/**
 * Chords that work everywhere, a focused terminal included. On macOS they
 * all hold Control and Command together, which no shell receives and no
 * browser is known to use, apart from ⌘K. Elsewhere they hold Ctrl and Shift.
 */
const digits = (modifier: string): Defaults =>
  Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`canvas.go.${i + 1}`, [`${modifier}+${i + 1}`]]));

/**
 * The chords browsers use to switch their own tabs, bound to canvases. In an
 * installed app window there are no browser tabs and these are expected to
 * arrive; in a browser tab the browser usually takes them first, and they
 * work only where it does not. They are bound in both: it costs nothing.
 */
const TAB_SWITCHING: Record<Platform, Defaults> = {
  mac: {
    'canvas.next': ['Ctrl+Tab', 'Meta+Shift+]', 'Meta+Alt+ArrowRight', 'Ctrl+PageDown'],
    'canvas.previous': ['Ctrl+Shift+Tab', 'Meta+Shift+[', 'Meta+Alt+ArrowLeft', 'Ctrl+PageUp'],
    ...digits('Meta'),
  },
  other: {
    'canvas.next': ['Ctrl+Tab', 'Ctrl+PageDown'],
    'canvas.previous': ['Ctrl+Shift+Tab', 'Ctrl+PageUp'],
    ...digits('Ctrl'),
  },
};

const ALWAYS_DEFAULTS: Record<Platform, Defaults> = {
  mac: {
    'palette.toggle': ['Meta+K'],
    'canvas.previous': ['Ctrl+Meta+['],
    'canvas.next': ['Ctrl+Meta+]'],
    'focus.left': ['Ctrl+Meta+ArrowLeft'],
    'focus.right': ['Ctrl+Meta+ArrowRight'],
    'focus.up': ['Ctrl+Meta+ArrowUp'],
    'focus.down': ['Ctrl+Meta+ArrowDown'],
    'terminal.leave': ['Ctrl+Meta+.'],
    'attention.next': ['Ctrl+Meta+J'],
  },
  other: {
    'palette.toggle': ['Ctrl+Shift+K'],
    'canvas.previous': ['Ctrl+Shift+['],
    'canvas.next': ['Ctrl+Shift+]'],
    'focus.left': ['Ctrl+Shift+ArrowLeft'],
    'focus.right': ['Ctrl+Shift+ArrowRight'],
    'focus.up': ['Ctrl+Shift+ArrowUp'],
    'focus.down': ['Ctrl+Shift+ArrowDown'],
    'terminal.leave': ['Ctrl+Shift+.'],
    // No chord for "next waiting session" here: nothing free is known. It is in the palette.
  },
};

/** The keys each command has before the settings file is applied. */
export function defaultShortcuts(platform: Platform): Record<CommandId, string[]> {
  const always = ALWAYS_DEFAULTS[platform];
  const tabs = TAB_SWITCHING[platform];
  return Object.fromEntries(
    COMMAND_IDS.map((id) => [id, [...(always[id] ?? []), ...(PLAIN_DEFAULTS[id] ?? []), ...(tabs[id] ?? [])]]),
  ) as Record<CommandId, string[]>;
}

/**
 * `shortcuts` in the settings file: command name to a chord, a list of
 * chords, or `null` for no key. Kept loose on purpose: a mistake in one entry
 * is reported and that entry skipped, it does not throw the whole file away.
 */
export const ShortcutSettings = z.record(z.string().max(100), z.unknown());
export type ShortcutSettings = z.infer<typeof ShortcutSettings>;

export interface Binding {
  command: CommandId;
  chord: Chord;
  /**
   * `always`: works everywhere, a focused terminal included.
   * `canvas`: works only while no terminal or text field has focus.
   */
  layer: 'always' | 'canvas';
  /**
   * Set when the browser is known to keep this chord in this kind of window:
   * what it does there instead. The chord is bound all the same and works
   * wherever the browser lets it through.
   */
  kept: string | null;
}

export interface ShortcutProblem {
  /** The command the problem is about, when there is one. */
  command: string;
  message: string;
}

export interface ResolvedShortcuts {
  bindings: Binding[];
  problems: ShortcutProblem[];
}

function chordsOf(value: unknown): string[] | null {
  if (value === null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) return value;
  return null;
}

/**
 * Works out the active keys: the defaults for the platform, then `shortcuts`
 * from the settings file, then (in an app window only) `shortcutsInAppWindow`.
 * Whatever is wrong with the file comes back as a list of problems.
 */
export function resolveShortcuts(input: {
  platform: Platform;
  mode: WindowMode;
  shortcuts?: ShortcutSettings;
  shortcutsInAppWindow?: ShortcutSettings;
}): ResolvedShortcuts {
  const { platform, mode } = input;
  const problems: ShortcutProblem[] = [];
  const chosen: Record<string, string[]> = defaultShortcuts(platform);
  const fromFile = new Set<string>();

  const layers: [string, ShortcutSettings | undefined][] = [
    ['shortcuts', input.shortcuts],
    ...(mode === 'app' ? [['shortcutsInAppWindow', input.shortcutsInAppWindow] as [string, ShortcutSettings | undefined]] : []),
  ];
  for (const [where, settings] of layers) {
    for (const [command, value] of Object.entries(settings ?? {})) {
      if (!isCommandId(command)) {
        problems.push({ command, message: `${where}: there is no command named "${command}".` });
        continue;
      }
      const chords = chordsOf(value);
      if (!chords) {
        problems.push({ command, message: `${where}: the value for "${command}" must be a chord, a list of chords, or null.` });
        continue;
      }
      chosen[command] = chords;
      fromFile.add(command);
    }
  }

  const bindings: Binding[] = [];
  const taken = new Map<string, CommandId>();
  for (const command of COMMAND_IDS) {
    for (const text of chosen[command] ?? []) {
      let chord: Chord;
      try {
        chord = parseChord(text);
      } catch (error) {
        if (!(error instanceof ChordError)) throw error;
        problems.push({ command, message: `"${text}" for "${command}" is not a chord: ${error.message}.` });
        continue;
      }
      const shown = formatChord(chord, platform);
      const id = chordId(chord);
      const other = taken.get(id);
      if (other && other !== command) {
        problems.push({ command, message: `${shown} is set for both "${other}" and "${command}". It runs "${other}"; "${command}" has no such key.` });
        continue;
      }
      if (other === command) continue;
      const kept = keptByBrowser(chord, platform, mode);
      // A default that the browser keeps is simply marked on the sheet. One the user set is worth a warning.
      if (kept && fromFile.has(command)) {
        problems.push({
          command,
          message: `${shown} for "${command}" may not reach this page: the browser usually keeps it (it ${kept})${mode === 'tab' ? ' in a browser tab' : ''}. It is bound all the same.`,
        });
      }
      const layer = belongsToTerminal(chord, platform) ? 'canvas' : 'always';
      if (layer === 'canvas' && !isPlainKey(chord) && fromFile.has(command)) {
        problems.push({
          command,
          message: `${shown} for "${command}" is a key programs in a terminal use, so it works only while no terminal has focus.`,
        });
      }
      taken.set(id, command);
      bindings.push({ command, chord, layer, kept });
    }
  }
  return { bindings, problems };
}
