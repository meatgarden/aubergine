import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { searchSessions, shortFolder } from './search';
import { useApp } from './store';

/**
 * The session picker: type to search names, folders, commands and notes,
 * Enter to go there. `onGo` moves the view to a node and focuses it.
 */
export function Picker({ onGo }: { onGo: (nodeId: string, sessionId: string) => void }) {
  const open = useApp((s) => s.picker);
  const setPicker = useApp((s) => s.setPicker);
  const sessions = useApp((s) => s.canvas?.sessions);
  const nodes = useApp((s) => s.canvas?.layout.nodes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => searchSessions(sessions ?? [], query), [sessions, query]);
  const selected = Math.min(index, Math.max(0, matches.length - 1));

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    input.current?.focus();
  }, [open]);

  if (!open) return null;

  const go = async (sessionId: string, parked: boolean): Promise<void> => {
    setPicker(false);
    if (parked) await api.restoreSession(sessionId);
    const node = nodes?.find((n) => n.sessionId === sessionId);
    if (node) onGo(node.id, sessionId);
  };

  return (
    <div
      className="dialog-backdrop picker-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPicker(false);
      }}
    >
      <div className="picker" role="dialog" aria-label="Go to session">
        <input
          ref={input}
          className="picker-input"
          placeholder="Search sessions by name, folder or note…"
          aria-label="Search sessions"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPicker(false);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex(Math.min(selected + 1, matches.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex(Math.max(selected - 1, 0));
            }
            if (e.key === 'Enter') {
              const match = matches[selected];
              if (match) void go(match.session.id, match.session.state === 'parked');
            }
          }}
        />
        <div className="picker-results" role="listbox">
          {matches.length === 0 && <div className="picker-empty">No session matches.</div>}
          {matches.map((match, i) => {
            const { session } = match;
            const detail =
              match.excerpt ?? [session.command, shortFolder(session.cwd)].filter(Boolean).join(' · ');
            return (
              <div
                key={session.id}
                role="option"
                aria-selected={i === selected}
                className={`picker-row${i === selected ? ' selected' : ''}`}
                data-testid="picker-row"
                onMouseEnter={() => setIndex(i)}
                onClick={() => void go(session.id, session.state === 'parked')}
              >
                <span className="picker-name">{session.name}</span>
                <span className="picker-detail">{detail}</span>
                {session.state !== 'open' && <span className="picker-tag">{session.state}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
