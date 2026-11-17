import { describe, expect, it } from 'vitest';
import { noteRoom, noteStartsOpen, rememberNoteOpen } from './note-open';

describe("a terminal's note beside it", () => {
  const storage = () => {
    const kept = new Map<string, string>();
    return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) };
  };
  it('is open until it is closed, and that is remembered for that terminal alone', () => {
    const s = storage();
    expect(noteStartsOpen('a', s)).toBe(true);
    rememberNoteOpen('a', false, s);
    expect(noteStartsOpen('a', s)).toBe(false);
    expect(noteStartsOpen('b', s)).toBe(true);
    rememberNoteOpen('a', true, s);
    expect(noteStartsOpen('a', s)).toBe(true);
  });
  it('is open where nothing can be remembered or what was kept is not a list', () => {
    expect(noteStartsOpen('a', null)).toBe(true);
    expect(noteStartsOpen('a', { getItem: () => '{"a":1}' })).toBe(true);
    expect(noteStartsOpen('a', { getItem: () => 'not json' })).toBe(true);
  });
});

describe('room for a note beside its terminal', () => {
  const me = { x: 0, y: 0, width: 700, height: 400 };
  it('is all there when nothing is to the right', () => {
    expect(noteRoom(me, [])).toBe('full');
    expect(noteRoom(me, [{ x: 0, y: 440, width: 700, height: 400 }])).toBe('full');
    expect(noteRoom(me, [{ x: 1000, y: 0, width: 700, height: 400 }])).toBe('full');
  });
  it('is a tab when a neighbour is close, and nothing when it is closer still', () => {
    expect(noteRoom(me, [{ x: 740, y: 0, width: 700, height: 400 }])).toBe('tab');
    expect(noteRoom(me, [{ x: 720, y: 100, width: 700, height: 400 }])).toBe('none');
  });
  it('does not mind a neighbour that is above or below the terminal', () => {
    expect(noteRoom(me, [{ x: 720, y: 400, width: 700, height: 400 }])).toBe('full');
  });
});
