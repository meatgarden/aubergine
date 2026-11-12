import { describe, expect, it } from 'vitest';
import type { NodeRect } from './entities';
import { findFreeRect } from './placement';

const size = { width: 720, height: 440 };

function intersects(a: NodeRect, b: NodeRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('findFreeRect', () => {
  it('centers the rectangle when the spot is free', () => {
    expect(findFreeRect([], { x: 1000, y: 500 }, size)).toEqual({ x: 640, y: 280, ...size });
  });

  it('moves next to a rectangle that is in the way, leaving a gap', () => {
    const first = findFreeRect([], { x: 0, y: 0 }, size);
    const second = findFreeRect([first], { x: 0, y: 0 }, size, 24);
    expect(intersects(first, second)).toBe(false);
    const horizontalGap = Math.max(second.x - (first.x + first.width), first.x - (second.x + second.width));
    const verticalGap = Math.max(second.y - (first.y + first.height), first.y - (second.y + second.height));
    expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(24);
    // Close by, not somewhere far off.
    expect(Math.abs(second.x - first.x) + Math.abs(second.y - first.y)).toBeLessThan(1000);
  });

  it('never overlaps when many rectangles are added at the same point', () => {
    const placed: NodeRect[] = [];
    for (let i = 0; i < 30; i++) placed.push(findFreeRect(placed, { x: 200, y: 100 }, size));
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(intersects(placed[i]!, placed[j]!), `${i} and ${j}`).toBe(false);
      }
    }
  });

  it('fills a hole near the center before going further out', () => {
    const left: NodeRect = { x: -800, y: 0, ...size };
    const right: NodeRect = { x: 800, y: 0, ...size };
    const placed = findFreeRect([left, right], { x: 360, y: 220 }, size);
    expect(placed).toEqual({ x: 0, y: 0, ...size });
  });
});
