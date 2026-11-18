import { useState } from 'react';
import { DEMO_LABEL, demoOf } from '@aubergine/shared';
import { runCommand } from './commands';
import { useApp } from './store';
import { showMeAround } from './tour/actions';

/**
 * What a canvas with nothing on it shows in its middle: the three ways to
 * begin. It goes away with the first terminal.
 */
export function EmptyCanvas() {
  const app = useApp((s) => s.app);
  const [bringing, setBringing] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = app ? demoOf(app) : null;
  // On the demo's own canvas, emptied: the way to take the demo away is said here too.
  const onDemo = useApp((state) => state.canvasId !== null && state.app?.canvases.find((c) => c.id === state.canvasId)?.labels[DEMO_LABEL] !== undefined);

  return (
    <div className="empty-canvas" data-testid="empty-canvas">
      <h2>Nothing here yet</h2>
      <p>A canvas holds your terminals, side by side. Three ways to begin:</p>
      <div className="empty-choices">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void showMeAround().finally(() => setBusy(false));
          }}
          data-testid="empty-show-me"
        >
          {demo ? 'Go to the demo' : 'Show me around'}
        </button>
        <button type="button" className="quiet" onClick={() => runCommand('terminal.new')} data-testid="empty-new-terminal">
          + New terminal
        </button>
        <button type="button" className="quiet" aria-expanded={bringing} onClick={() => setBringing(!bringing)} data-testid="empty-bring">
          Bring in a terminal I already have open
        </button>
      </div>
      {!demo && <p className="sheet-note">“Show me around” makes a canvas named “Demo” with stand-ins on it, and a short tour. Nothing in it is real, and one click removes it.</p>}
      {onDemo && (
        <p className="empty-line">
          This is the demo’s canvas.{' '}
          <button type="button" className="quiet" onClick={() => runCommand('demo.remove')} data-testid="empty-remove-demo">
            Remove the demo
          </button>
        </p>
      )}
      {bringing && (
        <p className="empty-line" data-testid="empty-bring-line">
          In that terminal, type <code>aubergine here</code> and press Enter. It appears on this canvas, in the same folder.
        </p>
      )}
    </div>
  );
}
