import { useEffect, useState } from 'react';
import { MAX_FIELDS, fieldFromLine, lineOfField, showControl, type TerminalField } from '@aubergine/shared';
import { api, isSuperseded } from '../api';
import { WithLinks } from '../links/LinkChip';
import { useApp } from '../store';
import { FoldHeading, MenuButton, MenuItem } from '../ui';
import { fieldsAfter, moved } from './fields-model';

/**
 * The owner's own fields of a terminal, in its details between Known and Links: rows of the same list of facts, each
 * with a small menu, and one box that adds or changes one as `Label: value`. `typing` says whether this part has the
 * one text box of the details; asking for it is `onTyping`. Its heading folds it (`folded`, `onFold`); folded, it
 * says how many fields there are and draws none of them. Every change sends the whole new list.
 */
export function FieldsPart({ sessionId, typing, onTyping, folded = false, onFold }: { sessionId: string; typing: boolean; onTyping: (on: boolean) => void; folded?: boolean; onFold?: () => void }) {
  const fields = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.fields) ?? NO_FIELDS;
  /** Adding one, or changing the one with this label. */
  const [mode, setMode] = useState<{ kind: 'add' } | { kind: 'edit'; label: string } | null>(null);
  const [line, setLine] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMode(null);
    setProblem(null);
    setLine('');
  }, [sessionId]);
  // Another part of the details took the text box, or the part was folded: this one puts its box away.
  useEffect(() => {
    if (!typing) setMode(null);
  }, [typing]);
  useEffect(() => {
    if (folded) {
      setMode(null);
      setProblem(null);
    }
  }, [folded]);
  const close = (): void => {
    setMode(null);
    setProblem(null);
    setLine('');
    onTyping(false);
  };
  const open = (next: { kind: 'add' } | { kind: 'edit'; label: string }, text: string): void => {
    setMode(next);
    setLine(text);
    setProblem(null);
    onTyping(true);
  };
  /** Sends the whole new list. What was typed stays where it was until the answer says it was kept. */
  const save = (next: TerminalField[], then?: () => void): void => {
    setProblem(null);
    setBusy(true);
    api.updateSession(sessionId, { fields: next }).then(
      () => {
        setBusy(false);
        then?.();
      },
      (error: unknown) => {
        setBusy(false);
        if (isSuperseded(error)) return;
        setProblem(`Could not save the fields: ${(error as Error).message}`);
      },
    );
  };
  const submit = (): void => {
    if (mode === null || busy) return;
    const read = fieldFromLine(line);
    if ('problem' in read) return setProblem(read.problem);
    const next = fieldsAfter(fields, read.field, mode.kind === 'edit' ? mode.label : null);
    if ('problem' in next) return setProblem(next.problem);
    save(next.fields, close);
  };
  const full = fields.length >= MAX_FIELDS;
  const row = (field: TerminalField, index: number) => (
    <div key={field.label} data-fact="field" data-field={field.label} data-testid="field-row">
      <dt>{showControl(field.label)}</dt>
      <dd className="fields-value">
        <span className="fields-text" data-testid="field-value">
          <WithLinks text={showControl(field.value)} />
        </span>
        <MenuButton more label={`More for ${showControl(field.label)}`} testid="field-more" menuTestid="field-menu" className="link-menu" againstWindow>
          <MenuItem onClick={() => open({ kind: 'edit', label: field.label }, lineOfField(field))} data-testid="field-edit">
            Edit…
          </MenuItem>
          {index > 0 && (
            <MenuItem onClick={() => save(moved(fields, index, -1))} data-testid="field-up">
              Move up
            </MenuItem>
          )}
          {index < fields.length - 1 && (
            <MenuItem onClick={() => save(moved(fields, index, 1))} data-testid="field-down">
              Move down
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              const before = fields;
              save(
                fields.filter((_, at) => at !== index),
                () => useApp.getState().say(`Removed the field “${showControl(field.label)}”.`, { label: 'Undo', run: () => void api.updateSession(sessionId, { fields: before }).catch(() => {}) }),
              );
            }}
            data-testid="field-remove"
          >
            Remove
          </MenuItem>
        </MenuButton>
      </dd>
    </div>
  );
  return (
    <section className="fields-part details-part" aria-label="Fields" data-testid="fields-part">
      <FoldHeading folded={folded} onToggle={() => onFold?.()} controls={`fields-${sessionId}`} count={fields.length} testid="details-fold-fields">
        Fields
      </FoldHeading>
      {!folded && (
        <div className="fields-body" id={`fields-${sessionId}`}>
          {fields.length === 0 ? (
            <p className="fields-none" data-testid="fields-none">
              No fields yet: a ticket, an owner, an environment, whatever you track about this terminal.
            </p>
          ) : (
            <dl className="ui-facts" data-testid="fields-list">
              {fields.map(row)}
            </dl>
          )}
          {mode !== null ? (
            <form
              className="links-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              data-testid="field-form"
              data-mode={mode.kind}
            >
              <input
                value={line}
                aria-label="A field: its label, a colon, its value"
                placeholder="Ticket: DEMO-12"
                autoFocus
                spellCheck={false}
                onChange={(event) => {
                  setLine(event.target.value);
                  setProblem(null);
                }}
                onKeyDown={(event) => {
                  // Taken here, before the drawer would close on it.
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                  }
                }}
                data-testid="field-line"
              />
              <button type="submit" disabled={line.trim() === ''} aria-busy={busy || undefined} data-testid="field-save">
                {mode.kind === 'add' ? 'Add' : 'Save'}
              </button>
              <button type="button" className="quiet" onClick={close}>
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="quiet ui-start fields-add"
              disabled={full}
              title={full ? `A terminal has at most ${MAX_FIELDS} fields. Remove one to add another.` : undefined}
              onClick={() => open({ kind: 'add' }, '')}
              data-testid="field-add-open"
            >
              Add a field
            </button>
          )}
          {problem && (
            <p className="dialog-error" role="alert" data-testid="field-problem">
              {problem}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const NO_FIELDS: TerminalField[] = [];
