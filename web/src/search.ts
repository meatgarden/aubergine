import type { Session } from '@aubergine/shared';

export type MatchField = 'name' | 'folder' | 'command' | 'note';

export interface SessionMatch {
  session: Session;
  /** The most telling field that matched. */
  field: MatchField;
  /** For note matches: the line of the note that matched. */
  excerpt: string | null;
}

const WEIGHT: Record<MatchField, number> = { name: 0, folder: 1, command: 2, note: 3 };

/**
 * Plain in-memory search over session names, folders, commands and notes.
 * Every word of the query must appear somewhere in the session (case does
 * not matter). Results are ordered by where the first word matched: names
 * first, then folders, commands and notes; ties keep the given order.
 * An empty query lists everything.
 */
export function searchSessions(sessions: readonly Session[], query: string): SessionMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sessions.map((session) => ({ session, field: 'name', excerpt: null }));

  const matches: SessionMatch[] = [];
  for (const session of sessions) {
    const fields: [MatchField, string][] = [
      ['name', session.name.toLowerCase()],
      ['folder', (session.cwd ?? '').toLowerCase()],
      ['command', (session.command ?? '').toLowerCase()],
      ['note', noteText(session).toLowerCase()],
    ];
    if (!words.every((word) => fields.some(([, text]) => text.includes(word)))) continue;

    const first = words[0] ?? '';
    const field = fields.find(([, text]) => text.includes(first))?.[0] ?? 'name';
    let excerpt: string | null = null;
    if (field === 'note') {
      const line = noteText(session).split('\n').find((l) => l.toLowerCase().includes(first)) ?? '';
      excerpt = line.trim().slice(0, 120);
    }
    matches.push({ session, field, excerpt });
  }
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => WEIGHT[a.match.field] - WEIGHT[b.match.field] || a.index - b.index)
    .map(({ match }) => match);
}

/** Everything written about a session: its pinned note and its log. */
function noteText(session: Session): string {
  return [session.note, ...session.noteLog.map((entry) => entry.text)].join('\n');
}

/** A short form of a folder path for tight spaces: its last two parts. */
export function shortFolder(path: string | null): string {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`;
}
