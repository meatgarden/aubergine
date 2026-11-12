import { describe, expect, it } from 'vitest';
import { decodeOsc52 } from './clipboard';
import { canvasShortcut, isCanvasChord, isPasteChord, type KeyLike } from './keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keyboard rules', () => {
  it('reserves one chord for the canvas and leaves the shell its own keys', () => {
    expect(isCanvasChord(key('k', { metaKey: true }), true)).toBe(true);
    expect(isCanvasChord(key('k', { ctrlKey: true }), true)).toBe(false); // kill-line stays with the shell
    expect(isCanvasChord(key('K', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isCanvasChord(key('k', { ctrlKey: true }), false)).toBe(false);
    expect(isCanvasChord(key('k'), true)).toBe(false);
  });

  it('maps single keys to canvas actions only without modifiers', () => {
    expect(canvasShortcut(key('n'))).toBe('new-terminal');
    expect(canvasShortcut(key('0'))).toBe('zoom-100');
    expect(canvasShortcut(key('F'))).toBe('zoom-fit');
    expect(canvasShortcut(key('n', { metaKey: true }))).toBeNull();
    expect(canvasShortcut(key('x'))).toBeNull();
  });

  it('uses Ctrl+Shift+V for paste away from macOS', () => {
    expect(isPasteChord(key('V', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(isPasteChord(key('v', { ctrlKey: true }), false)).toBe(false);
    expect(isPasteChord(key('V', { ctrlKey: true, shiftKey: true }), true)).toBe(false);
  });
});

describe('decodeOsc52', () => {
  it('decodes copied text, including non-ASCII', () => {
    expect(decodeOsc52('c;aGVsbG8=')).toBe('hello');
    expect(decodeOsc52(';aGVsbG8=')).toBe('hello');
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode('naïve ✓')));
    expect(decodeOsc52(`c;${encoded}`)).toBe('naïve ✓');
  });

  it('ignores clipboard queries and malformed payloads', () => {
    expect(decodeOsc52('c;?')).toBeNull();
    expect(decodeOsc52('c;')).toBeNull();
    expect(decodeOsc52('no-separator')).toBeNull();
    expect(decodeOsc52('c;***')).toBeNull();
  });
});
