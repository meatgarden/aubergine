import { useEffect, useMemo, useState } from 'react';
import { openProjects, queueSettingsOf, stateOf, BUSY_STATES, QUEUE_LIMIT_MAX, RULE_EVENT_WORDS, RuleEvent, TASK_STATE_WORDS, addedByWords, forYou, queueWords, sourceWords, waitingTasks, type ForYouItem, type RuleAction, type RuleList, type Run, type Task } from '@aubergine/shared';
import { api } from '../api';
import { notificationsWanted, setNotificationsWanted } from '../attention';
import { currentProjectId, useApp } from '../store';
import { useEndedRuns } from '../workflows/ended-runs';
import { actionView } from './action-views';
import { Schedules } from './Schedules';
import { TaskForm, type TaskDraft } from './TaskForm';
import { ScreenHead, Tabs } from '../ui';
import { itemsOfListing, useRepositoryListing } from '../review/repository-source';
import { runCommand } from '../commands';

/**
 * Two lists side by side. On the left, what waits on the owner: gathered by
 * `forYou` from the page's own state, which follows the change events. On
 * the right, the queue of tasks for agents. Nothing here asks the server on
 * a timer, and nothing here knows a kind of item, of source or of action by
 * name: a row shows what its item says, and offers what its item allows.
 */

/** Where one acts on an item: its address, understood here and by the command line alike. */
export function goTo(act: string): void {
  const [what, id] = act.split(':');
  const store = useApp.getState();
  if (what === 'run' && id) store.viewRun(id);
  else if (what === 'session' && id) {
    store.togglePanel(null);
    store.showSession(id);
  } else if (what === 'copy' && id) store.viewEnvironment(id);
  else if (what === 'review') store.togglePanel('review');
  else if (store.panel !== 'queue') store.togglePanel('queue');
}

/** The lines of a list a run handed in that the owner ticked. */
function tickedLines(run: Run | undefined, elementId: string | null): { item: number; text: string }[] {
  const entry = run?.elements.find((e) => e.elementId === elementId);
  const items = (entry?.output as { items?: { text?: unknown }[] } | null | undefined)?.items;
  if (!entry || !Array.isArray(items)) return [];
  return entry.ticks.flatMap((tick) => (typeof items[tick.item]?.text === 'string' ? [{ item: tick.item, text: items[tick.item]?.text as string }] : []));
}

function ForYouRow({ item, onSend, named }: { item: ForYouItem; onSend: (draft: TaskDraft) => void; named: boolean }) {
  // Looked up among everything: in the view of every project a row may be about another project's task or run.
  const task = useApp((s) => (item.taskId ? s.whole?.queue.tasks.find((t) => t.id === item.taskId) : undefined));
  const liveRun = useApp((s) => (item.runId ? s.whole?.runs.find((r) => r.id === item.runId) : undefined));
  const project = useApp((s) => (named && item.projectId ? s.whole?.projects.find((p) => p.id === item.projectId)?.name : undefined));
  const endedRun = useEndedRuns((e) => (item.runId ? e.items.find((entry) => entry.run.id === item.runId)?.run : undefined));
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      useApp.getState().setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ticked = item.elementId ? tickedLines(liveRun ?? endedRun, item.elementId) : [];
  const opens = item.askId === null && !(task && (task.state === 'proposed' || task.state === 'done' || task.state === 'failed'));
  return (
    <li
      className={`foryou-row${item.waits ? ' waits' : ''}${opens ? ' is-pressed' : ''}`}
      // Where the one thing to do is to go and look, the card is pressed as a whole.
      role={opens ? 'button' : undefined}
      tabIndex={opens ? 0 : undefined}
      // A control inside the card does its own thing and nothing more.
      onClick={opens ? (e) => !(e.target as HTMLElement).closest('button, a, input, select, textarea, label') && goTo(item.act) : undefined}
      onKeyDown={opens ? (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && goTo(item.act) : undefined}
      data-testid="foryou-row"
      data-kind={item.kind}
      data-opens={opens ? 'true' : undefined}
    >
      <div className="foryou-head">
        <span className="foryou-kind">{item.title}</span>
        <span className="foryou-from">
          {project ? <span data-testid="foryou-project">{project} · </span> : null}from {item.from}
        </span>
      </div>
      <p className="foryou-sentence">{item.sentence}</p>
      <div className="foryou-actions">
        {/* What was written is ticked off by the owner; what was gathered is opened where one acts on it. */}
        {item.askId !== null ? (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => api.askDo(item.askId as string, 'done'))} data-testid="ask-done">
              Done
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => onSend({ titles: [item.sentence.split('\n')[0]?.slice(0, 120) ?? ''], details: item.sentence.split('\n').slice(1).join('\n').trim(), sources: [{ kind: 'hand' }], after: () => api.askDo(item.askId as string, 'done').then(() => {}) })} data-testid="ask-to-queue">
              To the queue…
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.askDo(item.askId as string, 'dismiss'))} data-testid="ask-dismiss">
              Dismiss
            </button>
          </>
        ) : task && task.state === 'proposed' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'accept'))} data-testid="task-accept">
              Accept
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'decline'))} data-testid="task-decline">
              Decline
            </button>
          </>
        ) : task && (task.state === 'done' || task.state === 'failed') ? (
          <>
            {item.runId && (
              <button type="button" className="quiet" onClick={() => goTo(`run:${item.runId}`)} data-testid="foryou-open">
                What it did
              </button>
            )}
            {task.state === 'failed' && (
              <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'again'))} data-testid="task-again">
                Put it back in the queue
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'clear'))} data-testid="task-clear">
              Looked at
            </button>
          </>
        ) : null}
        {ticked.length > 0 && (
          <button type="button" className="quiet" onClick={() => onSend({ titles: ticked.map((line) => line.text.slice(0, 120)), details: '', sources: ticked.map((line) => ({ kind: 'checklist', from: item.from, runId: item.runId, elementId: item.elementId, item: line.item })) })} data-testid="checklist-to-queue">
            Send {ticked.length} ticked {ticked.length === 1 ? 'line' : 'lines'} to the queue…
          </button>
        )}
      </div>
    </li>
  );
}

function TaskRow({ task, waiting, onMove, onDropOn }: { task: Task; waiting: boolean; onMove?: (by: -1 | 1) => void; onDropOn?: (draggedId: string) => void }) {
  const session = useApp((s) => (task.sessionId ? s.app?.sessions.find((x) => x.id === task.sessionId) : undefined));
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      useApp.getState().setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className={`task-row state-${task.state}`}
      tabIndex={waiting ? 0 : undefined}
      draggable={waiting}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
      onDragOver={(e) => waiting && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn?.(e.dataTransfer.getData('text/plain'));
      }}
      onKeyDown={(e) => {
        // With the row itself in hand: Alt and an arrow move it up or down the order.
        if (!waiting || e.target !== e.currentTarget || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        e.stopPropagation();
        onMove?.(e.key === 'ArrowUp' ? -1 : 1);
      }}
      data-testid="task-row"
      data-state={task.state}
      data-task={task.id}
    >
      <div className="task-head">
        <span className="task-title">{task.title}</span>
        <span className="task-state" data-testid="task-state">
          {TASK_STATE_WORDS[task.state]}
        </span>
      </div>
      <div className="task-facts">
        added by {addedByWords(task.addedBy)}, {sourceWords(task.source)}
        {session ? ` · on “${session.name}”` : ''}
        {task.labels.length > 0 ? ` · ${task.labels.map((label) => `#${label}`).join(' ')}` : ''}
      </div>
      {task.reason && <p className="task-reason">{task.reason}</p>}
      <div className="foryou-actions">
        {waiting && (
          <>
            <button type="button" className="quiet" aria-label={`Move “${task.title}” up`} onClick={() => onMove?.(-1)} data-testid="task-up">
              ↑
            </button>
            <button type="button" className="quiet" aria-label={`Move “${task.title}” down`} onClick={() => onMove?.(1)} data-testid="task-down">
              ↓
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.startTasks(task.id).then((started) => useApp.getState().setNotice(started.started.some((s) => s.ok) ? null : started.says)))} data-testid="task-start">
              Start this one
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'withdraw'))} data-testid="task-withdraw">
              Withdraw
            </button>
          </>
        )}
        {task.runId && BUSY_STATES.includes(task.state) && (
          <button type="button" className="quiet" onClick={() => useApp.getState().viewRun(task.runId)}>
            Its run
          </button>
        )}
        {session && BUSY_STATES.includes(task.state) && (
          <button type="button" className="quiet" onClick={() => goTo(`session:${session.id}`)}>
            Go to “{session.name}”
          </button>
        )}
      </div>
    </li>
  );
}

function Rules() {
  const count = useApp((s) => s.app?.queue.rules.length ?? 0);
  const [list, setList] = useState<RuleList | null>(null);
  const [event, setEvent] = useState<RuleEvent>('task.done');
  const [action, setAction] = useState<RuleAction>({ kind: 'notify' });
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsWanted);
  // Read when the screen opens and when the number of rules changes: the sentences are the server's.
  useEffect(() => {
    let cancelled = false;
    void api.listRules().then(
      (found) => !cancelled && setList(found as RuleList),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [count]);
  const Fields = actionView(action.kind)?.Fields;
  return (
    <section className="queue-part queue-rules" data-testid="queue-rules">
      <p className="ui-meta">When something happens, do something.</p>
      <ul>
        {(list?.rules ?? []).map((rule) => (
          <li key={rule.id} data-testid="rule-row" data-on={rule.on}>
            <span>{rule.says}</span>
            <label title="A rule that is off is kept and does nothing. A rule that came in a project file arrives off.">
              <input type="checkbox" checked={rule.on} aria-label={`The rule is switched on: ${rule.says}`} onChange={(e) => void api.switchRule(rule.id, e.target.checked).then((found) => setList(found as RuleList), (error: unknown) => setError((error as Error).message))} data-testid="rule-on" /> On
            </label>
            <button type="button" className="quiet" aria-label={`Remove the rule: ${rule.says}`} onClick={() => void api.removeRule(rule.id).catch((e: unknown) => setError((e as Error).message))} data-testid="rule-remove">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="queue-rule-form">
        <span>When</span>
        <select aria-label="When" value={event} onChange={(e) => setEvent(e.target.value as RuleEvent)} data-testid="rule-event">
          {RuleEvent.options.map((option) => (
            <option key={option} value={option}>
              {RULE_EVENT_WORDS[option]}
            </option>
          ))}
        </select>
        <select aria-label="Then" value={action.kind} onChange={(e) => setAction(actionView(e.target.value)?.blank() ?? { kind: e.target.value })} data-testid="rule-action">
          {(list?.actions ?? []).map((kind) => (
            <option key={kind.kind} value={kind.kind} title={kind.says}>
              {kind.title.toLowerCase()}
            </option>
          ))}
        </select>
        {Fields && <Fields action={action} onChange={setAction} />}
        <button
          type="button"
          onClick={() => {
            setError(null);
            void api.addRule({ event, action }).catch((e: unknown) => setError((e as Error).message));
          }}
          data-testid="rule-add"
        >
          Add the rule
        </button>
      </div>
      <p className="sheet-note">{list?.actions.find((kind) => kind.kind === action.kind)?.says}</p>
      <p className="sheet-note">
        A notification is shown by this page, and only if you allowed it here.{' '}
        <button type="button" className="quiet" aria-pressed={notify} onClick={() => void setNotificationsWanted(!notify).then(setNotify)} data-testid="rule-allow-notify">
          {notify ? 'Notifications are on' : 'Allow notifications'}
        </button>
      </p>
      {error && <p className="dialog-error">{error}</p>}
    </section>
  );
}

/** What waits to be read before it can be used: said in a line of the owner's list, with the way to the review. */
function ReviewLine() {
  const drafts = useApp((s) => (s.app?.drafts ?? []).filter((d) => d.status === 'waiting').length);
  // Workflow files in repositories that were never accepted, or changed since.
  const files = itemsOfListing(useRepositoryListing()).length;
  if (drafts + files === 0) return null;
  return (
    <p className="ui-notice" data-testid="drafts-waiting">
      {drafts + files} to read before {drafts + files === 1 ? 'it' : 'they'} can be used.
      <button type="button" onClick={() => runCommand('drafts.review')} data-testid="review-open">
        Review
      </button>
    </p>
  );
}

export function QueueScreen() {
  const open = useApp((s) => s.panel === 'queue');
  const app = useApp((s) => s.app);
  const ended = useEndedRuns((e) => e.items);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [written, setWritten] = useState('');
  const [put, setPut] = useState<Task[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [part, setPart] = useState<'queue' | 'schedules' | 'rules'>('queue');
  const scheduleCount = useApp((s) => s.app?.schedules.items.length ?? 0);
  const ruleCount = useApp((s) => s.app?.queue.rules.length ?? 0);

  // Of the project being looked at: its tasks, its list, and how its tasks are started.
  const projectId = useApp(currentProjectId);
  const view = useMemo(() => (app && projectId ? stateOf(app, projectId) : null), [app, projectId]);
  const queue = view && projectId ? { ...view.queue, ...queueSettingsOf(view.queue, projectId) } : undefined;
  // Tasks that were put away, for "finished today": read when the screen opens and when the number of tasks changes.
  const taskCount = queue?.tasks.length ?? 0;
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
    if (open) setSaid(null);
  }, [open]);

  // The owner's list has two views: this project, and everything. In the second, each row names its project.
  const whole = useApp((s) => s.whole);
  const [everywhere, setEverywhere] = useState(false);
  const severalProjects = (whole ? openProjects(whole).length : 0) > 1;
  const list = useMemo(() => (open && app && whole ? forYou(whole, Date.now(), ended, everywhere && severalProjects ? null : projectId) : null), [open, app, whole, ended, projectId, everywhere, severalProjects]);
  if (!open || !app || !queue || !list) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const busy = queue.tasks.filter((task) => BUSY_STATES.includes(task.state)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const next = waitingTasks(queue.tasks);
  const today = new Date().toDateString();
  const finished = [...queue.tasks.filter((task) => task.state === 'done' || task.state === 'failed'), ...put.filter((task) => task.endedAt !== null && new Date(task.endedAt).toDateString() === today && !queue.tasks.some((t) => t.id === task.id))].sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
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
      <div className="dialog sheet queue-screen" role="dialog" aria-label="Queue and For you" data-testid="queue-screen">
        <ScreenHead title="Queue" onClose={close} closeTestid="queue-close" />
        <div className="ui-bar">
          <Tabs
            label="What this screen shows"
            value={part}
            onChange={setPart}
            tabs={[
              { value: 'queue', label: 'Queue', testid: 'queue-tab-queue' },
              { value: 'schedules', label: `Schedules${scheduleCount > 0 ? ` ${scheduleCount}` : ''}`, testid: 'queue-tab-schedules' },
              { value: 'rules', label: `Rules${ruleCount > 0 ? ` ${ruleCount}` : ''}`, testid: 'queue-tab-rules' },
            ]}
          />
        </div>
        {part === 'schedules' && <Schedules />}
        {part === 'rules' && <Rules />}
        {part === 'queue' && (
        <div className="queue-columns">
          <section className="queue-foryou ui-card" aria-label="For you">
            <h3>
              For you <span className="board-summary" data-testid="foryou-summary">{list.summary}</span>
            </h3>
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
              <input value={written} maxLength={1000} placeholder="Write something to do yourself…" aria-label="Write on your list" onChange={(e) => setWritten(e.target.value)} data-testid="foryou-write" />
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
            <ReviewLine />
            {list.items.length === 0 && <p className="list-empty">Nothing waits for you.</p>}
            <ul className="foryou-list">
              {list.items.map((item) => (
                <ForYouRow key={item.id} item={item} onSend={setDraft} named={everywhere && severalProjects} />
              ))}
            </ul>
          </section>
          <section className="queue-tasks ui-card" aria-label="Queue">
            <h3>
              Tasks for agents <span className="board-summary" data-testid="queue-summary">{queueWords(queue.tasks)}</span>
            </h3>
            <div className="queue-bar" data-testid="queue-bar">
              <button type="button" className="primary" onClick={() => setDraft({ titles: [''], details: '', sources: [{ kind: 'hand' }] })} data-testid="queue-add">
                + Task
              </button>
              <button type="button" disabled={queue.hold} onClick={() => say(api.startTasks())} data-testid="queue-start-next">
                Start next
              </button>
            </div>
            <details className="ui-fold queue-starts" data-testid="queue-starts">
              <summary>
                How the queue starts things{' '}
                <span className="ui-meta" data-testid="queue-starts-says">
                  Up to {queue.limit} at once · {queue.automatic ? 'starts by itself' : 'starts when you press'}
                  {queue.hold ? ' · held' : ''}
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
            {said && (
              <p className="sheet-note" role="status" data-testid="queue-said">
                {said}
              </p>
            )}
            {busy.length + next.length + finished.length === 0 && <p className="list-empty">No task yet. Add one with “+ Task”, then press Start next.</p>}
            {busy.length > 0 && <div className="wf-label">At work</div>}
            <ul className="task-list" data-testid="queue-working">
              {busy.map((task) => (
                <TaskRow key={task.id} task={task} waiting={false} />
              ))}
            </ul>
            {next.length > 0 && (
              <div className="wf-label">
                Next <span className="sheet-note">in this order; drag, or Alt with an arrow on a row, to change it</span>
              </div>
            )}
            <ul className="task-list" data-testid="queue-next">
              {next.map((task) => (
                <TaskRow key={task.id} task={task} waiting onMove={(by) => move(task, by)} onDropOn={(dragged) => dropOn(task, dragged)} />
              ))}
            </ul>
            {finished.length > 0 && <div className="wf-label">Finished today</div>}
            <ul className="task-list" data-testid="queue-finished">
              {finished.map((task) => (
                <TaskRow key={task.id} task={task} waiting={false} />
              ))}
            </ul>
          </section>
        </div>
        )}
      </div>
      {draft && <TaskForm draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
