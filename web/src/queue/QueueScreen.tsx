import { useEffect, useState } from 'react';
import { BUSY_STATES, RULE_EVENT_WORDS, RuleEvent, TASK_STATE_WORDS, addedByWords, sourceWords, type RuleAction, type RuleList, type Task } from '@aubergine/shared';
import { api, isSuperseded } from '../api';
import { notificationsWanted, setNotificationsWanted } from '../attention';
import { useApp } from '../store';
import { actionView } from './action-views';
import { Banner } from '../ui';
import { goTo } from './go-to';
import { itemsOfListing, useRepositoryListing } from '../review/repository-source';
import { runCommand } from '../commands';
import { toReadWords } from '../review/to-read';
import { useShallow } from 'zustand/react/shallow';

/**
 * The parts of the Runs page that are about the queue: a task's row, the
 * rules, and the line of what waits to be read. Nothing here knows a kind of
 * item, of source or of action by name: a row shows what its item says, and
 * offers what its item allows.
 */

export function TaskRow({ task, waiting, onMove, onDropOn }: { task: Task; waiting: boolean; onMove?: (by: -1 | 1) => void; onDropOn?: (draggedId: string) => void }) {
  const session = useApp((s) => (task.sessionId ? s.app?.sessions.find((x) => x.id === task.sessionId) : undefined));
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      if (!isSuperseded(e)) useApp.getState().setNotice((e as Error).message);
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

export function Rules() {
  // How many rules there are, and what each says is wrong with it: either changes what the list says.
  const count = useApp((s) => (s.app?.queue.rules ?? []).map((rule) => `${rule.id} ${rule.problem ?? ''}`).join('\n'));
  const [list, setList] = useState<RuleList | null>(null);
  const [event, setEvent] = useState<RuleEvent>('task.done');
  const [action, setAction] = useState<RuleAction>({ kind: 'notify' });
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(notificationsWanted);
  // Read when the screen opens and when the rules change: the sentences are the server's.
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
            <span>
              {rule.says}
              {rule.problem && (
                <>
                  <br />
                  <span className="dialog-error" data-testid="rule-problem">
                    {rule.problem}
                  </span>
                </>
              )}
            </span>
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
          Add rule
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
export function ReviewLine() {
  const waiting = useApp(useShallow((s) => (s.app?.drafts ?? []).filter((d) => d.status === 'waiting').map((d) => d.sessionId !== null)));
  const installs = useApp((s) => s.app?.library.requests.length ?? 0);
  // Workflow files in repositories that were never accepted, or changed since.
  const files = itemsOfListing(useRepositoryListing()).length;
  const words = toReadWords({ agentDrafts: waiting.filter(Boolean).length, programDrafts: waiting.filter((byAgent) => !byAgent).length, installs, files });
  if (words === '') return null;
  return (
    <Banner action="Review" onAction={() => runCommand('drafts.review')} testid="drafts-waiting" actionTestid="review-open">
      {words}
    </Banner>
  );
}
