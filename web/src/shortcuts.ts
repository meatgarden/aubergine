import {
  formatChord,
  matchesChord,
  resolveShortcuts,
  type Binding,
  type CommandId,
  type KeyPress,
  type Platform,
  type ResolvedShortcuts,
  type Settings,
  type WindowMode,
} from '@aubergine/shared';
import { commandById } from './commands';
import { isMac, isTypingTarget } from './keys';
import { useApp } from './store';

export function platform(): Platform {
  return isMac() ? 'mac' : 'other';
}

/** Whether this page is in a window of its own (an installed app) or in a browser tab. */
export function windowMode(): WindowMode {
  const modes = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'];
  return modes.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ? 'app' : 'tab';
}

let cache: { settings: Settings; resolved: ResolvedShortcuts } | null = null;

/** The keys in effect: the defaults for this system with the settings file applied. */
export function activeShortcuts(settings: Settings = useApp.getState().settings): ResolvedShortcuts {
  if (cache?.settings !== settings) {
    cache = {
      settings,
      resolved: resolveShortcuts({
        platform: platform(),
        mode: windowMode(),
        shortcuts: settings.shortcuts,
        shortcutsInAppWindow: settings.shortcutsInAppWindow,
      }),
    };
  }
  return cache.resolved;
}

/** Where the keyboard is: in a terminal, in a text field, or on the canvas itself. */
export type KeyPlace = 'terminal' | 'text' | 'canvas';

export function placeOf(target: EventTarget | null): KeyPlace {
  if (!(target instanceof Element)) return 'canvas';
  if (target.closest('.xterm')) return 'terminal';
  // A menu or a list has its own keys (arrows, digits, Enter), as a text field does.
  if (target.closest('[role="menu"], [role="listbox"]')) return 'text';
  return isTypingTarget(target) ? 'text' : 'canvas';
}

/**
 * Whether a plain key belongs to the control that has the keyboard rather
 * than to the canvas: Enter and Space press a focused button, and inside a
 * panel only Escape is the canvas's (it closes the panel).
 */
export function belongsToControl(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[role="dialog"], [role="alertdialog"]')) return key !== 'Escape';
  return (key === 'Enter' || key === ' ') && target.closest('button, a[href], summary, [role="button"]') !== null;
}

/**
 * The binding a key press triggers, given where the keyboard is. Keys of the
 * `canvas` layer count only on the canvas itself: in a terminal or a text
 * field they are typing. Chords of the `always` layer count everywhere.
 */
export function pickBinding(press: KeyPress, bindings: readonly Binding[], place: KeyPlace): Binding | null {
  for (const binding of bindings) {
    if (binding.layer === 'canvas' && place !== 'canvas') continue;
    if (matchesChord(press, binding.chord)) return binding;
  }
  return null;
}

/** The keys of a command as the user's keyboard shows them, for buttons, the palette and the sheet. */
export function keysOf(id: CommandId, settings?: Settings): string[] {
  return activeShortcuts(settings)
    .bindings.filter((binding) => binding.command === id)
    .map((binding) => formatChord(binding.chord, platform()));
}

/** A button's tooltip: what it does, and its keys if it has any. */
export function hint(id: CommandId, text?: string): string {
  const keys = keysOf(id);
  return `${text ?? commandById(id).title}${keys.length > 0 ? ` (${keys.join(' or ')})` : ''}`;
}

/**
 * Handles a key press for the whole page. Returns true when it was a shortcut
 * and has been dealt with.
 */
export function handleKey(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  const state = useApp.getState();
  // A question is on screen: its own keys only.
  if (state.closing !== null || state.closingCanvas !== null) return false;
  const place = placeOf(event.target);
  const binding = pickBinding(event, activeShortcuts(state.settings).bindings, place);
  if (!binding) return false;
  // With the palette open, plain keys are typing even if the field has lost the keyboard.
  if (state.picker && binding.layer === 'canvas') return false;
  if (binding.layer === 'canvas' && belongsToControl(event.target, event.key)) return false;
  // A terminal has just been given the keyboard, or is about to be, and the view may still be
  // on its way there: what is typed in that moment is meant for the terminal, not the canvas.
  const settling = Date.now() < state.settleUntil;
  if (binding.layer === 'canvas' && place === 'canvas' && settling) {
    event.preventDefault();
    return true;
  }
  const command = commandById(binding.command);
  const available = command.available(state);
  // A chord that works inside terminals is always ours: it must not reach the shell even when
  // there is nothing for it to do. A plain key with nothing to do is left alone.
  if (!available && binding.layer === 'canvas') return false;
  event.preventDefault();
  event.stopPropagation();
  if (available) command.run(state);
  return true;
}

/** Starts listening for shortcuts; returns the function that stops. */
export function startShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    handleKey(event);
  };
  // Capture phase, so a chord is seen before a focused terminal gets it.
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}
