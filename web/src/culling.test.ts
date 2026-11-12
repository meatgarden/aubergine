import { describe, expect, it } from 'vitest';
import { READABLE_ZOOM, nodeMode, type CullInput } from './culling';

const base: CullInput = {
  rect: { x: 0, y: 0, width: 720, height: 440 },
  view: { x: 100, y: 100, zoom: 1 },
  pane: { width: 1400, height: 900 },
  current: 'live',
};

describe('nodeMode', () => {
  it('keeps a readable, on-screen node live', () => {
    expect(nodeMode(base)).toBe('live');
    expect(nodeMode({ ...base, view: { x: 100, y: 100, zoom: 0.6 } })).toBe('live');
  });

  it('shows a snapshot when zoomed out too far to read', () => {
    expect(nodeMode({ ...base, view: { x: 100, y: 100, zoom: READABLE_ZOOM - 0.01 } })).toBe('snapshot');
  });

  it('hides a node that is far off screen, in any direction', () => {
    for (const view of [
      { x: -5000, y: 0, zoom: 1 },
      { x: 5000, y: 0, zoom: 1 },
      { x: 0, y: -5000, zoom: 1 },
      { x: 0, y: 5000, zoom: 1 },
    ]) {
      expect(nodeMode({ ...base, view })).toBe('hidden');
    }
    expect(nodeMode({ ...base, view: { x: -5000, y: 0, zoom: 0.2 } })).toBe('hidden');
  });

  it('does not flicker at the edge: a showing node stays longer than a hidden one takes to appear', () => {
    // 300px beyond the right edge of the window.
    const view = { x: 1700, y: 100, zoom: 1 };
    expect(nodeMode({ ...base, view, current: 'live' })).toBe('live');
    expect(nodeMode({ ...base, view, current: 'snapshot' })).toBe('live');
    expect(nodeMode({ ...base, view, current: 'hidden' })).toBe('hidden');
    // Just beyond the edge, a hidden node comes back.
    expect(nodeMode({ ...base, view: { x: 1500, y: 100, zoom: 1 }, current: 'hidden' })).toBe('live');
  });

  it('treats everything as visible until the canvas has a size', () => {
    expect(nodeMode({ ...base, pane: { width: 0, height: 0 }, view: { x: -9000, y: 0, zoom: 1 } })).toBe('live');
  });
});
