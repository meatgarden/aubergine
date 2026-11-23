import { useEffect, useState } from 'react';
import { shortCommand } from '@aubergine/shared';
import { shownAddress, terminalOnCanvasHref } from './address';
import { FocusCanvases, FocusDetails, FocusNote } from './FocusColumns';
import { setFocusColumns, useFocusColumns } from './focus-view';
import { useApp } from './store';
import { TerminalView } from './TerminalView';
import { DOT_WORD, dotTone } from './terminal-rows';
import { Button, StateDot } from './ui';

/**
 * One terminal by itself, filling a browser tab of its own (`/t/<session id>`): the focus view. It is the same running
 * terminal as its node on a canvas: one more viewer over its own socket, so both show it and either can type. Closing
 * the tab ends nothing. The two share one size, the size of the one typed into last (the runtime's `window-size latest`).
 * Beside it, when asked for, three columns: the canvases of its project, its details, its note. The terminal has the
 * room they leave.
 */
export function TerminalPage({ sessionId }: { sessionId: string }) {
  const session = useApp((s) => s.whole?.sessions.find((x) => x.id === sessionId) ?? null);
  const name = session?.name ?? null;

  useEffect(() => {
    document.title = name ? `${name} · Aubergine` : 'Aubergine';
  }, [name]);

  // The terminal takes the keyboard as soon as it can: it is all there is in this tab.
  const present = session !== null;
  useEffect(() => {
    if (present) useApp.getState().focusSession(sessionId);
  }, [sessionId, present]);

  const columns = useFocusColumns();
  // The note takes the keyboard when it was just asked for, not when it was simply remembered open.
  const [noteAsked, setNoteAsked] = useState(false);
  const toggle = (column: 'canvases' | 'details' | 'note'): void => {
    const open = !columns[column];
    setFocusColumns({ [column]: open });
    if (column === 'note') setNoteAsked(open);
    // Otherwise the keyboard goes back to the terminal: pressing a button in the head is not a reason to leave it.
    if (column !== 'note' || !open) useApp.getState().focusSession(sessionId);
  };

  if (!session) {
    return (
      <main className="message" data-testid="terminal-page-missing">
        <div className="message-card">
          <h1>This terminal is not here</h1>
          <p>It may have been ended, or the address is not one of a terminal on this server.</p>
          <Button onClick={() => location.assign(shownAddress('/'))}>Open the canvas</Button>
        </div>
      </main>
    );
  }

  const tone = dotTone(session, session.state === 'parked');
  return (
    <main className="terminal-page" data-testid="terminal-page" data-session={sessionId}>
      <header className="terminal-page-head">
        <Button
          kind="quiet"
          className="terminal-page-toggle"
          aria-expanded={columns.canvases}
          title={columns.canvases ? 'Hide the canvases of this project' : 'Show the canvases of this project'}
          onClick={() => toggle('canvases')}
          data-testid="focus-canvases-toggle"
        >
          Canvases
        </Button>
        <StateDot tone={tone} word={DOT_WORD[tone]} />
        <h1 className="terminal-page-name" data-testid="terminal-page-name">
          {session.name}
        </h1>
        {session.command && (
          <span className="terminal-page-command" title={session.command}>
            {shortCommand(session.command)}
          </span>
        )}
        <span className="terminal-page-actions">
          <Button kind="quiet" className="terminal-page-toggle" aria-pressed={columns.details} title={columns.details ? 'Hide the details' : 'Show the details of this terminal'} onClick={() => toggle('details')} data-testid="focus-details-toggle">
            Details
          </Button>
          <Button kind="quiet" className="terminal-page-toggle" aria-pressed={columns.note} title={columns.note ? 'Hide the note' : 'Show the note of this terminal'} onClick={() => toggle('note')} data-testid="focus-note-toggle">
            Note
          </Button>
          <Button
            kind="quiet"
            className="terminal-page-back"
            title="Open the canvas this terminal is on, with this terminal in view. This tab is left; the terminal goes on."
            onClick={() => location.assign(terminalOnCanvasHref(sessionId))}
            data-testid="terminal-page-canvas"
          >
            Show on its canvas
          </Button>
        </span>
      </header>
      <div className="terminal-page-columns">
        {columns.canvases && <FocusCanvases sessionId={sessionId} />}
        {columns.details && <FocusDetails sessionId={sessionId} />}
        <div className="terminal-page-body" data-testid="terminal-page-body">
          {session.state === 'exited' ? (
            <p className="terminal-page-ended" data-testid="terminal-page-ended">
              This shell has ended.
            </p>
          ) : (
            <TerminalView sessionId={sessionId} interactive chords={false} />
          )}
        </div>
        {columns.note && <FocusNote sessionId={sessionId} takeKeyboard={noteAsked} />}
      </div>
    </main>
  );
}
