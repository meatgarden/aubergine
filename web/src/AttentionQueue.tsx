import { useState } from 'react';
import { notificationsWanted, setNotificationsWanted, waitingQueue } from './attention';
import { messageMark } from './Messages';
import { keysOf } from './shortcuts';
import { canvasLabel } from './search';
import { useApp } from './store';

/** Which terminals wait for the owner and why, in a line: said on the thing in the top bar that counts what waits. */
export function useWaitingWords(): string {
  // Everything that waits, in every project: nothing that waits is out of sight because another project is open.
  const sessions = useApp((s) => s.whole?.sessions);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const runs = useApp((s) => s.whole?.runs);
  const queue = waitingQueue(sessions ?? [], runs ?? []);
  if (queue.length === 0) return '';
  return `Waiting for you${keysOf('attention.next').length > 0 ? ` (${keysOf('attention.next').join(' or ')} goes to the next)` : ''}: ${queue
    .map((s) => {
      const canvas = canvasLabel(app, s.id, canvasId);
      // Why it waits, when it said: a blocked or finished run names its step here.
      const mark = messageMark(s);
      const why = s.attention.message ? `: ${s.attention.message}` : mark && (s.messages.paused > 0 || s.messages.forOwner > 0) ? `: ${s.messages.paused > 0 ? 'these two have exchanged many messages; continue?' : mark.text}` : '';
      return `${canvas ? `${s.name} (on ${canvas})` : s.name}${why}`;
    })
    .join(', ')}`;
}

/** Whether the desktop is told when a terminal starts waiting: a switch, kept with Help. */
export function NotifySwitch() {
  const [notify, setNotify] = useState(notificationsWanted);
  return (
    <label className="ui-check" title={notify ? 'Desktop notifications are on.' : 'Notify me on the desktop when a terminal starts waiting'}>
      <input type="checkbox" checked={notify} onChange={() => void setNotificationsWanted(!notify).then(setNotify)} data-testid="notify-switch" />
      <span>Notify me on the desktop when a terminal starts waiting</span>
    </label>
  );
}
