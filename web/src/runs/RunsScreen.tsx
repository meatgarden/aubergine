import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_ENDED_MAX,
  BUSY_STATES,
  QUEUE_LIMIT_DEFAULT,
  QUEUE_LIMIT_MAX,
  RUN_STATUS_WORDS,
  boardOf,
  forYou,
  howLong,
  isLive,
  openProjects,
  projectName,
  queueSettingsOf,
  queueWords,
  runLanesOf,
  stateOf,
  waitingTasks,
  type ArchivedRun,
  type BoardCard,
  type BoardFilters,
  type RunStatus,
  type Task,
} from '@aubergine/shared';
import { api } from '../api';
import type { RunsTab } from '../address';
import { ARROWS, Card } from '../board/BoardScreen';
import { liveFilters, loadFilters, nextCard, saveFilters, type Box } from '../board/board-model';
import { RunManyDialog } from '../board/RunManyDialog';
import { PageFlow } from '../page-flow';
import { ForYouRow } from '../queue/ForYouRow';
import { ReviewLine, Rules, TaskRow } from '../queue/QueueScreen';
import { Schedules } from '../queue/Schedules';
import { TaskForm, type TaskDraft } from '../queue/TaskForm';
import { currentProjectId, useApp } from '../store';
import { FirstSteps, MenuButton, Page, Tabs } from '../ui';
import { useEndedRuns } from '../workflows/ended-runs';

/**
 * Runs: what the Queue and the Board showed, as one page. Work moves left to right through four columns: waiting to
 * start, running, waiting for you, done. A task is shown as its task until it is over; a run that no task stands for
 * is a card (`runLanesOf`, from what `boardOf` returns); what waits on the owner is the owner's list (`forYou`).
 * "By step" is the board's own view: each workflow, with a column for each of its steps. Schedules and rules are tabs.
 *
 * It draws from the page's own state, which follows the change events; nothing here asks the server on a timer. The
 * runs and tasks that are over are read when the page opens and when the number of live ones changes.
 */
export function RunsScreen() {
  const open = useApp((s) => s.page === 'runs');
  const tab = useApp((s) => s.runsTab);
  const setTab = useApp((s) => s.setRunsTab);
  // This project's runs, or every project's: in the second view a card and a row name their project.
  const [everywhere, setEverywhere] = useState(false);
  const app = useApp((s) => s.app);
  const shownApp = useApp((s) => (everywhere ? s.whole : s.app));
  const whole = useApp((s) => s.whole);
  const here = useApp(currentProjectId);
  const severalProjects = (whole ? openProjects(whole).length : 0) > 1;
  const ended = useEndedRuns((e) => e.items);
  const quietAfter = useApp((s) => s.settings.workflows.quietAfterSeconds);
  const scheduleCount = useApp((s) => s.app?.schedules.items.length ?? 0);
  const ruleCount = useApp((s) => s.app?.queue.rules.length ?? 0);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [written, setWritten] = useState('');
  const [put, setPut] = useState<Task[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [filters, setFilters] = useState<BoardFilters>(loadFilters);
  const [over, setOver] = useState<ArchivedRun[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [many, setMany] = useState(false);
  const body = useRef<HTMLDivElement | null>(null);

  // Of the project being looked at: its tasks, and how its tasks are started.
  const view = useMemo(() => (app && here ? stateOf(app, here) : null), [app, here]);
  const queue = view && here ? { ...view.queue, ...queueSettingsOf(view.queue, here) } : undefined;
  const taskCount = queue?.tasks.length ?? 0;
  const liveCount = shownApp?.runs.length ?? 0;
  // What is over: tasks put away, for "done today"; runs from the archive, for the last day.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.endedTasks().then(
      (page) => !cancelled && setPut(page.items as Task[]),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [open, taskCount]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .listEndedRunsPage(100)
      .then((page) => !cancelled && setOver(page.items as ArchivedRun[]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, liveCount]);
  useEffect(() => {
    if (open) setSaid(null);
  }, [open]);
  // "How long" moves on by itself. A timer, not animation frames: those stop in a tab that is not showing.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const runs = shownApp?.runs;
  const workflows = shownApp?.workflows;
  const sessions = shownApp?.sessions;
  const canvases = shownApp?.canvases;
  const shownFilters = useMemo(() => liveFilters(filters, { canvasIds: (canvases ?? []).map((c) => c.id), workflowIds: (workflows ?? []).map((w) => w.id) }), [filters, canvases, workflows]);
  // The columns show everything; the filters are the view by workflow's.
  const input = useMemo(
    () => (open && runs && workflows && sessions && canvases ? { runs, workflows, sessions, canvases, ended: over.filter((entry) => !isLive(entry.run.status)), now, quietAfterSeconds: quietAfter, scope: everywhere || !here ? {} : { projectId: here } } : null),
    [open, runs, workflows, sessions, canvases, over, now, quietAfter, everywhere, here],
  );
  const board = useMemo(() => (input ? boardOf({ ...input, filters: { ...shownFilters, ...input.scope } }) : null), [input, shownFilters]);
  const everyRun = useMemo(() => (input ? boardOf({ ...input, filters: input.scope }) : null), [input]);
  const list = useMemo(() => (open && app && whole ? forYou(whole, Date.now(), ended, everywhere && severalProjects ? null : here) : null), [open, app, whole, ended, here, everywhere, severalProjects]);
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

  if (!open || !app || !queue || !list || !board || !everyRun) return null;
  const close = (): void => useApp.getState().showPage(null);
  const busy = queue.tasks.filter((task) => BUSY_STATES.includes(task.state)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const next = waitingTasks(queue.tasks);
  const today = new Date().toDateString();
  const finished = [...queue.tasks.filter((task) => task.state === 'done' || task.state === 'failed'), ...put.filter((task) => task.endedAt !== null && new Date(task.endedAt).toDateString() === today && !queue.tasks.some((t) => t.id === task.id))].sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const taskRunIds = new Set([...queue.tasks, ...put].flatMap((task) => (task.runId ? [task.runId] : [])));
  const lanes = runLanesOf(everyRun, taskRunIds);
  const nothingYet = busy.length + next.length + finished.length === 0 && everyRun.groups.length === 0 && everyRun.ended.length === 0;
  const say = (work: Promise<{ says?: string } | unknown>): void => void work.then((answer) => setSaid((answer as { says?: string }).says ?? null), (e: unknown) => setSaid((e as Error).message));
  const move = (task: Task, by: -1 | 1): void => {
    const ids = next.map((t) => t.id);
    const at = ids.indexOf(task.id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    ids.splice(at, 1);
    ids.splice(to, 0, task.id);
    say(api.reorderTasks(ids));
  };
  const dropOn = (target: Task, draggedId: string): void => {
    const ids = next.map((t) => t.id).filter((id) => id !== draggedId);
    const at = ids.indexOf(target.id);
    if (at < 0 || draggedId === target.id) return;
    ids.splice(at, 0, draggedId);
    say(api.reorderTasks(ids));
  };
  const change = (chosen: BoardFilters): void => {
    setFilters(chosen);
    saveFilters(chosen);
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
  const showRun = (runId: string): void => useApp.getState().viewRun(runId);
  const named = everywhere && whole ? (projectId: string) => projectName(whole, projectId) : null;
  const filtered = Object.keys(shownFilters).length > 0;
  const chosen = [shownFilters.canvasId, shownFilters.workflowId, shownFilters.status, shownFilters.tag].filter(Boolean).length;
  const newTask = (): void => setDraft({ titles: [''], details: '', sources: [{ kind: 'hand' }] });

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    // The arrows move between cards, as on a board; they belong to a text field or a list of choices that has the keyboard.
    const direction = ARROWS[e.key];
    const target = e.target as HTMLElement;
    if (!direction || target.closest('input, select, textarea')) return;
    const cards = [...(body.current?.querySelectorAll<HTMLElement>('[data-board-card]') ?? [])];
    const boxes: Box[] = cards.map((el) => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.boardCard ?? '', left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    const from = target.closest<HTMLElement>('[data-board-card]')?.dataset.boardCard ?? '';
    const found = nextCard(boxes, from, direction);
    if (found === null) return;
    e.preventDefault();
    e.stopPropagation();
    cards.find((el) => el.dataset.boardCard === found)?.focus();
  };

  const lane = (key: string, title: string, says: React.ReactNode, children: React.ReactNode) => (
    <section className="runs-lane" aria-label={title} data-testid="runs-lane" data-lane={key}>
      <h3>
        {title} {says}
      </h3>
      {children}
    </section>
  );

  return (
    <>
      <Page
        name="runs"
        title="Runs"
        line="Work for agents, from waiting to done: tasks waiting to start, runs going now, what waits for you, and what is finished."
        flow={<PageFlow here="runs" />}
        summary={
          <span className="board-summary" data-testid="board-summary">
            {board.summary}
          </span>
        }
        label="Runs"
        testid="runs-screen"
        className="runs-screen"
        wide
        onKeyDown={onKeyDown}
        tabs={
          <Tabs
            label="What this page shows"
            value={tab}
            onChange={(value: RunsTab) => setTab(value)}
            tabs={[
              { value: 'runs', label: 'Runs', testid: 'queue-tab-queue' },
              { value: 'workflow', label: 'By step', testid: 'runs-tab-workflow' },
              { value: 'schedules', label: `Schedules${scheduleCount > 0 ? ` ${scheduleCount}` : ''}`, testid: 'queue-tab-schedules' },
              { value: 'rules', label: `Rules${ruleCount > 0 ? ` ${ruleCount}` : ''}`, testid: 'queue-tab-rules' },
            ]}
          />
        }
        actions={
          <span className="queue-bar" data-testid="queue-bar">
            {severalProjects && (
              <span className="list-scope" role="group" aria-label="Which projects">
                <button type="button" aria-pressed={!everywhere} onClick={() => setEverywhere(false)} data-testid="runs-this-project">
                  This project
                </button>
                <button type="button" aria-pressed={everywhere} onClick={() => setEverywhere(true)} data-testid="runs-every-project">
                  Every project
                </button>
              </span>
            )}
            <button type="button" onClick={() => setMany(true)} data-testid="board-start-many">
              Start on several terminals…
            </button>
            <button type="button" disabled={queue.hold} onClick={() => say(api.startTasks())} data-testid="queue-start-next">
              Start next
            </button>
            <button type="button" className="primary" onClick={newTask} data-testid="queue-add">
              Add task
            </button>
          </span>
        }
      >
        {tab === 'schedules' && <Schedules />}
        {tab === 'rules' && <Rules />}
        {tab === 'runs' && (
          <>
            <ReviewLine />
            {nothingYet && (
              <FirstSteps
                testid="queue-empty"
                title="Work moves from left to right."
                steps={['Add a task: one sentence of what to do. It waits to start.', 'When an agent is free, it takes the next task, which runs as a workflow.', 'What needs you, an approval or a question, waits for you; then it is done.']}
                action={
                  <button type="button" onClick={() => setDraft({ titles: ['Write a short README for this folder'], details: '', sources: [{ kind: 'hand' }] })} data-testid="queue-empty-add">
                    Add a task
                  </button>
                }
              />
            )}
            {said && (
              <p className="sheet-note" role="status" data-testid="queue-said">
                {said}
              </p>
            )}
            <div className="runs-lanes" ref={body} data-testid="runs-lanes">
              {lane(
                'waiting',
                'Waiting to start',
                <span className="board-summary" data-testid="queue-summary">
                  {queueWords(queue.tasks)}
                </span>,
                <>
                  {/* How tasks start matters once there is one: shown from the first task on, or as soon as any of it was changed. */}
                  {(busy.length + next.length + finished.length > 0 || queue.hold || queue.automatic || queue.limit !== QUEUE_LIMIT_DEFAULT) && (
                    <details className="ui-fold queue-starts" data-testid="queue-starts">
                      <summary>
                        Starting tasks{' '}
                        <span className="ui-meta" data-testid="queue-starts-says">
                          {queue.limit} at a time · {queue.hold ? 'on hold' : queue.automatic ? 'the next one starts by itself' : 'you start each one'}
                        </span>
                      </summary>
                      <div className="queue-settings">
                        <label className="wf-inline">
                          <span>At most</span>
                          <input type="number" min={1} max={QUEUE_LIMIT_MAX} value={queue.limit} onChange={(e) => Number(e.target.value) >= 1 && say(api.changeQueue({ limit: Math.min(QUEUE_LIMIT_MAX, Math.round(Number(e.target.value))) }))} aria-label="How many at once" data-testid="queue-limit" />
                          <span>at once</span>
                        </label>
                        <label className="wf-inline" title="No new task is started while this is on. What is running is not touched.">
                          <input type="checkbox" checked={queue.hold} onChange={(e) => say(api.changeQueue({ hold: e.target.checked }))} data-testid="queue-hold" />
                          <span>Hold: start nothing new</span>
                        </label>
                        <label className="wf-inline" title="A task starts by itself when a place is free and someone can take it. Off: nothing starts until you press Start next.">
                          <input type="checkbox" checked={queue.automatic} onChange={(e) => say(api.changeQueue({ automatic: e.target.checked }))} data-testid="queue-automatic" />
                          <span>Start by itself when a place is free</span>
                        </label>
                      </div>
                    </details>
                  )}
                  {next.length > 1 && <p className="sheet-note">In this order; drag, or Alt with an arrow on a row, to change it.</p>}
                  <ul className="task-list" data-testid="queue-next">
                    {next.map((task) => (
                      <TaskRow key={task.id} task={task} waiting onMove={(by) => move(task, by)} onDropOn={(dragged) => dropOn(task, dragged)} />
                    ))}
                  </ul>
                  {lanes.waiting.map((card) => (
                    <Card key={card.runId} card={card} single now={now} onGo={go} onView={showRun} named={named} />
                  ))}
                  {next.length + lanes.waiting.length === 0 && <p className="list-empty">Nothing waits to start.</p>}
                </>,
              )}
              {lane(
                'running',
                'Running',
                null,
                <>
                  <ul className="task-list" data-testid="queue-working">
                    {busy.map((task) => (
                      <TaskRow key={task.id} task={task} waiting={false} />
                    ))}
                  </ul>
                  {lanes.running.map((card) => (
                    <Card key={card.runId} card={card} single now={now} onGo={go} onView={showRun} named={named} />
                  ))}
                  {busy.length + lanes.running.length === 0 && <p className="list-empty">Nothing is running.</p>}
                </>,
              )}
              {lane(
                'you',
                'Waiting for you',
                <span className="board-summary" data-testid="foryou-summary">
                  {list.summary}
                </span>,
                <>
                  {severalProjects && (
                    <div className="list-scope" role="group" aria-label="Which projects">
                      <button type="button" aria-pressed={!everywhere} onClick={() => setEverywhere(false)} data-testid="foryou-this-project">
                        This project
                      </button>
                      <button type="button" aria-pressed={everywhere} onClick={() => setEverywhere(true)} data-testid="foryou-every-project">
                        Every project
                      </button>
                    </div>
                  )}
                  <div className="queue-write">
                    <input value={written} maxLength={1000} placeholder="Add a to-do for yourself…" aria-label="Add a to-do for yourself" onChange={(e) => setWritten(e.target.value)} data-testid="foryou-write" />
                    <button
                      type="button"
                      disabled={written.trim() === ''}
                      onClick={() => {
                        void api.addAsk(written.trim()).then(() => setWritten(''), (e: unknown) => setSaid((e as Error).message));
                      }}
                      data-testid="foryou-add"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="foryou-list">
                    {list.items.map((item) => (
                      <ForYouRow key={item.id} item={item} onSend={setDraft} named={everywhere && severalProjects} />
                    ))}
                  </ul>
                </>,
              )}
              {lane(
                'done',
                'Done',
                null,
                <>
                  <ul className="task-list" data-testid="queue-finished">
                    {finished.map((task) => (
                      <TaskRow key={task.id} task={task} waiting={false} />
                    ))}
                  </ul>
                  <ul className="runs-done" data-testid="board-ended">
                    {lanes.ended.map((card) => (
                      <li key={card.runId}>
                        <button type="button" className="quiet" onClick={() => showRun(card.runId)} data-testid="board-ended-row">
                          {card.sessionName || 'a terminal that is gone'} · {card.workflowName} · {card.statusWords}
                          {card.finishedAt ? ` · ${howLong(card.finishedAt, now)} ago` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {everyRun.endedCut && <p className="sheet-note">These are the newest {BOARD_ENDED_MAX}; there are more.</p>}
                  {finished.length + lanes.ended.length === 0 && <p className="list-empty">Nothing finished today.</p>}
                </>,
              )}
            </div>
          </>
        )}
        {tab === 'workflow' && (
          <>
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
                    {[...new Set([...choices.tags, ...(shownFilters.tag ? [shownFilters.tag] : [])])].map((tagName) => (
                      <option key={tagName} value={tagName}>
                        #{tagName}
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
              {board.groups.length === 0 &&
                (filtered ? (
                  <p className="list-empty" data-testid="board-empty">
                    No run matches these filters.
                  </p>
                ) : (
                  <FirstSteps
                    testid="board-empty"
                    title="By step, a run is in the column of the step it is on."
                    steps={['Start a workflow on a terminal that runs an agent: that is a run.', 'Each run is a card, in the column of the step it is on.', 'A step that waits for you says so: approve it, or send it back.']}
                    action={
                      <button type="button" onClick={() => setMany(true)} data-testid="board-empty-start">
                        Start a workflow…
                      </button>
                    }
                  />
                ))}
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
                        <Card key={card.runId} card={card} single={group.single} now={now} onGo={go} onView={showRun} named={named} />
                      ))}
                    </div>
                  )}
                  <div className="board-columns">
                    {group.columns.map((column, index) => (
                      <div key={column.elementId} className={`board-column${column.waitsForPerson ? ' waits-for-person' : ''}`} data-testid="board-column" data-element={column.elementId}>
                        <div className="board-column-head">
                          <span>{group.single ? column.name : `${index + 1}. ${column.name}`}</span>
                          {column.waitsForPerson && (
                            <span className="board-column-mark" title="A run stops here until you approve it or send it back">
                              you decide
                            </span>
                          )}
                          <span className="board-column-count">{column.cards.length > 0 ? column.cards.length : ''}</span>
                        </div>
                        {column.cards.map((card) => (
                          <Card key={card.runId} card={card} single={group.single} now={now} onGo={go} onView={showRun} named={named} />
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </Page>
      {draft && <TaskForm draft={draft} onClose={() => setDraft(null)} />}
      {many && <RunManyDialog onClose={() => setMany(false)} />}
    </>
  );
}
