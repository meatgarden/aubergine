import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openProjects, projectName, type CommandId } from '@aubergine/shared';
import { canvasActions } from '../../canvas-actions';
import { runCommand } from '../../commands';
import { SCOPE_FILTER, TAG_FILTER, TEXT_FILTER, listFilters } from '../../list-filters';
import { listModel, listSource } from '../../list-model';
import { NotePanel } from '../../NotePanel';
import { RecapBlock, recapTitle } from '../../Recap';
import { MessageMark, SessionMessages } from '../../Messages';
import { markNotesSeen, useUnseenNotes } from '../../notes-seen';
import { shortFolder } from '../../search';
import { hint } from '../../shortcuts';
import { useApp } from '../../store';
import {
  SORTS,
  SORT_LABEL,
  STATE_MARK,
  STATE_WORD,
  ago,
  describeEmpty,
  filterChips,
  itemHeight,
  measureItems,
  stateCounts,
  visibleRange,
  type Density,
  type Row,
  type Sort,
} from '../../terminal-rows';
import { registerSection } from '../registry';
import { Menu } from '../../ui';
import { ListMark } from '../../workflows/ListMark';
import { RunStrip } from '../../workflows/RunStrip';

const SECTION = 'terminals';
/** Relative times are brought up to date this often, by one timer for the whole list. */
const CLOCK_MS = 5000;
const PREVIEW_DELAY_MS = 350;

function useModel() {
  // Of the project being looked at, or of every project, as the view says.
  const app = useApp((s) => listSource(s));
  const view = useApp((s) => s.listView);
  const canvasId = useApp((s) => s.canvasId);
  return useMemo(() => listModel(app, view, canvasId), [app, view, canvasId]);
}

/** Every terminal on every canvas and the parked ones, filtered, grouped and sorted as the user chose. */
function TerminalsSection() {
  const model = useModel();
  const view = useApp((s) => s.listView);
  const canvasId = useApp((s) => s.canvasId);
  const current = useApp((s) => s.focus?.sessionId ?? s.selected);
  const focused = useApp((s) => s.focus?.sessionId ?? null);
  const drawer = useApp((s) => s.drawer);
  const setView = useApp((s) => s.setListView);
  const canvasCount = useApp((s) => s.app?.canvases.length ?? 0);
  useApp((s) => s.settings.shortcuts);
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ row: Row; top: number; left: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);

  // One clock for every row in view.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = (): void => setViewport(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { tops, total } = useMemo(() => measureItems(model.items, view.density), [model.items, view.density]);
  const [from, to] = visibleRange(tops, total, scrollTop, viewport);

  // Keep the row of the selected terminal in view.
  useEffect(() => {
    const element = scroller.current;
    if (!current || !element) return;
    const index = model.items.findIndex((item) => item.kind === 'row' && item.row.session.id === current);
    const item = model.items[index];
    if (!item) return;
    const top = tops[index] as number;
    const bottom = top + itemHeight(item, view.density);
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight;
  }, [current, model.items, tops, view.density]);

  // An open notes drawer follows the selection, so the list can be used to read through notes.
  // It follows a change of selection, not the selection as it happened to be when it was opened.
  const followed = useRef(current);
  useEffect(() => {
    const changed = followed.current !== current;
    followed.current = current;
    const open = useApp.getState().drawer;
    if (changed && current && open?.section === SECTION && open.kind === 'notes' && open.id !== current) {
      useApp.getState().openDrawer({ section: SECTION, kind: 'notes', id: current });
    }
  }, [current]);

  // Asked to put the keyboard in the text box (by a key or the palette).
  const ask = useApp((s) => (s.ask?.kind === 'list-search' ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    search.current?.focus();
    search.current?.select();
    useApp.getState().asked(ask.tick);
  }, [ask]);

  // The row menu closes on a click anywhere else.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('.list-menu, .list-more')) setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [menu]);

  const go = (sessionId: string): void => {
    setMenu(null);
    useApp.getState().showSession(sessionId);
  };

  /** Runs a command on a row's terminal: it becomes the selected one first. */
  const act = (sessionId: string, command: CommandId): void => {
    setMenu(null);
    canvasActions.get()?.releaseFocus();
    useApp.getState().select(sessionId);
    canvasActions.get()?.reveal(sessionId);
    runCommand(command);
  };

  const openNotes = (sessionId: string): void => {
    setPreview(null);
    const open = useApp.getState().drawer;
    const same = open?.section === SECTION && open.kind === 'notes' && open.id === sessionId;
    useApp.getState().openDrawer(same ? null : { section: SECTION, kind: 'notes', id: sessionId });
  };

  const addTag = (tag: string): void => {
    if (!view.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setView({ tags: [...view.tags, tag] });
  };

  const toggleGroup = (id: string): void =>
    setView({ collapsedGroups: view.collapsedGroups.includes(id) ? view.collapsedGroups.filter((g) => g !== id) : [...view.collapsedGroups, id] });

  const scoped = view.filters.includes(SCOPE_FILTER);
  const whole = useApp((s) => s.whole);
  const severalProjects = (whole ? openProjects(whole).length : 0) > 1;
  /** In the view of every project a group says which project its canvas is in. */
  const projectOfGroup = (groupId: string): string => {
    const projectId = whole?.canvases.find((c) => c.id === groupId)?.projectId;
    return projectId && whole ? `${projectName(whole, projectId)} · ` : '';
  };
  const toggles = listFilters().filter((filter) => ![SCOPE_FILTER, TEXT_FILTER, TAG_FILTER].includes(filter.id));
  // What is on beyond the default. The default is the canvas being looked at and nothing else: it is not said.
  const chips = [
    ...filterChips(view).filter((chip) => chip.key !== SCOPE_FILTER),
    ...(scoped ? [] : [{ key: 'everywhere', label: view.everyProject ? 'All projects' : 'All canvases', remove: { everyProject: false, filters: [...view.filters.filter((id) => id !== SCOPE_FILTER), SCOPE_FILTER] } }]),
  ];
  const laidOut = view.grouping !== 'canvas' || view.density === 'compact';
  const chosen = chips.length + (laidOut ? 1 : 0);
  const [moreAsked, setMoreAsked] = useState(false);
  const more = moreAsked;
  const bar = useRef<HTMLDivElement>(null);
  // The menu closes when something else is pressed, and on Escape.
  useEffect(() => {
    if (!more) return;
    const away = (event: PointerEvent): void => {
      if (!bar.current?.contains(event.target as Node)) setMoreAsked(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMoreAsked(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [more]);
  const toggle = (filter: (typeof toggles)[number]) => {
    const on = view.filters.includes(filter.id);
    return (
      <button
        key={filter.id}
        type="button"
        role="menuitemcheckbox"
        aria-checked={on}
        aria-pressed={on}
        data-filter={filter.id}
        onClick={() => setView({ filters: on ? view.filters.filter((id) => id !== filter.id) : [...view.filters, filter.id] })}
      >
        {filter.label}
      </button>
    );
  };

  return (
    <div className={`terminal-list${view.tags.length > 0 ? ' by-tag' : ''}`} data-testid="terminal-list">
      <div className="list-bar" ref={bar}>
        <div className="list-find">
          <input
            ref={search}
            className="list-search"
            type="search"
            placeholder="Find a terminal…"
            aria-label="Filter terminals by text"
            title={hint('list.search', 'Filter by name, folder, command or note')}
            value={view.text}
            data-testid="list-search"
            onChange={(event) => setView({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                if (view.text) setView({ text: '' });
                else event.currentTarget.blur();
              }
            }}
          />
          <button type="button" aria-haspopup="menu" aria-expanded={more} onClick={() => setMoreAsked((v) => !v)} title="Which terminals are listed, and how" data-testid="list-more">
            Filter{chosen > 0 ? ` · ${chosen}` : ''}
          </button>
        </div>
        {more && (
          <Menu className="list-filter-menu" aria-label="Which terminals are listed, and how" data-testid="list-more-filters">
            <span className="ui-menu-label">Where</span>
            <button type="button" role="menuitemradio" aria-checked={scoped} aria-pressed={scoped} title={hint('list.scope.toggle', 'Only the canvas you are looking at')} onClick={() => !scoped && runCommand('list.scope.toggle')} data-testid="scope-this">
              This canvas
            </button>
            <button type="button" role="menuitemradio" aria-checked={!scoped && !view.everyProject} aria-pressed={!scoped && !view.everyProject} title={hint('list.scope.toggle', 'Every canvas of this project')} onClick={() => (view.everyProject ? setView({ everyProject: false }) : scoped && runCommand('list.scope.toggle'))} data-testid="scope-all">
              All canvases
            </button>
            {severalProjects && (
              <button type="button" role="menuitemradio" aria-checked={view.everyProject === true} aria-pressed={view.everyProject === true} title="The terminals of every project; each group names its project" onClick={() => setView({ everyProject: true, filters: view.filters.filter((id) => id !== SCOPE_FILTER) })} data-testid="scope-projects">
                All projects
              </button>
            )}
            <span className="ui-menu-label">Only those that are</span>
            {toggles.map(toggle)}
            <span className="ui-menu-label">How the list is laid out</span>
            <label className="ui-menu-line">
              <span>Grouping</span>
              <select value={view.grouping} aria-label="Grouping" title={hint('list.grouping.toggle', 'Group by canvas, or one flat list')} onChange={(e) => {
                  setView({ grouping: e.target.value === 'flat' ? 'flat' : 'canvas' });
                  e.currentTarget.blur();
                }} data-testid="list-grouping">
                <option value="canvas">By canvas</option>
                <option value="flat">Flat list</option>
              </select>
            </label>
            {view.grouping === 'flat' && (
              <label className="ui-menu-line">
                <span>Order</span>
                <select value={view.sort} aria-label="Order" title={hint('list.sort.cycle', 'Order of the flat list')} onChange={(e) => {
                    setView({ sort: e.target.value as Sort });
                    e.currentTarget.blur();
                  }} data-testid="list-sort">
                  {SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {SORT_LABEL[sort]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" role="menuitemcheckbox" aria-checked={view.density === 'compact'} aria-pressed={view.density === 'compact'} title={hint('list.density.toggle', 'One line per terminal')} onClick={() => runCommand('list.density.toggle')} data-testid="list-density">
              One line per terminal
            </button>
          </Menu>
        )}
        {chips.length > 0 && (
          <div className="list-chips" data-testid="list-chips">
            {chips.map((chip) => (
              <button key={chip.key} type="button" className="list-chip" title={`Remove the filter ${chip.label}`} aria-label={`Remove the filter ${chip.label}`} onClick={() => setView(chip.remove)} data-testid="list-chip">
                {chip.label} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="list-clear" title="Back to the terminals of this canvas, all of them" onClick={() => setView({ filters: [SCOPE_FILTER], text: '', tags: [], everyProject: false })} data-testid="list-clear">
              Clear
            </button>
          </div>
        )}
      </div>

      <div
        className="list-rows"
        role="listbox"
        tabIndex={0}
        aria-label="Terminals"
        ref={scroller}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          // With the keyboard in the list: arrows move through the rows, Enter goes to the terminal.
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowDown') runCommand('select.next');
          else if (event.key === 'ArrowUp') runCommand('select.previous');
          else if (event.key === 'Enter') runCommand('terminal.enter');
          else if (event.key === 'Escape') {
            if (useApp.getState().drawer) useApp.getState().openDrawer(null);
            else event.currentTarget.blur();
          } else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {model.items.length === 0 ? (
          <div className="list-empty" data-testid="list-empty">
            {describeEmpty(view, model.rows.length)}
          </div>
        ) : (
          <div className="list-canvas-space" style={{ height: total }}>
            {model.items.slice(from, to).map((item, offset) => {
              const index = from + offset;
              const style = { top: tops[index], height: itemHeight(item, view.density) };
              if (item.kind === 'group') {
                return (
                  <button key={`g:${item.id}`} type="button" className="list-group" style={style} aria-expanded={!item.collapsed} onClick={() => toggleGroup(item.id)} data-testid="list-group" data-group={item.id}>
                    <span className="list-chevron">{item.collapsed ? '▸' : '▾'}</span>
                    <span className="list-group-title">
                      {view.everyProject ? `${projectOfGroup(item.id)}${item.title}` : item.title}
                    </span>
                    <span className="list-count">{item.count}</span>
                    {item.waiting > 0 && (
                      <span className="tab-waiting" title={`${item.waiting} waiting for you`}>
                        {item.waiting}
                      </span>
                    )}
                  </button>
                );
              }
              if (item.kind === 'frame') {
                return (
                  <div key={`f:${item.id}`} className="list-heading" style={style} data-testid="list-heading">
                    {item.title}
                  </div>
                );
              }
              const { row } = item;
              const id = row.session.id;
              return (
                <RowView
                  key={id}
                  row={row}
                  style={style}
                  density={view.density}
                  indented={item.indented}
                  current={id === current}
                  focused={id === focused}
                  here={row.canvasId === canvasId}
                  menuOpen={menu === id}
                  notesOpen={drawer?.kind === 'notes' && drawer.id === id}
                  canMove={canvasCount > 1}
                  now={now}
                  onGo={go}
                  onMenu={setMenu}
                  onAct={act}
                  onNotes={openNotes}
                  onTag={addTag}
                  onPreview={setPreview}
                />
              );
            })}
          </div>
        )}
      </div>
      {preview && <NotePreview row={preview.row} top={preview.top} left={preview.left} />}
    </div>
  );
}

interface RowProps {
  row: Row;
  style: React.CSSProperties;
  density: Density;
  indented: boolean;
  current: boolean;
  focused: boolean;
  /** On the canvas being looked at, so the node's commands can act on it. */
  here: boolean;
  menuOpen: boolean;
  notesOpen: boolean;
  canMove: boolean;
  now: number;
  onGo: (sessionId: string) => void;
  onMenu: (sessionId: string | null) => void;
  onAct: (sessionId: string, command: CommandId) => void;
  onNotes: (sessionId: string) => void;
  onTag: (tag: string) => void;
  onPreview: (preview: { row: Row; top: number; left: number } | null) => void;
}

/** The most telling word for a row: its state, said the way the node says it. */
function badgeOf(row: Row): string | null {
  const { session, state } = row;
  if (state === 'waiting') return session.attention.state === 'done' ? 'finished' : 'waiting for you';
  if (state === 'failed') return `exit ${session.status.lastExit}`;
  if (state === 'idle') return row.parked ? 'parked' : null;
  return STATE_WORD[state];
}

const RowView = memo(function RowView({ row, style, density, indented, current, focused, here, menuOpen, notesOpen, canMove, now, onGo, onMenu, onAct, onNotes, onTag, onPreview }: RowProps) {
  const { session, state } = row;
  const compact = density === 'compact';
  const badge = badgeOf(row);
  const detail = session.state === 'exited' ? 'ended' : [session.command, shortFolder(session.cwd)].filter(Boolean).join(' · ');
  const typed = ago(session.lastInputAt, now);
  const updated = ago(session.lastOutputAt, now);
  // The later of the two times is the one the row says.
  const active = ago([session.lastInputAt, session.lastOutputAt].filter((t): t is string => typeof t === 'string').sort().at(-1) ?? null, now);
  const hasNotes = session.note !== '' || session.noteLog.length > 0;
  const unseen = useUnseenNotes(session.id, session.noteLog.length);
  const timer = useRef<number | undefined>(undefined);

  const showPreview = (element: HTMLElement): void => {
    // A preview is for a pointer that can hover, or the keyboard; never for touch.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const box = element.getBoundingClientRect();
      onPreview({ row, top: box.top, left: box.right + 8 });
    }, PREVIEW_DELAY_MS);
  };
  const hidePreview = (): void => {
    window.clearTimeout(timer.current);
    onPreview(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      className={`list-row state-${state}${compact ? ' compact' : ''}${current ? ' current' : ''}${focused ? ' focused' : ''}${indented ? ' indented' : ''}`}
      style={style}
      role="option"
      aria-selected={current}
      data-testid="list-row"
      data-session={session.id}
      data-state={state}
      onClick={() => onGo(session.id)}
    >
      <div className="list-main">
        <span className="list-state" title={STATE_WORD[state]} aria-label={STATE_WORD[state]}>
          {STATE_MARK[state]}
        </span>
        <span
          className="list-name"
          // The recap, on hover: worked out when the pointer arrives, so that drawing a row costs nothing more.
          onMouseEnter={(event) => {
            event.currentTarget.title = recapTitle(session.id);
          }}
          data-testid="list-name"
        >
          {session.name}
        </span>
        {/* At the right of the first line: what the terminal waits for, and the run it is on. Nothing when there is nothing. */}
        {badge && !compact && (
          <span className="list-badge" data-testid="list-badge" title={session.attention.message ?? session.status.commandLine ?? undefined}>
            {badge}
          </span>
        )}
        {!compact && <MessageMark session={session} />}
        {!compact && <RunStrip sessionId={session.id} variant="row" />}
        {!compact && <ListMark sessionId={session.id} variant="row" />}
        {hasNotes && unseen > 0 && (
          <button
            type="button"
            className={`list-note${notesOpen ? ' open' : ''}`}
            aria-label={`Notes of ${session.name}, ${unseen} new`}
            aria-expanded={notesOpen}
            data-testid="list-note"
            onClick={(event) => {
              event.stopPropagation();
              onNotes(session.id);
            }}
            onMouseEnter={(event) => window.matchMedia('(hover: hover)').matches && showPreview(event.currentTarget)}
            onMouseLeave={hidePreview}
            onFocus={(event) => event.currentTarget.matches(':focus-visible') && showPreview(event.currentTarget)}
            onBlur={hidePreview}
          >
            ✎<span className="list-note-new">{unseen}</span>
          </button>
        )}
      </div>
      {!compact && (
        <div className="list-detail">
          <span className="list-where">
            {[detail, session.meantFor?.agent ? `was ${session.meantFor.agent}` : session.agent ? 'agent' : null, active ? (active === 'now' ? 'just now' : `${active} ago`) : null].filter(Boolean).join(' · ') || ' '}
          </span>
          {session.meantFor?.agent && <span className="visually-hidden" data-testid="row-meant-for">was {session.meantFor.agent}</span>}
          {active && (
            // The later of the two times is in the line; both are said in full to whoever asks.
            <span className="visually-hidden" title={[typed ? `You last typed here ${typed === 'now' ? 'just now' : `${typed} ago`}` : null, updated ? `It last printed ${updated === 'now' ? 'just now' : `${updated} ago`}` : null].filter(Boolean).join('. ')} data-testid="list-active" data-typed={typed || undefined} data-updated={updated || undefined}>
              active {active === 'now' ? 'just now' : `${active} ago`}
            </span>
          )}
          {session.peopleOnly && (
            <span className="list-lock" title="People only: no API token may read this terminal or type into it" data-testid="row-people-only">
              people only
            </span>
          )}
          {session.typedBy && (
            <span className="list-time list-typed-by" title={`An API token typed into this terminal: ${new Date(session.typedBy.at).toLocaleString()}`} data-testid="list-typed-by">
              typed by {session.typedBy.name} {ago(session.typedBy.at, now) === 'now' ? 'just now' : `${ago(session.typedBy.at, now)} ago`}
            </span>
          )}
          {/* Tags are on the row while the pointer or the keyboard is on it, and while the list is filtered by a tag. */}
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
                  onTag(tag);
                }}
              >
                #{tag}
              </button>
            ))}
          </span>
        </div>
      )}
      {/* Everything else that can be done with it: one menu, there while the pointer or the keyboard is on the row. */}
      <button
        type="button"
        className="list-more"
        aria-haspopup="menu"
        aria-label={`Actions for ${session.name}`}
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation();
          onMenu(menuOpen ? null : session.id);
        }}
        data-testid="row-more"
      >
        ⋯
      </button>
      {menuOpen && (
        <div className="list-menu" role="menu" aria-label={`Actions for ${session.name}`} onClick={(event) => event.stopPropagation()}>
          {!here && (
            <button type="button" role="menuitem" className="list-restore" onClick={() => onGo(session.id)} data-testid="row-restore">
              {row.parked ? 'Restore to this canvas' : 'Go to it'}
            </button>
          )}
          {!here && hasNotes && (
            <button type="button" role="menuitem" onClick={() => onNotes(session.id)}>
              Notes
            </button>
          )}
          {here && (
            <>
          <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.rename')}>
                Rename
              </button>
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'notes.toggle')}>
                Notes
              </button>
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.tags')}>
                Tags…
              </button>
              {session.state !== 'exited' && (
                <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.openOnDesktop')} data-testid="row-open-desktop">
                  Open on desktop
                </button>
              )}
              {canMove && (
                <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.moveToCanvas')}>
                  Move to canvas…
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => onAct(session.id, 'terminal.park')}>
                {session.state === 'exited' ? 'Remove' : 'Park'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

/** A glance at a session's notes: the start of the pinned note and the newest log entry. Read-only; it never takes the keyboard. */
function NotePreview({ row, top, left }: { row: Row; top: number; left: number }) {
  const { session } = row;
  const lines = session.note.split('\n').filter((line) => line.trim() !== '').slice(0, 4);
  const entry = session.noteLog.at(-1);
  return (
    <div className="note-preview" role="tooltip" style={{ top: Math.min(top, window.innerHeight - 180), left }} data-testid="note-preview">
      <strong>{session.name}</strong>
      {lines.length > 0 ? lines.map((line, i) => <p key={i}>{line.slice(0, 160)}</p>) : <p className="note-empty">No pinned note.</p>}
      {entry && (
        <p className="note-preview-entry">
          <span className="note-author">{entry.kind === 'prompt' ? 'prompt' : entry.author === 'agent' ? 'agent' : 'you'}</span>{' '}
          <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          <br />
          {entry.text.slice(0, 200)}
        </p>
      )}
    </div>
  );
}

/** The notes of one session beside the list: the same component the node uses. */
function NotesDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const entries = useApp((s) => s.app?.sessions.find((x) => x.id === id)?.noteLog.length ?? 0);
  const exists = useApp((s) => s.app?.sessions.some((x) => x.id === id) ?? false);
  useEffect(() => markNotesSeen(id, entries), [id, entries]);
  useEffect(() => {
    if (!exists) onClose();
  }, [exists, onClose]);
  const isAgent = useApp((s) => s.app?.sessions.find((x) => x.id === id)?.agent != null);
  if (!exists) return null;
  return (
    <>
      {isAgent && (
        <div className="drawer-section" data-testid="drawer-switched-on">
          <button type="button" className="quiet" onClick={() => useApp.getState().openHistory({ folder: useApp.getState().app?.sessions.find((x) => x.id === id)?.cwd ?? null, query: '' })} data-testid="drawer-history">
            Past conversations in this folder…
          </button>
          <button type="button" className="quiet" onClick={() => useApp.getState().showInventory(id)}>
            ⚙ How this agent is set up…
          </button>
        </div>
      )}
      <div className="drawer-section">
        <RecapBlock sessionId={id} />
      </div>
      <SessionMessages sessionId={id} />
      <NotePanel sessionId={id} onClose={onClose} embedded />
    </>
  );
}

registerSection({
  id: SECTION,
  title: 'Terminals',
  order: 10,
  icon: '▤',
  useCount: () => useModel().filtered.length,
  useBadges: () => {
    const counts = stateCounts(useModel().filtered);
    return (['waiting', 'processing', 'unread', 'failed'] as const).map((state) => ({ key: state, mark: STATE_MARK[state], count: counts[state], title: STATE_WORD[state] }));
  },
  Component: TerminalsSection,
  drawers: {
    notes: {
      useTitle: (id) => useApp((s) => s.app?.sessions.find((x) => x.id === id)?.name ?? 'Notes'),
      Component: NotesDrawer,
    },
  },
});
