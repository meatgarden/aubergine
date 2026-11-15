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

/** Ctrl+Shift+V pastes on systems where plain Ctrl+V is a terminal key. */
export function isPasteChord(event: KeyLike, mac: boolean): boolean {
  return !mac && event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'v';
}

/** True when keystrokes belong to whatever has focus (a terminal or a text field). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
