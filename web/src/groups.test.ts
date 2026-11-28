import { describe, expect, it } from 'vitest';
import { NAMED_COLORS } from '@aubergine/shared';
import { GROUP_LABEL, GROUP_PAD, elsewhereOf, groupColor, groupFoldId, isGroupFolded, outlineOf, withGroupFolded } from './groups';

describe('a group of terminals, as the page draws it', () => {
  it('has a color of its name: always the same, a named one, never none', () => {
    for (const name of ['release', 'Backend', 'a', 'données 2', '🚀']) {
      expect(groupColor(name)).toBe(groupColor(name));
      expect(NAMED_COLORS).toContain(groupColor(name));
      expect(['none', 'gray']).not.toContain(groupColor(name));
    }
    expect(new Set(['release', 'backend', 'frontend', 'ops', 'data', 'docs'].map(groupColor)).size).toBeGreaterThan(1);
  });

  it('is folded or open among the folded things of the list, once', () => {
    expect(groupFoldId('release')).toBe('set:release');
    const folded = withGroupFolded(['parked'], 'release', true);
    expect(folded).toEqual(['parked', 'set:release']);
    expect(withGroupFolded(folded, 'release', true)).toEqual(['parked', 'set:release']);
    expect(isGroupFolded(folded, 'release')).toBe(true);
    expect(isGroupFolded(folded, 'parked')).toBe(false);
    expect(withGroupFolded(folded, 'release', false)).toEqual(['parked']);
  });

  it('has an outline that holds its terminals, with room for the label', () => {
    expect(outlineOf([])).toBeNull();
    expect(outlineOf([{ x: 100, y: 200, width: 300, height: 100 }, { x: 500, y: 100, width: 100, height: 400 }])).toEqual({
      x: 100 - GROUP_PAD,
      y: 100 - GROUP_PAD - GROUP_LABEL,
      width: 500 + 2 * GROUP_PAD,
      height: 400 + 2 * GROUP_PAD + GROUP_LABEL,
    });
  });

  it('says where its terminals are that are not on the canvas looked at', () => {
    const members = [{ id: 'a', state: 'open' }, { id: 'b', state: 'open' }, { id: 'c', state: 'parked' }, { id: 'd', state: 'open' }];
    const canvases = [
      { id: 'one', name: 'Main', layout: { nodes: [{ sessionId: 'a' }, { sessionId: 'x' }] } },
      { id: 'two', name: 'Deploys', layout: { nodes: [{ sessionId: 'b' }, { sessionId: 'd' }] } },
      { id: 'three', name: 'Empty', layout: { nodes: [{ sessionId: 'y' }] } },
    ];
    expect(elsewhereOf(members, canvases, 'one')).toEqual({ canvases: [{ id: 'two', name: 'Deploys', sessionIds: ['b', 'd'] }], parked: ['c'] });
    expect(elsewhereOf(members, canvases, 'two').canvases).toEqual([{ id: 'one', name: 'Main', sessionIds: ['a'] }]);
  });
});
