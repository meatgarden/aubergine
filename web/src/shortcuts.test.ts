import { describe, expect, it } from 'vitest';
import { COMMAND_IDS, resolveShortcuts, type KeyPress } from '@aubergine/shared';
import { COMMANDS } from './commands';
import { pickBinding } from './shortcuts';

const press = (key: string, code: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

const mac = resolveShortcuts({ platform: 'mac', mode: 'tab' }).bindings;
const other = resolveShortcuts({ platform: 'other', mode: 'tab' }).bindings;

describe('the command list', () => {
  it('implements every command name exactly once', () => {
    expect(COMMANDS.map((c) => c.id).sort()).toEqual([...COMMAND_IDS].sort());
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    for (const command of COMMANDS) {
      expect(command.title.length, command.id).toBeGreaterThan(3);
      expect(command.description.endsWith('.'), command.id).toBe(true);
    }
  });
});

describe('pickBinding', () => {
  it('runs plain keys on the canvas only', () => {
    expect(pickBinding(press('n', 'KeyN'), mac, 'canvas')?.command).toBe('terminal.new');
    expect(pickBinding(press('n', 'KeyN'), mac, 'terminal')).toBeNull();
    expect(pickBinding(press('n', 'KeyN'), mac, 'text')).toBeNull();
    expect(pickBinding(press('Escape', 'Escape'), mac, 'terminal')).toBeNull();
    expect(pickBinding(press('Escape', 'Escape'), mac, 'canvas')?.command).toBe('panels.close');
    expect(pickBinding(press('?', 'Slash', { shiftKey: true }), mac, 'canvas')?.command).toBe('shortcuts.show');
    expect(pickBinding(press('3', 'Digit3'), mac, 'canvas')?.command).toBe('canvas.go.3');
    expect(pickBinding(press('ArrowLeft', 'ArrowLeft'), mac, 'canvas')?.command).toBe('select.left');
  });

  it('runs the chords of the always layer inside a terminal too', () => {
    const chord = { ctrlKey: true, metaKey: true };
    expect(pickBinding(press('k', 'KeyK', { metaKey: true }), mac, 'terminal')?.command).toBe('palette.toggle');
    expect(pickBinding(press('ArrowLeft', 'ArrowLeft', chord), mac, 'terminal')?.command).toBe('focus.left');
    expect(pickBinding(press(']', 'BracketRight', chord), mac, 'terminal')?.command).toBe('canvas.next');
    expect(pickBinding(press('.', 'Period', chord), mac, 'terminal')?.command).toBe('terminal.leave');
    expect(pickBinding(press('j', 'KeyJ', chord), mac, 'text')?.command).toBe('attention.next');
    expect(pickBinding(press('K', 'KeyK', { ctrlKey: true, shiftKey: true }), other, 'terminal')?.command).toBe('palette.toggle');
    expect(pickBinding(press('ArrowUp', 'ArrowUp', { ctrlKey: true, shiftKey: true }), other, 'terminal')?.command).toBe('focus.up');
  });

  it('takes Ctrl+Tab inside a terminal, and never Tab or Shift+Tab', () => {
    for (const bindings of [mac, other]) {
      expect(pickBinding(press('Tab', 'Tab', { ctrlKey: true }), bindings, 'terminal')?.command).toBe('canvas.next');
      expect(pickBinding(press('Tab', 'Tab', { ctrlKey: true, shiftKey: true }), bindings, 'terminal')?.command).toBe('canvas.previous');
      expect(pickBinding(press('Tab', 'Tab'), bindings, 'terminal')).toBeNull();
      expect(pickBinding(press('Tab', 'Tab', { shiftKey: true }), bindings, 'terminal')).toBeNull();
      expect(pickBinding(press('Tab', 'Tab'), bindings, 'text')).toBeNull();
    }
    // The other tab keys with Command reach the canvas from a terminal on macOS.
    expect(pickBinding(press('}', 'BracketRight', { metaKey: true, shiftKey: true }), mac, 'terminal')?.command).toBe('canvas.next');
    expect(pickBinding(press('ArrowLeft', 'ArrowLeft', { metaKey: true, altKey: true }), mac, 'terminal')?.command).toBe('canvas.previous');
    expect(pickBinding(press('3', 'Digit3', { metaKey: true }), mac, 'terminal')?.command).toBe('canvas.go.3');
    // Ctrl with a digit or with Page Down may mean something to a program: outside terminals only.
    expect(pickBinding(press('3', 'Digit3', { ctrlKey: true }), other, 'terminal')).toBeNull();
    expect(pickBinding(press('3', 'Digit3', { ctrlKey: true }), other, 'canvas')?.command).toBe('canvas.go.3');
    expect(pickBinding(press('PageDown', 'PageDown', { ctrlKey: true }), mac, 'terminal')).toBeNull();
    expect(pickBinding(press('PageDown', 'PageDown', { ctrlKey: true }), mac, 'canvas')?.command).toBe('canvas.next');
  });

  it('lets a function key through from a list or a text field, never from a terminal', () => {
    expect(pickBinding(press('F6', 'F6'), mac, 'canvas')?.command).toBe('controls.focus');
    expect(pickBinding(press('F6', 'F6'), mac, 'text')?.command).toBe('controls.focus');
    expect(pickBinding(press('F6', 'F6'), mac, 'terminal')).toBeNull();
  });

  it('leaves the shell every key it needs', () => {
    const shellKeys: KeyPress[] = [
      press('c', 'KeyC', { ctrlKey: true }),
      press('r', 'KeyR', { ctrlKey: true }),
      press('a', 'KeyA', { ctrlKey: true }),
      press('e', 'KeyE', { ctrlKey: true }),
      press('k', 'KeyK', { ctrlKey: true }),
      press('b', 'KeyB', { ctrlKey: true }),
      press('[', 'BracketLeft', { ctrlKey: true }),
      press('ArrowLeft', 'ArrowLeft', { altKey: true }),
      press('ArrowRight', 'ArrowRight', { altKey: true }),
      press('∫', 'KeyB', { altKey: true }),
      press('Escape', 'Escape'),
      press('Enter', 'Enter'),
      press('Tab', 'Tab'),
      press('Tab', 'Tab', { shiftKey: true }),
      press('p', 'KeyP'),
      press('ArrowUp', 'ArrowUp'),
      press('ArrowLeft', 'ArrowLeft', { ctrlKey: true }),
    ];
    for (const bindings of [mac, other]) {
      for (const key of shellKeys) expect(pickBinding(key, bindings, 'terminal'), JSON.stringify(key)).toBeNull();
    }
  });
});
