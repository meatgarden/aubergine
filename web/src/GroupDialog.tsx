import { useEffect, useRef, useState } from 'react';
import { GROUP_NAME_MAX, GroupName, groupsOf } from '@aubergine/shared';
import { isSuperseded } from './api';
import { colorClass } from './color';
import { setGroup } from './group-actions';
import { groupColor } from './groups';
import { useApp } from './store';

/**
 * Which group one terminal is in. Opened by the group command, from the terminal's title, its row and the palette:
 * there is one editor. A group is a name; typing a new one makes the group, and the last terminal to leave ends it.
 */
export function GroupDialog() {
  const ask = useApp((s) => (s.ask?.kind === 'group' ? s.ask : null));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const sessions = useApp((s) => s.app?.sessions);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ask) return;
    const found = useApp.getState().app?.sessions.find((x) => x.id === ask.id);
    setSessionId(ask.id);
    setDraft(found?.group ?? '');
    setError(null);
    useApp.getState().asked(ask.tick);
  }, [ask]);

  useEffect(() => {
    if (!sessionId) return;
    input.current?.focus();
    input.current?.select();
  }, [sessionId]);

  if (!sessionId || !session) return null;

  const close = (): void => setSessionId(null);
  const groups = groupsOf(sessions ?? []);
  const put = (group: string | null): void => {
    setGroup(sessionId, group)
      .then(close)
      .catch((e: unknown) => !isSuperseded(e) && setError((e as Error).message));
  };
  const save = (): void => {
    if (draft.trim() === '') return put(null);
    const name = GroupName.safeParse(draft);
    if (!name.success) return setError('A group’s name is one line of plain text.');
    put(name.data);
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
      <div className="dialog" role="dialog" data-part="dialog" aria-modal="true" aria-label={`Group of ${session.name}`} data-testid="group-dialog">
        <h2>Group of “{session.name}”</h2>
        <p>Terminals in a group stand together in the list and inside one outline on the canvas, and fold away as one. A group may hold terminals of several canvases.</p>
        {groups.length > 0 && (
          <div className="tag-chips" role="group" aria-label="The groups there are">
            {groups.map((name) => (
              <button key={name} type="button" className={`ui-chip group-chip ${colorClass(groupColor(name))}`} aria-pressed={draft.trim() === name} onClick={() => put(name)} data-testid="group-choice">
                {name}
              </button>
            ))}
          </div>
        )}
        <input
          ref={input}
          className="tag-input"
          aria-label="The group’s name"
          placeholder={groups.length > 0 ? 'A new group’s name, or press one above' : 'A name for a new group'}
          maxLength={GROUP_NAME_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          data-testid="group-name"
        />
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          {session.group && (
            <button type="button" onClick={() => put(null)} data-testid="group-leave">
              Take out of the group
            </button>
          )}
          <button type="button" className="primary" onClick={save} data-testid="group-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
