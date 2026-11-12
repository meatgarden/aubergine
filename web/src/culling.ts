/**
 * Which form a terminal node takes, so that sessions nobody is looking at
 * cost almost nothing in the browser:
 * - `live`: a real terminal with its own connection
 * - `snapshot`: on screen but too small to read; plain text, refreshed about once a second
 * - `hidden`: off screen; nothing is fetched
 */
export type NodeMode = 'live' | 'snapshot' | 'hidden';

/** Below this zoom, terminal text is too small to read (13px text under about 6px). */
export const READABLE_ZOOM = 0.45;

/** How far outside the window (in screen pixels) a node may be and still count as on screen. */
const SHOW_MARGIN = 150;
/** A node that is already showing stays until it is this far outside, so panning does not flicker. */
const KEEP_MARGIN = 500;

export interface CullInput {
  /** Node rectangle in canvas units. */
  rect: { x: number; y: number; width: number; height: number };
  /** Canvas transform: screen = canvas * zoom + offset. */
  view: { x: number; y: number; zoom: number };
  /** Size of the canvas area in screen pixels. */
  pane: { width: number; height: number };
  /** The mode the node is in now. */
  current: NodeMode;
}

export function nodeMode({ rect, view, pane, current }: CullInput): NodeMode {
  // Before the canvas has been measured, assume everything is visible.
  if (pane.width === 0 || pane.height === 0) return view.zoom < READABLE_ZOOM ? 'snapshot' : 'live';

  const margin = current === 'hidden' ? SHOW_MARGIN : KEEP_MARGIN;
  const left = rect.x * view.zoom + view.x;
  const top = rect.y * view.zoom + view.y;
  const right = left + rect.width * view.zoom;
  const bottom = top + rect.height * view.zoom;
  const onScreen = right > -margin && bottom > -margin && left < pane.width + margin && top < pane.height + margin;

  if (!onScreen) return 'hidden';
  return view.zoom < READABLE_ZOOM ? 'snapshot' : 'live';
}
