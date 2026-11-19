import { useEffect, useRef, useState } from 'react';
import { DEMO_LABEL, canvasCounts, openProjects, sortedCanvases, type Canvas } from '@aubergine/shared';
import { api } from './api';
import { ColorButton } from './ColorButton';
import { colorClass, colorStyle } from './color';
import { runCommand } from './commands';
import { hint } from './shortcuts';
import { useApp } from './store';
import { IconButton } from './ui';

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
  const whole = useApp((s) => s.whole);
  const current = useApp((s) => s.canvasId);
  const setCanvas = useApp((s) => s.setCanvas);
  useApp((s) => s.settings.shortcuts);
  const askToCloseCanvas = useApp((s) => s.askToCloseCanvas);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The options of the tab being looked at, open at a place against the window.
  const [menu, setMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const menuRoot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!menuRoot.current?.contains(target) && !target?.closest('.tab-more, .color-palette')) setMenu(null);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  useEffect(() => setMenu(null), [current]);
  // The tab being looked at is kept in sight: with many tabs the row scrolls sideways to it.
  const row = useRef<HTMLDivElement>(null);
  const tabCount = useApp((state) => state.app?.canvases.length ?? 0);
  useEffect(() => {
    const tab = row.current?.querySelector<HTMLElement>('.tab.active');
    const box = row.current?.getBoundingClientRect();
    if (!tab || !box || !row.current) return;
    const at = tab.getBoundingClientRect();
    if (at.left < box.left) row.current.scrollLeft -= box.left - at.left;
    else if (at.right > box.right) row.current.scrollLeft += at.right - box.right;
    // Also when a tab is added or goes: the one being looked at may only now be in the row.
  }, [current, tabCount]);

  // Asked to rename a canvas (by a key or the palette).
  const ask = useApp((s) => (s.ask?.kind === 'rename-canvas' ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    const canvas = useApp.getState().app?.canvases.find((c) => c.id === ask.id);
    if (canvas) setRenaming({ id: canvas.id, text: canvas.name });
    useApp.getState().asked(ask.tick);
  }, [ask]);

  if (!app) return null;
  // The tabs are the canvases of the project being looked at.
  const canvases = sortedCanvases(app);
  const here = canvases.find((c) => c.id === current)?.projectId;
  const others = whole ? openProjects(whole).filter((project) => project.id !== here) : [];

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
      {/* The tabs scroll sideways by themselves, so that the way to add one is never pushed out of sight. */}
      <div className="tabbar-tabs" role="tablist" aria-label="Canvases" ref={row} data-testid="tabbar-tabs">
      {canvases.map((canvas) => {
        const counts = canvasCounts(app, canvas);
        const active = canvas.id === current;
        const messaging = canvas.messagesFrom.includes(canvas.id);
        return (
          <div
            key={canvas.id}
            style={colorStyle(canvas.color)}
            className={`tab ${colorClass(canvas.color)}${active ? ' active' : ''}${dragging === canvas.id ? ' dragging' : ''}`}
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
            tabIndex={0}
            onKeyDown={(e) => {
              // With the keyboard on a tab (F6 gets here), Enter or Space shows that canvas.
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                if (!active) setCanvas(canvas.id);
              }
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
              // A plain number: what waits is counted once in colour, at the top of the page.
              <span className="tab-waiting" title={`${counts.waiting} waiting for you`} aria-label={`${counts.waiting} waiting for you`} data-testid="tab-waiting">
                {counts.waiting}
              </span>
            )}
            {counts.unread > 0 && !active && <span className="badge-unread" title="New output" data-testid="tab-unread" />}
            {renaming?.id !== canvas.id && (
              // The same two things on every tab, shown on the one being looked at and where the pointer or the keyboard is.
              <span className="tab-tools" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="quiet tab-more"
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === canvas.id}
                  aria-label={`Options for the canvas ${canvas.name}`}
                  title="Options for this canvas: rename, color, messages between its terminals, move to another project"
                  onClick={(e) => {
                    // The bar of tabs scrolls sideways and cuts off what hangs below it: the menu is placed against the window.
                    const box = e.currentTarget.getBoundingClientRect();
                    setMenu(menu?.id === canvas.id ? null : { id: canvas.id, left: Math.min(box.left, window.innerWidth - 330), top: box.bottom + 6 });
                  }}
                  data-testid={active ? 'tab-more' : 'tab-more-other'}
                >
                  ⋯
                </button>
                {menu?.id === canvas.id && (
                  <span className="toolbar-menu tab-menu" role="menu" style={{ left: menu.left, top: menu.top }} ref={menuRoot} data-testid="tab-menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        setRenaming({ id: canvas.id, text: canvas.name });
                      }}
                      data-testid="tab-rename"
                    >
                      Rename…
                      <small>Double-clicking the name does the same.</small>
                    </button>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={messaging}
                      aria-pressed={messaging}
                      onClick={() => {
                        // Switching it on is a decision: said in full before it is taken.
                        if (!messaging && !window.confirm(`Let the terminals on “${canvas.name}” message each other?\n\nAn agent there will be able to send a message to another terminal on this canvas, and to be told that one waits. A message is never typed into a terminal. Every message is shown to you, a thread between two pauses after a few turns until you have looked, and terminals marked “people only” take messages from you alone. Terminals that start an agent are “people only” from the start unless you changed that: such a terminal can send, and receives only once you say so: open its drawer (Message on the terminal) and tick that it takes messages while people only. That opens it to messages from terminals and to nothing else.`)) return;
                        run(api.setCanvasMessaging(canvas.id, !messaging));
                      }}
                      data-testid="tab-messaging"
                    >
                      Messages between terminals: {messaging ? 'on' : 'off'}
                      <small>{messaging ? 'Terminals on this canvas may message each other. Click to switch that off.' : 'Terminals on this canvas may not message each other. You can always message any terminal yourself.'}</small>
                    </button>
                    <span className="tab-menu-line tab-menu-colour">
                      <span>Color</span>
                      <ColorButton value={canvas.color} onChange={(color) => run(api.updateCanvas(canvas.id, { color }))} againstWindow title="Pick a color for this tab" />
                    </span>
                    {canvas.labels[DEMO_LABEL] !== undefined && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          runCommand('demo.remove');
                        }}
                        data-testid="remove-demo"
                      >
                        Remove the demo
                        <small>Take away everything the demo made. Nothing else is touched.</small>
                      </button>
                    )}
                    {others.length > 0 && (
                      <label className="tab-menu-line">
                        <span>Move to another project</span>
                        <select
                          className="tab-project"
                          aria-label={`Move the canvas ${canvas.name} to another project`}
                          title="Move this canvas to another project, with its terminals, their runs and what they work in"
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            setMenu(null);
                            run(api.moveCanvasToProject(canvas.id, e.target.value));
                          }}
                          data-testid="tab-move-project"
                        >
                          <option value="">Choose…</option>
                          {others.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </span>
                )}
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
      </div>
      <IconButton className="tab-add" label="New canvas" title={hint('canvas.new')} onClick={() => runCommand('canvas.new')}>
        +
      </IconButton>
      {error && <span className="warning">{error}</span>}
    </nav>
  );
}
