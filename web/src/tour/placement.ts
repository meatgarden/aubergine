/**
 * Where the tour's card goes so that it is least in the way: the corner of
 * the window in which it covers least of what the person needs. Buttons of
 * an open dialog count most, then the thing being pointed at, then the
 * dialog itself. A pure function, so that it can be tested without a page.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export const CORNERS: readonly Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export interface Obstacle {
  box: Box;
  /** How much it matters that this stays uncovered. */
  weight: number;
}

const MARGIN = 16;

export function cornerBox(corner: Corner, card: { width: number; height: number }, window: { width: number; height: number }): Box {
  return {
    x: corner.endsWith('right') ? window.width - card.width - MARGIN : MARGIN,
    y: corner.startsWith('bottom') ? window.height - card.height - MARGIN : MARGIN,
    width: card.width,
    height: card.height,
  };
}

export function overlap(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** The corner that covers least. It stays where it is unless another corner is clearly better, so that it does not jump about. */
export function bestCorner(card: { width: number; height: number }, window: { width: number; height: number }, obstacles: readonly Obstacle[], current: Corner = 'bottom-right'): Corner {
  const cost = (corner: Corner): number => {
    const box = cornerBox(corner, card, window);
    return obstacles.reduce((sum, obstacle) => sum + overlap(box, obstacle.box) * obstacle.weight, 0);
  };
  let best = current;
  let least = cost(current);
  for (const corner of CORNERS) {
    const here = cost(corner);
    // Clearly better: by more than a sliver of the card.
    if (here < least - card.width * card.height * 0.05) {
      best = corner;
      least = here;
    }
  }
  return best;
}
