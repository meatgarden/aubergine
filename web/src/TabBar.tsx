import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canvasHref, openInNewTab } from './address';
import { DEMO_LABEL, canvasCounts, openProjects, sortedCanvases, type Canvas } from '@aubergine/shared';
import { api } from './api';
import { ColorButton } from './ColorButton';
import { colorClass, colorStyle } from './color';
import { runCommand } from './commands';
import { hint } from './shortcuts';
import { useApp } from './store';
import { CANVAS_VIEWS, setCanvasView, useCanvasView, type CanvasView } from './canvas-view';
import { IconButton, Switcher } from './ui';

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
  const view = useCanvasView();
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
    // As a column the tabs scroll up and down instead.
    if (at.top < box.top) row.current.scrollTop -= box.top - at.top;
    else if (at.bottom > box.bottom) row.current.scrollTop += at.bottom - box.bottom;
    // Also when a tab is added or goes: the one being looked at may only now be in the row.
  }, [current, tabCount, view]);

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

  /** The options and the close button of a canvas: on each tab, and beside the list's name. */
  const tools = (canvas: Canvas, active: boolean) => {
    const messaging = canvas.messagesFrom.includes(canvas.id);
    return (
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
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    openInNewTab(canvasHref(canvas.id, canvas.projectId));
                  }}
                  data-testid="tab-open-tab"
                >
                  Open in new browser tab
                  <small>This canvas in a browser tab of its own, beside this one.</small>
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
    );
  };

  const column = view === 'column';
  return (
    <nav className={`tabbar is-${view}`} aria-label="Canvases" data-testid="tabbar" data-view={view}>
      {column ? (
        // As a column, the button stands in a head of the column's own, with the word for what is under it.
        <div className="tabbar-head">
          <ViewSwitch view={view} />
          <span className="tabbar-title">Canvases</span>
        </div>
      ) : (
        <ViewSwitch view={view} />
      )}
      {view === 'list' ? (
        <CanvasList
          canvases={canvases}
          current={current}
          renaming={renaming}
          setRenaming={setRenaming}
          commitName={commitName}
          setCanvas={setCanvas}
          tools={tools}
        />
      ) : (
      <>
      {/* The tabs scroll sideways by themselves, so that the way to add one is never pushed out of sight. */}
      <div className="tabbar-tabs" role="tablist" aria-label="Canvases" aria-orientation={column ? 'vertical' : 'horizontal'} ref={row} data-testid="tabbar-tabs">
      {canvases.map((canvas) => {
        const counts = canvasCounts(app, canvas);
        const active = canvas.id === current;
        return (
          <div
            key={canvas.id}
            title={column ? `${canvas.name}: ${canvas.layout.nodes.length} terminal${canvas.layout.nodes.length === 1 ? '' : 's'}` : undefined}
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
            onClick={(e) => {
              // Clicked the way a link is opened in a new tab: this canvas opens in a new browser tab, and this one stays.
              if (e.metaKey || e.ctrlKey || e.shiftKey) return openInNewTab(canvasHref(canvas.id, canvas.projectId));
              if (!active) setCanvas(canvas.id);
            }}
            onMouseDown={(e) => {
              // The middle button would otherwise start the browser's scrolling.
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) openInNewTab(canvasHref(canvas.id, canvas.projectId));
            }}
            onDoubleClick={() => setRenaming({ id: canvas.id, text: canvas.name })}
          >
            {column && <span className={`tabbar-list-color ${colorClass(canvas.color, 'swatch')}`} style={colorStyle(canvas.color)} aria-hidden="true" />}
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
            {renaming?.id !== canvas.id && tools(canvas, active)}
          </div>
        );
      })}
      </div>
      </>
      )}
      <NewCanvas />
      {error && <span className="warning">{error}</span>}
    </nav>
  );
}

/**
 * "New canvas" and the arrow beside it: one control, the one primary of the bar of tabs. Its menu begins with what the
 * button does. The bar scrolls sideways, so the menu is placed against the window, under the button.
 */
function NewCanvas() {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent): void => {
      const target = event.target as globalThis.Node | null;
      if (!root.current?.contains(target) && !list.current?.contains(target)) setMenu(null);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // The menu's own Escape: it goes no further.
      event.stopPropagation();
      setMenu(null);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  const item = (command: 'canvas.new' | 'canvas.newInNewTab', label: string, says: string, testid: string) => (
    <button
      type="button"
      role="menuitem"
      title={hint(command)}
      data-testid={testid}
      onClick={() => {
        setMenu(null);
        runCommand(command);
      }}
    >
      {label}
      <small>{says}</small>
    </button>
  );
  return (
    <span className="toolbar-new tabbar-new" ref={root}>
      <button type="button" onClick={() => runCommand('canvas.new')} title={hint('canvas.new')} data-testid="tabbar-new-canvas">
        New canvas
      </button>
      <button
        type="button"
        className="toolbar-new-more"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        aria-label="More ways to add a canvas"
        title="More ways to add a canvas: in a new browser tab"
        onClick={(e) => {
          const box = (root.current ?? e.currentTarget).getBoundingClientRect();
          setMenu(menu ? null : { left: Math.max(4, Math.min(box.left, window.innerWidth - 324)), top: box.bottom + 6 });
        }}
        data-testid="tabbar-new-more"
      >
        ▾
      </button>
      {menu && (
        <span className="toolbar-menu tabbar-new-menu" role="menu" style={{ left: menu.left, top: menu.top }} ref={list} data-testid="tabbar-new-menu">
          {item('canvas.new', 'New canvas', 'Added here, and shown in this tab.', 'tabbar-new-here')}
          {item('canvas.newInNewTab', 'New canvas in a new browser tab', 'Added, and shown in a tab of its own. This one stays as it is.', 'tabbar-new-tab')}
        </span>
      )}
    </span>
  );
}

const VIEW_WORDS: Record<CanvasView, { label: string; says: string }> = {
  tabs: { label: 'Tabs', says: 'A row of tabs over the canvas.' },
  list: { label: 'One list', says: 'The name of the canvas you are on, and the others in its menu.' },
  column: { label: 'A column on the left', says: 'The tabs one under another at the left of the window, as a browser can show them.' },
};

/** What each way of showing the canvases looks like, drawn small. */
function ViewIcon({ view }: { view: CanvasView }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {view === 'tabs' && (
        <>
          <path d="M4 18v-8a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 12 10v8" />
          <path d="M14 18v-5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 20 13v5" />
          <path d="M2 18h20" />
        </>
      )}
      {view === 'list' && (
        <>
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <path d="M15 6.5l1.5 1.5 1.5-1.5" />
          <path d="M5 14h14M5 18h10" />
        </>
      )}
      {view === 'column' && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M9 4v16" />
          <path d="M5 8h2M5 12h2M5 16h2" />
        </>
      )}
    </svg>
  );
}

/**
 * The button at the start of the bar: what it draws is how the canvases are shown now, and its menu gives the three
 * ways, the one in use ticked. The menu is placed against the window: the bar may scroll, and a column is narrow.
 */
function ViewSwitch({ view }: { view: CanvasView }) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as globalThis.Node)) setMenu(null);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // The menu's own Escape: it goes no further.
      event.stopPropagation();
      setMenu(null);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  return (
    <span className="tabbar-view-root" ref={root}>
      <IconButton
        className="tabbar-view"
        label="How the canvases are shown"
        title={`The canvases are shown as: ${VIEW_WORDS[view].label.toLowerCase()}. Press to choose another way.`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { left: Math.max(4, Math.min(box.left, window.innerWidth - 324)), top: box.bottom + 6 });
        }}
        data-testid="tabbar-view"
      >
        <ViewIcon view={view} />
      </IconButton>
      {menu && (
        <span className="ui-menu ui-menu-fixed toolbar-menu tabbar-view-menu" role="menu" style={{ left: menu.left, top: menu.top }} data-testid="tabbar-view-menu">
          {CANVAS_VIEWS.map((way) => (
            <button
              key={way}
              type="button"
              role="menuitemradio"
              aria-checked={way === view}
              data-testid={`tabbar-view-${way}`}
              onClick={() => {
                setMenu(null);
                setCanvasView(way);
              }}
            >
              <span className="tabbar-view-line">
                <ViewIcon view={way} />
                {VIEW_WORDS[way].label}
              </span>
              <small>{VIEW_WORDS[way].says}</small>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The canvases as one list: the canvas being looked at by its name, the others in its menu, each with what waits
 * there. Its options and its close button stand beside it, as they do on its tab.
 */
function CanvasList({
  canvases,
  current,
  renaming,
  setRenaming,
  commitName,
  setCanvas,
  tools,
}: {
  canvases: readonly Canvas[];
  current: string | null;
  renaming: { id: string; text: string } | null;
  setRenaming: (next: { id: string; text: string } | null) => void;
  commitName: () => void;
  setCanvas: (id: string) => void;
  tools: (canvas: Canvas, active: boolean) => ReactNode;
}) {
  const app = useApp((s) => s.app);
  const canvas = canvases.find((c) => c.id === current);
  if (!app || !canvas) return null;
  const waitingElsewhere = canvases.filter((c) => c.id !== canvas.id).reduce((sum, c) => sum + canvasCounts(app, c).waiting, 0);
  return (
    <span className="tabbar-list" data-testid="tabbar-list">
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setRenaming(null);
          }}
        />
      ) : (
        <Switcher
          className="tabbar-list-switcher"
          buttonClassName={`tabbar-list-current ${colorClass(canvas.color)}`}
          style={colorStyle(canvas.color)}
          label="Canvas"
          name={canvas.name}
          nameTestid="tabbar-list-name"
          title={`The canvas you are looking at, of ${canvases.length}. Choose another from the list.`}
          testid="tabbar-list-button"
          menuTestid="tabbar-list-menu"
          extra={
            // What waits on the canvases not being looked at, as the project's control says it of other projects; what waits here is on the canvas.
            waitingElsewhere > 0 && (
              <span className="tab-waiting" title={`${waitingElsewhere} waiting for you on other canvases`} data-testid="tabbar-list-elsewhere">
                {waitingElsewhere}
              </span>
            )
          }
        >
          {canvases.map((c) => {
            const counts = canvasCounts(app, c);
            const active = c.id === current;
            return (
              <button
                key={c.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-testid="tabbar-list-row"
                data-canvas={c.id}
                onClick={(e) => {
                  // As on a tab: a click the way a link opens in a new tab opens this canvas in a new browser tab.
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return openInNewTab(canvasHref(c.id, c.projectId));
                  if (!active) setCanvas(c.id);
                }}
              >
                <span className="tabbar-list-row">
                  <span className={`tabbar-list-color ${colorClass(c.color, 'swatch')}`} style={colorStyle(c.color)} aria-hidden="true" />
                  <span className="tabbar-list-row-name">{c.name}</span>
                  {counts.waiting > 0 && (
                    <span className="tab-waiting" title={`${counts.waiting} waiting for you`}>
                      {counts.waiting}
                    </span>
                  )}
                  {counts.unread > 0 && !active && <span className="badge-unread" title="New output" />}
                </span>
                <small>{active ? 'You are here.' : `${c.layout.nodes.length} terminal${c.layout.nodes.length === 1 ? '' : 's'}`}</small>
              </button>
            );
          })}
        </Switcher>
      )}
      {renaming?.id !== canvas.id && tools(canvas, true)}
    </span>
  );
}
