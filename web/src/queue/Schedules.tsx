import { useEffect, useState } from 'react';
import { WEEKDAYS, daysWords, type ScheduleRow, type ScheduleWhat, type ScheduleWhere, type Weekday } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';

/**
 * Schedules, beside the rules: at these times, run this there. The rows are
 * the server's own sentences, read when this opens and when a schedule
 * changes; nothing here asks on a timer, and nothing here decides when a
 * schedule is due.
 */

const DAY_LETTERS: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

interface Draft {
  /** The schedule being changed; null for a new one. */
  id: string | null;
  name: string;
  time: string;
  days: Weekday[];
  /** `e:<element>` or `w:<workflow>`. */
  what: string;
  /** `s:<terminal>` or `c:<canvas>`. */
  where: string;
  task: string;
}
const BLANK: Draft = { id: null, name: '', time: '08:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'], what: '', where: '', task: '' };
const whatOf = (value: string): ScheduleWhat | null => (value.length <= 2 ? null : value.startsWith('w:') ? { kind: 'workflow', workflowId: value.slice(2) } : { kind: 'element', elementId: value.slice(2) });
const whereOf = (value: string): ScheduleWhere | null => (value.length <= 2 ? null : value.startsWith('c:') ? { kind: 'new', canvasId: value.slice(2) } : { kind: 'session', sessionId: value.slice(2) });
const draftOf = (row: ScheduleRow): Draft => ({
  id: row.id,
  name: row.name,
  time: row.time,
  days: row.days,
  what: row.what.kind === 'workflow' ? `w:${row.what.workflowId}` : `e:${row.what.elementId}`,
  where: row.where.kind === 'new' ? `c:${row.where.canvasId}` : `s:${row.where.sessionId}`,
  task: row.task,
});

export function Schedules() {
  // Changes with every change of a schedule: when one fires, is switched, is made or removed.
  const stamp = useApp((s) => (s.app?.schedules.items ?? []).map((item) => `${item.id}${item.updatedAt}`).join(' '));
  const count = useApp((s) => s.app?.schedules.items.length ?? 0);
  const broken = useApp((s) => (s.app?.schedules.items ?? []).some((item) => item.on && item.problem !== null));
  const shelf = useApp((s) => s.app?.shelf);
  const workflows = useApp((s) => s.app?.workflows);
  const sessions = useApp((s) => s.app?.sessions);
  const canvases = useApp((s) => s.app?.canvases);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api.listSchedules().then(
      (found) => !cancelled && setRows(found),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [stamp]);
  const doing = (work: Promise<unknown>): void => {
    setError(null);
    setSaid(null);
    void work.catch((e: unknown) => setError((e as Error).message));
  };
  const save = (): void => {
    if (!draft) return;
    const what = whatOf(draft.what);
    const where = whereOf(draft.where);
    if (draft.name.trim() === '' || !what || !where || draft.days.length === 0) {
      setError('A schedule needs a name, at least one day, what to run and where.');
      return;
    }
    const body = { name: draft.name.trim(), time: draft.time, days: draft.days, what, where, task: draft.task };
    doing((draft.id === null ? api.addSchedule(body) : api.changeSchedule(draft.id, body)).then(() => setDraft(null)));
  };
  return (
    <details className="queue-rules queue-schedules" data-testid="queue-schedules" open={broken || undefined}>
      <summary>Schedules{count > 0 ? ` (${count})` : ''}: at these times, run this there</summary>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="schedule-row" data-testid="schedule-row" data-on={row.on} data-result={row.last?.result ?? 'none'}>
            <span>
              <strong>{row.name}</strong>
              <br />
              {row.says} <span data-testid="schedule-next">{row.nextSays}</span> <span data-testid="schedule-last">{row.lastSays}</span>
              {row.problem && (
                <>
                  <br />
                  <span className="dialog-error" data-testid="schedule-problem">
                    It cannot run as it is written: {row.problem}
                  </span>
                </>
              )}
            </span>
            <label>
              <input type="checkbox" checked={row.on} aria-label={`“${row.name}” is switched on`} onChange={(e) => doing(api.changeSchedule(row.id, { on: e.target.checked }))} data-testid="schedule-on" /> On
            </label>
            <button type="button" onClick={() => doing(api.runSchedule(row.id).then((ran) => setSaid(ran.says)))} data-testid="schedule-run">
              Run now
            </button>
            <button type="button" className="quiet" onClick={() => setDraft(draftOf(row))} data-testid="schedule-edit">
              Edit
            </button>
            <button type="button" className="quiet" aria-label={`Remove the schedule “${row.name}”`} onClick={() => doing(api.removeSchedule(row.id))} data-testid="schedule-remove">
              ×
            </button>
          </li>
        ))}
      </ul>
      {said && (
        <p className="sheet-note" role="status" data-testid="schedule-said">
          {said}
        </p>
      )}
      {draft === null ? (
        <button type="button" className="quiet" onClick={() => setDraft(BLANK)} data-testid="schedule-add">
          Add a schedule…
        </button>
      ) : (
        <div className="queue-rule-form schedule-form" data-testid="schedule-form">
          <input value={draft.name} maxLength={80} placeholder="Its name, such as: My morning list" aria-label="Name of the schedule" onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="schedule-name" />
          <span>at</span>
          <input type="time" value={draft.time} aria-label="Time of day" onChange={(e) => e.target.value !== '' && setDraft({ ...draft, time: e.target.value.slice(0, 5) })} data-testid="schedule-time" />
          <span className="schedule-days" role="group" aria-label="Days of the week">
            {WEEKDAYS.map((day) => (
              <label key={day}>
                <input type="checkbox" checked={draft.days.includes(day)} onChange={(e) => setDraft({ ...draft, days: WEEKDAYS.filter((d) => (d === day ? e.target.checked : draft.days.includes(d))) })} data-testid={`schedule-day-${day}`} />
                {DAY_LETTERS[day]}
              </label>
            ))}
          </span>
          <select aria-label="What it runs" value={draft.what} onChange={(e) => setDraft({ ...draft, what: e.target.value })} data-testid="schedule-what">
            <option value="">Run what…</option>
            {[...(shelf ?? [])]
              .filter((item) => item.state !== 'retired')
              .map((item) => (
                <option key={item.id} value={`e:${item.id}`}>
                  the element “{item.element.name}”
                </option>
              ))}
            {[...(workflows ?? [])]
              .filter((w) => w.listed)
              .map((w) => (
                <option key={w.id} value={`w:${w.id}`}>
                  the workflow “{w.name}”
                </option>
              ))}
          </select>
          <select aria-label="Where it runs" value={draft.where} onChange={(e) => setDraft({ ...draft, where: e.target.value })} data-testid="schedule-where">
            <option value="">Where…</option>
            {(canvases ?? []).map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                on a new agent terminal on “{c.name}”
              </option>
            ))}
            {(sessions ?? [])
              .filter((s) => s.state === 'open')
              .map((s) => (
                <option key={s.id} value={`s:${s.id}`}>
                  on “{s.name}”
                </option>
              ))}
          </select>
          <textarea value={draft.task} rows={2} maxLength={4000} placeholder="What the agent is told to do, as the task of what it runs (optional)" aria-label="The task it is given" onChange={(e) => setDraft({ ...draft, task: e.target.value })} data-testid="schedule-task" />
          <button type="button" onClick={save} data-testid="schedule-save">
            {draft.id === null ? `Add: ${daysWords(draft.days)} at ${draft.time}` : 'Save the change'}
          </button>
          <button type="button" className="quiet" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      )}
      <p className="sheet-note">
        Times are on this computer’s clock. Each time becomes a task of the queue: the limit and Hold count for it. The agent that takes it uses its own tools and connections; Aubergine calls nothing itself. The computer must be awake and Aubergine running: a
        time that passed while it was not runs late, once, if it was not long ago, and is otherwise said to be missed.
      </p>
      {error && <p className="dialog-error">{error}</p>}
    </details>
  );
}
