import { describe, expect, it } from 'vitest';
import { belongsToTerminal, chordId, keptByBrowser, parseChord } from './chords';
import { Settings } from './settings';
import { COMMAND_IDS, defaultShortcuts, resolveShortcuts } from './shortcuts';

const keysOf = (resolved: ReturnType<typeof resolveShortcuts>, command: string): string[] =>
  resolved.bindings.filter((b) => b.command === command).map((b) => chordId(b.chord));

describe('default shortcuts', () => {
  for (const platform of ['mac', 'other'] as const) {
    it(`are valid and free of collisions on ${platform}`, () => {
      for (const mode of ['tab', 'app'] as const) {
        const resolved = resolveShortcuts({ platform, mode });
        expect(resolved.problems).toEqual([]);
        const ids = resolved.bindings.map((b) => chordId(b.chord));
        expect(new Set(ids).size).toBe(ids.length);
        for (const binding of resolved.bindings) expect(binding.kept).toBe(keptByBrowser(binding.chord, platform, mode));
      }
    });

    it(`bind the browser's tab keys to canvases on ${platform}, expected to arrive only in an app window`, () => {
      const inTab = resolveShortcuts({ platform, mode: 'tab' }).bindings;
      const inApp = resolveShortcuts({ platform, mode: 'app' }).bindings;
      const tabKeys = platform === 'mac'
        ? ['Ctrl+Tab', 'Ctrl+Shift+Tab', 'Meta+Shift+]', 'Meta+Shift+[', 'Meta+Alt+ArrowRight', 'Meta+Alt+ArrowLeft', 'Ctrl+PageDown', 'Ctrl+PageUp', 'Meta+1', 'Meta+9']
        : ['Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageDown', 'Ctrl+PageUp', 'Ctrl+1', 'Ctrl+9'];
      for (const key of tabKeys) {
        const tab = inTab.find((b) => chordId(b.chord) === key);
        const app = inApp.find((b) => chordId(b.chord) === key);
        expect(tab?.command, key).toMatch(/^canvas\.(next|previous|go\.\d)$/);
        expect(tab?.kept, key).toMatch(/tabs/);
        expect(app?.kept, key).toBeNull();
      }
      // The chords that do not depend on the browser are still there, and nothing is kept among them.
      const own = inTab.filter((b) => b.kept === null && b.layer === 'always').map((b) => b.command);
      expect(own).toContain('canvas.next');
      expect(own).toContain('canvas.previous');
    });

    it(`never take a key a terminal program needs on ${platform}`, () => {
      for (const binding of resolveShortcuts({ platform, mode: 'tab' }).bindings) {
        expect(binding.layer === 'always', chordId(binding.chord)).toBe(!belongsToTerminal(binding.chord, platform));
      }
    });
  }

  it('give every platform the chords that must work inside a terminal', () => {
    for (const platform of ['mac', 'other'] as const) {
      const always = new Set(resolveShortcuts({ platform, mode: 'tab' }).bindings.filter((b) => b.layer === 'always').map((b) => b.command));
      for (const command of ['palette.toggle', 'canvas.next', 'canvas.previous', 'focus.left', 'focus.right', 'focus.up', 'focus.down', 'terminal.leave']) {
        expect(always.has(command as never), `${command} on ${platform}`).toBe(true);
      }
    }
    // Off macOS nothing safe is known for this one: it is left to the palette.
    expect(defaultShortcuts('other')['attention.next']).toEqual(['W']);
    // Ctrl+Tab reaches the canvas from inside a terminal on both; plain Tab is never bound there.
    for (const platform of ['mac', 'other'] as const) {
      const bindings = resolveShortcuts({ platform, mode: 'app' }).bindings;
      expect(bindings.find((b) => chordId(b.chord) === 'Ctrl+Tab')?.layer).toBe('always');
      expect(bindings.find((b) => chordId(b.chord) === 'Ctrl+Shift+Tab')?.layer).toBe('always');
      for (const b of bindings.filter((x) => x.chord.key === 'Tab' && !x.chord.ctrl)) expect(b.layer).toBe('canvas');
    }
    expect(defaultShortcuts('mac')['attention.next']).toEqual(['Ctrl+Meta+J', 'W']);
  });

  it('cover every command name', () => {
    expect(Object.keys(defaultShortcuts('mac')).sort()).toEqual([...COMMAND_IDS].sort());
  });
});

describe('shortcuts from the settings file', () => {
  it('replace the keys of a command, take a list, and remove with null', () => {
    const resolved = resolveShortcuts({
      platform: 'mac',
      mode: 'tab',
      shortcuts: { 'terminal.park': 'X', 'attention.next': ['cmd+ctrl+g', 'Y'], 'view.fit': null },
    });
    expect(resolved.problems).toEqual([]);
    expect(keysOf(resolved, 'terminal.park')).toEqual(['X']);
    expect(keysOf(resolved, 'attention.next')).toEqual(['Ctrl+Meta+G', 'Y']);
    expect(keysOf(resolved, 'view.fit')).toEqual([]);
    // Everything else keeps its default.
    expect(keysOf(resolved, 'terminal.new')).toEqual(['N']);
  });

  it('reports a collision and keeps the key with the first command', () => {
    const resolved = resolveShortcuts({ platform: 'mac', mode: 'tab', shortcuts: { 'terminal.park': 'N' } });
    expect(resolved.problems).toHaveLength(1);
    expect(resolved.problems[0]?.message).toMatch(/N is set for both "terminal.new" and "terminal.park"/);
    expect(keysOf(resolved, 'terminal.new')).toEqual(['N']);
    expect(keysOf(resolved, 'terminal.park')).toEqual([]);
  });

  it('warns about a chord the browser keeps, and binds it all the same', () => {
    const resolved = resolveShortcuts({ platform: 'mac', mode: 'tab', shortcuts: { 'canvas.new': 'Meta+T' } });
    expect(resolved.problems[0]?.message).toMatch(/⌘T for "canvas.new" may not reach this page/);
    expect(keysOf(resolved, 'canvas.new')).toEqual(['Meta+T']);
    expect(resolved.bindings.find((b) => b.command === 'canvas.new')?.kept).toMatch(/tab/);
  });

  it('reports unknown commands, unreadable chords and wrong kinds of value', () => {
    const resolved = resolveShortcuts({
      platform: 'other',
      mode: 'tab',
      shortcuts: { 'terminal.explode': 'X', 'terminal.park': 'Hyper+P', 'view.fit': 7 },
    });
    expect(resolved.problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/no command named "terminal.explode"/),
      expect.stringMatching(/must be a chord, a list of chords, or null/),
      expect.stringMatching(/"Hyper\+P" for "terminal.park" is not a chord/),
    ]);
    // A value of the wrong kind leaves the default in place.
    expect(keysOf(resolved, 'view.fit')).toEqual(['F']);
  });

  it('never lets a terminal key into the layer that works inside terminals', () => {
    const resolved = resolveShortcuts({ platform: 'mac', mode: 'tab', shortcuts: { 'terminal.leave': 'Ctrl+B', 'focus.left': 'Alt+ArrowLeft' } });
    for (const command of ['terminal.leave', 'focus.left']) {
      expect(resolved.bindings.find((b) => b.command === command)?.layer).toBe('canvas');
    }
    expect(resolved.problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/⌥← for "focus.left" is a key programs in a terminal use/),
      expect.stringMatching(/⌃B for "terminal.leave" is a key programs in a terminal use/),
    ]);
  });

  it('applies the app-window keys only in an app window, where tab chords are not warned about', () => {
    const settings = { shortcutsInAppWindow: { 'canvas.new': 'Meta+T' } };
    expect(keysOf(resolveShortcuts({ platform: 'mac', mode: 'tab', ...settings }), 'canvas.new')).toEqual(['T']);
    const inApp = resolveShortcuts({ platform: 'mac', mode: 'app', ...settings });
    expect(inApp.problems).toEqual([]);
    expect(keysOf(inApp, 'canvas.new')).toEqual(['Meta+T']);
    expect(inApp.bindings.find((b) => chordId(b.chord) === 'Meta+T')?.layer).toBe('always');
  });
});

describe('settings', () => {
  it('load with shortcuts left out, and keep a wrong entry for reporting instead of failing', () => {
    expect(Settings.parse({}).shortcuts).toEqual({});
    const parsed = Settings.parse({ shortcuts: { 'terminal.park': 12, nonsense: 'X' } });
    expect(parsed.theme).toBe('system');
    expect(resolveShortcuts({ platform: 'mac', mode: 'tab', shortcuts: parsed.shortcuts }).problems).toHaveLength(2);
    expect(parseChord('Ctrl+Meta+.')).toBeTruthy();
  });
});
