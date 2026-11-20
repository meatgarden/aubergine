import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openProjects, projectName, type CommandId } from '@aubergine/shared';
import { canvasActions } from '../../canvas-actions';
import { runCommand } from '../../commands';
import { SCOPE_FILTER, TAG_FILTER, TEXT_FILTER, listFilters } from '../../list-filters';
import { listModel, listSource } from '../../list-model';
import { recapTitle } from '../../Recap';
import { shortFolder } from '../../search';
import { hint } from '../../shortcuts';
import { currentCanvas, useApp } from '../../store';
import {
  SORTS,
  SORT_LABEL,
  DOT_WORD,
  STATE_MARK,
  STATE_WORD,
  dotTone,
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
import { Details, DetailsHead } from './terminal-details';
import { Menu, StateDot } from '../../ui';
import { RunStrip } from '../../workflows/RunStrip';

const SECTION = 'terminals';
/** Relative times are brought up to date this often, by one timer for the whole list. */
const CLOCK_MS = 5000;

function useModel() {
  // Of the project being looked at, or of every project, as the view says.
  const app = useApp((s) => listSource(s));
  const view = useApp((s) => s.listView);
  const canvasId = useApp((s) => s.canvasId);
  return useMemo(() => listModel(app, view, canvasId), [app, view, canvasId]);
}

/**
 * On the rail the panel folds to: the mark of each terminal's state, in the list's own order. Its name is a tooltip
 * and a press goes to it. A terminal that is put away has no mark here: there is nowhere on the canvas to go to.
 */
function TerminalsRail() {
  const model = useModel();
  const byId = useMemo(() => new Map(model.filtered.map((row) => [row.session.id, row])), [model.filtered]);
  const rows = model.order.map((entry) => byId.get(entry.sessionId)).filter((row): row is Row => row !== undefined && !row.parked);
  return (
    <div className="rail-dots" role="list" aria-label="Terminals" data-testid="rail-dots">
      {rows.map((row) => {
        const tone = dotTone(row.session, row.parked);
        const word = tone === 'hollow' ? 'ended' : DOT_WORD[tone];
        return (
          <span role="listitem" key={row.session.id}>
            <button type="button" className="rail-dot" aria-label={`${row.session.name}: ${word}`} title={`${row.session.name}: ${word}`} onClick={() => useApp.getState().showSession(row.session.id)} data-testid="rail-dot" data-session={row.session.id}>
              <StateDot tone={tone} word={word} title={undefined} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Every terminal on every canvas and the parked ones, filtered, grouped and sorted as the user chose. */
function TerminalsSection() {
  const model = useModel();
  const view = useApp((s) => s.listView);
  const canvasId = useApp((s) => s.canvasId);
  const current = useApp((s) => s.focus?.sessionId ?? s.selected);
  const focused = useApp((s) => s.focus?.sessionId ?? null);
  const setView = useApp((s) => s.setListView);
  const canvasCount = useApp((s) => s.app?.canvases.length ?? 0);
  useApp((s) => s.settings.shortcuts);
  const [menu, setMenu] = useState<string | null>(null);
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

  // A terminal whose details are opened, from anywhere, becomes the one chosen in the list: its row is marked and
  // brought into view. A terminal that had the keyboard keeps it only if it is that one.
  const opened = useApp((s) => (s.drawer?.section === SECTION && s.drawer.kind === 'notes' ? s.drawer.id : null));
  useEffect(() => {
    if (!opened) return;
    const store = useApp.getState();
    if (store.focus && store.focus.sessionId !== opened) store.focusSession(null);
    if (store.selected !== opened) store.select(opened);
  }, [opened]);

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
    actOnTerminal(sessionId, command);
  };

  const showDetails = (sessionId: string): void => {
    setMenu(null);
    useApp.getState().openDrawer({ section: SECTION, kind: 'notes', id: sessionId });
  };
  const openNotes = (sessionId: string): void => {
    setMenu(null);
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
  // Where the list looks is always said, first: the canvas being looked at by its name, or every canvas, or every
  // project. Its × flips between the two: the canvas widens to every canvas, and every canvas (or project) goes
  // back to this one.
  const canvasName = useApp((s) => currentCanvas(s)?.name ?? 'This canvas');
  const scopeChip = scoped
    ? { key: SCOPE_FILTER, label: canvasName, title: 'Showing this canvas. Press to show every canvas.', remove: { everyProject: false, filters: view.filters.filter((id) => id !== SCOPE_FILTER) } }
    : {
        key: 'everywhere',
        label: view.everyProject ? 'All projects' : 'All canvases',
        title: `Showing ${view.everyProject ? 'every project' : 'every canvas'}. Press to show this canvas only.`,
        remove: { everyProject: false, filters: [...view.filters.filter((id) => id !== SCOPE_FILTER), SCOPE_FILTER] },
      };
  // What is on beyond the default (this canvas, nothing else): counted on Filter, and what Clear takes away.
  const chips = [...filterChips(view).filter((chip) => chip.key !== SCOPE_FILTER), ...(scoped ? [] : [scopeChip])];
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
        <div className="list-chips" data-testid="list-chips">
          <button
            type="button"
            className="list-chip list-scope-chip"
            title={scopeChip.title}
            aria-label={`${scopeChip.label}: ${scopeChip.title}`}
            onClick={() => setView(scopeChip.remove)}
            data-testid="list-scope-chip"
            data-scope={scoped ? 'canvas' : view.everyProject ? 'projects' : 'canvases'}
          >
            <span className="list-chip-label">{scopeChip.label}</span> <span aria-hidden="true">×</span>
          </button>
          {chips
            .filter((chip) => chip.key !== scopeChip.key)
            .map((chip) => (
              <button key={chip.key} type="button" className="list-chip" title={`Remove the filter ${chip.label}`} aria-label={`Remove the filter ${chip.label}`} onClick={() => setView(chip.remove)} data-testid="list-chip">
                {chip.label} <span aria-hidden="true">×</span>
              </button>
            ))}
          {chips.length > 0 && (
            <button type="button" className="list-clear" title="Back to the terminals of this canvas, all of them" onClick={() => setView({ filters: [SCOPE_FILTER], text: '', tags: [], everyProject: false })} data-testid="list-clear">
              Clear
            </button>
          )}
        </div>
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
                  <button key={`g:${item.id}`} type="button" className="list-group" style={style} aria-expanded={!item.collapsed} title={`${item.count} ${item.count === 1 ? 'terminal' : 'terminals'}${item.waiting > 0 ? `, ${item.waiting} waiting for you` : ''}`} onClick={() => toggleGroup(item.id)} data-testid="list-group" data-group={item.id}>
                    <span className="list-chevron" aria-hidden="true">
                      {item.collapsed ? '▸' : '▾'}
                    </span>
                    <span className="list-group-title">{view.everyProject ? `${projectOfGroup(item.id)}${item.title}` : item.title}</span>
                    <span className="list-count">{item.count}</span>
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
                  canMove={canvasCount > 1}
                  now={now}
                  onGo={go}
                  onMenu={setMenu}
                  onAct={act}
                  onNotes={openNotes}
                  onDetails={showDetails}
                  onTag={addTag}
                />
              );
            })}
          </div>
        )}
      </div>
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
  canMove: boolean;
  now: number;
  onGo: (sessionId: string) => void;
  onMenu: (sessionId: string | null) => void;
  onAct: (sessionId: string, command: CommandId) => void;
  onNotes: (sessionId: string) => void;
  /** Opens a terminal's details, and leaves them open when they already are: what a double click on a row does. */
  onDetails: (sessionId: string) => void;
  onTag: (tag: string) => void;
}

/** What can be done with a terminal from its row and from its details: the same lines in both menus. `command` runs on the terminal once it is the selected one. */
export interface TerminalAction {
  key: string;
  label: string;
  testid?: string;
  command?: CommandId;
}
export function terminalActions(session: Row['session'], where: { here: boolean; parked: boolean; canMove: boolean; hasNotes: boolean }): TerminalAction[] {
  const exited = session.state === 'exited';
  if (!where.here) return [{ key: 'details', label: 'Details' }, { key: 'go', label: where.parked ? 'Restore to this canvas' : 'Go to it', testid: 'row-restore' }];
  return [
    { key: 'details', label: 'Details' },
    { key: 'rename', label: 'Rename', command: 'terminal.rename' },
    { key: 'tags', label: 'Tags…', command: 'terminal.tags' },
    ...(exited ? [] : [{ key: 'desktop', label: 'Open on desktop', testid: 'row-open-desktop', command: 'terminal.openOnDesktop' as const }, { key: 'tab', label: 'Open in new tab', testid: 'row-open-tab', command: 'terminal.openInNewTab' as const }]),
    ...(where.canMove ? [{ key: 'move', label: 'Move to canvas…', command: 'terminal.moveToCanvas' as const }] : []),
    { key: 'park', label: exited ? 'Remove' : 'Park', command: 'terminal.park' },
  ];
}

/** Runs a command on a terminal: it becomes the selected one first, and is brought into view. */
export function actOnTerminal(sessionId: string, command: CommandId): void {
  canvasActions.get()?.releaseFocus();
  useApp.getState().select(sessionId);
  canvasActions.get()?.reveal(sessionId);
  runCommand(command);
}

/** The state of a row in words, where it is not the ordinary one: what the chip on its second line says. */
export function chipOf(row: Pick<Row, 'session' | 'state'>): { text: string; tone: 'attention' | 'ok' | 'danger' } | null {
  const { session, state } = row;
  if (state === 'waiting') return session.attention.state === 'done' ? { text: 'finished', tone: 'ok' } : { text: 'waiting for you', tone: 'attention' };
  if (state === 'failed') return { text: `exit ${session.status.lastExit}`, tone: 'danger' };
  return null;
}

const RowView = memo(function RowView({ row, style, density, indented, current, focused, here, menuOpen, canMove, now, onGo, onMenu, onAct, onNotes, onDetails, onTag }: RowProps) {
  const { session, state } = row;
  const compact = density === 'compact';
  const chip = chipOf(row);
  const tone = dotTone(session, row.parked);
  const typed = ago(session.lastInputAt, now);
  const updated = ago(session.lastOutputAt, now);
  // The later of the two times is the one the row says.
  const active = ago([session.lastInputAt, session.lastOutputAt].filter((t): t is string => typeof t === 'string').sort().at(-1) ?? null, now);
  const said = (short: string): string => (short === 'now' ? 'just now' : `${short} ago`);
  const hasNotes = session.note !== '' || session.noteLog.length > 0;
  // Where it is, and what else is known that a row has room for. When it was last active is said once, after these.
  const where = [session.state === 'exited' ? 'ended' : shortFolder(session.cwd), session.meantFor?.agent ? `was ${session.meantFor.agent}` : null, row.parked && session.state !== 'exited' ? 'parked' : null].filter(Boolean).join(' · ');

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
      // A double click opens its details: the clicks before it went to the terminal, so it is in view beside them.
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input')) return;
        onDetails(session.id);
      }}
    >
      {/* The first line is the name's: the mark of its state, then the name with all the room there is. */}
      <div className="list-main">
        <StateDot tone={tone} word={tone === 'hollow' && state !== 'ended' ? 'parked' : tone === 'hollow' ? 'ended' : DOT_WORD[tone]} className="list-state" data-testid="list-state" />
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
      </div>
      {/* The second line: its state in words where that is not the ordinary one, the step it is on, then what is known about it. */}
      {!compact && (
        <div className="list-detail">
          {chip && (
            <span className={`ui-badge is-${chip.tone} list-badge`} data-testid="list-badge" title={session.attention.message ?? session.status.commandLine ?? undefined}>
              {chip.text}
            </span>
          )}
          <RunStrip sessionId={session.id} variant="row" />
          <span className="list-where">{where}</span>
          {session.meantFor?.agent && <span className="visually-hidden" data-testid="row-meant-for">was {session.meantFor.agent}</span>}
          {active && (
            // The later of the two times, said once; both are said in full to whoever asks.
            <span className="list-active" title={[typed ? `You last typed here ${said(typed)}` : null, updated ? `It last printed ${said(updated)}` : null].filter(Boolean).join('. ')} data-testid="list-active" data-typed={typed || undefined} data-updated={updated || undefined}>
              {said(active)}
            </span>
          )}
          {session.peopleOnly && (
            <span className="list-lock" title="People only: no API token may read this terminal or type into it" data-testid="row-people-only">
              people only
            </span>
          )}
          {session.typedBy && (
            <span className="list-time list-typed-by" title={`An API token typed into this terminal: ${new Date(session.typedBy.at).toLocaleString()}`} data-testid="list-typed-by">
              typed by {session.typedBy.name} {said(ago(session.typedBy.at, now))}
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
          {terminalActions(session, { here, parked: row.parked, canMove, hasNotes }).map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className={action.key === 'go' ? 'list-restore' : undefined}
              onClick={() => (action.command ? onAct(session.id, action.command) : action.key === 'details' ? onNotes(session.id) : onGo(session.id))}
              data-testid={action.testid}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

registerSection({
  id: SECTION,
  title: 'Terminals',
  says: 'Every terminal, with what it is doing.',
  order: 10,
  Rail: TerminalsRail,
  icon: '▤',
  useCount: () => useModel().filtered.length,
  useBadges: () => {
    const counts = stateCounts(useModel().filtered);
    return (['waiting', 'processing', 'unread', 'failed'] as const).map((state) => ({ key: state, mark: STATE_MARK[state], tone: ({ waiting: 'waiting', processing: 'working', unread: 'unread', failed: 'failed' } as const)[state], count: counts[state], title: STATE_WORD[state] }));
  },
  Component: TerminalsSection,
  drawers: {
    notes: {
      useTitle: (id) => useApp((s) => s.app?.sessions.find((x) => x.id === id)?.name ?? 'Details'),
      Head: DetailsHead,
      Component: Details,
      // Back to the row it was opened from: its menu button, which is the control of the row.
      returnTo: (id) => document.querySelector<HTMLElement>(`[data-testid="list-row"][data-session="${id}"] [data-testid="row-more"]`) ?? document.querySelector<HTMLElement>('.list-rows'),
    },
  },
});
