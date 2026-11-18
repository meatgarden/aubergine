import { useEffect, useRef, useState } from 'react';
import type { NoteEntry } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

const SAVE_DELAY_MS = 500;
const noEntries: NoteEntry[] = [];

/**
 * A terminal's note: a summary, edited in place and saved as you type, above a log that only grows. The agent in
 * the terminal adds to the log; so can the owner. One thing is typed into at a time: the summary, or, once asked
 * for, the box that adds to the log. The same component beside a terminal and in the drawer.
 */
export function NotePanel({
  sessionId,
  onClose,
  embedded = false,
  takeKeyboard = false,
}: {
  sessionId: string;
  onClose: () => void;
  /** Shown inside something that has its own frame and close button (the side panel's drawer), not on a node. */
  embedded?: boolean;
  /** Whether the note takes the keyboard when it appears: yes when it was just asked for, no when it is simply there. */
  takeKeyboard?: boolean;
}) {
  const saved = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.note ?? '');
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

  const log = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.noteLog ?? noEntries);
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

  // One thing to type into at a time: the summary, or, once asked for, the box that adds to the log.
  const [adding, setAdding] = useState(false);
  const entryBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) entryBox.current?.focus();
  }, [adding]);
  const who = (entry: NoteEntry): string => (entry.kind === 'prompt' ? 'you asked' : entry.author === 'agent' ? 'agent' : 'you');

  return (
    <aside className={`note-panel nodrag nopan nowheel${embedded ? ' embedded' : ''}`} data-testid={embedded ? 'note-drawer' : 'note-panel'}>
      {!embedded && (
        <header>
          <span>Note</span>
          <button type="button" className="node-close" aria-label="Hide note" title="Hide note" onClick={onClose}>
            ×
          </button>
        </header>
      )}
      <div className="note-part">
        <div className="note-label">
          <strong>Summary</strong>
          <span className="note-status">{status === 'saved' ? 'Saved' : status === 'failed' ? 'Not saved' : 'Saving…'}</span>
        </div>
        <p className="note-help">Kept at the top. You or the agent can change it.</p>
        {adding ? (
          // While the log is being added to, the summary is read, not typed into; pressing it goes back to it.
          <button type="button" className="note-summary-read" title="Change the summary" onClick={() => setAdding(false)} data-testid="note-summary-read">
            {text.trim() === '' ? 'No summary yet.' : text}
          </button>
        ) : (
          <textarea
            className="note-summary"
            aria-label="Summary of this terminal"
            autoFocus={!embedded && takeKeyboard}
            placeholder="What this terminal is for, in a few lines…"
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
        )}
      </div>
      <div className="note-part note-log-part">
        <div className="note-label">
          <strong>Log</strong>
          <span className="note-status">{log.length === 0 ? '' : `${log.length} ${log.length === 1 ? 'entry' : 'entries'}`}</span>
        </div>
        <div className="note-log" data-testid="note-log" aria-label="Log">
          {log.length === 0 && <p className="note-empty">Entries from you or the agent will be listed here.</p>}
          {log.map((entry) => (
            <article key={entry.id} className={`note-entry kind-${entry.kind}`} data-testid="note-entry">
              <header>
                <span className="note-author">{who(entry)}</span>
                <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>
              <p>{entry.text}</p>
            </article>
          ))}
          <div ref={logEnd} />
        </div>
        {adding ? (
          <input
            ref={entryBox}
            className="note-add"
            aria-label="Add to the log"
            placeholder="Write an entry and press Enter"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addEntry();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setAdding(false);
              }
            }}
            data-testid="note-add"
          />
        ) : (
          <button type="button" className="quiet note-add-open" onClick={() => setAdding(true)} data-testid="note-add-open">
            Add to the log
          </button>
        )}
      </div>
    </aside>
  );
}
