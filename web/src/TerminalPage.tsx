import { useEffect } from 'react';
import { shortCommand } from '@aubergine/shared';
import { shownAddress, terminalOnCanvasHref } from './address';
import { useApp } from './store';
import { TerminalView } from './TerminalView';
import { DOT_WORD, dotTone } from './terminal-rows';
import { Button, StateDot } from './ui';

/**
 * One terminal by itself, filling a browser tab of its own (`/t/<session id>`). It is the same running terminal as its
 * node on a canvas: one more viewer over its own socket, so both show it and either can type. Closing the tab ends
 * nothing. The two share one size, the size of the one typed into last (the runtime's `window-size latest`).
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
        <StateDot tone={tone} word={DOT_WORD[tone]} />
        <h1 className="terminal-page-name" data-testid="terminal-page-name">
          {session.name}
        </h1>
        {session.command && (
          <span className="terminal-page-command" title={session.command}>
            {shortCommand(session.command)}
          </span>
        )}
        <Button
          kind="quiet"
          className="terminal-page-back"
          title="Open the canvas this terminal is on, with this terminal in view. This tab is left; the terminal goes on."
          onClick={() => location.assign(terminalOnCanvasHref(sessionId))}
          data-testid="terminal-page-canvas"
        >
          Show on its canvas
        </Button>
      </header>
      <div className="terminal-page-body">
        {session.state === 'exited' ? (
          <p className="terminal-page-ended" data-testid="terminal-page-ended">
            This shell has ended.
          </p>
        ) : (
          <TerminalView sessionId={sessionId} interactive chords={false} />
        )}
      </div>
    </main>
  );
}
