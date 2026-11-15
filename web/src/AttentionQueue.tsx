import { useState } from 'react';
import { notificationsWanted, setNotificationsWanted, waitingQueue } from './attention';
import { runCommand } from './commands';
import { keysOf } from './shortcuts';
import { canvasLabel } from './search';
import { useApp } from './store';

/**
 * "2 waiting": how many sessions want the user, and a way to go to the next
 * one, on whichever canvas it is. Going there focuses it, which also tells
 * the daemon the user has looked.
 */
export function AttentionQueue() {
  const sessions = useApp((s) => s.app?.sessions);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const [notify, setNotify] = useState(notificationsWanted);

  const queue = waitingQueue(sessions ?? []);

  return (
    <>
      {queue.length > 0 && (
        <button
          type="button"
          className="attention-button"
          onClick={() => runCommand('attention.next')}
          title={`Go to the next session that is waiting for you${keysOf('attention.next').length > 0 ? ` (${keysOf('attention.next').join(' or ')})` : ''}: ${queue
            .map((s) => {
              const canvas = canvasLabel(app, s.id, canvasId);
              return canvas ? `${s.name} (on ${canvas})` : s.name;
            })
            .join(', ')}`}
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
