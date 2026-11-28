import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DEFAULT_FORMAT,
  TITLE_LINKS,
  parseTemplate,
  projectName,
  renderTemplate,
  sameLabel,
  shortCommand,
  shortFolder,
  showControl,
  sortedLinks,
  templatePart,
  templateParts,
  templatePartsVersion,
  onTemplateParts,
  themeOf,
  untoldWords,
  type ParsedTemplate,
  type Session,
  type TemplateKind,
  type TemplateWhere,
} from '@aubergine/shared';
import { api } from '../api';
import { canResumeAgent } from '../attention';
import { EnvironmentChip } from '../environment/EnvironmentChip';
import { LinkChip, WithLinks } from '../links/LinkChip';
import { MessageMark, messageMark } from '../Messages';
import { recapTitle } from '../Recap';
import { hint } from '../shortcuts';
import { describeStatus } from '../StatusBadges';
import { useApp } from '../store';
import { rowFacts, type Row } from '../terminal-rows';
import { useTerminalTheme, useUserThemes } from '../theme';
import { useEndedRuns } from '../workflows/ended-runs';
import { ListMark } from '../workflows/ListMark';
import { RunStrip } from '../workflows/RunStrip';
import { handedInBy, runsBySession } from '../workflows/run-model';

/**
 * What a terminal's title and its row in the list say after the name, drawn from the owner's templates
 * (`appearance.titleFormat`, `appearance.rowFormat`). The template is read once for each text it has had
 * (`templateOf`); what each placeholder says comes from the functions that say the same thing elsewhere, and each
 * kind of placeholder is drawn here the one way the page draws that kind. Nothing here is asked of the server.
 */

const parsed = new Map<string, ParsedTemplate>();
/**
 * A template, read once for each text it has had and each place: not once per row. Read again once the placeholders
 * there are change (a plugin's added or taken away), since what is a placeholder is what was registered.
 */
export function templateOf(text: string, where: TemplateWhere): ParsedTemplate {
  const key = `${templatePartsVersion()}\u0000${where}\u0000${text}`;
  let known = parsed.get(key);
  if (!known) {
    known = parseTemplate(text, where);
    if (parsed.size > 50) parsed.clear();
    parsed.set(key, known);
  }
  return known;
}

/** The template of a place as the settings have it now. */
export function useTemplate(where: TemplateWhere): ParsedTemplate {
  const text = useApp((s) => (where === 'title' ? s.settings.appearance.titleFormat : s.settings.appearance.rowFormat)) ?? DEFAULT_FORMAT[where];
  // A placeholder added or taken away while the page runs: the template is read again.
  useSyncExternalStore(onTemplateParts, templatePartsVersion, templatePartsVersion);
  return templateOf(text, where);
}

/** What a placeholder is drawn from: the terminal, where it is drawn, and what the page knows beside it. */
export interface SaysContext {
  session: Session;
  where: TemplateWhere;
  /** In the focus view: what needs the canvas's screens (a run, a working copy, a list, the tags dialog, messages) is not pressed there. */
  standalone: boolean;
  now: number;
  row: Row | null;
  canvas: string | null;
  project: string | null;
  hasRun: boolean;
  hasList: boolean;
  hasCopy: boolean;
  /** In a title: a token typed into it in the last half minute. */
  typedLately: boolean;
  onTag: (tag: string) => void;
}

/** How each kind is drawn where it stands: the class of plain words in a title and on a row. */
const WORDS_CLASS: Record<TemplateWhere, string> = { title: 'node-words', row: 'list-words' };

/** Plain words, cut where there is no room, with the whole in a tooltip. Drawn as text, whatever they hold. */
function words(context: SaysContext, text: string, title?: string): ReactNode {
  if (text === '') return null;
  return (
    <span className={WORDS_CLASS[context.where]} title={title && title !== text ? title : undefined} data-testid="template-words">
      {text}
    </span>
  );
}

/** What each kind of placeholder is drawn with. A placeholder's own drawing (below) uses the one of its kind. */
export const KIND_DRAWN: Record<TemplateKind, string> = {
  words: 'plain words in the meta size, cut where there is no room, the whole when pointed at',
  state: 'the state in words, in the color of that state',
  step: 'the step of a run, pressed for the run',
  time: 'one time in a few characters, both times when pointed at',
  tags: 'the tags, pressed as tags are',
  links: 'the marks of links, each a chip',
  link: 'a link, as a chip',
  field: 'the value, an address in it a chip',
  mark: 'the mark as it was always drawn',
};

type Draw = (context: SaysContext, label: string | undefined) => ReactNode;

/** How each placeholder is drawn, by its name. Every placeholder registered in `shared/` has one (a test says so). */
const DRAW: Record<string, Draw> = {
  state: (c) => {
    const { session } = c;
    if (c.where === 'row') {
      const state = c.row ? rowFacts(c.row, c.now).state : null;
      if (!state) return null;
      if (state.tone === 'working')
        return (
          <span className="list-said list-working" data-testid="list-working" data-tone={state.dot}>
            {state.text}
          </span>
        );
      return (
        <span className={`list-said is-${state.tone} list-badge`} data-testid="list-badge" data-tone={state.dot} title={state.title}>
          {state.text}
        </span>
      );
    }
    if (session.state === 'exited' || (session.attention.state !== 'waiting' && session.attention.state !== 'done')) return null;
    // The state in words, where it is not the ordinary one. Working is said by the mark alone.
    return (
      <span className={`badge-attention is-${session.attention.state}`} title={session.attention.message ?? undefined} data-testid="badge-attention">
        {session.attention.state === 'waiting' ? 'waiting for you' : 'finished'}
      </span>
    );
  },
  exit: ({ session }) => {
    const { status } = session;
    if (session.state === 'exited' || status.state !== 'idle' || status.lastExit === null || status.lastExit === 0) return null;
    return (
      <span className="badge-exit" data-testid="badge-exit">
        exit {status.lastExit}
      </span>
    );
  },
  untold: ({ session, now }) => {
    if (session.state === 'exited' || !session.untold || now - Date.parse(session.untold.at) >= 30 * 60_000) return null;
    return (
      <span className="badge-untold" title={untoldWords(session.untold)} data-testid="badge-untold">
        not told
      </span>
    );
  },
  messages: ({ session, standalone }) => (session.state === 'exited' || standalone || !messageMark(session) ? null : <MessageMark session={session} />),
  activity: (c) => {
    if (c.session.state === 'exited') return null;
    const info = describeStatus(c.session);
    if (info.text === '') return null;
    if (c.where === 'row') return words(c, info.text, info.title);
    return (
      <span className="node-activity" title={info.title} data-testid="node-activity">
        {info.text}
      </span>
    );
  },
  command: (c) => {
    const { status } = c.session;
    const line = status.state === 'busy' ? (status.commandLine ?? c.session.command) : c.session.command;
    return words(c, shortCommand(line), line ? showControl(line) : undefined);
  },
  folder: (c) => words(c, showControl(shortFolder(c.session.cwd)), c.session.cwd ? showControl(c.session.cwd) : undefined),
  step: (c) => (c.hasRun && !c.standalone ? <RunStrip sessionId={c.session.id} variant="row" /> : null),
  copy: (c) => (c.hasCopy && !c.standalone ? <EnvironmentChip sessionId={c.session.id} /> : null),
  list: (c) => (c.hasList && !c.standalone ? <ListMark sessionId={c.session.id} variant={c.where === 'title' ? 'node' : 'row'} /> : null),
  standing: (c) => {
    const standing = c.row ? rowFacts(c.row, c.now).standing : null;
    const text = standing?.text ?? (c.session.state === 'exited' ? ['ended', c.session.meantFor?.agent ? `was ${c.session.meantFor.agent}` : null].filter(Boolean).join(' · ') : '');
    if (text === '') return null;
    if (c.where === 'title') return words(c, text);
    return (
      <>
        <span className="list-where">{text}</span>
        {standing?.meantFor && (
          <span className="visually-hidden" data-testid="row-meant-for">
            was {standing.meantFor}
          </span>
        )}
      </>
    );
  },
  time: (c) => {
    const time = rowFacts({ session: c.session, state: 'idle', parked: false }, c.now).time;
    if (!time) return null;
    return (
      <span className={c.where === 'row' ? 'list-active' : 'node-words node-time'} title={time.title} data-testid={c.where === 'row' ? 'list-active' : 'node-time'} data-typed={time.typed || undefined} data-updated={time.updated || undefined}>
        {time.text}
      </span>
    );
  },
  'typed-by': (c) => {
    const by = c.session.typedBy;
    if (!by) return null;
    if (c.where === 'row') {
      const said = rowFacts({ session: c.session, state: 'idle', parked: false }, c.now).typedBy;
      return (
        <span className="list-time list-typed-by" title={said?.title} data-testid="list-typed-by">
          {said?.text}
        </span>
      );
    }
    // A brief mark that a token typed into the terminal, and which. It fades after half a minute; the row keeps the time.
    if (!c.typedLately) return null;
    return (
      <span className="badge-typed" title={`The API token “${by.name}” typed into this terminal at ${new Date(by.at).toLocaleTimeString()}`} data-testid="badge-typed">
        typed by {by.name}
      </span>
    );
  },
  desktop: ({ session }) =>
    session.state === 'exited' || (session.outsideViewers ?? 0) === 0 ? null : (
      <span
        className="badge-desktop"
        title="Something outside this page is attached to this terminal and shows it too: most likely a window of your terminal application. Which program it is cannot be told from here. The two views share one size."
        data-testid="badge-desktop"
      >
        also on desktop
      </span>
    ),
  resume: ({ session }) =>
    !canResumeAgent(session) ? null : (
      <button
        type="button"
        className="node-tool resume-agent nodrag"
        title="Start the agent again in the conversation it was last in"
        // What that conversation was about, as far as is known, when the pointer arrives.
        onMouseEnter={(event) => {
          event.currentTarget.title = `Start the agent again in the conversation it was last in.\n\n${recapTitle(session.id)}`;
        }}
        data-testid="resume-agent"
        onClick={() => void api.resumeAgent(session.id).catch(() => {})}
      >
        Resume agent
      </button>
    ),
  'people-only': (c) => {
    if (!c.session.peopleOnly) return null;
    if (c.where === 'row')
      return (
        <span className="list-lock" title="People only: no API token may read this terminal or type into it" data-testid="row-people-only">
          people only
        </span>
      );
    if (c.session.state === 'exited') return null;
    return (
      <span className="ui-badge" title="People only: no API token may read this terminal or type into it. It is switched in the menu at the right." data-testid="badge-people-only">
        people only
      </span>
    );
  },
  links: ({ session }) => {
    const shown = sortedLinks(session.links).slice(0, TITLE_LINKS);
    if (shown.length === 0) return null;
    // The marks of at most three of its links, the ticket and the pull request first: pressed to open.
    return shown.map((link) => (
      <span key={link.id} className="nodrag node-link">
        <LinkChip url={link.url} kind={link.kind} label={link.label} markOnly testid="node-link" />
      </span>
    ));
  },
  tags: (c) => {
    const { session } = c;
    if (session.tags.length === 0) return null;
    if (c.where === 'row')
      // Tags are on the row while the pointer or the keyboard is on it, and while the list is filtered by a tag.
      return (
        <span className="list-tags">
          {session.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="list-tag"
              title={`Show only terminals tagged ${tag}`}
              data-testid="list-tag"
              onClick={(event) => {
                event.stopPropagation();
                c.onTag(tag);
              }}
            >
              #{tag}
            </button>
          ))}
        </span>
      );
    const text = `#${session.tags[0]}${session.tags.length > 1 ? ` +${session.tags.length - 1}` : ''}`;
    // In a tab of its own there is no dialog to change them in: they are said, not pressed.
    if (c.standalone)
      return (
        <span className="ui-chip" title={`Tags: ${session.tags.join(', ')}`} data-testid="node-tags">
          {text}
        </span>
      );
    return (
      <button type="button" className="ui-chip nodrag" title={hint('terminal.tags', `Tags: ${session.tags.join(', ')}`)} aria-label={`Tags of ${session.name}: ${session.tags.join(', ')}`} onClick={() => useApp.getState().request({ kind: 'tags', id: session.id })} data-testid="node-tags">
        #{session.tags[0]}
        {session.tags.length > 1 ? ` +${session.tags.length - 1}` : ''}
      </button>
    );
  },
  canvas: (c) => (c.canvas ? words(c, showControl(c.canvas)) : null),
  project: (c) => (c.project ? words(c, showControl(c.project)) : null),
  theme: (c) => <ThemeName sessionId={c.session.id} className={WORDS_CLASS[c.where]} />,
  agent: (c) => (c.session.agent ? words(c, showControl(c.session.agent.program ?? c.session.agent.kind), 'The agent on record in this terminal') : null),
  branch: (c) => (c.session.found?.branch ? words(c, showControl(c.session.found.branch), `Branch ${showControl(c.session.found.branch)}`) : null),
  'pull-request': ({ session }) => {
    const pr = session.found?.pullRequest;
    if (!pr) return null;
    return (
      <span className="nodrag node-link">
        <LinkChip url={pr.url} kind="pull-request" label={`PR ${pr.number}`} about={showControl(pr.title)} state={pr.state} testid="template-pull-request" />
      </span>
    );
  },
  field: (c, label) => {
    const field = label === undefined ? undefined : c.session.fields.find((one) => sameLabel(one.label, label));
    if (!field) return null;
    return (
      <span className={WORDS_CLASS[c.where]} title={`${field.label}: ${field.value}`} data-testid="template-field" data-label={field.label}>
        <WithLinks text={field.value} />
      </span>
    );
  },
};

/**
 * Placeholders added while the page runs (a plugin's), with what they say of a terminal: plain words, drawn as a
 * `words` placeholder is, or (`field`) a value whose addresses are chips. What they say is text, whatever it holds.
 * A `say` that throws says nothing, and is reported once through `onFailure`.
 */
export interface AddedDrawing {
  kind: 'words' | 'field';
  say: (session: Session, where: TemplateWhere) => string | null | undefined;
  /** Where the drawing comes from, put on what is drawn (`data-plugin`), so that its own stylesheet can reach it. */
  plugin: string;
  onFailure: (error: unknown) => void;
}
const added = new Map<string, AddedDrawing>();
/** Draws a placeholder registered in `shared/` while the page runs. Returns what takes the drawing away again. */
export function addPartDrawing(name: string, drawing: AddedDrawing): () => void {
  added.set(name, drawing);
  return () => {
    if (added.get(name) === drawing) added.delete(name);
  };
}
function drawAdded(drawing: AddedDrawing, context: SaysContext): ReactNode {
  let said: string | null | undefined;
  try {
    said = drawing.say(context.session, context.where);
  } catch (error) {
    drawing.onFailure(error);
    return null;
  }
  if (typeof said !== 'string' || said.trim() === '') return null;
  const text = showControl(said);
  return (
    <span className={WORDS_CLASS[context.where]} title={text} data-testid="template-words" data-plugin={drawing.plugin}>
      {drawing.kind === 'field' ? <WithLinks text={text} /> : text}
    </span>
  );
}
const drawOf = (name: string): Draw | undefined => {
  const drawing = added.get(name);
  return drawing ? (context) => drawAdded(drawing, context) : DRAW[name];
};

/** Which placeholders have a drawing here: every one registered, as a test checks. */
export const drawnParts = (): string[] => templateParts().map((part) => part.name).filter((name) => drawOf(name) !== undefined);

/** The name of the theme a terminal's body is drawn in. */
function ThemeName({ sessionId, className }: { sessionId: string; className: string }) {
  const id = useTerminalTheme(sessionId);
  const themes = useUserThemes();
  return (
    <span className={className} data-testid="template-words">
      {themeOf(id, themes)?.name ?? id}
    </span>
  );
}

/** Draws a template for one terminal, with the rule of `renderTemplate` for what hangs from a placeholder. */
export function drawTemplate(template: ParsedTemplate, context: SaysContext, only?: (kind: TemplateKind) => boolean): ReactNode {
  const pieces = only ? template.pieces.filter((piece) => 'part' in piece && only(templatePart(piece.part)?.kind ?? 'words')) : template.pieces;
  const drawn = renderTemplate(pieces, (piece) => {
    const node = drawOf(piece.part)?.(context, piece.label);
    return node === null || node === undefined || node === false ? null : node;
  });
  // Each piece is keyed by what it is, so that a piece that comes or goes is drawn anew and another is not patched into its place.
  const seen = new Map<string, number>();
  const keyOf = (name: string): string => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return `${name}#${n}`;
  };
  return drawn.map((piece) =>
    'text' in piece ? (
      <span key={keyOf(`text:${piece.text}`)} className="template-text">
        {piece.text}
      </span>
    ) : (
      <Fragment key={keyOf(`${piece.part}:${piece.label ?? ''}`)}>{piece.value}</Fragment>
    ),
  );
}

/** Whether a token typed into a terminal in the last half minute; it turns false by itself when that has passed. */
function useLately(at: string | undefined): boolean {
  const [lately, setLately] = useState(() => at !== undefined && Date.now() - Date.parse(at) < 30_000);
  useEffect(() => {
    if (at === undefined) return setLately(false);
    const left = 30_000 - (Date.now() - Date.parse(at));
    setLately(left > 0);
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLately(false), left);
    return () => window.clearTimeout(timer);
  }, [at]);
  return lately;
}

/** What the page knows beside a terminal that a template may say: read from the state the page has, nothing asked. */
function useBeside(session: Session, canvasOfRow: string | null | undefined, template: ParsedTemplate) {
  const id = session.id;
  // Only what the template says is looked up: a row whose template does not name a run does not look for one.
  const uses = usesOf(template);
  const hasRun = useApp((s) => (uses.has('step') && s.app ? runsBySession(s.app.runs).has(id) : false));
  const hasCopy = useApp((s) => (uses.has('copy') ? (s.app?.environments.some((e) => e.sessionId === id) ?? false) : false));
  const ended = useEndedRuns((e) => e.items);
  const hasList = useApp((s) => (uses.has('list') && s.app ? handedInBy(s.app, id, ended) !== null : false));
  const canvas = useApp((s) => (!uses.has('canvas') ? null : canvasOfRow !== undefined ? canvasOfRow : (s.whole?.canvases.find((c) => c.layout.nodes.some((n) => n.sessionId === id))?.name ?? null)));
  const project = useApp((s) => (uses.has('project') && s.whole ? projectName(s.whole, session.projectId) : null));
  return { hasRun, hasCopy, hasList, canvas, project };
}

const used = new WeakMap<ParsedTemplate, Set<string>>();
/** The placeholders a template names, worked out once for each template. */
function usesOf(template: ParsedTemplate): Set<string> {
  let known = used.get(template);
  if (!known) {
    known = new Set(template.pieces.flatMap((piece) => ('part' in piece ? [piece.part] : [])));
    used.set(template, known);
  }
  return known;
}

/**
 * What follows a terminal's name in its title, before Note, as the title's template says: by default its state in
 * words, how its last command ended, what it runs, and its marks. `standalone`: at the head of the focus view.
 */
export function TitleSays({ session, standalone = false, template: given }: { session: Session; standalone?: boolean; template?: ParsedTemplate }) {
  const saved = useTemplate('title');
  const template = given ?? saved;
  const beside = useBeside(session, undefined, template);
  const typedLately = useLately(session.typedBy?.at);
  return <>{drawTemplate(template, { session, where: 'title', standalone, now: Date.now(), row: null, typedLately, onTag: () => {}, ...beside })}</>;
}

/**
 * What a row says after its name, as the row's template says: on its second line; compact, its state in words beside
 * the name and nothing else, as a row of one line always had.
 */
export function RowSays({ row, now, onTag, compact = false, template: given }: { row: Row; now: number; onTag: (tag: string) => void; compact?: boolean; template?: ParsedTemplate }) {
  const saved = useTemplate('row');
  const template = given ?? saved;
  const beside = useBeside(row.session, row.canvasName, template);
  const context: SaysContext = { session: row.session, where: 'row', standalone: false, now, row, typedLately: false, onTag, ...beside };
  return <>{drawTemplate(template, context, compact ? (kind) => kind === 'state' : undefined)}</>;
}
