import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useApp } from './store';

const SAVE_DELAY_MS = 500;

/** The session's Markdown note, edited in place and saved as you type. */
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
        aria-label="Session note"
        autoFocus
        placeholder="Markdown notes for this session…"
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
    </aside>
  );
}
