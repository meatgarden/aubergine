import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchHit } from '@aubergine/shared';
import { api } from './api';
import { searchSessions, shortFolder } from './search';
import { useApp } from './store';

const HISTORY_DELAY_MS = 250;
const HISTORY_MIN_LENGTH = 2;
/** How much of a matching line is used to scroll the terminal to it. */
const REVEAL_LENGTH = 80;

type Row =
  | { kind: 'session'; sessionId: string; parked: boolean }
  | { kind: 'output'; sessionId: string; parked: boolean; hit: SearchHit };

/**
 * The session picker: type to search names, folders, commands and notes, and
 * what terminals have printed. Enter goes there. `onGo` moves the view to a
 * node and focuses it.
 */
export function Picker({ onGo }: { onGo: (nodeId: string, sessionId: string) => void }) {
  const open = useApp((s) => s.picker);
  const setPicker = useApp((s) => s.setPicker);
  const sessions = useApp((s) => s.canvas?.sessions);
  const nodes = useApp((s) => s.canvas?.layout.nodes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ query: string; hits: SearchHit[]; truncated: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => searchSessions(sessions ?? [], query), [sessions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    setHistory(null);
    input.current?.focus();
  }, [open]);

  // Terminal history is read on demand, a moment after typing stops.
  const wanted = query.trim();
  useEffect(() => {
    if (!open || wanted.length < HISTORY_MIN_LENGTH) {
      setHistory(null);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .searchHistory(wanted)
        .then((result) => {
          if (!stale) setHistory({ query: wanted, ...result });
        })
        .catch(() => {
          if (!stale) setHistory({ query: wanted, hits: [], truncated: false });
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, HISTORY_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [open, wanted]);

  const byId = useMemo(() => new Map((sessions ?? []).map((s) => [s.id, s])), [sessions]);
  const hits = history?.query === wanted ? history.hits.filter((hit) => byId.has(hit.sessionId)) : [];

  const rows: Row[] = [
    ...matches.map((m): Row => ({ kind: 'session', sessionId: m.session.id, parked: m.session.state === 'parked' })),
    ...hits.map((hit): Row => ({
      kind: 'output',
      sessionId: hit.sessionId,
      parked: byId.get(hit.sessionId)?.state === 'parked',
      hit,
    })),
  ];
  const selected = Math.min(index, Math.max(0, rows.length - 1));

  if (!open) return null;

  const go = async (row: Row): Promise<void> => {
    setPicker(false);
    if (row.parked) await api.restoreSession(row.sessionId);
    const node = nodes?.find((n) => n.sessionId === row.sessionId);
    if (node) onGo(node.id, row.sessionId);
    if (row.kind === 'output') {
      // Scroll the terminal back to the line that matched.
      const text = row.hit.text.trim().slice(0, REVEAL_LENGTH);
      if (text) void api.revealInSession(row.sessionId, text).catch(() => {});
    }
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
          placeholder="Search sessions, notes and terminal output…"
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
              setIndex(Math.min(selected + 1, rows.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex(Math.max(selected - 1, 0));
            }
            if (e.key === 'Enter') {
              const row = rows[selected];
              if (row) void go(row);
            }
          }}
        />
        <div className="picker-results" role="listbox">
          {matches.length === 0 && hits.length === 0 && !searching && (
            <div className="picker-empty">Nothing matches.</div>
          )}
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
                onClick={() => void go({ kind: 'session', sessionId: session.id, parked: session.state === 'parked' })}
              >
                <span className="picker-name">{session.name}</span>
                <span className="picker-detail">{detail}</span>
                {session.state !== 'open' && <span className="picker-tag">{session.state}</span>}
              </div>
            );
          })}
          {wanted.length >= HISTORY_MIN_LENGTH && (
            <div className="picker-section" data-testid="picker-output-section">
              Terminal output{searching ? ' · searching…' : hits.length === 0 ? ' · no matches' : ''}
              {history?.truncated && !searching ? ' · showing the most recent' : ''}
            </div>
          )}
          {hits.map((hit, n) => {
            const i = matches.length + n;
            const session = byId.get(hit.sessionId);
            return (
              <div
                key={`${hit.sessionId}:${n}`}
                role="option"
                aria-selected={i === selected}
                className={`picker-row output${i === selected ? ' selected' : ''}`}
                data-testid="picker-output-row"
                onMouseEnter={() => setIndex(i)}
                onClick={() =>
                  void go({ kind: 'output', sessionId: hit.sessionId, parked: session?.state === 'parked', hit })
                }
              >
                <span className="picker-name">{session?.name}</span>
                <span className="picker-detail picker-line">{hit.text.trim()}</span>
                {session?.state === 'parked' && <span className="picker-tag">parked</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
