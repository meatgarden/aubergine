import { useEffect, useRef, useState } from 'react';
import { sortedCanvases } from '@aubergine/shared';
import { api, isSuperseded } from './api';
import { hint } from './shortcuts';
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

  // Asked to open (by a key or the palette).
  const ask = useApp((s) => (s.ask?.kind === 'move' && s.ask.id === sessionId ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    setOpen(true);
    useApp.getState().asked(ask.tick);
  }, [ask]);

  // Opened: the keyboard goes to the first canvas in the list, so arrows and Enter work.
  const menu = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (open) menu.current?.querySelector('button')?.focus();
  }, [open]);

  const move = (canvasId: string): void => {
    setOpen(false);
    void api.moveSession(sessionId, canvasId).catch((error: unknown) => !isSuperseded(error) && useApp.getState().setNotice(`Could not move "${name}": ${(error as Error).message}`));
  };

  const others = app ? sortedCanvases(app).filter((c) => c.id !== current) : [];
  if (others.length === 0) return null;

  return (
    <span className="move-to nodrag" ref={root}>
      <button
        type="button"
        className="node-tool"
        aria-label={`Move ${name} to another canvas`}
        aria-expanded={open}
        title={hint('terminal.moveToCanvas', 'Move to canvas…')}
        onClick={() => setOpen((v) => !v)}
      >
        Move
      </button>
      {open && (
        <span
          className="move-menu"
          role="menu"
          aria-label="Move to canvas"
          ref={menu}
          onKeyDown={(event) => {
            const items = [...(menu.current?.querySelectorAll('button') ?? [])];
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'Escape') setOpen(false);
            else if (event.key === 'ArrowDown') items[(at + 1) % items.length]?.focus();
            else if (event.key === 'ArrowUp') items[(at - 1 + items.length) % items.length]?.focus();
            else if (/^[1-9]$/.test(event.key) && others[Number(event.key) - 1]) move(others[Number(event.key) - 1]!.id);
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {others.map((canvas, index) => (
            <button
              key={canvas.id}
              type="button"
              role="menuitem"
              onClick={() => move(canvas.id)}
            >
              {index < 9 && <kbd>{index + 1}</kbd>}
              {canvas.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
