import { useCallback } from 'react';
import { useReactFlow, useStore, type Viewport } from '@xyflow/react';

const STORAGE_KEY = 'aubergine.viewport';

/** A terminal can only be used at exactly 100% zoom; text selection is wrong at any other scale. */
export function isFullZoom(zoom: number): boolean {
  return Math.abs(zoom - 1) < 0.001;
}

export function useIsFullZoom(): boolean {
  return useStore((state) => isFullZoom(state.transform[2]));
}

/** The viewport is a per-browser preference, so it lives in the browser. */
export function loadViewport(): Viewport {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Viewport> | null;
    if (
      saved &&
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y) &&
      Number.isFinite(saved.zoom) &&
      (saved.zoom ?? 0) > 0
    ) {
      return { x: saved.x ?? 0, y: saved.y ?? 0, zoom: Math.min(saved.zoom ?? 1, 1) };
    }
  } catch {
    // Unreadable or blocked storage: fall through to the default.
  }
  return { x: 40, y: 80, zoom: 1 };
}

export function saveViewport(viewport: Viewport): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(viewport));
  } catch {
    // Not being able to remember the viewport is harmless.
  }
}

const MARGIN = 24;
const TOP_MARGIN = 72; // leaves room for the toolbar

/**
 * Returns a function that brings a zoomed-out view to 100% on a node:
 * centered when it fits in the window, otherwise with its top-left corner in
 * view. At 100% it leaves the view alone, so a click never shifts the canvas
 * under the pointer; pass `reveal` to also move a 100% view when the node is
 * not fully on screen.
 */
export function useZoomToNode(): (nodeId: string, options?: { reveal?: boolean }) => void {
  const flow = useReactFlow();
  return useCallback(
    (nodeId: string, options?: { reveal?: boolean }) => {
      const node = flow.getNode(nodeId);
      const pane = document.querySelector('.react-flow');
      if (!node || !pane) return;
      const view = pane.getBoundingClientRect();
      const width = node.measured?.width ?? node.width ?? 0;
      const height = node.measured?.height ?? node.height ?? 0;

      const current = flow.getViewport();
      if (isFullZoom(current.zoom)) {
        if (!options?.reveal) return;
        const left = node.position.x + current.x;
        const top = node.position.y + current.y;
        const onScreen =
          left >= 0 && top >= TOP_MARGIN - MARGIN && left + width <= view.width && top + height <= view.height;
        if (onScreen) return;
      }

      const x = width + 2 * MARGIN <= view.width ? (view.width - width) / 2 : MARGIN;
      const y =
        height + TOP_MARGIN + MARGIN <= view.height
          ? Math.max(TOP_MARGIN, (view.height - height) / 2)
          : TOP_MARGIN;
      void flow.setViewport(
        { x: Math.round(x - node.position.x), y: Math.round(y - node.position.y), zoom: 1 },
        { duration: 220 },
      );
    },
    [flow],
  );
}
