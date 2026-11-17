import type { AgentKind, AgentToolsChoice } from '@aubergine/shared';

/**
 * What only the canvas on screen can do, because it needs the view: placing a
 * new terminal in free space, zooming, moving the view to a node. The canvas
 * component registers itself here while it is mounted; commands call it.
 */
export interface CanvasActions {
  /** Starts a terminal in free space. With an agent, `agentArgs` are handed to it. Gives back the new session's ID, or null when it could not be started. */
  /** `where`: the folder it starts in, the kind of environment it works in, and its name, where the owner said. */
  addTerminal: (agent?: AgentKind, agentArgs?: string[], agentTools?: AgentToolsChoice, where?: { cwd?: string; environment?: string; name?: string }) => Promise<string | null>;
  addFrame: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
  /** Takes the keyboard away from any terminal, back to the canvas. */
  releaseFocus: () => void;
  /** Brings a session's node into view at 100% without giving it the keyboard. */
  reveal: (sessionId: string) => void;
  /** Moves the view to a session's node only if it is not fully on screen, keeping the zoom. */
  bringIntoView: (sessionId: string) => void;
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
