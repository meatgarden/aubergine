import { useEffect, useState } from 'react';
import { api } from './api';

const REFRESH_MS = 1000;

/**
 * A plain-text picture of a session's screen, shown in place of a live
 * terminal. It refreshes about once a second while `refreshing`; otherwise it
 * fetches nothing.
 */
export function SnapshotView({ sessionId, refreshing }: { sessionId: string; refreshing: boolean }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!refreshing) return;
    let stopped = false;
    let busy = false;
    const load = (): void => {
      if (busy) return;
      busy = true;
      api
        .getSnapshot(sessionId)
        .then((snapshot) => {
          if (!stopped) setText(snapshot.text);
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionId, refreshing]);

  return (
    <pre className="snapshot" data-testid="snapshot">
      {text}
    </pre>
  );
}
