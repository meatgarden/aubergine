import { describe, expect, it } from 'vitest';
import { ChordError, belongsToTerminal, chordId, chordOfPress, formatChord, keptByBrowser, matchesChord, parseChord, type KeyPress } from './chords';

const press = (key: string, code: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('parseChord', () => {
  it('reads modifiers in any order and under their other names', () => {
    expect(chordId(parseChord('cmd+ctrl+left'))).toBe('Ctrl+Meta+ArrowLeft');
    expect(chordId(parseChord('Option+Shift+k'))).toBe('Alt+Shift+K');
    expect(chordId(parseChord(' Control + Meta + . '))).toBe('Ctrl+Meta+.');
    expect(chordId(parseChord('?'))).toBe('?');
    expect(chordId(parseChord('esc'))).toBe('Escape');
    expect(chordId(parseChord('Ctrl++'))).toBe('Ctrl++');
    expect(chordId(parseChord('f5'))).toBe('F5');
  });

  it('says what is wrong with a chord it cannot read', () => {
    expect(() => parseChord('')).toThrow(ChordError);
    expect(() => parseChord('Hyper+K')).toThrow(/not a modifier/);
    expect(() => parseChord('Ctrl+Ctrl+K')).toThrow(/twice/);
    expect(() => parseChord('Ctrl+Shift')).toThrow(/no key/);
    expect(() => parseChord('Ctrl+Banana')).toThrow(/not a key/);
  });
});

describe('formatChord', () => {
  it('shows a chord the way each kind of keyboard does', () => {
    const chord = parseChord('Ctrl+Meta+ArrowLeft');
    expect(formatChord(chord, 'mac')).toBe('⌃⌘←');
    expect(formatChord(parseChord('Meta+Shift+K'), 'mac')).toBe('⇧⌘K');
    expect(formatChord(parseChord('Ctrl+Shift+ArrowLeft'), 'other')).toBe('Ctrl+Shift+Left');
    expect(formatChord(parseChord('Escape'), 'other')).toBe('Esc');
  });
});

describe('matchesChord', () => {
  it('compares chords with Ctrl, Meta or Alt by the physical key', () => {
    // Option+K types "˚" on macOS; Ctrl+Meta with a bracket may type nothing useful.
    expect(matchesChord(press('˚', 'KeyK', { altKey: true }), parseChord('Alt+K'))).toBe(true);
    expect(matchesChord(press('[', 'BracketLeft', { ctrlKey: true, metaKey: true }), parseChord('Ctrl+Meta+['))).toBe(true);
    expect(matchesChord(press('{', 'BracketLeft', { ctrlKey: true, shiftKey: true }), parseChord('Ctrl+Shift+['))).toBe(true);
    expect(matchesChord(press('k', 'KeyK', { metaKey: true }), parseChord('Meta+K'))).toBe(true);
  });

  it('needs every modifier to be exactly as written', () => {
    const chord = parseChord('Meta+K');
    expect(matchesChord(press('k', 'KeyK', { metaKey: true, shiftKey: true }), chord)).toBe(false);
    expect(matchesChord(press('k', 'KeyK', { metaKey: true, ctrlKey: true }), chord)).toBe(false);
    expect(matchesChord(press('k', 'KeyK'), chord)).toBe(false);
    expect(matchesChord(press('k', 'KeyK', { ctrlKey: true }), parseChord('Ctrl+Meta+K'))).toBe(false);
  });

  it('compares plain keys by the character typed', () => {
    expect(matchesChord(press('n', 'KeyN'), parseChord('N'))).toBe(true);
    expect(matchesChord(press('N', 'KeyN', { shiftKey: true }), parseChord('N'))).toBe(false);
    expect(matchesChord(press('R', 'KeyR', { shiftKey: true }), parseChord('Shift+R'))).toBe(true);
    // "?" needs Shift on some layouts and not on others.
    expect(matchesChord(press('?', 'Slash', { shiftKey: true }), parseChord('?'))).toBe(true);
    expect(matchesChord(press('?', 'Minus'), parseChord('?'))).toBe(true);
    expect(matchesChord(press('[', 'BracketLeft'), parseChord('['))).toBe(true);
    expect(matchesChord(press('1', 'Digit1'), parseChord('1'))).toBe(true);
    expect(matchesChord(press('!', 'Digit1', { shiftKey: true }), parseChord('1'))).toBe(false);
  });

  it('matches named keys, Shift included', () => {
    expect(matchesChord(press('ArrowLeft', 'ArrowLeft'), parseChord('ArrowLeft'))).toBe(true);
    expect(matchesChord(press('ArrowLeft', 'ArrowLeft', { shiftKey: true }), parseChord('ArrowLeft'))).toBe(false);
    expect(matchesChord(press(' ', 'Space', { ctrlKey: true, shiftKey: true }), parseChord('Ctrl+Shift+Space'))).toBe(true);
  });
});

describe('chordOfPress', () => {
  it('names what was pressed, and nothing for a modifier alone', () => {
    expect(chordOfPress(press('Meta', 'MetaLeft', { metaKey: true }))).toBeNull();
    expect(chordId(chordOfPress(press('˚', 'KeyK', { altKey: true }))!)).toBe('Alt+K');
    expect(chordId(chordOfPress(press('ArrowUp', 'ArrowUp', { ctrlKey: true, metaKey: true }))!)).toBe('Ctrl+Meta+ArrowUp');
  });
});

describe('belongsToTerminal', () => {
  it('keeps everything a shell, an editor or tmux may need', () => {
    for (const platform of ['mac', 'other'] as const) {
      for (const text of ['A', 'Escape', 'Enter', 'Ctrl+C', 'Ctrl+R', 'Ctrl+A', 'Ctrl+E', 'Ctrl+B', 'Alt+B', 'Alt+ArrowLeft', 'Alt+Shift+F', 'Ctrl+Alt+X', 'Shift+Tab']) {
        expect(belongsToTerminal(parseChord(text), platform), `${text} on ${platform}`).toBe(true);
      }
    }
    // Without a Command key, Ctrl+Shift is what is left.
    expect(belongsToTerminal(parseChord('Ctrl+Shift+K'), 'mac')).toBe(true);
    expect(belongsToTerminal(parseChord('Ctrl+Shift+K'), 'other')).toBe(false);
    expect(belongsToTerminal(parseChord('Ctrl+Shift+Alt+K'), 'other')).toBe(true);
  });

  it('leaves Command chords to the canvas on macOS', () => {
    expect(belongsToTerminal(parseChord('Meta+K'), 'mac')).toBe(false);
    expect(belongsToTerminal(parseChord('Ctrl+Meta+ArrowLeft'), 'mac')).toBe(false);
  });
});

describe('keptByBrowser', () => {
  it('knows the chords a page cannot count on, per kind of window', () => {
    expect(keptByBrowser(parseChord('Meta+T'), 'mac', 'tab')).toMatch(/tab/);
    expect(keptByBrowser(parseChord('Meta+T'), 'mac', 'app')).toBeNull();
    expect(keptByBrowser(parseChord('Meta+W'), 'mac', 'app')).not.toBeNull();
    expect(keptByBrowser(parseChord('Meta+3'), 'mac', 'tab')).not.toBeNull();
    expect(keptByBrowser(parseChord('Ctrl+W'), 'other', 'tab')).not.toBeNull();
    expect(keptByBrowser(parseChord('Ctrl+W'), 'mac', 'tab')).toBeNull();
    expect(keptByBrowser(parseChord('Ctrl+Meta+ArrowLeft'), 'mac', 'tab')).toBeNull();
  });
});
