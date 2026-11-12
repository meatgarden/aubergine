import type { NodeRect } from './entities';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

function overlaps(a: NodeRect, b: NodeRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * Finds room for a new rectangle: centered on `center` when that spot is
 * free, otherwise the closest free spot around it. Nothing it returns
 * overlaps a rectangle in `taken`, and `gap` is kept clear between them.
 */
export function findFreeRect(taken: readonly NodeRect[], center: Point, size: Size, gap = 24): NodeRect {
  const step = 40;
  const origin = { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) };
  const at = (dx: number, dy: number): NodeRect => ({ x: origin.x + dx * step, y: origin.y + dy * step, ...size });
  const free = (rect: NodeRect): boolean => !taken.some((other) => overlaps(rect, other, gap));

  if (free(at(0, 0))) return at(0, 0);

  // Search square rings around the center, nearest ring first, and take the
  // candidate in that ring that is closest to the center.
  for (let ring = 1; ring <= 400; ring++) {
    let best: NodeRect | null = null;
    let bestDistance = Infinity;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const distance = dx * dx + dy * dy;
        if (distance >= bestDistance) continue;
        const candidate = at(dx, dy);
        if (free(candidate)) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    if (best) return best;
  }
  return at(0, 0);
}
