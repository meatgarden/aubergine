import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useApp } from './store';

/** Sessions taken off the canvas whose shells are still running. */
export function ParkedList({ onRestored }: { onRestored: (nodeId: string) => void }) {
  const sessions = useApp((s) => s.canvas?.sessions);
  const nodes = useApp((s) => s.canvas?.layout.nodes);
  const askToClose = useApp((s) => s.askToClose);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const parked = (sessions ?? []).filter((s) => s.state === 'parked');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  if (parked.length === 0) return null;

  const restore = async (sessionId: string): Promise<void> => {
    await api.restoreSession(sessionId);
    const node = nodes?.find((n) => n.sessionId === sessionId);
    if (node) onRestored(node.id);
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
                  {[session.command, session.cwd].filter(Boolean).join(' · ') || 'running'}
                </div>
              </div>
              <button type="button" onClick={() => void restore(session.id)}>
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
