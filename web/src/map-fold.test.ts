import { describe, expect, it } from 'vitest';
import { MAP_ROOM, underMap } from './map-fold';

describe('the map steps aside', () => {
  const pane = { width: 1000, height: 800 };
  const still = { x: 0, y: 0, zoom: 1 };
  it('for a terminal that reaches into its corner', () => {
    expect(underMap({ x: 500, y: 400, width: 400, height: 300 }, 0, still, pane)).toBe(true);
    expect(underMap({ x: 0, y: 0, width: 400, height: 300 }, 0, still, pane)).toBe(false);
    // Left of the corner, or above it.
    expect(underMap({ x: 100, y: 500, width: pane.width - MAP_ROOM.width - 100, height: 300 }, 0, still, pane)).toBe(false);
    expect(underMap({ x: 600, y: 100, width: 400, height: pane.height - MAP_ROOM.height - 100 }, 0, still, pane)).toBe(false);
  });
  it('and for the note beside one', () => {
    const rect = { x: 300, y: 500, width: 400, height: 300 };
    expect(underMap(rect, 0, still, pane)).toBe(false);
    expect(underMap(rect, 288, still, pane)).toBe(true);
  });
  it('as the canvas is drawn: moved and scaled', () => {
    const rect = { x: 1000, y: 800, width: 400, height: 300 };
    expect(underMap(rect, 0, { x: -400, y: -300, zoom: 1 }, pane)).toBe(true);
    expect(underMap(rect, 0, { x: 0, y: 0, zoom: 0.5 }, pane)).toBe(false);
    // Off the page altogether.
    expect(underMap(rect, 0, { x: 600, y: 600, zoom: 1 }, pane)).toBe(false);
  });
});
