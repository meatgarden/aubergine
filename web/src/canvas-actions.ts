import type { AgentKind } from '@aubergine/shared';

/**
 * What only the canvas on screen can do, because it needs the view: placing a
 * new terminal in free space, zooming, moving the view to a node. The canvas
 * component registers itself here while it is mounted; commands call it.
 */
export interface CanvasActions {
  addTerminal: (agent?: AgentKind) => void;
  addFrame: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
  /** Takes the keyboard away from any terminal, back to the canvas. */
  releaseFocus: () => void;
  /** Brings a session's node into view without giving it the keyboard. */
  reveal: (sessionId: string) => void;
}

let current: CanvasActions | null = null;

export const canvasActions = {
  get: (): CanvasActions | null => current,
  /** Registers the mounted canvas; returns the function that unregisters it. */
  register: (actions: CanvasActions): (() => void) => {
    current = actions;
    return () => {
      if (current === actions) current = null;
    };
  },
};
