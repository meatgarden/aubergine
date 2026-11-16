import { useEffect, useState } from 'react';
import { ago, showControl, type AwayDigest } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * "While you were away": when the page is come back to after a while, a
 * small panel says what changed meanwhile. It asks the server, which keeps
 * a window of recent changes in memory. When the page was last looked at is
 * remembered in this browser only. The panel never covers the canvas and
 * goes away when dismissed.
 */

const STORAGE_KEY = 'aubergine.last-seen';

/** Whether enough time has passed since the page was last looked at to say what changed. */
export function wasAway(lastSeen: string | null, now: Date, afterMinutes: number): boolean {
  if (afterMinutes <= 0 || lastSeen === null) return false;
  const then = Date.parse(lastSeen);
  return Number.isFinite(then) && now.getTime() - then > afterMinutes * 60_000;
}

const read = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const mark = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // Not remembered: the panel is then never shown, which is the safe way round.
  }
};

export function Away() {
  const ready = useApp((s) => s.phase === 'ready');
  const afterMinutes = useApp((s) => s.settings.away.afterMinutes);
  const [digest, setDigest] = useState<AwayDigest | null>(null);

  useEffect(() => {
    if (!ready) return;
    const look = (): void => {
      if (document.visibilityState !== 'visible') return;
      const lastSeen = read();
      mark();
      if (!wasAway(lastSeen, new Date(), afterMinutes) || lastSeen === null) return;
      void api.away(lastSeen).then(
        (found) => found.items.length > 0 && setDigest(found),
        () => {},
      );
    };
    look();
    const onVisibility = (): void => (document.visibilityState === 'visible' ? look() : mark());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', mark);
    // While it is being looked at, "last seen" keeps up.
    const timer = setInterval(() => document.visibilityState === 'visible' && mark(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', mark);
      clearInterval(timer);
    };
  }, [ready, afterMinutes]);

  if (!digest) return null;
  const now = new Date();
  const go = (item: AwayDigest['items'][number]): void => {
    if (item.runId && (item.kind === 'run-finished' || item.kind === 'run-moved')) useApp.getState().viewRun(item.runId);
    else if (item.sessionId) useApp.getState().showSession(item.sessionId);
    else if (item.kind === 'draft-arrived') useApp.getState().togglePanel('review');
  };

  return (
    <section className="away-panel" role="region" aria-label="While you were away" data-testid="away-panel">
      <header>
        <h2>While you were away</h2>
        <button type="button" className="quiet" onClick={() => setDigest(null)} data-testid="away-dismiss">
          Dismiss
        </button>
      </header>
      {digest.partial && (
        <p className="sheet-note" data-testid="away-partial">
          {digest.why}
        </p>
      )}
      <ul>
        {digest.items.map((item, index) => (
          <li key={`${item.at} ${index}`} data-testid="away-item" data-kind={item.kind}>
            <button type="button" className="away-item" disabled={!item.sessionId && !item.runId && item.kind !== 'draft-arrived'} onClick={() => go(item)}>
              {/* Names and messages are other people's text: shown as text, control characters shown. */}
              <span>{showControl(item.text)}</span>
              <span className="away-when">{ago(item.at, now)} ago</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
