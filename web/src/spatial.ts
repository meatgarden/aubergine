/** Finding the terminal next to another one on the canvas, by where they are. */

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * The box to go to from `from` in a direction.
 *
 * Only boxes whose middle lies in that direction count. Among them, one that
 * overlaps `from` sideways (shares part of its row, or of its column) beats
 * one that does not; after that the nearest wins, with distance across the
 * direction of travel counting double, so that "right" prefers what is level
 * with you over what is nearer but far above or below.
 *
 * With nowhere to start from, it is the box nearest the top left.
 */
export function neighbour(boxes: readonly Box[], fromId: string | null, direction: Direction): Box | null {
  const from = boxes.find((box) => box.id === fromId);
  if (!from) {
    return [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
  }
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;

  let best: { box: Box; overlaps: boolean; cost: number } | null = null;
  for (const box of boxes) {
    if (box.id === from.id) continue;
    const dx = box.x + box.width / 2 - cx;
    const dy = box.y + box.height / 2 - cy;
    const along = (horizontal ? dx : dy) * sign;
    if (along <= 0) continue;
    const across = Math.abs(horizontal ? dy : dx);
    const overlaps = horizontal
      ? box.y < from.y + from.height && from.y < box.y + box.height
      : box.x < from.x + from.width && from.x < box.x + box.width;
    const cost = along + 2 * across;
    if (!best || (overlaps && !best.overlaps) || (overlaps === best.overlaps && cost < best.cost)) {
      best = { box, overlaps, cost };
    }
  }
  return best?.box ?? null;
}
