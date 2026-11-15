import { useEffect, useRef, useState } from 'react';
import { sortedCanvases } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * "Move to canvas…" on a node: puts the terminal on another canvas. Its shell
 * is not touched. Shown only when there is another canvas to move to.
 */
export function MoveToCanvas({ sessionId, name }: { sessionId: string; name: string }) {
  const app = useApp((s) => s.app);
  const current = useApp((s) => s.canvasId);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);

  const others = app ? sortedCanvases(app).filter((c) => c.id !== current) : [];
  if (others.length === 0) return null;

  return (
    <span className="move-to nodrag" ref={root}>
      <button
        type="button"
        className="node-tool"
        aria-label={`Move ${name} to another canvas`}
        aria-expanded={open}
        title="Move to canvas…"
        onClick={() => setOpen((v) => !v)}
      >
        Move
      </button>
      {open && (
        <span className="move-menu" role="menu" aria-label="Move to canvas">
          {others.map((canvas) => (
            <button
              key={canvas.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void api.moveSession(sessionId, canvas.id).catch(() => {});
              }}
            >
              {canvas.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
