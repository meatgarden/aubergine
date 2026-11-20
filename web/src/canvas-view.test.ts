import { describe, expect, it } from 'vitest';
import { canvasViewFrom, nextCanvasView } from './canvas-view';

describe('how the canvases are shown', () => {
  it('is tabs unless this browser chose the list', () => {
    expect(canvasViewFrom(null)).toBe('tabs');
    expect(canvasViewFrom('tabs')).toBe('tabs');
    expect(canvasViewFrom('list')).toBe('list');
    expect(canvasViewFrom('column')).toBe('column');
    expect(canvasViewFrom('dropdown')).toBe('tabs');
    expect(canvasViewFrom('')).toBe('tabs');
  });

  it('the command goes through the three in turn', () => {
    expect(nextCanvasView('tabs')).toBe('list');
    expect(nextCanvasView('list')).toBe('column');
    expect(nextCanvasView('column')).toBe('tabs');
  });
});
