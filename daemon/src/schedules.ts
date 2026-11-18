import {
  OVER_STATES,
  SCHEDULES_MAX,
  isLocalHome,
  isOpenProject,
  ofProject,
  projectById,
  queueSettingsOf,
  stateOf,
  type ProjectScope,
  TASK_STATE_WORDS,
  dueSchedules,
  lastWords,
  minutesWords,
  momentWords,
  newId,
  nextTime,
  whenWords,
  type AddScheduleRequest,
  type AppState,
  type ChangeScheduleRequest,
  type DueSchedule,
  type PageQuery,
  type RanSchedule,
  type RuleEvent,
  type Schedule,
  type ScheduleLast,
  type ScheduleRow,
} from '@aubergine/shared';
import type { ActivityLog } from './activity';
import { paginate } from './public-api';
import type { Queue } from './queue';
import { BadInputError, ConflictError, NotFoundError } from './sessions';
import type { StateHub } from './state-hub';

/**
 * Schedules, and the one timer in the server that starts something.
 *
 * The timer wakes at most once a minute, and only while a schedule is
 * switched on. Each time it asks one pure function, `dueSchedules`, which
 * schedules have a time to answer for, and answers for each: it adds a task
 * to the queue, or says why it did not. That is all it does. Starting the
 * task is the queue's, by the queue's own rules: its limit and its hold.
 *
 * Nothing else in the server starts anything on a timer.
 */

/** The clock and the timer, as this module is given them. A test passes its own: no test waits on the real clock. */
export interface ScheduleClock {
  now(): number;
  /** Calls `then` once, after `ms` milliseconds. Returns what takes that back. */
  wake(ms: number, then: () => void): () => void;
}

export const REAL_CLOCK: ScheduleClock = {
  now: () => Date.now(),
  wake: (ms, then) => {
    const timer = setTimeout(then, ms);
    // The server does not stay up for the sake of this timer.
    timer.unref();
    return () => clearTimeout(timer);
  },
};

/** How often the timer wakes. Never less. */
export const WAKE_EVERY_MS = 60_000;

export interface SchedulesOptions {
  clock: ScheduleClock;
  /** The time zone schedules are written in: this computer's own. */
  zone: string;
  /** A time that passed unseen still runs, late, when it is at most this old. */
  lateWithinMs: number;
  activity: ActivityLog;
  onError?: (error: unknown) => void;
}

const OWNER = { by: { kind: 'person' as const }, trusted: true, owner: true };

export class Schedules {
  private readonly unsubscribe: () => void;
  private cancel: (() => void) | null = null;
  private working: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly hub: StateHub,
    private readonly queue: Queue,
    private readonly options: SchedulesOptions,
  ) {
    // A schedule that is made or switched on arms the timer; the last one going takes it away.
    this.unsubscribe = hub.subscribe((event) => {
      if (event.type === 'schedule.changed' || event.type === 'schedule.removed') this.arm();
    });
  }

  private get items(): readonly Schedule[] {
    return this.hub.state.schedules.items;
  }

  /** After a start of the server: one look for times that passed while it was stopped, and the timer where a schedule is on. */
  start(): Promise<void> {
    this.arm();
    return this.look();
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
    this.cancel?.();
    this.cancel = null;
  }

  /** Everything that was begun still to be finished, for a caller that is about to stop. */
  async settled(): Promise<void> {
    await this.working.catch(() => {});
  }

  /** The timer: on while a schedule is switched on, and waking once in `WAKE_EVERY_MS`. It looks, and does nothing else. */
  private arm(): void {
    const wanted = !this.closed && this.items.some((schedule) => schedule.on);
    if (!wanted) {
      this.cancel?.();
      this.cancel = null;
      return;
    }
    if (this.cancel !== null) return;
    this.cancel = this.options.clock.wake(WAKE_EVERY_MS, () => {
      this.cancel = null;
      void this.look();
      this.arm();
    });
  }

  /** One look: which schedules have a time to answer for now, and an answer for each. */
  private look(): Promise<void> {
    // The time of the look is the time it was asked for, not the time an earlier answer was finished.
    const now = this.options.clock.now();
    this.working = this.working
      .then(async () => {
        if (this.closed) return;
        const checked = this.hub.state.schedules.checkedAt;
        // An archived project's schedules are not looked at: they fire nothing and say nothing. Nor are those of a project this server does not keep.
        const live = this.items.filter((schedule) => {
          const project = projectById(this.hub.state, schedule.projectId);
          return project !== undefined && project.state === 'open' && isLocalHome(project);
        });
        const due = dueSchedules(live, checked === null ? null : Date.parse(checked), now, this.options.zone, this.options.lateWithinMs);
        if (due.length === 0) return;
        this.hub.emit({ type: 'schedules.checked', at: new Date(now).toISOString() });
        for (const one of due) {
          const schedule = this.items.find((s) => s.id === one.scheduleId);
          if (schedule) await this.answer(schedule, one, now);
        }
      })
      .catch(this.options.onError ?? (() => {}));
    return this.working;
  }

  /* ---------- Answering for a time ---------- */

  /** Why a schedule cannot run as it is written: something it names is gone. Null when it can. */
  private problemOf(schedule: Pick<Schedule, 'what' | 'where'>, whole: AppState, projectId: string): string | null {
    const { what, where } = schedule;
    // What it names is looked for in its own project and in what is shared with it. A thing of another project is, to it, not there.
    const state = stateOf(whole, projectId);
    if (what.kind === 'element') {
      const item = state.shelf.find((e) => e.id === what.elementId);
      if (!item) return whole.shelf.some((e) => e.id === what.elementId) ? 'The step it runs now belongs to another project.' : 'The step it runs is no longer among the saved steps.';
      if (item.state === 'retired') return `The step it runs, “${item.element.name}”, was retired.`;
    } else if (!state.workflows.some((w) => w.id === what.workflowId && w.listed)) return whole.workflows.some((w) => w.id === what.workflowId && w.listed) ? 'The workflow it runs now belongs to another project.' : 'The workflow it runs is gone.';
    if (where.kind === 'session' && !state.sessions.some((s) => s.id === where.sessionId)) return whole.sessions.some((s) => s.id === where.sessionId) ? 'The terminal it runs on is in another project now.' : 'The terminal it runs on is gone.';
    if (where.kind === 'new' && !state.canvases.some((c) => c.id === where.canvasId)) return whole.canvases.some((c) => c.id === where.canvasId) ? 'The canvas its new terminal was to start on is in another project now.' : 'The canvas its new terminal was to start on was closed.';
    return null;
  }

  /** The task of its latest firing, while that one still waits or is at work. */
  private earlier(schedule: Schedule) {
    const task = schedule.taskId === null ? undefined : this.hub.state.queue.tasks.find((t) => t.id === schedule.taskId);
    return task && !OVER_STATES.includes(task.state) ? task : null;
  }

  private record(schedule: Schedule, last: ScheduleLast, status: number, outcome: 'ok' | 'error'): void {
    // Which schedule, for which time, and how it ended. Never what the task says.
    void this.options.activity.append({ at: last.at, caller: 'schedule', tokenId: null, tokenName: `schedule ${schedule.id}`, action: `schedule.${last.result}`, resource: {}, method: 'SCHEDULE', route: last.due ?? 'by hand', status, outcome });
  }

  private tell(event: RuleEvent, schedule: Schedule, last: ScheduleLast, sentence: string): void {
    this.queue.happened({ id: `${event} ${schedule.id} ${last.due ?? last.at}`, event, sentence: sentence.slice(0, 500), taskId: last.taskId, askId: null, projectId: schedule.projectId });
  }

  /** It did not run: the row says why. Where something it names is gone, the owner's list says so too, once, for as long as that lasts. */
  private didNot(schedule: Schedule, result: 'skipped' | 'missed' | 'could-not-run', reason: string, due: string | null, now: number): Schedule {
    const at = new Date(now).toISOString();
    const last: ScheduleLast = { at, due, result, lateMinutes: 0, reason: reason.slice(0, 600), taskId: null };
    const next: Schedule = { ...schedule, last, problem: result === 'could-not-run' ? last.reason : schedule.problem, updatedAt: at };
    this.hub.emit({ type: 'schedule.changed', schedule: next });
    this.record(schedule, last, result === 'skipped' ? 409 : result === 'missed' ? 410 : 424, 'error');
    // A rule hears of a time that was missed each time, and of a schedule that cannot run once: when that begins, or when the reason changes.
    if (result === 'missed') this.tell('schedule.failed', schedule, last, `The schedule “${schedule.name}” was missed: ${reason}`);
    else if (result === 'could-not-run' && schedule.problem !== next.problem) this.tell('schedule.failed', schedule, last, `The schedule “${schedule.name}” could not run: ${reason}`);
    return next;
  }

  /** Adds the task of one firing to the queue. The queue starts it when it may: the limit and the hold count for it. */
  private async fire(schedule: Schedule, due: string | null, lateMinutes: number, now: number): Promise<{ schedule: Schedule; taskId: string | null }> {
    const problem = this.problemOf(schedule, this.hub.state, schedule.projectId);
    if (problem !== null) return { schedule: this.didNot(schedule, 'could-not-run', problem, due, now), taskId: null };
    const byHand = due === null;
    let taskId: string;
    try {
      const task = await this.queue.add(
        {
          title: schedule.name,
          details: schedule.task,
          folder: schedule.folder,
          environment: schedule.environment,
          workflowId: schedule.what.kind === 'workflow' ? schedule.what.workflowId : null,
          taker: schedule.where,
          source: { kind: 'schedule', scheduleId: schedule.id, name: schedule.name, ...(byHand ? { byHand: true } : lateMinutes > 0 ? { lateMinutes } : {}) },
        },
        { ...OWNER, projectId: schedule.projectId },
        { elementId: schedule.what.kind === 'element' ? schedule.what.elementId : null },
      );
      taskId = task.id;
    } catch (error) {
      if (!(error instanceof NotFoundError || error instanceof ConflictError || error instanceof BadInputError)) throw error;
      return { schedule: this.didNot(schedule, 'could-not-run', error.message, due, now), taskId: null };
    }
    const at = new Date(now).toISOString();
    const last: ScheduleLast = { at, due, result: byHand ? 'by-hand' : lateMinutes > 0 ? 'late' : 'fired', lateMinutes, reason: null, taskId };
    const next: Schedule = { ...schedule, last, taskId, problem: null, updatedAt: at };
    this.hub.emit({ type: 'schedule.changed', schedule: next });
    this.record(schedule, last, 200, 'ok');
    this.tell('schedule.fired', schedule, last, `The schedule “${schedule.name}” fired${byHand ? ', run by hand' : lateMinutes > 0 ? `, ${minutesWords(lateMinutes)} late` : ''}.`);
    return { schedule: next, taskId };
  }

  private async answer(schedule: Schedule, due: DueSchedule, now: number): Promise<void> {
    if (due.verdict === 'missed') {
      const hours = Math.round(this.options.lateWithinMs / 360_000) / 10;
      this.didNot(schedule, 'missed', `Nothing was looking at that time (the server was stopped, or the computer asleep), and it was ${minutesWords(due.lateMinutes)} ago: more than the ${hours} ${hours === 1 ? 'hour' : 'hours'} within which a time still runs late.`, due.due, now);
      return;
    }
    const earlier = this.earlier(schedule);
    if (earlier) {
      // Checked before whether it could run at all: one that is still going is the plainer thing to say.
      this.didNot(schedule, 'skipped', `Its earlier task is not over: it ${earlier.state === 'queued' ? 'still waits to start' : `is ${TASK_STATE_WORDS[earlier.state]}`}.`, due.due, now);
      return;
    }
    await this.fire(schedule, due.due, due.verdict === 'late' ? due.lateMinutes : 0, now);
  }

  /* ---------- Reading ---------- */

  private row(schedule: Schedule): ScheduleRow {
    const state = this.hub.state;
    const now = this.options.clock.now();
    const { what, where } = schedule;
    const runs = what.kind === 'element' ? (state.shelf.find((e) => e.id === what.elementId)?.element.name ?? 'a step that is gone') : (state.workflows.find((w) => w.id === what.workflowId)?.versions.at(-1)?.name ?? 'a workflow that is gone');
    const place = where.kind === 'session' ? `on “${state.sessions.find((s) => s.id === where.sessionId)?.name ?? 'a terminal that is gone'}”` : `on a new agent terminal on “${state.canvases.find((c) => c.id === where.canvasId)?.name ?? 'a canvas that is gone'}”`;
    const next = schedule.on ? nextTime(schedule, now, this.options.zone) : null;
    return {
      ...schedule,
      says: `${whenWords(schedule).replace(/^./, (c) => c.toUpperCase())}, run “${runs}” ${place}.`,
      next: next === null ? null : new Date(next).toISOString(),
      nextSays: next === null ? 'Switched off.' : `Next ${momentWords(next, now, this.options.zone)}.`,
      lastSays: lastWords(schedule.last, now, this.options.zone),
    };
  }

  /** The schedules of one project; null: of every project. */
  list(query: PageQuery, projectId: ProjectScope = null): { items: ScheduleRow[]; nextCursor: string | null } {
    const sorted = this.items.filter((schedule) => ofProject(schedule, projectId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const page = paginate(sorted, (schedule) => schedule.id, query);
    return { items: page.items.map((schedule) => this.row(schedule)), nextCursor: page.nextCursor };
  }

  private find(scheduleId: string): Schedule {
    const schedule = this.items.find((s) => s.id === scheduleId);
    if (!schedule) throw new NotFoundError(`No schedule ${scheduleId}`);
    return schedule;
  }

  /* ---------- The owner's: making, changing, removing, running now ---------- */

  /** A schedule is its project's: what it runs and where are looked for there, and it fires into that project's queue. */
  add(body: Omit<AddScheduleRequest, 'projectId'>, projectId: string): ScheduleRow {
    if (this.items.length >= SCHEDULES_MAX) throw new ConflictError(`There are ${SCHEDULES_MAX} schedules; remove one first.`);
    const problem = this.problemOf(body, this.hub.state, projectId);
    if (problem !== null) throw new BadInputError(problem);
    const at = new Date(this.options.clock.now()).toISOString();
    const schedule: Schedule = {
      id: newId(),
      projectId,
      name: body.name,
      time: body.time,
      days: body.days,
      what: body.what,
      where: body.where,
      folder: body.folder ?? null,
      environment: body.environment ?? null,
      task: body.task ?? '',
      on: body.on ?? true,
      since: at,
      last: null,
      taskId: null,
      problem: null,
      createdAt: at,
      updatedAt: at,
    };
    this.hub.emit({ type: 'schedule.changed', schedule });
    return this.row(schedule);
  }

  /** What is not sent stays as it was. A change of its time or days, and switching it on, begin it anew: a time that passed before now is not its own. */
  change(scheduleId: string, body: ChangeScheduleRequest): ScheduleRow {
    const schedule = this.find(scheduleId);
    const given = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as ChangeScheduleRequest;
    const next: Schedule = { ...schedule, ...given };
    const problem = this.problemOf(next, this.hub.state, schedule.projectId);
    // Switching off, and nothing else, is always possible: also for one that names something that is gone.
    if (problem !== null && !(Object.keys(given).length === 1 && given.on === false)) throw new BadInputError(problem);
    const at = new Date(this.options.clock.now()).toISOString();
    const anew = next.time !== schedule.time || next.days.join() !== schedule.days.join() || (next.on && !schedule.on);
    const changed: Schedule = { ...next, since: anew ? at : schedule.since, problem: problem === null ? null : schedule.problem, updatedAt: at };
    this.hub.emit({ type: 'schedule.changed', schedule: changed });
    return this.row(changed);
  }

  remove(scheduleId: string): void {
    this.find(scheduleId);
    this.hub.emit({ type: 'schedule.removed', scheduleId });
  }

  /** The owner's "Run now": the same path as a firing, marked as asked for by hand. Its time of day is left as it was. */
  async runNow(scheduleId: string): Promise<RanSchedule> {
    let result: RanSchedule | undefined;
    let failure: unknown;
    this.working = this.working.then(async () => {
      try {
        const schedule = this.find(scheduleId);
        if (!isOpenProject(this.hub.state, schedule.projectId)) throw new ConflictError('Its project is archived: nothing is started in it. Reopen the project first.');
        const earlier = this.earlier(schedule);
        if (earlier) throw new ConflictError(`Its earlier task is not over: it ${earlier.state === 'queued' ? 'still waits to start' : `is ${TASK_STATE_WORDS[earlier.state]}`}.`);
        const fired = await this.fire(schedule, null, 0, this.options.clock.now());
        const queue = queueSettingsOf(this.hub.state.queue, schedule.projectId);
        result = {
          schedule: this.row(fired.schedule),
          taskId: fired.taskId,
          says: fired.taskId === null ? `“${schedule.name}” could not run: ${fired.schedule.last?.reason ?? ''}` : queue.hold ? `“${schedule.name}” is in the queue. New starts are held: it starts when the hold is taken off.` : `“${schedule.name}” is in the queue and starts when a place is free.`,
        };
      } catch (error) {
        failure = error;
      }
    });
    await this.working;
    if (result === undefined) throw failure;
    return result;
  }
}

/** This computer's own time zone. */
export const ownZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
