import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NoteEntry } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
import { WithLinks, hasAddress } from './links/LinkChip';

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
  takeKeyboard = false, reading = false, onTyping }: {
  sessionId: string;
  onClose: () => void;
  /** Shown inside something that has its own frame and close button (the side panel's drawer), not on a node. */
  embedded?: boolean;
  /** Whether the note takes the keyboard when it appears: yes when it was just asked for, no when it is simply there. */
  takeKeyboard?: boolean;
  /** Another part of the details has the one text box: the summary is read, not typed into. */
  reading?: boolean;
  /** The note asks for the text box back. */
  onTyping?: () => void;
}) {
  const saved = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.note ?? '');
  const [text, setText] = useState(saved);
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'failed'>('saved');
  // Whether the summary is being changed: one with an address in it is read as chips otherwise.
  const [editing, setEditing] = useState(false);
  const asChips = hasAddress(text);
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
  const logBox = useRef<HTMLDivElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  // Whether the entry that arrives next is one written here just now.
  const wroteOne = useRef(false);

  // Beside a terminal the log scrolls by itself, and the newest entry is kept in view as entries arrive: only the log
  // is moved, never what the note stands in. In the details the log is part of the one column that is read from the
  // top, so nothing moves by itself there: only an entry written here is brought into view.
  useEffect(() => {
    if (!embedded) {
      const element = logBox.current;
      if (element) element.scrollTop = element.scrollHeight;
    } else if (wroteOne.current) {
      wroteOne.current = false;
      logEnd.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [log.length, embedded]);

  const addEntry = (): void => {
    const entry = draft.trim();
    if (!entry) return;
    setDraft('');
    wroteOne.current = true;
    void api.appendNote(sessionId, entry).catch(() => {
      wroteOne.current = false;
      setDraft(entry);
    });
  };

  // One thing to type into at a time: the summary, or, once asked for, the box that adds to the log.
  const [adding, setAdding] = useState(false);
  const entryBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) entryBox.current?.focus();
  }, [adding]);
  // The box grows with what is in it, as the summary does when it is read, so that the note keeps its height when
  // the summary is pressed to change it and when it is left. Beside a terminal both stop at a share of the note's
  // height and scroll there (the stylesheet says how much).
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    const edges = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + edges}px`;
  }, [text, editing, embedded, adding, reading]);
  const who = (entry: NoteEntry): string => (entry.kind === 'prompt' ? 'you asked' : entry.author === 'agent' ? 'agent' : 'you');
  // The time of an entry of today; the day too of one that is older, so that last week's is not taken for this morning's.
  const when = (at: string): string => {
    const date = new Date(at);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  };

  return (
    <aside
      className={`note-panel nodrag nopan nowheel${embedded ? ' embedded' : ''}`}
      // The note has the keyboard now: no terminal is on record as having it, or the next time that terminal is drawn
      // again it would take the keyboard back from the note in the middle of typing. The selection stays.
      onFocus={() => {
        if (useApp.getState().focus) useApp.getState().focusSession(null);
      }}
      data-testid={embedded ? 'note-drawer' : 'note-panel'}
    >
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
        {adding || reading || (asChips && !editing) ? (
          // While the log is being added to, or another part has the text box, the summary is read, not typed into; pressing it goes back
          // to it. A summary with an address in it is read too, the address as a chip, until it is pressed to change it.
          <div
            role="button"
            tabIndex={0}
            className="note-summary-read"
            title="Change the summary"
            onClick={(event) => {
              // A chip in it is pressed for itself.
              if ((event.target as HTMLElement).closest('a')) return;
              setAdding(false);
              setEditing(true);
              onTyping?.();
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              setAdding(false);
              setEditing(true);
              onTyping?.();
            }}
            data-testid="note-summary-read"
          >
            {text.trim() === '' ? 'No summary yet.' : <WithLinks text={text} />}
          </div>
        ) : (
          <textarea
            ref={box}
            className="note-summary"
            aria-label="Summary of this terminal"
            autoFocus={editing || (!embedded && takeKeyboard)}
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
            onBlur={() => {
              save();
              setEditing(false);
            }}
          />
        )}
      </div>
      <div className="note-part note-log-part">
        <div className="note-label">
          <strong>Log</strong>
          <span className="note-status">{log.length === 0 ? '' : `${log.length} ${log.length === 1 ? 'entry' : 'entries'}`}</span>
        </div>
        <div className="note-log" ref={logBox} data-testid="note-log" aria-label="Log">
          {log.length === 0 && <p className="note-empty">Entries from you or the agent will be listed here.</p>}
          {log.map((entry) => (
            <article key={entry.id} className={`note-entry kind-${entry.kind}`} data-testid="note-entry">
              <header>
                <span className="note-author">{who(entry)}</span>
                <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                  {when(entry.at)}
                </time>
              </header>
              <p>
                <WithLinks text={entry.text} />
              </p>
            </article>
          ))}
          <div ref={logEnd} className="note-log-end" />
        </div>
        {/* Where the log is added to: under its last entry, and kept in view at the foot while the log is longer than its room. */}
        <div className="note-add-row">
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
      </div>
    </aside>
  );
}
