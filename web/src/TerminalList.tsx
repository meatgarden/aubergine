import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { canvasCounts, sortedCanvases, type Canvas, type CommandId, type Session } from '@aubergine/shared';
import { canvasActions } from './canvas-actions';
import { runCommand } from './commands';
import { shortFolder } from './search';
import { hint } from './shortcuts';
import { currentCanvas, useApp } from './store';
import { listGroups, listOrder } from './terminal-list';

/**
 * The terminals of the canvas being looked at, as a list down the left side,
 * in the order they read on the canvas; below it the other canvases and the
 * parked sessions. It is made from the state the page already has: no
 * terminal is attached for it and nothing is fetched or polled.
 */
export function TerminalList() {
  const app = useApp((s) => s.app);
  const canvas = useApp(currentCanvas);
  const prefs = useApp((s) => s.list);
  const current = useApp((s) => s.focus?.sessionId ?? s.selected);
  const focused = useApp((s) => s.focus?.sessionId ?? null);
  useApp((s) => s.settings.shortcuts);
  const [open, setOpen] = useState<{ canvases: boolean; parked: boolean; expanded: Record<string, boolean> }>({
    canvases: false,
    parked: false,
    expanded: {},
  });
  const [menu, setMenu] = useState<string | null>(null);
  const rows = useRef<HTMLDivElement>(null);

  const sessions = useMemo(() => new Map((app?.sessions ?? []).map((s) => [s.id, s])), [app?.sessions]);
  const groups = useMemo(() => (canvas ? listGroups(canvas.layout) : []), [canvas]);

  // Keep the row of the selected terminal in view.
  useEffect(() => {
    if (!current) return;
    rows.current?.querySelector(`[data-session="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, prefs.collapsed]);

  // The row menu closes on a click anywhere else.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('.list-menu, .list-more')) setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [menu]);

  if (!app || !canvas) return null;

  if (prefs.collapsed) {
    return (
      <aside className="terminal-list collapsed" aria-label="Terminals" data-testid="terminal-list">
        <button type="button" className="quiet" aria-label="Show the terminal list" title={hint('list.toggle', 'Show the terminal list')} onClick={() => runCommand('list.toggle')}>
          ›
        </button>
      </aside>
    );
  }

  const go = (sessionId: string): void => {
    setMenu(null);
    useApp.getState().showSession(sessionId);
  };

  /** Runs a command on a row's terminal: it becomes the selected one first. */
  const act = (sessionId: string, command: CommandId): void => {
    setMenu(null);
    canvasActions.get()?.releaseFocus();
    useApp.getState().select(sessionId);
    canvasActions.get()?.reveal(sessionId);
    runCommand(command);
  };

  const startResize = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = prefs.width;
    const move = (e: PointerEvent): void => useApp.getState().setList({ width: startWidth + e.clientX - startX });
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const others = sortedCanvases(app).filter((c) => c.id !== canvas.id);
  const parked = app.sessions.filter((s) => s.state === 'parked');
  const waitingElsewhere = others.reduce((sum, c) => sum + canvasCounts(app, c).waiting, 0);
  const total = canvas.layout.nodes.length;

  return (
    <aside className="terminal-list" style={{ width: prefs.width }} aria-label="Terminals" data-testid="terminal-list">
      <header className="list-head">
        <span>
          Terminals <span className="list-count">{total}</span>
        </span>
        <button type="button" className="quiet" aria-label="Hide the terminal list" title={hint('list.toggle', 'Hide the terminal list')} onClick={() => runCommand('list.toggle')}>
          ‹
        </button>
      </header>
      <div className="list-scroll">
        <div
          className="list-rows"
          role="listbox"
          tabIndex={0}
          aria-label="Terminals on this canvas"
          ref={rows}
          onKeyDown={(event) => {
            // With the keyboard in the list: arrows move through the rows, Enter goes to the terminal.
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowDown') runCommand('select.next');
            else if (event.key === 'ArrowUp') runCommand('select.previous');
            else if (event.key === 'Enter') runCommand('terminal.enter');
            else if (event.key === 'Escape') event.currentTarget.blur();
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {total === 0 && <div className="list-empty">No terminals on this canvas.</div>}
          {groups.map((group) => (
            <div key={group.frame?.id ?? 'loose'} role="group" aria-label={group.frame ? group.frame.label || 'Frame' : 'Outside any frame'}>
              {group.frame && (
                <div className="list-heading" data-testid="list-heading">
                  {group.frame.label || 'Frame'}
                </div>
              )}
              {group.nodes.map((node) => {
                const session = sessions.get(node.sessionId);
                if (!session) return null;
                return (
                  <Row
                    key={session.id}
                    session={session}
                    current={session.id === current}
                    focused={session.id === focused}
                    menuOpen={menu === session.id}
                    indented={group.frame !== null}
                    onGo={go}
                    onMenu={setMenu}
                    onAct={act}
                    canMove={others.length > 0}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {others.length > 0 && (
          <section className="list-section">
            <button
              type="button"
              className="list-toggle"
              aria-expanded={open.canvases}
              data-testid="list-other-canvases"
              onClick={() => setOpen((o) => ({ ...o, canvases: !o.canvases }))}
            >
              <span className="list-chevron">{open.canvases ? '▾' : '▸'}</span> Other canvases
              {waitingElsewhere > 0 && (
                <span className="tab-waiting" title={`${waitingElsewhere} waiting for you`}>
                  {waitingElsewhere}
                </span>
              )}
            </button>
            {open.canvases &&
              others.map((other) => (
                <OtherCanvas
                  key={other.id}
                  canvas={other}
                  waiting={canvasCounts(app, other).waiting}
                  expanded={open.expanded[other.id] === true}
                  onToggle={() => setOpen((o) => ({ ...o, expanded: { ...o.expanded, [other.id]: !o.expanded[other.id] } }))}
                  sessions={sessions}
                  onGo={go}
                />
              ))}
          </section>
        )}

        {parked.length > 0 && (
          <section className="list-section">
            <button
              type="button"
              className="list-toggle"
              aria-expanded={open.parked}
              data-testid="list-parked"
              onClick={() => setOpen((o) => ({ ...o, parked: !o.parked }))}
            >
              <span className="list-chevron">{open.parked ? '▾' : '▸'}</span> Parked <span className="list-count">{parked.length}</span>
            </button>
            {open.parked &&
              parked.map((session) => (
                <Row key={session.id} session={session} current={false} focused={false} menuOpen={false} indented onGo={go} title="Restore onto this canvas" />
              ))}
          </section>
        )}
      </div>
      <div className="list-resize" role="separator" aria-orientation="vertical" aria-label="Resize the terminal list" onPointerDown={startResize} data-testid="list-resize" />
    </aside>
  );
}

function OtherCanvas({
  canvas,
  waiting,
  expanded,
  onToggle,
  sessions,
  onGo,
}: {
  canvas: Canvas;
  waiting: number;
  expanded: boolean;
  onToggle: () => void;
  sessions: Map<string, Session>;
  onGo: (sessionId: string) => void;
}) {
  const order = useMemo(() => (expanded ? listOrder(canvas.layout) : []), [expanded, canvas.layout]);
  return (
    <div data-testid="list-canvas" data-canvas={canvas.id}>
      <div className="list-canvas">
        <button type="button" className="list-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} the terminals of ${canvas.name}`} onClick={onToggle}>
          <span className="list-chevron">{expanded ? '▾' : '▸'}</span>
        </button>
        <button type="button" className="list-canvas-name" title={`Go to ${canvas.name}`} onClick={() => useApp.getState().setCanvas(canvas.id)}>
          {canvas.name}
        </button>
        <span className="list-count">{canvas.layout.nodes.length}</span>
        {waiting > 0 && (
          <span className="tab-waiting" title={`${waiting} waiting for you`}>
            {waiting}
          </span>
        )}
      </div>
      {expanded &&
        order.map((id) => {
          const session = sessions.get(id);
          return session ? <Row key={id} session={session} current={false} focused={false} menuOpen={false} indented onGo={onGo} /> : null;
        })}
    </div>
  );
}

const ATTENTION: Record<string, string> = { waiting: 'waiting', done: 'finished', working: 'working' };

/** One terminal: name, what it is doing and where, and the same marks as its node. */
const Row = memo(function Row({
  session,
  current,
  focused,
  menuOpen,
  indented,
  onGo,
  onMenu,
  onAct,
  canMove,
  title,
}: {
  session: Session;
  current: boolean;
  focused: boolean;
  menuOpen: boolean;
  indented: boolean;
  onGo: (sessionId: string) => void;
  onMenu?: (sessionId: string | null) => void;
  onAct?: (sessionId: string, command: CommandId) => void;
  canMove?: boolean;
  title?: string;
}) {
  const { status, attention } = session;
  const exited = session.state === 'exited';
  const failed = status.state === 'idle' && status.lastExit !== null && status.lastExit !== 0;
  const detail = exited ? 'ended' : [session.command, shortFolder(session.cwd)].filter(Boolean).join(' · ');
  return (
    <div
      className={`list-row${current ? ' current' : ''}${focused ? ' focused' : ''}${indented ? ' indented' : ''}`}
      role="option"
      aria-selected={current}
      data-testid="list-row"
      data-session={session.id}
      title={title}
      onClick={() => onGo(session.id)}
    >
      <div className="list-main">
        <span className="list-name">{session.name}</span>
        <span className="list-marks">
          {status.unread && !focused && <span className="badge-unread" title="New output since you last looked" />}
          {status.state === 'busy' && !exited && <span className="badge-busy" aria-label="Busy" title={status.commandLine ?? "Busy"} />}
          {failed && <span className="badge-exit">exit {status.lastExit}</span>}
          {session.agent && <span className="list-agent" title="An agent runs here">agent</span>}
          {!exited && attention.state !== 'none' && (
            <span className={`badge-attention is-${attention.state}`} title={attention.message ?? undefined}>
              {ATTENTION[attention.state]}
            </span>
          )}
        </span>
      </div>
      <div className="list-detail">{detail || ' '}</div>
      {onMenu && onAct && (
        <>
          <button
            type="button"
            className="list-more quiet"
            aria-label={`Actions for ${session.name}`}
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onMenu(menuOpen ? null : session.id);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="list-menu" role="menu" aria-label={`Actions for ${session.name}`} onClick={(event) => event.stopPropagation()}>
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.rename')}>
                Rename
              </button>
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'notes.toggle')}>
                Notes
              </button>
              {canMove && (
                <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.moveToCanvas')}>
                  Move to canvas…
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.park')}>
                {exited ? 'Remove' : 'Park'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});
