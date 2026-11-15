import { useEffect, useState } from 'react';
import { canvasCounts, sortedCanvases, type Canvas } from '@aubergine/shared';
import { api } from './api';
import { ColorButton } from './ColorButton';
import { runCommand } from './commands';
import { hint } from './shortcuts';
import { useApp } from './store';

/**
 * Where a tab dropped just before `target` should sit: between `target` and
 * the tab in front of it. Any number will do, so no other tab needs to change.
 */
export function orderBefore(canvases: readonly Canvas[], targetId: string): number {
  const index = canvases.findIndex((c) => c.id === targetId);
  const target = canvases[index];
  if (!target) return (canvases.at(-1)?.order ?? 0) + 1;
  const previous = canvases[index - 1];
  return previous ? (previous.order + target.order) / 2 : target.order - 1;
}

/** One tab per canvas: switch, add, rename (double-click), reorder (drag), color, close. */
export function TabBar() {
  const app = useApp((s) => s.app);
  const current = useApp((s) => s.canvasId);
  const setCanvas = useApp((s) => s.setCanvas);
  useApp((s) => s.settings.shortcuts);
  const askToCloseCanvas = useApp((s) => s.askToCloseCanvas);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Asked to rename a canvas (by a key or the palette).
  const ask = useApp((s) => (s.ask?.kind === 'rename-canvas' ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    const canvas = useApp.getState().app?.canvases.find((c) => c.id === ask.id);
    if (canvas) setRenaming({ id: canvas.id, text: canvas.name });
    useApp.getState().asked(ask.tick);
  }, [ask]);

  if (!app) return null;
  const canvases = sortedCanvases(app);

  const run = (work: Promise<unknown>): void => {
    setError(null);
    work.catch((e: unknown) => setError((e as Error).message));
  };

  const commitName = (): void => {
    if (!renaming) return;
    const name = renaming.text.trim();
    const canvas = canvases.find((c) => c.id === renaming.id);
    setRenaming(null);
    if (name && canvas && name !== canvas.name) run(api.updateCanvas(canvas.id, { name }));
  };

  const close = (canvas: Canvas): void => {
    // Sessions on it need a decision; an empty canvas just goes.
    if (canvas.layout.nodes.length > 0) askToCloseCanvas(canvas.id);
    else run(api.closeCanvas(canvas.id, null));
  };

  return (
    <nav className="tabbar" aria-label="Canvases" data-testid="tabbar">
      {canvases.map((canvas) => {
        const counts = canvasCounts(app, canvas);
        const active = canvas.id === current;
        return (
          <div
            key={canvas.id}
            className={`tab color-${canvas.color}${active ? ' active' : ''}${dragging === canvas.id ? ' dragging' : ''}`}
            role="tab"
            aria-selected={active}
            data-testid="tab"
            data-canvas={canvas.id}
            draggable={renaming?.id !== canvas.id}
            onDragStart={(e) => {
              setDragging(canvas.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', canvas.id);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              if (dragging && dragging !== canvas.id) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const moved = dragging;
              setDragging(null);
              if (moved && moved !== canvas.id) run(api.updateCanvas(moved, { order: orderBefore(canvases, canvas.id) }));
            }}
            onClick={() => {
              if (!active) setCanvas(canvas.id);
            }}
            onDoubleClick={() => setRenaming({ id: canvas.id, text: canvas.name })}
          >
            {renaming?.id === canvas.id ? (
              <input
                className="tab-input"
                aria-label="Canvas name"
                value={renaming.text}
                maxLength={80}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenaming({ id: canvas.id, text: e.target.value })}
                onBlur={commitName}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className="tab-name" title="Double-click to rename; drag to reorder">
                {canvas.name}
              </span>
            )}
            {counts.waiting > 0 && (
              <span className="tab-waiting" title={`${counts.waiting} waiting for you`} data-testid="tab-waiting">
                {counts.waiting}
              </span>
            )}
            {counts.unread > 0 && !active && <span className="badge-unread" title="New output" data-testid="tab-unread" />}
            {active && (
              <span className="tab-tools" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <ColorButton value={canvas.color} onChange={(color) => run(api.updateCanvas(canvas.id, { color }))} />
                {canvases.length > 1 && (
                  <button
                    type="button"
                    className="node-close"
                    aria-label={`Close canvas ${canvas.name}`}
                    title="Close this canvas (its terminals are moved or parked, never ended)"
                    onClick={() => close(canvas)}
                  >
                    ×
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      <button type="button" className="tab-add quiet" aria-label="New canvas" title={hint('canvas.new')} onClick={() => runCommand('canvas.new')}>
        +
      </button>
      {error && <span className="warning">{error}</span>}
    </nav>
  );
}
