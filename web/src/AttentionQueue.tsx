import { useState } from 'react';
import { notificationsWanted, setNotificationsWanted, waitingQueue } from './attention';
import { runCommand } from './commands';
import { messageMark } from './Messages';
import { keysOf } from './shortcuts';
import { canvasLabel } from './search';
import { useApp } from './store';

/**
 * "2 waiting": how many sessions want the user, and a way to go to the next
 * one, on whichever canvas it is. Going there focuses it, which also tells
 * the daemon the user has looked.
 */
export function AttentionQueue() {
  // Everything that waits, in every project: nothing that waits is out of sight because another project is open.
  const sessions = useApp((s) => s.whole?.sessions);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const [notify, setNotify] = useState(notificationsWanted);

  const runs = useApp((s) => s.whole?.runs);
  const queue = waitingQueue(sessions ?? [], runs ?? []);

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
              // Why it waits, when it said: a blocked or finished run names its element here.
              const mark = messageMark(s);
              const why = s.attention.message ? `: ${s.attention.message}` : mark && (s.messages.paused > 0 || s.messages.forOwner > 0) ? `: ${s.messages.paused > 0 ? 'these two have exchanged many messages; continue?' : mark.text}` : '';
              return `${canvas ? `${s.name} (on ${canvas})` : s.name}${why}`;
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
        Notify {notify ? 'on' : 'off'}
      </button>
    </>
  );
}
