import { useState } from 'react';
import { nextWaiting, notificationsWanted, setNotificationsWanted, waitingQueue } from './attention';
import { useApp } from './store';

/**
 * "2 waiting": how many sessions want the user, and a way to go to the next
 * one, on whichever canvas it is. Going there focuses it, which also tells
 * the daemon the user has looked.
 */
export function AttentionQueue() {
  const sessions = useApp((s) => s.app?.sessions);
  const current = useApp((s) => s.focus?.sessionId ?? null);
  const [notify, setNotify] = useState(notificationsWanted);

  const queue = waitingQueue(sessions ?? []);

  const goNext = (): void => {
    const next = nextWaiting(sessions ?? [], current);
    if (next) useApp.getState().showSession(next.id);
  };

  return (
    <>
      {queue.length > 0 && (
        <button
          type="button"
          className="attention-button"
          onClick={goNext}
          title={`Go to the next session that is waiting for you: ${queue.map((s) => s.name).join(', ')}`}
          data-testid="attention-queue"
        >
          {queue.length} waiting
        </button>
      )}
      <button
        type="button"
        className="quiet"
        aria-pressed={notify}
        title={notify ? 'Desktop notifications are on. Click to turn them off.' : 'Notify me on the desktop when a session starts waiting'}
        onClick={() => void setNotificationsWanted(!notify).then(setNotify)}
      >
        {notify ? 'Notify: on' : 'Notify: off'}
      </button>
    </>
  );
}
