import { useEffect, useRef, useState } from 'react';
import { useApp } from './store';

/** Sessions taken off the canvas whose shells are still running. */
export function ParkedList() {
  const sessions = useApp((s) => s.app?.sessions);
  const askToClose = useApp((s) => s.askToClose);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const parked = (sessions ?? []).filter((s) => s.state === 'parked');
  const canvases = useApp((s) => s.app?.canvases);
  /** Where a parked session came from, if that canvas still exists. */
  const fromCanvas = (id: string | undefined): string | null => {
    const canvas = canvases?.find((c) => c.id === id);
    return canvas ? `from ${canvas.name}` : null;
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  if (parked.length === 0) return null;

  // Showing a parked session restores it onto the canvas being looked at.
  const restore = (sessionId: string): void => {
    useApp.getState().showSession(sessionId);
    if (parked.length === 1) setOpen(false);
  };

  return (
    <div className="parked" ref={root}>
      <button type="button" className="quiet" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Parked ({parked.length})
      </button>
      {open && (
        <div className="parked-panel" role="dialog" aria-label="Parked sessions">
          {parked.map((session) => (
            <div className="parked-row" key={session.id} data-testid="parked-row">
              <div className="parked-info">
                <div>{session.name}</div>
                <div className="parked-detail">
                  {[fromCanvas(session.parkedFrom?.canvasId), session.command, session.cwd].filter(Boolean).join(' · ') || 'running'}
                </div>
              </div>
              <button type="button" onClick={() => restore(session.id)}>
                Restore
              </button>
              <button type="button" className="quiet" onClick={() => askToClose(session.id)}>
                End
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
