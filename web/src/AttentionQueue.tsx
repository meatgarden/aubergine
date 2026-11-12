import { useState } from 'react';
import { api } from './api';
import { nextWaiting, notificationsWanted, setNotificationsWanted, waitingQueue } from './attention';
import { useApp } from './store';

/**
 * "2 waiting": how many sessions want the user, and a way to go to the next
 * one. `onGo` moves the view to a node and focuses it, which also tells the
 * daemon the user has looked.
 */
export function AttentionQueue({ onGo }: { onGo: (nodeId: string, sessionId: string) => void }) {
  const sessions = useApp((s) => s.canvas?.sessions);
  const nodes = useApp((s) => s.canvas?.layout.nodes);
  const current = useApp((s) => s.focus?.sessionId ?? null);
  const [notify, setNotify] = useState(notificationsWanted);

  const queue = waitingQueue(sessions ?? []);

  const goNext = async (): Promise<void> => {
    const next = nextWaiting(sessions ?? [], current);
    if (!next) return;
    if (next.state === 'parked') await api.restoreSession(next.id);
    const node = nodes?.find((n) => n.sessionId === next.id);
    if (node) onGo(node.id, next.id);
  };

  return (
    <>
      {queue.length > 0 && (
        <button
          type="button"
          className="attention-button"
          onClick={() => void goNext()}
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
