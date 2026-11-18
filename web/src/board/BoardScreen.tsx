import { useEffect, useMemo, useRef, useState } from 'react';
import { openProjects, projectName, BOARD_ENDED_MAX, RUN_STATUS_WORDS, boardOf, howLong, isLive, versionOf, type ArchivedRun, type BoardCard, type BoardFilters, type RunStatus } from '@aubergine/shared';
import { api } from '../api';
import { currentProjectId, useApp } from '../store';
import { ApprovalControls } from '../workflows/ApprovalControls';
import { liveFilters, loadFilters, nextCard, saveFilters, type Box } from './board-model';
import { RunManyDialog } from './RunManyDialog';
import { MenuButton } from '../ui';

/**
 * The board: every run that is going, on every canvas, by workflow and by
 * element. It draws what `boardOf` returns from the page's own state, which
 * follows the change events; nothing here asks the server on a timer. The
 * runs that are over are read once when the board opens and again when a
 * live run ends.
 */

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function Card({ card, single, now, onGo, onView, named }: { card: BoardCard; single: boolean; now: number; onGo: (card: BoardCard) => void; onView: (runId: string) => void; named: ((projectId: string) => string) | null }) {
  // Looked up among everything: in the view of every project a card may be of another project.
  const run = useApp((s) => s.whole?.runs.find((r) => r.id === card.runId));
  const elements = useApp((s) => {
    const workflow = run ? s.whole?.workflows.find((w) => w.id === run.workflowId) : undefined;
    return workflow && run ? (versionOf(workflow, run.workflowVersion)?.elements ?? null) : null;
  });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`board-card status-${card.status}${card.waitsForPerson ? ' needs-you' : ''}`}
      title={card.sessionId ? `Go to “${card.sessionName}”${card.canvasName ? ` on ${card.canvasName}` : ''}` : 'This run has no terminal yet'}
      onClick={() => onGo(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onGo(card);
        }
      }}
      data-board-card={card.runId}
      data-testid="board-card"
      data-status={card.status}
      data-session={card.sessionId ?? ''}
    >
      <div className="board-card-head">
        <span className="board-card-name">
          {named && card.projectId ? <span data-testid="board-card-project">{named(card.projectId)} · </span> : null}
          {card.sessionName || 'no terminal yet'}
        </span>
        {card.canvasName && <span className="board-card-canvas">{card.canvasName}</span>}
      </div>
      {single && <div className="board-card-element">{card.elementName}</div>}
      <div className="board-card-facts">
        <span className="board-card-status" data-testid="board-card-status">
          {card.statusWords}
        </span>
        {card.since && <span title="How long it has been on this step"> · {howLong(card.since, now)}</span>}
        {card.quiet && <span title="The terminal has printed for a while with no report, so this may be behind"> · quiet</span>}
      </div>
      {card.blockedReason && <p className="board-card-reason">{card.blockedReason}</p>}
      {card.waitsForPerson && run && elements && <ApprovalControls run={run} elements={elements} compact />}
      <button
        type="button"
        className="quiet board-card-view"
        onClick={(e) => {
          e.stopPropagation();
          onView(card.runId);
        }}
        data-testid="board-card-view"
      >
        What it did
      </button>
    </div>
  );
}

export function BoardScreen() {
  const open = useApp((s) => s.panel === 'board');
  // This project's runs, or every project's: in the second view a card names its project.
  const [everywhere, setEverywhere] = useState(false);
  const app = useApp((s) => (everywhere ? s.whole : s.app));
  const whole = useApp((s) => s.whole);
  const here = useApp(currentProjectId);
  const severalProjects = (whole ? openProjects(whole).length : 0) > 1;
  const quietAfter = useApp((s) => s.settings.workflows.quietAfterSeconds);
  const [filters, setFilters] = useState<BoardFilters>(loadFilters);
  const [ended, setEnded] = useState<ArchivedRun[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [many, setMany] = useState(false);
  const body = useRef<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  // The board takes the keyboard when it opens, so that the arrows work at once.
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  // What is over, from the archive: when the board opens, and when the number of live runs changes (one ended, or began).
  const liveCount = app?.runs.length ?? 0;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .listEndedRunsPage(100)
      .then((page) => !cancelled && setEnded(page.items as ArchivedRun[]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, liveCount]);
  // "How long" moves on by itself. A timer, not animation frames: those stop in a tab that is not showing.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const runs = app?.runs;
  const workflows = app?.workflows;
  const sessions = app?.sessions;
  const canvases = app?.canvases;
  const shownFilters = useMemo(() => liveFilters(filters, { canvasIds: (canvases ?? []).map((c) => c.id), workflowIds: (workflows ?? []).map((w) => w.id) }), [filters, canvases, workflows]);
  const board = useMemo(
    () => (open && runs && workflows && sessions && canvases ? boardOf({ runs, workflows, sessions, canvases, ended: ended.filter((entry) => !isLive(entry.run.status)), now, quietAfterSeconds: quietAfter, filters: { ...shownFilters, ...(everywhere || !here ? {} : { projectId: here }) } }) : null),
    [open, runs, workflows, sessions, canvases, ended, now, quietAfter, shownFilters, everywhere, here],
  );
  // The choices of each filter: what the runs there are could be filtered by.
  const choices = useMemo(() => {
    const onRun = new Set((runs ?? []).flatMap((r) => (r.sessionId ? [r.sessionId] : [])));
    const tags = new Map<string, string>();
    for (const session of sessions ?? []) if (onRun.has(session.id)) for (const tag of session.tags) tags.set(tag.toLowerCase(), tag);
    const withRuns = new Set((runs ?? []).map((r) => r.workflowId));
    return {
      tags: [...tags.values()].sort((a, b) => a.localeCompare(b)),
      workflows: (workflows ?? []).filter((w) => w.listed && withRuns.has(w.id)).sort((a, b) => a.name.localeCompare(b.name)),
      statuses: [...new Set((runs ?? []).map((r) => r.status))] as RunStatus[],
    };
  }, [runs, sessions, workflows]);

  if (!open || !board) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const change = (next: BoardFilters): void => {
    setFilters(next);
    saveFilters(next);
  };
  const set = (key: keyof BoardFilters, value: string): void => {
    const { [key]: _dropped, ...rest } = shownFilters;
    change(value === '' ? rest : ({ ...rest, [key]: value } as BoardFilters));
  };
  const go = (card: BoardCard): void => {
    // A terminal that is parked, or a run with none yet, has nowhere to go to: its run is shown.
    if (card.sessionId === null || card.canvasId === null) return useApp.getState().viewRun(card.runId);
    close();
    useApp.getState().showSession(card.sessionId);
  };
  const view = (runId: string): void => useApp.getState().viewRun(runId);
  const filtered = Object.keys(shownFilters).length > 0;

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    const direction = ARROWS[e.key];
    const target = e.target as HTMLElement;
    // Arrows belong to a text field or a list of choices while one has the keyboard.
    if (!direction || target.closest('input, select, textarea')) return;
    const cards = [...(body.current?.querySelectorAll<HTMLElement>('[data-board-card]') ?? [])];
    const boxes: Box[] = cards.map((el) => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.boardCard ?? '', left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const from = target.closest<HTMLElement>('[data-board-card]')?.dataset.boardCard ?? '';
    const next = nextCard(boxes, from, direction);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    cards.find((el) => el.dataset.boardCard === next)?.focus();
  };

  const chosen = [shownFilters.canvasId, shownFilters.workflowId, shownFilters.status, shownFilters.tag].filter(Boolean).length;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="dialog sheet board-screen" role="dialog" aria-label="Board" data-testid="board" tabIndex={-1} ref={dialog}>
        <header className="sheet-head">
          <h2>
            Board
            <span className="board-summary" data-testid="board-summary">
              {board.summary}
            </span>
            {severalProjects && (
              <span className="list-scope" role="group" aria-label="Which projects">
                <button type="button" aria-pressed={!everywhere} onClick={() => setEverywhere(false)} data-testid="board-this-project">
                  This project
                </button>
                <button type="button" aria-pressed={everywhere} onClick={() => setEverywhere(true)} data-testid="board-every-project">
                  Every project
                </button>
              </span>
            )}
          </h2>
          <span>
            <button type="button" className="quiet" onClick={() => setMany(true)} data-testid="board-start-many">
              Start on several terminals…
            </button>
            <button type="button" className="quiet" onClick={close} data-testid="board-close">
              Close
            </button>
          </span>
        </header>
        <div className="board-filters" data-testid="board-filters">
          <MenuButton label={`Filter${chosen > 0 ? ` · ${chosen}` : ''}`} testid="board-filter-open" menuTestid="board-filter-menu" className="board-filter">
            <label className="ui-menu-line">
              <span>Canvas</span>
              <select aria-label="Canvas" value={shownFilters.canvasId ?? ''} onChange={(e) => set('canvasId', e.target.value)} data-testid="board-filter-canvas">
              <option value="">Every canvas</option>
              {(canvases ?? []).map((canvas) => (
                <option key={canvas.id} value={canvas.id}>
                  {canvas.name}
                </option>
              ))}
            </select>
            </label>
            <label className="ui-menu-line">
              <span>Workflow</span>
              <select aria-label="Workflow" value={shownFilters.workflowId ?? ''} onChange={(e) => set('workflowId', e.target.value)} data-testid="board-filter-workflow">
              <option value="">Every workflow</option>
              {choices.workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
            </label>
            <label className="ui-menu-line">
              <span>Status</span>
              <select aria-label="Status" value={shownFilters.status ?? ''} onChange={(e) => set('status', e.target.value)} data-testid="board-filter-status">
              <option value="">Every status</option>
              {[...new Set([...choices.statuses, ...(shownFilters.status ? [shownFilters.status] : [])])].map((status) => (
                <option key={status} value={status}>
                  {RUN_STATUS_WORDS[status]}
                </option>
              ))}
            </select>
            </label>
            <label className="ui-menu-line">
              <span>Tag</span>
              <select aria-label="Tag" value={shownFilters.tag ?? ''} onChange={(e) => set('tag', e.target.value)} data-testid="board-filter-tag">
              <option value="">Every tag</option>
              {[...new Set([...choices.tags, ...(shownFilters.tag ? [shownFilters.tag] : [])])].map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
            </label>
          </MenuButton>
          {filtered && (
            <button type="button" className="quiet" onClick={() => change({})} data-testid="board-filters-clear">
              Show everything
            </button>
          )}
        </div>
        <div className="board-body" ref={body} title="Arrows move between cards; Enter goes to the terminal.">
          {board.groups.length === 0 && (
            <p className="list-empty" data-testid="board-empty">
              {filtered ? 'No run matches these filters.' : 'No runs are going. Put a terminal on a workflow with “Run workflow…”, or start one on several terminals from here.'}
            </p>
          )}
          {board.groups.map((group) => (
            <section key={group.key} className="board-group" data-testid="board-group" data-workflow={group.workflowId ?? 'single'}>
              <h3>
                {group.workflowName}
                {group.version !== null && <span className="board-version"> · version {group.version}</span>}
              </h3>
              {group.queued.length > 0 && (
                <div className="board-queued">
                  <span className="wf-label">Waiting for a terminal</span>
                  {group.queued.map((card) => (
                    <Card key={card.runId} card={card} single={group.single} now={now} onGo={go} onView={view} named={everywhere && whole ? (projectId) => projectName(whole, projectId) : null} />
                  ))}
                </div>
              )}
              <div className="board-columns">
                {group.columns.map((column, index) => (
                  <div key={column.elementId} className={`board-column${column.waitsForPerson ? ' waits-for-person' : ''}`} data-testid="board-column" data-element={column.elementId}>
                    <div className="board-column-head">
                      <span>{group.single ? column.name : `${index + 1}. ${column.name}`}</span>
                      {column.waitsForPerson && <span className="board-column-mark" title="A run stops here until you approve it or send it back">you decide</span>}
                      <span className="board-column-count">{column.cards.length > 0 ? column.cards.length : ''}</span>
                    </div>
                    {column.cards.map((card) => (
                      <Card key={card.runId} card={card} single={group.single} now={now} onGo={go} onView={view} named={everywhere && whole ? (projectId) => projectName(whole, projectId) : null} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {board.ended.length > 0 && (
            <section className="board-group board-ended" data-testid="board-ended">
              <h3>Over in the last day</h3>
              <ul>
                {board.ended.map((card) => (
                  <li key={card.runId}>
                    <button type="button" className="quiet" onClick={() => view(card.runId)} data-testid="board-ended-row">
                      {card.sessionName || 'a terminal that is gone'} · {card.workflowName} · {card.statusWords}
                      {card.finishedAt ? ` · ${howLong(card.finishedAt, now)} ago` : ''}
                    </button>
                  </li>
                ))}
              </ul>
              {board.endedCut && <p className="sheet-note">These are the newest {BOARD_ENDED_MAX}; there are more.</p>}
            </section>
          )}
        </div>
      </div>
      {many && <RunManyDialog onClose={() => setMany(false)} />}
    </div>
  );
}
