import { useState } from 'react';
import { demoOf } from '@aubergine/shared';
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

  return (
    <div className="empty-canvas" data-testid="empty-canvas">
      <h2>Nothing here yet</h2>
      <p>A canvas holds your terminals, side by side. Three ways to begin:</p>
      <div className="empty-choices">
        <button
          type="button"
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
      {bringing && (
        <p className="empty-line" data-testid="empty-bring-line">
          In that terminal, type <code>aubergine here</code> and press Enter. It appears on this canvas, in the same folder.
        </p>
      )}
    </div>
  );
}
