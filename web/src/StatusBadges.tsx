import { untoldWords, type Session } from '@aubergine/shared';
import { MessageMark } from './Messages';
import { shortFolder } from './search';
import { DOT_WORD, dotTone, shortCommand } from './terminal-rows';
import { StateDot } from './ui';

/** "3m ago", "2h ago": how long since a moment, in the largest sensible unit. */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * What to say about a session in one short line: the program and the last part of what it was given while
 * something runs ("sh demo-agent.sh"), the shell and its folder otherwise. The title has the whole of it.
 */
export function describeStatus(session: Session): { text: string; title: string } {
  const { status } = session;
  const folder = shortFolder(session.cwd);
  if (status.state === 'busy') {
    const line = status.commandLine ?? session.command ?? '';
    return { text: shortCommand(line) || 'running', title: [line, session.cwd ? `in ${session.cwd}` : '', `Running since ${timeAgo(status.startedAt)}`].filter(Boolean).join('\n') };
  }
  const text = [session.command, folder].filter(Boolean).join(' · ');
  if (status.state === 'idle' && status.lastFinishedAt) {
    return { text, title: [session.cwd ?? '', `Last command finished ${timeAgo(status.lastFinishedAt)} with exit code ${status.lastExit ?? '?'}`].filter(Boolean).join('\n') };
  }
  return { text, title: session.cwd ?? '' };
}

/** The mark at the start of a terminal's title: the same dot as its row in the list. */
export function TitleDot({ session, focused }: { session: Session; focused: boolean }) {
  // New output is not news to whoever is typing in the terminal.
  const tone = dotTone(session);
  const shown = tone === 'unread' && focused ? 'ordinary' : tone;
  return <StateDot tone={shown} word={shown === 'hollow' ? 'ended' : DOT_WORD[shown]} data-busy={session.status.state === 'busy' ? 'true' : undefined} />;
}

/**
 * After a terminal's name: how its last command ended where it failed, a sentence that could not be typed, its
 * messages, and then, quietly, what it runs. They read the session only, so they look the same on a live
 * terminal and on a snapshot.
 */
export function StatusBadges({ session }: { session: Session }) {
  const { status } = session;
  const failed = status.state === 'idle' && status.lastExit !== null && status.lastExit !== 0;
  const info = describeStatus(session);
  return (
    <>
      {failed && (
        <span className="badge-exit" data-testid="badge-exit">
          exit {status.lastExit}
        </span>
      )}
      {session.untold && Date.now() - Date.parse(session.untold.at) < 30 * 60_000 && (
        <span className="badge-untold" title={untoldWords(session.untold)} data-testid="badge-untold">
          not told
        </span>
      )}
      <MessageMark session={session} />
      <span className="node-activity" title={info.title} data-testid="node-activity">
        {info.text}
      </span>
    </>
  );
}
