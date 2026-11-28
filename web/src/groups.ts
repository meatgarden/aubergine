import { NAMED_COLORS, type NamedColor } from '@aubergine/shared';

/**
 * A group of terminals, as the page draws it. A group is a name that terminals carry (`Session.group`), at most one
 * each; the terminals with the same name are the group, on whatever canvas they are. Nothing else is stored about a
 * group, so its color is worked out from its name, and whether it is folded is this browser's (the list's view).
 */

const GROUP_COLORS: readonly NamedColor[] = NAMED_COLORS.filter((color) => color !== 'none' && color !== 'gray');

/** The color of a group: always the same for the same name, one of the named colors. */
export function groupColor(name: string): NamedColor {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length] as NamedColor;
}

/** What a group is called among the folded things of the list's view. The list and the canvas ask the same. */
export const groupFoldId = (name: string): string => `set:${name}`;

export const isGroupFolded = (collapsed: readonly string[], name: string): boolean => collapsed.includes(groupFoldId(name));

/** The folded things with one group folded, or open again. */
export function withGroupFolded(collapsed: readonly string[], name: string, folded: boolean): string[] {
  const id = groupFoldId(name);
  const without = collapsed.filter((g) => g !== id);
  return folded ? [...without, id] : without;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room between a group's outline and its terminals, and for its label above them. On the grid of four. */
export const GROUP_PAD = 16;
export const GROUP_LABEL = 32;
/** A folded group on the canvas: one label where its outline began. */
export const GROUP_FOLDED_WIDTH = 280;

/** The outline round the given rectangles: what holds them all, with room for the label. Null for none. */
export function outlineOf(rects: readonly Box[]): Box | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left - GROUP_PAD, y: top - GROUP_PAD - GROUP_LABEL, width: right - left + 2 * GROUP_PAD, height: bottom - top + 2 * GROUP_PAD + GROUP_LABEL };
}

/** Where the members of a group are that are not on the canvas being looked at: by canvas, and parked. */
export function elsewhereOf(
  members: readonly { id: string; state: string }[],
  canvases: readonly { id: string; name: string; layout: { nodes: readonly { sessionId: string }[] } }[],
  currentCanvasId: string | null,
): { canvases: { id: string; name: string; sessionIds: string[] }[]; parked: string[] } {
  const ids = new Set(members.map((m) => m.id));
  const found = canvases
    .filter((canvas) => canvas.id !== currentCanvasId)
    .map((canvas) => ({ id: canvas.id, name: canvas.name, sessionIds: canvas.layout.nodes.filter((n) => ids.has(n.sessionId)).map((n) => n.sessionId) }))
    .filter((canvas) => canvas.sessionIds.length > 0);
  return { canvases: found, parked: members.filter((m) => m.state === 'parked').map((m) => m.id) };
}
