/**
 * Key chords: how they are written in the settings file, matched against a
 * key press, and shown to the user. No browser or Node APIs here.
 */

export type Platform = 'mac' | 'other';
/** A normal browser tab, or a window of its own (an installed app). */
export type WindowMode = 'tab' | 'app';

export interface Chord {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** A named key (`ArrowLeft`, `Enter`, `Escape`…) or one character, letters in upper case. */
  key: string;
}

/** The parts of a keyboard event that matching needs. */
export interface KeyPress {
  key: string;
  /** The physical key (`KeyK`, `BracketLeft`…); empty when the browser gives none. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const NAMED_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
] as const;

const KEY_ALIASES: Record<string, string> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  esc: 'Escape',
  return: 'Enter',
  spacebar: 'Space',
  del: 'Delete',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  pageup: 'PageUp',
};

const MODIFIER_ALIASES: Record<string, 'ctrl' | 'meta' | 'alt' | 'shift'> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  '⌃': 'ctrl',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta',
  '⌘': 'meta',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  '⌥': 'alt',
  shift: 'shift',
  '⇧': 'shift',
};

/** Physical keys of the characters a chord may name, on a US layout. */
const PUNCTUATION_CODES: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '.': 'Period',
  ',': 'Comma',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
  '\\': 'Backslash',
};

export class ChordError extends Error {}

/**
 * Reads a chord such as `Ctrl+Meta+ArrowLeft`, `cmd+k`, `Shift+R` or `?`.
 * Modifier names are forgiving (`Cmd`, `Option`, `Control`); the key is one
 * character or a named key.
 */
export function parseChord(text: string): Chord {
  const trimmed = text.trim();
  if (trimmed === '') throw new ChordError('It is empty');
  // "+" is the separator, so a chord for the plus key itself ends in "++" or is just "+".
  const parts = trimmed === '+' ? ['+'] : trimmed.endsWith('++') ? [...trimmed.slice(0, -2).split('+'), '+'] : trimmed.split('+');
  const keyPart = (parts.pop() ?? '').trim();
  const chord: Chord = { ctrl: false, meta: false, alt: false, shift: false, key: '' };
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.trim().toLowerCase()];
    if (!modifier) throw new ChordError(`"${part.trim()}" is not a modifier (use Ctrl, Meta or Cmd, Alt or Option, Shift)`);
    if (chord[modifier]) throw new ChordError(`${part.trim()} is there twice`);
    chord[modifier] = true;
  }
  if (keyPart === '') throw new ChordError('It names no key');
  if (MODIFIER_ALIASES[keyPart.toLowerCase()]) throw new ChordError('It has only modifiers and no key');
  const named = NAMED_KEYS.find((name) => name.toLowerCase() === keyPart.toLowerCase()) ?? KEY_ALIASES[keyPart.toLowerCase()];
  if (named) chord.key = named;
  else if ([...keyPart].length === 1 && keyPart !== ' ') chord.key = keyPart.toUpperCase();
  else throw new ChordError(`"${keyPart}" is not a key (use one character, or a name such as ArrowLeft, Enter, Escape, F5)`);
  return chord;
}

/** The canonical way to write a chord: `Ctrl+Meta+Alt+Shift+Key`. */
export function chordId(chord: Chord): string {
  return [chord.ctrl && 'Ctrl', chord.meta && 'Meta', chord.alt && 'Alt', chord.shift && 'Shift', chord.key].filter(Boolean).join('+');
}

const MAC_SYMBOLS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '↩',
  Escape: 'esc',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  Space: 'space',
};
const OTHER_NAMES: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc' };

/** A chord as the user's keyboard shows it: `⌃⌘←` on macOS, `Ctrl+Shift+Left` elsewhere. */
export function formatChord(chord: Chord, platform: Platform): string {
  if (platform === 'mac') {
    return `${chord.ctrl ? '⌃' : ''}${chord.alt ? '⌥' : ''}${chord.shift ? '⇧' : ''}${chord.meta ? '⌘' : ''}${MAC_SYMBOLS[chord.key] ?? chord.key}`;
  }
  const key = OTHER_NAMES[chord.key] ?? chord.key;
  return [chord.ctrl && 'Ctrl', chord.meta && 'Super', chord.alt && 'Alt', chord.shift && 'Shift', key].filter(Boolean).join('+');
}

/** True for a chord with no Ctrl, Meta or Alt: a key that would otherwise type something. */
export function isPlainKey(chord: Chord): boolean {
  return !chord.ctrl && !chord.meta && !chord.alt;
}

function codeOf(key: string): string | null {
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return PUNCTUATION_CODES[key] ?? null;
}

function namedKeyOf(press: KeyPress): string {
  return press.key === ' ' ? 'Space' : press.key;
}

/**
 * Whether a key press is this chord.
 *
 * A plain key is compared by the character it types, so `?` works on any
 * layout and needs no mention of Shift. A chord with Ctrl, Meta or Alt is
 * compared by the physical key where there is one, because those modifiers
 * change the character (Option+K types `˚` on macOS).
 */
export function matchesChord(press: KeyPress, chord: Chord): boolean {
  if (press.ctrlKey !== chord.ctrl || press.metaKey !== chord.meta || press.altKey !== chord.alt) return false;
  const isCharacter = [...chord.key].length === 1;
  if (!isCharacter) return press.shiftKey === chord.shift && namedKeyOf(press) === chord.key;
  if (isPlainKey(chord)) {
    if (/^[A-Z]$/.test(chord.key)) return press.shiftKey === chord.shift && press.key.toUpperCase() === chord.key;
    // Digits and punctuation: the character itself says whether Shift was needed.
    return press.key === chord.key && (!chord.shift || press.shiftKey);
  }
  if (press.shiftKey !== chord.shift) return false;
  const code = codeOf(chord.key);
  if (code && press.code) return press.code === code;
  return press.key.toUpperCase() === chord.key;
}

/** The chord a key press amounts to, for showing what was pressed. Null for a modifier on its own. */
export function chordOfPress(press: KeyPress): Chord | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'OS', 'Hyper', 'Super', 'CapsLock', 'Dead', 'Unidentified'].includes(press.key)) return null;
  let key = namedKeyOf(press);
  const fromCode = /^Key([A-Z])$/.exec(press.code ?? '')?.[1] ?? /^Digit([0-9])$/.exec(press.code ?? '')?.[1];
  const punctuation = Object.entries(PUNCTUATION_CODES).find(([, code]) => code === press.code)?.[0];
  if ([...key].length === 1 || key === 'Dead') key = fromCode ?? punctuation ?? key.toUpperCase();
  return { ctrl: press.ctrlKey, meta: press.metaKey, alt: press.altKey, shift: press.shiftKey, key };
}

/**
 * Whether a program in a terminal may need this chord, so that it must never
 * be taken while a terminal has focus.
 *
 * Shells, editors and tmux use plain keys, Ctrl with a key, and Alt/Option
 * with a key. What is left for the canvas: chords with Meta (⌘) on macOS,
 * which a terminal never passes on, and Ctrl+Shift chords elsewhere, which
 * terminals have long kept for themselves (copy and paste) because a program
 * cannot tell Ctrl+Shift+K from Ctrl+K.
 *
 * One exception, and it stays this narrow: Ctrl+Tab and Ctrl+Shift+Tab. A
 * terminal has no way to pass Ctrl+Tab on as a key of its own (a program
 * would receive a plain Tab), so no program can be waiting for it, and it is
 * what browsers use to switch tabs. Plain Tab and Shift+Tab are completion
 * and always belong to the program.
 */
export function belongsToTerminal(chord: Chord, platform: Platform): boolean {
  if (isPlainKey(chord)) return true;
  if (chord.key === 'Tab' && chord.ctrl && !chord.meta && !chord.alt) return false;
  if (platform === 'mac') return !chord.meta;
  if (chord.meta) return false;
  return !(chord.ctrl && chord.shift && !chord.alt);
}

interface Kept {
  chord: string;
  platform: Platform;
  /** Where it is kept. Chords for tabs and windows may be free in an app window. */
  modes: readonly WindowMode[];
  why: string;
}

const tabDigits = (modifier: string, platform: Platform): Kept[] =>
  Array.from({ length: 9 }, (_, i) => ({ chord: `${modifier}+${i + 1}`, platform, modes: ['tab'] as const, why: 'switches browser tabs' }));

/**
 * Chords a page cannot count on. This is what browsers document and what is
 * widely observed, not a measurement made on this machine; `docs/keys.md`
 * says what was measured and how to measure the rest.
 */
const KEPT: Kept[] = [
  { chord: 'Meta+T', platform: 'mac', modes: ['tab'], why: 'opens a browser tab' },
  { chord: 'Meta+N', platform: 'mac', modes: ['tab', 'app'], why: 'opens a browser window' },
  { chord: 'Meta+W', platform: 'mac', modes: ['tab', 'app'], why: 'closes the tab or window' },
  { chord: 'Meta+Q', platform: 'mac', modes: ['tab', 'app'], why: 'quits the browser' },
  { chord: 'Meta+Shift+T', platform: 'mac', modes: ['tab'], why: 'reopens a closed tab' },
  { chord: 'Meta+Shift+N', platform: 'mac', modes: ['tab', 'app'], why: 'opens a private window' },
  { chord: 'Meta+Shift+W', platform: 'mac', modes: ['tab', 'app'], why: 'closes the window' },
  { chord: 'Meta+Shift+[', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Meta+Shift+]', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Meta+Alt+ArrowLeft', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Meta+Alt+ArrowRight', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+Tab', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+Shift+Tab', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+PageUp', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+PageDown', platform: 'mac', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Meta+Tab', platform: 'mac', modes: ['tab', 'app'], why: 'switches applications' },
  { chord: 'Meta+Space', platform: 'mac', modes: ['tab', 'app'], why: 'opens system search' },
  { chord: 'Meta+H', platform: 'mac', modes: ['tab', 'app'], why: 'hides the application' },
  { chord: 'Meta+M', platform: 'mac', modes: ['tab', 'app'], why: 'minimizes the window' },
  { chord: 'Meta+`', platform: 'mac', modes: ['tab', 'app'], why: 'switches windows' },
  { chord: 'Ctrl+Meta+Q', platform: 'mac', modes: ['tab', 'app'], why: 'locks the screen' },
  { chord: 'Ctrl+Meta+F', platform: 'mac', modes: ['tab', 'app'], why: 'toggles full screen' },
  { chord: 'Ctrl+Meta+Space', platform: 'mac', modes: ['tab', 'app'], why: 'opens the character viewer' },
  { chord: 'Ctrl+Meta+D', platform: 'mac', modes: ['tab', 'app'], why: 'looks up a word' },
  ...tabDigits('Meta', 'mac'),
  { chord: 'Ctrl+T', platform: 'other', modes: ['tab'], why: 'opens a browser tab' },
  { chord: 'Ctrl+N', platform: 'other', modes: ['tab', 'app'], why: 'opens a browser window' },
  { chord: 'Ctrl+W', platform: 'other', modes: ['tab', 'app'], why: 'closes the tab or window' },
  { chord: 'Ctrl+Shift+T', platform: 'other', modes: ['tab'], why: 'reopens a closed tab' },
  { chord: 'Ctrl+Shift+N', platform: 'other', modes: ['tab', 'app'], why: 'opens a private window' },
  { chord: 'Ctrl+Shift+W', platform: 'other', modes: ['tab', 'app'], why: 'closes the window' },
  { chord: 'Ctrl+Shift+Q', platform: 'other', modes: ['tab', 'app'], why: 'quits the browser' },
  { chord: 'Ctrl+Tab', platform: 'other', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+Shift+Tab', platform: 'other', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+PageUp', platform: 'other', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+PageDown', platform: 'other', modes: ['tab'], why: 'switches browser tabs' },
  { chord: 'Ctrl+Shift+I', platform: 'other', modes: ['tab', 'app'], why: 'opens the developer tools' },
  { chord: 'Ctrl+Shift+J', platform: 'other', modes: ['tab', 'app'], why: 'opens the developer tools' },
  { chord: 'Ctrl+Shift+Escape', platform: 'other', modes: ['tab', 'app'], why: 'opens the system task manager' },
  { chord: 'Alt+F4', platform: 'other', modes: ['tab', 'app'], why: 'closes the window' },
  { chord: 'Alt+Tab', platform: 'other', modes: ['tab', 'app'], why: 'switches applications' },
  ...tabDigits('Ctrl', 'other'),
];

const KEPT_INDEX = new Map(KEPT.map((entry) => [`${entry.platform}:${chordId(parseChord(entry.chord))}`, entry]));

/**
 * Why a page cannot count on this chord in this kind of window, or null when
 * nothing is known against it. A chord may be bound all the same: binding one
 * the browser keeps costs nothing, and it works wherever the browser does
 * let it through.
 */
export function keptByBrowser(chord: Chord, platform: Platform, mode: WindowMode): string | null {
  const entry = KEPT_INDEX.get(`${platform}:${chordId(chord)}`);
  return entry && entry.modes.includes(mode) ? entry.why : null;
}

/** Every chord known to be kept on a platform, for the key tester and the docs. */
export function keptChords(platform: Platform): { chord: Chord; modes: readonly WindowMode[]; why: string }[] {
  return KEPT.filter((entry) => entry.platform === platform).map((entry) => ({ chord: parseChord(entry.chord), modes: entry.modes, why: entry.why }));
}
