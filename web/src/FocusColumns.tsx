import { useMemo } from 'react';
import { placeOfSession, sessionsWaiting, sortedCanvases } from '@aubergine/shared';
import { canvasHref } from './address';
import { colorClass, colorStyle } from './color';
import { setFocusColumns, useFocusColumns } from './focus-view';
import { NotePanel } from './NotePanel';
import { DrawerResize } from './panel/SidePanel';
import { Details } from './panel/sections/terminal-details';
import { useApp } from './store';
import { IconButton } from './ui';

/**
 * The three columns of the focus view, beside its terminal: the canvases of its project at the left, its details
 * beside them, its note at the right. Each is the same piece the canvas page uses: the column of canvas tabs, the
 * drawer's details, the note beside a node.
 */

/** The terminal's own keyboard, given back when a column it was in goes away. */
const backToTerminal = (sessionId: string): void => useApp.getState().focusSession(sessionId);

/** A terminal that is gone is said by the page itself: the details do not close their column for it, which would be remembered. */
const stay = (): void => {};

/**
 * The canvases of the terminal's project, in their order, each a link to its canvas (so that the browser's own "open
 * in new tab" works), with what waits there; the canvas the terminal is on, or was parked from, is marked.
 */
export function FocusCanvases({ sessionId }: { sessionId: string }) {
  const app = useApp((s) => s.app);
  const canvases = useMemo(() => (app ? sortedCanvases(app) : []), [app]);
  if (!app) return null;
  const session = app.sessions.find((s) => s.id === sessionId);
  const own = placeOfSession(app, sessionId)?.canvas.id ?? session?.parkedFrom?.canvasId ?? null;
  return (
    <nav className="tabbar is-column focus-canvases" aria-label="Canvases" data-testid="focus-canvases">
      <div className="tabbar-tabs">
        {canvases.map((canvas) => {
          const here = new Set(canvas.layout.nodes.map((n) => n.sessionId));
          // The same function the count at the top and the owner's list are made with.
          const waiting = sessionsWaiting(
            app.sessions.filter((s) => here.has(s.id)),
            app.runs,
          ).length;
          const current = canvas.id === own;
          return (
            <a
              key={canvas.id}
              href={canvasHref(canvas.id, canvas.projectId)}
              className={`tab ${colorClass(canvas.color)}${current ? ' active' : ''}`}
              style={colorStyle(canvas.color)}
              aria-current={current ? 'page' : undefined}
              title={`Opens “${canvas.name}” in this browser tab. The terminal goes on.`}
              data-testid="focus-canvas"
              data-canvas={canvas.id}
            >
              <span className={`tabbar-list-color ${colorClass(canvas.color, 'swatch')}`} style={colorStyle(canvas.color)} aria-hidden="true" />
              <span className="tab-name">{canvas.name}</span>
              {waiting > 0 && (
                <span className="panel-count is-urgent" title={`${waiting} waiting for you`} aria-label={`${waiting} waiting for you`} data-testid="focus-canvas-waiting">
                  {waiting}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The terminal's details: the drawer's own, standalone, as wide as the drawer is in this browser and resized the same
 * way. While the Note column is open the note is there, once: the details leave out its summary and its log.
 */
export function FocusDetails({ sessionId }: { sessionId: string }) {
  const width = useApp((s) => s.side.drawerWidth);
  const noteOpen = useFocusColumns().note;
  const close = (): void => {
    setFocusColumns({ details: false });
    backToTerminal(sessionId);
  };
  return (
    <>
      <aside
        className="panel-drawer focus-details"
        style={{ width }}
        aria-label="Details"
        data-testid="focus-details"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <header className="panel-drawer-head details-head">
          <h2 className="panel-drawer-title">Details</h2>
          <IconButton className="details-close" label="Close the details" title="Close (Esc)" onClick={close} data-testid="details-close">
            ×
          </IconButton>
        </header>
        <Details id={sessionId} onClose={stay} standalone noteElsewhere={noteOpen} />
      </aside>
      <DrawerResize width={width} />
    </>
  );
}

/** The terminal's note, laid out as a column of the page: the note beside a node, standing at the right. */
export function FocusNote({ sessionId, takeKeyboard }: { sessionId: string; takeKeyboard: boolean }) {
  return (
    <div className="focus-note" data-testid="focus-note">
      <NotePanel
        sessionId={sessionId}
        takeKeyboard={takeKeyboard}
        onClose={() => {
          setFocusColumns({ note: false });
          backToTerminal(sessionId);
        }}
      />
    </div>
  );
}
