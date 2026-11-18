import { useEffect, useRef, useState } from 'react';
import { TAGS_MAX, TAG_MAX_LENGTH, normaliseTags } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * Editing the tags of one terminal. Opened by the tags command, from the node
 * and from the list alike: there is one editor.
 */
export function TagDialog() {
  const ask = useApp((s) => (s.ask?.kind === 'tags' ? s.ask : null));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ask) return;
    const found = useApp.getState().app?.sessions.find((x) => x.id === ask.id);
    setSessionId(ask.id);
    setTags(found?.tags ?? []);
    setDraft('');
    setError(null);
    useApp.getState().asked(ask.tick);
  }, [ask]);

  useEffect(() => {
    if (sessionId) input.current?.focus();
  }, [sessionId]);

  if (!sessionId || !session) return null;

  const close = (): void => setSessionId(null);
  /** The tags with whatever is still in the box added. */
  const withDraft = (): string[] => normaliseTags([...tags, ...draft.split(',')]).slice(0, TAGS_MAX);
  const add = (): void => {
    setTags(withDraft());
    setDraft('');
  };
  const save = (): void => {
    const next = withDraft();
    api
      .updateSession(sessionId, { tags: next })
      .then(close)
      .catch((e: unknown) => setError((e as Error).message));
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`Tags of ${session.name}`} data-testid="tag-dialog">
        <h2>Tags of “{session.name}”</h2>
        <p>Short words of your own. The list on the left can show only the terminals with a tag.</p>
        <div className="tag-chips">
          {tags.length === 0 && <span className="note-empty">No tags yet.</span>}
          {tags.map((tag) => (
            <button key={tag} type="button" className="list-chip" aria-label={`Remove the tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
              #{tag} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <input
          ref={input}
          className="tag-input"
          aria-label="Add a tag"
          placeholder={tags.length >= TAGS_MAX ? `At most ${TAGS_MAX} tags` : 'Type a tag and press Enter; Enter again to save'}
          maxLength={TAG_MAX_LENGTH}
          disabled={tags.length >= TAGS_MAX}
          value={draft}
          onChange={(e) => {
            // A comma ends a tag, so several can be typed in one go.
            if (e.target.value.includes(',')) {
              setTags(normaliseTags([...tags, ...e.target.value.split(',')]).slice(0, TAGS_MAX));
              setDraft('');
            } else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (draft.trim()) add();
              else save();
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              setTags(tags.slice(0, -1));
            }
          }}
        />
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save} data-testid="tag-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
