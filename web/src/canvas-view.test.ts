import { describe, expect, it } from 'vitest';
import { canvasViewFrom, columnFoldedFrom, nextCanvasView } from './canvas-view';

describe('how the canvases are shown', () => {
  it('is the column unless this browser chose tabs or the list', () => {
    expect(canvasViewFrom(null)).toBe('column');
    expect(canvasViewFrom('tabs')).toBe('tabs');
    expect(canvasViewFrom('list')).toBe('list');
    expect(canvasViewFrom('column')).toBe('column');
    expect(canvasViewFrom('dropdown')).toBe('column');
    expect(canvasViewFrom('')).toBe('column');
  });

  it('the command goes through the three in turn', () => {
    expect(nextCanvasView('tabs')).toBe('list');
    expect(nextCanvasView('list')).toBe('column');
    expect(nextCanvasView('column')).toBe('tabs');
  });

  it('the column is open unless this browser folded it', () => {
    expect(columnFoldedFrom(null)).toBe(false);
    expect(columnFoldedFrom('yes')).toBe(true);
    expect(columnFoldedFrom('no')).toBe(false);
    expect(columnFoldedFrom('')).toBe(false);
  });
});
