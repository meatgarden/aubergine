import { describe, expect, it } from 'vitest';
import type { Frame, LayoutNode } from '@aubergine/shared';
import { clampListWidth, listGroups, listOrder, readingOrder, stepInList } from './terminal-list';

const node = (sessionId: string, x: number, y: number, width = 100, height = 60): LayoutNode => ({
  id: `node-${sessionId}`,
  sessionId,
  x,
  y,
  width,
  height,
  color: 'none',
});
const frame = (label: string, x: number, y: number, width: number, height: number): Frame => ({ id: `frame-${label}`, label, x, y, width, height, color: 'none' });

describe('readingOrder', () => {
  it('goes top to bottom, then left to right', () => {
    const items = [node('d', 120, 80), node('b', 120, 0), node('c', 0, 80), node('a', 0, 0)];
    expect(readingOrder(items).map((n) => n.sessionId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('treats tops that are nearly level as one row', () => {
    // b sits a little higher than a, but they are side by side: a still comes first.
    const items = [node('b', 120, -10), node('a', 0, 0), node('c', 0, 100)];
    expect(readingOrder(items).map((n) => n.sessionId)).toEqual(['a', 'b', 'c']);
  });

  it('starts a new row once something is clearly lower', () => {
    const items = [node('a', 200, 0), node('b', 0, 40)];
    expect(readingOrder(items).map((n) => n.sessionId)).toEqual(['a', 'b']);
  });
});

describe('listGroups', () => {
  const layout = {
    frames: [frame('Backend', 0, 300, 400, 200), frame('Empty', 1000, 0, 200, 200), frame('Web', 0, 0, 400, 200)],
    nodes: [
      node('loose-2', 600, 320),
      node('api', 20, 320),
      node('web', 20, 20),
      node('db', 140, 320),
      node('loose-1', 600, 20),
      // Sticks out of the frame, so it is not in it.
      node('half', 350, 20),
    ],
  };

  it('lists frames as headings in reading order, then what is outside any frame', () => {
    const groups = listGroups(layout);
    expect(groups.map((g) => g.frame?.label ?? null)).toEqual(['Web', 'Backend', null]);
    expect(groups.map((g) => g.nodes.map((n) => n.sessionId))).toEqual([['web'], ['api', 'db'], ['half', 'loose-1', 'loose-2']]);
    expect(listOrder(layout)).toEqual(['web', 'api', 'db', 'half', 'loose-1', 'loose-2']);
  });

  it('gives a terminal inside two frames to the first of them only', () => {
    const overlapping = { frames: [frame('Outer', 0, 0, 500, 500), frame('Inner', 10, 10, 200, 200)], nodes: [node('x', 20, 20)] };
    const groups = listGroups(overlapping);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.frame?.label).toBe('Outer');
  });

  it('is empty for an empty canvas', () => {
    expect(listGroups({ frames: [], nodes: [] })).toEqual([]);
  });
});

describe('stepInList', () => {
  const order = ['a', 'b', 'c'];
  it('moves forward and back, wrapping at the ends', () => {
    expect(stepInList(order, 'a', 1)).toBe('b');
    expect(stepInList(order, 'c', 1)).toBe('a');
    expect(stepInList(order, 'a', -1)).toBe('c');
    expect(stepInList(order, 'b', -1)).toBe('a');
  });

  it('starts at the first, or from the end going back', () => {
    expect(stepInList(order, null, 1)).toBe('a');
    expect(stepInList(order, null, -1)).toBe('c');
    expect(stepInList(order, 'gone', 1)).toBe('a');
    expect(stepInList([], null, 1)).toBeNull();
    expect(stepInList(['only'], 'only', 1)).toBe('only');
  });
});

describe('clampListWidth', () => {
  it('keeps the width within what is usable', () => {
    expect(clampListWidth(10)).toBe(160);
    expect(clampListWidth(5000)).toBe(520);
    expect(clampListWidth(300.4)).toBe(300);
  });
});
