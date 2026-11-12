import { useEffect, useRef, useState } from 'react';
import type { NoteEntry } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

const SAVE_DELAY_MS = 500;
const noEntries: NoteEntry[] = [];

/**
 * A session's notes: a pinned Markdown summary, edited in place and saved as
 * you type, above a log that only grows. Agents in the session add to the
 * log; so can the user.
 */
export function NotePanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const saved = useApp((s) => s.canvas?.sessions.find((x) => x.id === sessionId)?.note ?? '');
  const [text, setText] = useState(saved);
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'failed'>('saved');
  const dirty = useRef(false);
  const latest = useRef(text);
  const timer = useRef<number | undefined>(undefined);

  // Take changes made elsewhere, unless there are unsaved edits here.
  useEffect(() => {
    if (!dirty.current) {
      setText(saved);
      latest.current = saved;
    }
  }, [saved]);

  const save = (): void => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const note = latest.current;
    api
      .updateSession(sessionId, { note })
      .then(() => {
        if (latest.current === note) {
          dirty.current = false;
          setStatus('saved');
        }
      })
      .catch(() => setStatus('failed'));
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Do not lose the last edits when the panel closes.
  useEffect(() => () => saveRef.current(), []);

  const log = useApp((s) => s.canvas?.sessions.find((x) => x.id === sessionId)?.noteLog ?? noEntries);
  const [draft, setDraft] = useState('');
  const logEnd = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view as entries arrive.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  const addEntry = (): void => {
    const entry = draft.trim();
    if (!entry) return;
    setDraft('');
    void api.appendNote(sessionId, entry).catch(() => setDraft(entry));
  };

  return (
    <aside className="note-panel nodrag nopan nowheel" data-testid="note-panel">
      <header>
        <span>Note</span>
        <span className="note-status">{status === 'saved' ? 'Saved' : status === 'failed' ? 'Not saved' : 'Saving…'}</span>
        <button type="button" className="node-close" aria-label="Hide note" title="Hide note" onClick={onClose}>
          ×
        </button>
      </header>
      <textarea
        className="note-summary"
        aria-label="Session note"
        autoFocus
        placeholder="Pinned Markdown summary for this session…"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          latest.current = e.target.value;
          dirty.current = true;
          setStatus('unsaved');
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(save, SAVE_DELAY_MS);
        }}
        onBlur={save}
      />
      <div className="note-log" data-testid="note-log" aria-label="Note log">
        {log.length === 0 && <p className="note-empty">Entries added here, or by an agent in this session, appear below.</p>}
        {log.map((entry) => (
          <article key={entry.id} className={`note-entry kind-${entry.kind}`} data-testid="note-entry">
            <header>
              <span className="note-author">
                {entry.kind === 'prompt' ? 'prompt' : entry.author === 'agent' ? 'agent' : 'you'}
              </span>
              <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </header>
            <p>{entry.text}</p>
          </article>
        ))}
        <div ref={logEnd} />
      </div>
      <input
        className="note-add"
        aria-label="Add a note entry"
        placeholder="Add an entry and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addEntry();
        }}
      />
    </aside>
  );
}
