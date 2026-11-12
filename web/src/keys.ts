/** Keyboard rules shared by the canvas and the terminals. */

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * The one shortcut that always reaches the canvas, even while a terminal has
 * focus: ⌘K on macOS, Ctrl+Shift+K elsewhere (plain Ctrl+K belongs to the shell).
 */
export function isCanvasChord(event: KeyLike, mac: boolean): boolean {
  if (event.key.toLowerCase() !== 'k' || event.altKey) return false;
  return mac
    ? event.metaKey && !event.ctrlKey && !event.shiftKey
    : event.ctrlKey && event.shiftKey && !event.metaKey;
}

/** Ctrl+Shift+V pastes on systems where plain Ctrl+V is a terminal key. */
export function isPasteChord(event: KeyLike, mac: boolean): boolean {
  return !mac && event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'v';
}

export type CanvasAction = 'new-terminal' | 'zoom-100' | 'zoom-fit';

/** Single-key shortcuts that work only while no terminal or text field has focus. */
export function canvasShortcut(event: KeyLike): CanvasAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case 'n':
      return 'new-terminal';
    case '0':
      return 'zoom-100';
    case 'f':
      return 'zoom-fit';
    default:
      return null;
  }
}

/** True when keystrokes belong to whatever has focus (a terminal or a text field). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
