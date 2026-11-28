import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_FORMAT, NO_ATTENTION, NO_STATUS, TEMPLATE_MAX, parseTemplate, templateParts, writtenPart, type Session, type TemplatePart, type TemplateWhere } from '@aubergine/shared';
import { colorClass, colorStyle } from '../color';
import { useApp } from '../store';
import { TitleDot } from '../StatusBadges';
import { RowSays, TitleSays, templateOf } from '../templates/TemplateSays';
import { createRowSelector, type Row } from '../terminal-rows';
import { setFormat } from '../theme';
import { Button } from '../ui';

/**
 * Settings → Appearance, Titles and rows: what a terminal's title and its row in the list say after the name, each a
 * template (docs/templates.md). Each field is saved on Enter or on leaving it; what is wrong in it is said under it,
 * and a template with a brace that is not closed is not saved. Under each, the real title or row drawn with what is
 * typed, for the terminal that is selected or a made-up one.
 */

const WHERE_WORDS: Record<TemplateWhere, string> = { title: 'Title', row: 'Row' };
const WHERE_SAYS: Record<TemplateWhere, string> = {
  title: 'What a terminal’s title says after its name, on the canvas and in a browser tab of its own.',
  row: 'What a row of the list says on its second line. A row of one line says its state alone.',
};

/** What is said under a field about what is typed in it, and whether it can be saved. Pure. */
export function formatSays(text: string, where: TemplateWhere): { problems: string[]; saves: boolean } {
  if (text.length > TEMPLATE_MAX) return { problems: [`A template is at most ${TEMPLATE_MAX} characters.`], saves: false };
  const parsed = parseTemplate(text, where);
  return { problems: parsed.unclosed ? [...parsed.problems, 'It is not saved until the brace is closed.'] : parsed.problems, saves: !parsed.unclosed };
}

/** A placeholder put into a field where its caret is, with the caret after it. Pure. */
export function insertPart(text: string, start: number, end: number, written: string): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: `${text.slice(0, from)}${written}${text.slice(to)}`, caret: from + written.length };
}

/** How a placeholder is written into a field: a field's label is a word to change. */
export const partToWrite = (part: TemplatePart): string => (part.takesLabel ? `{${part.name}:Ticket}` : `{${part.name}}`);

/** Where a placeholder may be used, in a word or two. Pure. */
export const partWhereWords = (part: TemplatePart): string => (part.where.length === 2 ? 'title and row' : part.where[0] === 'title' ? 'title only' : 'row only');

/** The terminal a preview is drawn for when none is selected: made up, with something to say for most placeholders. Its times are a few minutes before `now`. */
export const madeUp = (now: number): Session => {
  const at = new Date(now - 4 * 60_000).toISOString();
  return {
    id: '0190c2a4-0000-7000-8000-00000000beef',
    projectId: '',
    name: 'api-server',
    createdAt: at,
    state: 'open',
    cwd: '/home/you/work/shop/api',
    command: 'zsh',
    note: '',
    status: { ...NO_STATUS, state: 'busy', commandLine: 'npm run dev', startedAt: at },
    attention: { ...NO_ATTENTION, state: 'waiting', message: 'May I run the migration?', at },
    noteLog: [],
    agent: { kind: 'claude-code', conversationId: null, program: 'claude' },
    parkedFrom: null,
    peopleOnly: false,
    typedBy: null,
    recap: null,
    takesMessages: false,
    theme: null,
    untold: null,
    messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
    links: [],
    written: {},
    suggested: {},
    found: { branch: 'fix-checkout', repository: 'shop', repositoryUrl: null, pullRequest: null, at },
    lastInputAt: at,
    lastOutputAt: at,
    tags: ['backend', 'checkout'],
    fields: [{ label: 'Ticket', value: 'SHOP-142', source: 'owner' }],
  };
};

const selectRows = createRowSelector();

/** The selected terminal's row, or one made up (`madeUp`). */
function usePreviewRow(): { row: Row; madeUp: boolean } {
  const whole = useApp((s) => s.whole);
  const selected = useApp((s) => s.focus?.sessionId ?? s.selected);
  const found = whole && selected ? selectRows(whole).find((row) => row.session.id === selected) : undefined;
  const [made] = useState(() => madeUp(Date.now()));
  if (found) return { row: found, madeUp: false };
  return { row: { session: made, canvasId: null, canvasName: 'Main', frame: null, parked: false, color: 'none', state: 'waiting', index: 0 }, madeUp: true };
}

type Inserters = { last: TemplateWhere; insert: Partial<Record<TemplateWhere, (written: string) => void>> };

function FormatField({ where, inserters }: { where: TemplateWhere; inserters: { current: Inserters } }) {
  const saved = useApp((s) => (where === 'title' ? s.settings.appearance.titleFormat : s.settings.appearance.rowFormat));
  const [text, setText] = useState(saved);
  const input = useRef<HTMLInputElement>(null);
  // What the settings say, once changed elsewhere (another browser, Reset, a failure put back), is what the field holds.
  useEffect(() => setText(saved), [saved]);
  const says = formatSays(text, where);
  const take = (value: string): void => {
    if (value === saved || !formatSays(value, where).saves) return;
    setFormat(where, value);
  };
  const insert = (written: string): void => {
    const element = input.current;
    const next = insertPart(text, element?.selectionStart ?? text.length, element?.selectionEnd ?? text.length, written);
    if (next.text.length > TEMPLATE_MAX) return;
    setText(next.text);
    take(next.text);
    window.setTimeout(() => {
      element?.focus();
      element?.setSelectionRange(next.caret, next.caret);
    }, 0);
  };
  // What a placeholder pressed in the list below puts into this field, as it stands now.
  inserters.current.insert[where] = insert;
  const { row, madeUp } = usePreviewRow();
  const preview = useMemo(() => templateOf(text, where), [text, where]);
  const id = `titles-${where}`;
  return (
    <div className="titles-field" data-testid={`titles-${where}`}>
      <div className="settings-line">
        <label htmlFor={id}>{WHERE_WORDS[where]}</label>
        <input
          id={id}
          ref={input}
          className="ui-field titles-input"
          value={text}
          maxLength={TEMPLATE_MAX}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            inserters.current.last = where;
          }}
          onBlur={() => take(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') take(text);
            if (e.key === 'Escape' && text !== saved) {
              e.stopPropagation();
              setText(saved);
            }
          }}
          aria-describedby={`${id}-says`}
          data-testid={`${where}-format`}
          data-autofocus={where === 'title' || undefined}
        />
        {saved !== DEFAULT_FORMAT[where] && (
          <Button kind="quiet" onClick={() => setFormat(where, DEFAULT_FORMAT[where])} data-testid={`${where}-format-reset`}>
            Reset
          </Button>
        )}
      </div>
      <p className="ui-meta" id={`${id}-says`} role={says.problems.length > 0 ? 'status' : undefined} data-testid={`${where}-format-says`}>
        {says.problems.length > 0 ? says.problems.join(' ') : WHERE_SAYS[where]}
      </p>
      <div className="titles-preview" aria-label={`${WHERE_WORDS[where]} as it is drawn`} data-testid={`${where}-preview`}>
        {where === 'title' ? (
          <div className="titles-preview-title node-title">
            <TitleDot session={row.session} focused={false} />
            <span className="node-name">{row.session.name}</span>
            <TitleSays session={row.session} template={preview} standalone={madeUp} />
          </div>
        ) : (
          <div className="titles-preview-row list-row">
            <div className="list-main">
              <span className={`list-color ${colorClass(row.color, 'swatch')}`} style={colorStyle(row.color)} aria-hidden="true" />
              <span className="list-name">{row.session.name}</span>
            </div>
            <div className="list-detail">
              <RowSays row={row} now={Date.now()} onTag={() => {}} template={preview} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Settings → Appearance, Titles and rows. */
export function TitlesPart() {
  // The field the keyboard was in last: a placeholder pressed in the list goes there, else into the title's.
  const inserters = useRef<Inserters>({ last: 'title', insert: {} });
  const { row, madeUp } = usePreviewRow();
  const name = row.session.name;
  return (
    <div className="appearance-part" data-testid="settings-titles">
      <h4>Titles and rows</h4>
      <p className="ui-meta">
        What a terminal says after its name, as a template: text with placeholders such as <code>{'{state}'}</code>, <code>{'{folder}'}</code> or <code>{'{field:Ticket}'}</code>. A placeholder with nothing to say is left out with the text that leads to it. {madeUp ? 'Drawn below for a made-up terminal; select one to see it drawn for that one.' : `Drawn below for the terminal selected, ${name}.`}
      </p>
      <FormatField where="title" inserters={inserters} />
      <FormatField where="row" inserters={inserters} />
      <details className="ui-fold" data-testid="titles-parts">
        <summary>What can be used</summary>
        <p className="ui-meta">Pressed, a placeholder goes into the field you were in last, where its caret was. {'{{'} and {'}}'} write a brace.</p>
        <ul className="titles-parts">
          {templateParts().map((part) => (
            <li key={part.name}>
              <button
                type="button"
                className="quiet ui-start"
                title={`Put ${partToWrite(part)} into the field you were in last`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => inserters.current.insert[inserters.current.last]?.(partToWrite(part))}
                data-testid="titles-part"
                data-part={part.name}
              >
                <code>{writtenPart(part)}</code>
              </button>
              <span>
                {part.says} <span className="ui-meta">({partWhereWords(part)})</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
