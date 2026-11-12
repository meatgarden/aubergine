import type { Session } from '@aubergine/shared';
import { shortFolder } from './search';

/** "3m ago", "2h ago": how long since a moment, in the largest sensible unit. */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** What to say about a session in one short line: what runs, or how the last command ended. */
export function describeStatus(session: Session): { text: string; title: string } {
  const { status } = session;
  const folder = shortFolder(session.cwd);
  if (status.state === 'busy') {
    const command = status.commandLine ?? session.command ?? 'running';
    return { text: [command, folder].filter(Boolean).join(' · '), title: `Running since ${timeAgo(status.startedAt)}` };
  }
  const text = [session.command, folder].filter(Boolean).join(' · ');
  if (status.state === 'idle' && status.lastFinishedAt) {
    return { text, title: `Last command finished ${timeAgo(status.lastFinishedAt)} with exit code ${status.lastExit ?? '?'}` };
  }
  return { text, title: session.cwd ?? '' };
}

/**
 * The small marks in a node's title bar: new output, busy, and a failed last
 * command. They read the session only, so they look the same on a live
 * terminal and on a snapshot.
 */
export function StatusBadges({ session, focused }: { session: Session; focused: boolean }) {
  const { status } = session;
  const failed = status.state === 'idle' && status.lastExit !== null && status.lastExit !== 0;
  const info = describeStatus(session);
  return (
    <span className="node-status" title={info.title} data-testid="node-status">
      {status.unread && !focused && (
        <span className="badge-unread" title="New output since you last looked" data-testid="badge-unread" />
      )}
      {status.state === 'busy' && <span className="badge-busy" data-testid="badge-busy" aria-label="Busy" />}
      {failed && (
        <span className="badge-exit" data-testid="badge-exit">
          exit {status.lastExit}
        </span>
      )}
      <span className="node-activity" data-testid="node-activity">
        {info.text}
      </span>
    </span>
  );
}
