import {
  ASKS_MAX,
  ASKS_WAITING_MAX,
  BUSY_STATES,
  Element,
  OVER_STATES,
  PROPOSALS_WAITING_MAX,
  RULES_MAX,
  RULE_RATE_PER_MINUTE,
  TASKS_MAX,
  firstProject,
  forYou,
  isLocalHome,
  isLocalHost,
  isOpenProject,
  ofProject,
  openProjects,
  projectById,
  projectOfRun,
  projectOfSession,
  queueSettingsOf,
  stateOf,
  visibleIn,
  kickoffLine,
  newId,
  nextToStart,
  occasionOfTask,
  orderAtEnd,
  placeOfSession,
  queueWords,
  stepTask,
  taskSource,
  taskText,
  waitingTasks,
  whyNotNow,
  type AddAskRequest,
  type AddRuleRequest,
  type AddTaskRequest,
  type AddedBy,
  type Ask,
  type ChangeEvent,
  type ChangeQueueRequest,
  type ChangeTaskRequest,
  type DispatchSession,
  type ProjectScope,
  type ForYou,
  type ItemSource,
  type Occasion,
  type OwnQueue,
  type QueueSettings,
  type Rule,
  type RuleList,
  type Run,
  type StartedTasks,
  type Task,
  type TaskStep,
  type TasksQuery,
} from '@aubergine/shared';
import type { ActivityLog } from './activity';
import type { Drafts } from './drafts';
import type { Environments } from './environments';
import { paginate } from './public-api';
import { actionKind, actionKinds, ruleWords, type ActionContext } from './rules';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { TaskArchive } from './task-archive';
import type { Workflows } from './workflows';

/** The changes after which a terminal's agent may be free though no run ended: a new agent terminal, an agent seen in front (its record, or the program in front), an agent that stopped working. */
const FREES_AN_AGENT: ReadonlySet<ChangeEvent['type']> = new Set(['session.created', 'session.agent', 'session.activity', 'session.attention', 'session.restored', 'session.restarted', 'session.moved']);

export interface QueueOptions {
  /** Asks every open page to notify the owner; returns how many were asked. */
  notify: (title: string, body: string) => number;
  activity: ActivityLog;
  onError?: (error: unknown) => void;
}

/** Who asks, as far as the queue needs to know: the owner, or someone whose additions wait for the owner. */
export interface Asker {
  by: AddedBy;
  /** The project what is added goes into: the caller's own, or the one it named and may reach. */
  projectId: string;
  /** True for the owner, and for a token the owner made with review switched off. */
  trusted: boolean;
  owner: boolean;
}

/**
 * The queue of tasks, what is asked of the owner in writing, and the rules.
 *
 * A task moves only through `stepTask`; which task starts, and where, is
 * `nextToStart`. Starting one is the existing start of a run, with the
 * existing rule for the kickoff sentence: nothing new is typed. Nothing
 * starts by itself unless the owner switched that on, and then only when a
 * change event says a place may be free: never on a timer.
 */
export class Queue {
  private readonly unsubscribe: () => void;
  /** Tasks being started right now, so that none is started twice. */
  private readonly starting = new Set<string>();
  private dispatching: Promise<void> = Promise.resolve();
  private closed = false;
  /** What each rule already fired for, and when it fired lately. Not kept across a restart. */
  private readonly fired = new Set<string>();
  private readonly firedAt = new Map<string, number[]>();

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly workflows: Workflows,
    private readonly drafts: Drafts,
    private readonly environments: Environments,
    private readonly archive: TaskArchive,
    private readonly options: QueueOptions,
  ) {
    this.unsubscribe = hub.subscribe((event) => this.on(event));
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
  }

  /** Everything that was started still to be finished, for a caller that is about to stop. */
  async settled(): Promise<void> {
    await this.dispatching.catch(() => {});
  }

  private get queue() {
    return this.hub.state.queue;
  }

  /**
   * After a start of the server: a task that was being started when it stopped did not start, and a task whose run
   * ended while nobody was listening follows it now. Nothing is started here.
   */
  async reconcile(): Promise<void> {
    for (const task of [...this.queue.tasks]) {
      if (task.state === 'taken') await this.apply(task, { type: 'fail', reason: 'The server stopped while it was being started.' }).catch(() => {});
      else if ((task.state === 'working' || task.state === 'needs-owner') && task.runId !== null) {
        const live = this.hub.state.runs.find((run) => run.id === task.runId);
        if (live) this.follow(task, live);
        else {
          const ended = await this.workflows.getRun(task.runId).catch(() => null);
          if (ended) this.follow(task, ended.run);
          else await this.apply(task, { type: 'fail', reason: 'Its run can no longer be found.' }).catch(() => {});
        }
      }
    }
  }

  /* ---------- Following what happens ---------- */

  private on(event: ChangeEvent): void {
    if (event.type === 'run.moved' || event.type === 'run.finished') {
      const task = this.queue.tasks.find((t) => t.runId === event.run.id);
      if (task) this.follow(task, event.run);
      if (event.type === 'run.finished') {
        // A run a rule started is over: what its terminal does from now on can set off rules again.
        if (this.queue.ruleRuns.includes(event.run.id)) this.emitSettings(projectOfRun(this.hub.state, event.run) ?? firstProject(this.hub.state).id, { ruleRuns: this.queue.ruleRuns.filter((id) => id !== event.run.id) });
        this.maybeDispatch();
      }
      return;
    }
    // The other things that can free a place or fill one: a task that now waits, a change of the limit or the hold,
    // and a terminal whose agent may have become free without a run ending. All of them are change events.
    if (event.type === 'task.changed' && event.task.state === 'queued') this.maybeDispatch();
    else if (event.type === 'queue.settings') this.maybeDispatch();
    else if (FREES_AN_AGENT.has(event.type)) this.maybeDispatch();
  }

  /** A task follows its run. */
  private follow(task: Task, run: Run): void {
    if (task.state !== 'working' && task.state !== 'needs-owner') return;
    const version = this.hub.state.workflows.find((w) => w.id === run.workflowId)?.versions.find((v) => v.number === run.workflowVersion);
    const element = version?.elements.find((e) => e.id === run.currentElementId)?.name;
    const reason = run.status === 'awaiting' ? `Its run waits for your approval${element ? ` at “${element}”` : ''}.` : run.status === 'blocked' ? run.blockedReason : null;
    const result = stepTask(task, { type: 'run', status: run.status, reason }, new Date().toISOString());
    if (!result.ok || (result.task.state === task.state && result.task.reason === task.reason)) return;
    this.moved(task, result.task);
  }

  /** Records a task's new state, and says so to the rules where it is one they listen for. */
  private moved(before: Task, after: Task): void {
    this.hub.emit({ type: 'task.changed', task: after });
    if (after.state === before.state) return;
    const event = after.state === 'done' ? 'task.done' : after.state === 'failed' ? 'task.failed' : after.state === 'needs-owner' ? 'task.needs-owner' : null;
    if (event) this.fire(occasionOfTask(after, event), after.source);
  }

  private find(taskId: string): Task {
    const task = this.queue.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundError(`No task ${taskId}`);
    return task;
  }

  /** One step of a task, through the one function that knows how tasks move. A task that is withdrawn leaves the state for the archive. */
  private async apply(task: Task, step: TaskStep): Promise<Task> {
    const result = stepTask(task, step, new Date().toISOString());
    if (!result.ok) throw new ConflictError(result.reason);
    if (result.task.state === 'withdrawn') {
      // Into the archive first, out of the state second.
      await this.archive.append(result.task);
      this.hub.emit({ type: 'task.removed', taskId: task.id });
      return result.task;
    }
    this.moved(task, result.task);
    return result.task;
  }

  /* ---------- Reading ---------- */

  /** `projectId`: the tasks of one project; null: of every project. */
  async list(query: TasksQuery, projectId: ProjectScope = null): Promise<{ items: Task[]; nextCursor: string | null }> {
    if (query.state === 'ended') return this.archive.read({ limit: query.limit, cursor: query.cursor }, projectId);
    const order = (task: Task): number => (BUSY_STATES.includes(task.state) ? 0 : task.state === 'queued' ? 1 : task.state === 'proposed' ? 2 : 3);
    const wanted = this.queue.tasks.filter((task) => ofProject(task, projectId) && (query.state === 'live' || task.state === query.state)).sort((a, b) => order(a) - order(b) || a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return paginate(wanted, (task) => task.id, { limit: query.limit, cursor: query.cursor });
  }

  async get(taskId: string): Promise<Task> {
    const live = this.queue.tasks.find((t) => t.id === taskId);
    if (live) return live;
    const archived = await this.archive.get(taskId);
    if (!archived) throw new NotFoundError(`No task ${taskId}`);
    return archived;
  }

  /** How one project's tasks are started, and how its queue stands. */
  settings(projectId: string): QueueSettings {
    const { limit, hold, automatic } = queueSettingsOf(this.queue, projectId);
    return { projectId, limit, hold, automatic, summary: queueWords(this.queue.tasks.filter((task) => task.projectId === projectId)) };
  }

  /** What waits on the owner: gathered from the state, and from the runs that ended lately for the lists they handed in. */
  async forYou(projectId: ProjectScope = null): Promise<ForYou> {
    const ended = await this.workflows.listRuns({ status: 'ended', limit: 50, cursor: undefined, sessionId: undefined, workflowId: undefined }).catch(() => ({ items: [] }));
    return forYou(this.hub.state, Date.now(), ended.items, projectId);
  }

  /** What a session is shown: every task by title and state, and what it itself asked. */
  ownQueue(sessionId: string): OwnQueue {
    // Of its own project only: a terminal sees nothing of another project's queue.
    const projectId = this.sessions.get(sessionId).projectId;
    const tasks = this.queue.tasks.filter((task) => task.projectId === projectId && !OVER_STATES.includes(task.state)).map((task) => ({ id: task.id, title: task.title, state: task.state, mine: task.addedBy.sessionId === sessionId }));
    const asks = this.queue.asks.filter((ask) => ask.addedBy.sessionId === sessionId);
    const mine = tasks.filter((task) => task.mine && task.state === 'proposed').length;
    return { tasks, asks, says: `${queueWords(this.queue.tasks.filter((task) => task.projectId === projectId))}. Of yours, ${mine} ${mine === 1 ? 'proposal waits' : 'proposals wait'} for your owner's yes, and ${asks.length} ${asks.length === 1 ? 'thing you asked is' : 'things you asked are'} still open. Neither is done until your owner acts.` };
  }

  /* ---------- Adding and changing ---------- */

  /** Checks what a task names: its workflow, its terminal or its canvas must exist, and its source must be a kind that is known. */
  private check(fields: { workflowId?: string | null | undefined; taker?: Task['taker'] | undefined; source?: ItemSource | undefined; environment?: string | null | undefined }, projectId: string): void {
    // A workflow of another project, a terminal or a canvas of another project: to this project they are not there.
    if (fields.workflowId && !this.hub.state.workflows.some((w) => w.id === fields.workflowId && w.listed && visibleIn(w, projectId))) throw new NotFoundError('There is no such workflow.');
    if (fields.taker?.kind === 'session' && projectOfSession(this.hub.state, fields.taker.sessionId) !== projectId) throw new NotFoundError('There is no such terminal.');
    if (fields.taker?.kind === 'new' && this.hub.state.canvases.find((c) => c.id === (fields.taker as { canvasId: string }).canvasId)?.projectId !== projectId) throw new NotFoundError('There is no such canvas.');
    if (fields.source && !taskSource(fields.source.kind)) throw new BadInputError(`A task does not come from “${fields.source.kind}”.`);
  }

  /** Whether what is added now comes about because of a run a rule started: such a thing sets off no rule. */
  private viaRule(by: AddedBy): boolean {
    if (!by.sessionId) return false;
    const run = this.workflows.liveRunOf(by.sessionId);
    return run !== null && this.queue.ruleRuns.includes(run.id);
  }

  /** The source as it is kept: what the caller said of where it came from, and never what only the server may say. */
  private sourceFor(asker: Asker, given: ItemSource | undefined): ItemSource {
    const { viaRule: _never, ...said } = (given ?? { kind: asker.owner ? 'hand' : 'api' }) as ItemSource & { viaRule?: unknown };
    return this.viaRule(asker.by) ? { ...said, viaRule: true } : said;
  }

  /**
   * Adds a task. From the owner (or a token made with review off) it waits to be started; from anyone else it waits
   * for the owner's yes first. `arranged` is the server's own, for what the owner arranged beforehand (a time of a
   * schedule): no route passes it.
   */
  async add(body: AddTaskRequest, asker: Asker, arranged?: { elementId: string | null }): Promise<Task> {
    this.check(body, asker.projectId);
    if (this.queue.tasks.length >= TASKS_MAX) throw new ConflictError(`The queue holds ${TASKS_MAX} tasks. Put away the ones that are over first.`);
    if (!asker.trusted) {
      const waiting = this.queue.tasks.filter((task) => task.state === 'proposed' && ((asker.by.sessionId !== undefined && task.addedBy.sessionId === asker.by.sessionId) || (asker.by.tokenId !== undefined && task.addedBy.tokenId === asker.by.tokenId))).length;
      if (waiting >= PROPOSALS_WAITING_MAX) throw new ConflictError(`${waiting} tasks you proposed already wait for the owner's yes, and that is as many as may. Wait for the owner; do not look for another way to add this.`);
    }
    const at = new Date().toISOString();
    const task: Task = {
      id: newId(),
      projectId: asker.projectId,
      title: body.title,
      details: body.details ?? '',
      folder: body.folder ?? null,
      workflowId: body.workflowId ?? null,
      elementId: arranged?.elementId ?? null,
      unattended: arranged !== undefined,
      environment: body.environment ?? null,
      taker: body.taker ?? { kind: 'any' },
      addedBy: asker.by,
      source: this.sourceFor(asker, body.source),
      labels: body.labels ?? [],
      order: orderAtEnd(this.queue.tasks),
      state: asker.trusted ? 'queued' : 'proposed',
      sessionId: null,
      runId: null,
      reason: null,
      createdAt: at,
      updatedAt: at,
      endedAt: null,
    };
    this.hub.emit({ type: 'task.changed', task });
    return task;
  }

  /** The owner changes a task that has not started. What is not sent stays as it was. */
  change(taskId: string, body: ChangeTaskRequest): Task {
    const task = this.find(taskId);
    if (task.state !== 'proposed' && task.state !== 'queued') throw new ConflictError('Only a task that has not started can be changed.');
    this.check(body, task.projectId);
    const given = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
    const next: Task = { ...task, ...given, updatedAt: new Date().toISOString() };
    this.hub.emit({ type: 'task.changed', task: next });
    return next;
  }

  accept(taskId: string): Promise<Task> {
    return this.apply(this.find(taskId), { type: 'accept' });
  }

  decline(taskId: string): Promise<Task> {
    return this.apply(this.find(taskId), { type: 'decline' });
  }

  again(taskId: string): Promise<Task> {
    const task = this.find(taskId);
    return this.apply({ ...task, order: orderAtEnd(this.queue.tasks) }, { type: 'again' });
  }

  /** Taken back before it starts: by the owner, or by whoever added it and nobody else. */
  withdraw(taskId: string, asker: Asker): Promise<Task> {
    const task = this.find(taskId);
    const own = (asker.by.tokenId !== undefined && task.addedBy.tokenId === asker.by.tokenId) || (asker.by.sessionId !== undefined && task.addedBy.sessionId === asker.by.sessionId);
    if (!asker.owner && !own) throw new ConflictError('Only what you added yourself can be withdrawn by you.');
    return this.apply(task, { type: 'withdraw' });
  }

  /** The owner has looked at a task that is over: it goes to the archive. */
  async clear(taskId: string): Promise<Task> {
    const task = this.find(taskId);
    if (task.state !== 'done' && task.state !== 'failed') throw new ConflictError('Only a task that is done or failed is put away.');
    await this.archive.append(task);
    this.hub.emit({ type: 'task.removed', taskId });
    return task;
  }

  /** The order in which the waiting tasks start: the ones named, in that order, then the rest as they were. */
  reorder(taskIds: readonly string[]): QueueSettings {
    const named = taskIds.flatMap((id) => {
      const task = this.queue.tasks.find((t) => t.id === id && t.state === 'queued');
      return task ? [task] : [];
    });
    // The order is a project's own: the tasks of the project of the first one named, and no other's.
    const projectId = named[0]?.projectId ?? firstProject(this.hub.state).id;
    const mine = named.filter((task) => task.projectId === projectId);
    const rest = waitingTasks(this.queue.tasks).filter((task) => task.projectId === projectId && !mine.includes(task));
    [...new Set(mine), ...rest].forEach((task, index) => {
      if (task.order !== index + 1) this.hub.emit({ type: 'task.changed', task: { ...task, order: index + 1 } });
    });
    return this.settings(projectId);
  }

  private emitSettings(projectId: string, change: Partial<{ limit: number; hold: boolean; automatic: boolean; ruleRuns: string[] }>): void {
    const { limit, hold, automatic } = queueSettingsOf(this.queue, projectId);
    this.hub.emit({ type: 'queue.settings', projectId, limit, hold, automatic, ruleRuns: this.queue.ruleRuns, ...change });
  }

  /** The limit, the hold and automatic starting of one project. Another project's are not touched. */
  changeSettings(projectId: string, body: Omit<ChangeQueueRequest, 'projectId'>): QueueSettings {
    const given = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
    if (Object.keys(given).length > 0) this.emitSettings(projectId, given);
    return this.settings(projectId);
  }

  /* ---------- Starting ---------- */

  private dispatchSessions(projectId: string): DispatchSession[] {
    // Only terminals of the project, and only those whose shell runs on this computer: nothing is started anywhere else.
    return this.hub.state.sessions.filter((s) => s.projectId === projectId && isLocalHost(s)).map((s) => ({ id: s.id, state: s.state, command: s.command, agent: s.agent, attention: s.attention, onCanvas: placeOfSession(this.hub.state, s.id) !== null }));
  }
  private canvasIds(projectId: string): string[] {
    return this.hub.state.canvases.filter((c) => c.projectId === projectId).map((c) => c.id);
  }
  /** How many tasks of a project are being started right now. */
  private startingIn(projectId: string): number {
    return this.queue.tasks.filter((task) => task.projectId === projectId && this.starting.has(task.id)).length;
  }

  /** What may start now in one project. `only`: one task by its ID. `arranged`: of the tasks that wait, only those the owner arranged beforehand. */
  private toStart(projectId: string, only?: string, arranged = false): { taskId: string; sessionId: string | null }[] {
    // An archived project starts nothing; nor does one whose record is not this server's.
    const project = projectById(this.hub.state, projectId);
    if (!project || project.state !== 'open' || !isLocalHome(project)) return [];
    const own = this.queue.tasks.filter((task) => task.projectId === projectId);
    const tasks = only !== undefined ? own.filter((task) => task.id === only || task.state !== 'queued') : arranged ? own.filter((task) => task.unattended || task.state !== 'queued') : own;
    const { limit, hold } = queueSettingsOf(this.queue, projectId);
    return nextToStart(
      tasks.filter((task) => !this.starting.has(task.id)),
      this.dispatchSessions(projectId),
      this.hub.state.runs,
      // A task that is being started holds its place before the state says so.
      limit - this.startingIn(projectId),
      hold,
      this.canvasIds(projectId),
    );
  }

  /** The owner's "Start next" in a project, or the start of one task they named. One task. */
  async start(taskId: string | undefined, inProject: string): Promise<StartedTasks> {
    const projectId = taskId !== undefined ? this.find(taskId).projectId : inProject;
    const project = projectById(this.hub.state, projectId);
    if (!project || project.state !== 'open') throw new ConflictError('This project is archived: nothing is started in it. Reopen it first.');
    if (!isLocalHome(project)) throw new ConflictError('This project is not kept on this server: nothing can be started for it here.');
    const settings = queueSettingsOf(this.queue, projectId);
    if (settings.hold) throw new ConflictError('New starts are held. Take the hold off first.');
    if (taskId !== undefined && this.find(taskId).state !== 'queued') throw new ConflictError(`This task is not waiting to be started.`);
    const [next] = this.toStart(projectId, taskId);
    if (!next) {
      const own = this.queue.tasks.filter((task) => task.projectId === projectId);
      const busy = own.filter((task) => BUSY_STATES.includes(task.state)).length + this.startingIn(projectId);
      if (busy >= settings.limit) return { started: [], says: `${busy} ${busy === 1 ? 'task is' : 'tasks are'} at work, and the limit is ${settings.limit}. Nothing was started.` };
      const first = taskId !== undefined ? this.find(taskId) : waitingTasks(own)[0];
      if (!first) return { started: [], says: 'No task waits to be started.' };
      return { started: [], says: `Nothing was started. ${whyNotNow(first, this.dispatchSessions(projectId), this.hub.state.runs, this.canvasIds(projectId)) ?? 'No task that waits can be taken now.'}` };
    }
    const outcome = await this.startOne(next.taskId, next.sessionId);
    const title = this.queue.tasks.find((t) => t.id === next.taskId)?.title ?? 'the task';
    return { started: [outcome], says: outcome.ok ? `Started “${title}”.` : `“${title}” could not be started: ${outcome.reason ?? ''}` };
  }

  /** Starts one task on a terminal, or on a new one: the existing start of a run, and the existing rule for what is typed. */
  private async startOne(taskId: string, sessionId: string | null): Promise<StartedTasks['started'][number]> {
    if (this.starting.has(taskId)) return { taskId, sessionId, ok: false, reason: 'It is being started already.' };
    this.starting.add(taskId);
    let task = this.find(taskId);
    try {
      let onNew = false;
      if (sessionId === null) {
        if (task.taker.kind !== 'new') throw new ConflictError('No terminal was chosen for it.');
        // A new agent terminal: where the task says, in the kind of place it says, or one that keeps its work apart where the folder allows.
        // Where it names no folder of its own: the project's.
        const folder = task.folder ?? projectById(this.hub.state, task.projectId)?.defaultFolder ?? null;
        const environment = task.environment ?? (await this.environments.suggestedFor(folder));
        const created = await this.sessions.create({ agent: 'claude-code', agentArgs: [kickoffLine()], canvasId: task.taker.canvasId, ...(folder ? { cwd: folder } : {}), environment, name: task.title.slice(0, 60), uniqueName: true });
        sessionId = created.session.id;
        onNew = true;
      }
      task = await this.apply(task, { type: 'take', sessionId });
      const by = { kind: 'person' as const };
      // A new agent is told in its first prompt; one that is there already by the fixed sentence, where an agent is seen in front.
      const input = { sessionId, inputs: { task: taskText(task) }, replace: false, typeKickoff: !onNew };
      const run = task.workflowId
        ? await this.workflows.start({ ...input, workflowId: task.workflowId }, by)
        : task.elementId
          ? await this.workflows.startElement(this.drafts.runnable(task.elementId, task.projectId), input, by)
          : await this.workflows.startElement(Element.parse({ id: 'task', name: task.title, instructions: '{{task}}', doneWhen: 'The task is done, and your note says what was done.', origin: { kind: 'task' } }), input, by);
      // Nobody was there when this one started: what comes about because of its run sets off no rule, like a run a rule started.
      if (task.unattended) this.emitSettings(task.projectId, { ruleRuns: [...this.queue.ruleRuns, run.run.id].slice(-200) });
      task = await this.apply(this.find(taskId), { type: 'started', runId: run.run.id });
      // It may have moved already: a workflow that begins with an approval waits at once.
      const live = this.hub.state.runs.find((r) => r.id === run.run.id);
      if (live) this.follow(task, live);
      return { taskId, sessionId, ok: true, reason: null };
    } catch (error) {
      if (!(error instanceof NotFoundError || error instanceof ConflictError || error instanceof BadInputError)) this.options.onError?.(error);
      const reason = `It could not be started: ${(error as Error).message}`.slice(0, 600);
      const now = this.queue.tasks.find((t) => t.id === taskId);
      if (now) await this.apply(now, { type: 'fail', reason }).catch(() => {});
      return { taskId, sessionId, ok: false, reason };
    } finally {
      this.starting.delete(taskId);
    }
  }

  /**
   * Starts what can be started now without the owner pressing anything: every waiting task while automatic starting
   * is on, and otherwise only those the owner arranged beforehand (a time of a schedule). Called when a change event
   * says a place may be free; never by a timer. The limit and the hold count for all of them.
   */
  private maybeDispatch(): void {
    const wanted = (projectId: string): boolean => {
      const { hold, automatic } = queueSettingsOf(this.queue, projectId);
      return !this.closed && !hold && this.queue.tasks.some((task) => task.projectId === projectId && task.state === 'queued' && (automatic || task.unattended));
    };
    // Each project by itself: its own limit, its own hold, its own terminals.
    const projects = openProjects(this.hub.state).map((project) => project.id);
    if (!projects.some(wanted)) return;
    this.dispatching = this.dispatching
      .then(async () => {
        for (const projectId of projects) {
          // One at a time, looking again after each: a start changes who is free.
          for (let guard = 0; guard < 50; guard += 1) {
            if (!wanted(projectId)) break;
            const [next] = this.toStart(projectId, undefined, !queueSettingsOf(this.queue, projectId).automatic);
            if (!next) break;
            await this.startOne(next.taskId, next.sessionId);
          }
        }
      })
      .catch(this.options.onError ?? (() => {}));
  }

  /* ---------- What is asked of the owner in writing ---------- */

  addAsk(body: AddAskRequest, asker: Asker): Ask {
    if (this.queue.asks.length >= ASKS_MAX) throw new ConflictError(`${ASKS_MAX} things are written on the owner's list already.`);
    if (!asker.owner) {
      const waiting = this.queue.asks.filter((ask) => (asker.by.sessionId !== undefined && ask.addedBy.sessionId === asker.by.sessionId) || (asker.by.tokenId !== undefined && ask.addedBy.tokenId === asker.by.tokenId)).length;
      if (waiting >= ASKS_WAITING_MAX) throw new ConflictError(`${waiting} things you asked of the owner still wait, and that is as many as may. Wait for the owner; do not look for another way to ask.`);
    }
    if (body.source && !taskSource(body.source.kind)) throw new BadInputError(`Nothing comes from “${body.source.kind}”.`);
    const ask: Ask = { id: newId(), projectId: asker.projectId, text: body.text, addedBy: asker.by, source: this.sourceFor(asker, body.source), createdAt: new Date().toISOString() };
    this.hub.emit({ type: 'ask.changed', ask });
    this.fire({ id: `ask.added ${ask.id}`, event: 'ask.added', sentence: `${asker.owner ? 'You wrote' : 'Asked of you'}: ${ask.text}`.slice(0, 500), taskId: null, askId: ask.id, projectId: ask.projectId }, ask.source);
    return ask;
  }

  /** Done, or dismissed: either way it leaves the list. Which of the two is in the activity of the owner's own page only. */
  removeAsk(askId: string): Ask {
    const ask = this.queue.asks.find((a) => a.id === askId);
    if (!ask) throw new NotFoundError(`Nothing with the ID ${askId} is written on the list`);
    this.hub.emit({ type: 'ask.removed', askId });
    return ask;
  }

  /* ---------- Rules ---------- */

  /** The rules of one project; null: of every project. */
  rules(projectId: ProjectScope = null): RuleList {
    const state = this.hub.state;
    return { rules: this.queue.rules.filter((rule) => ofProject(rule, projectId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((rule) => ({ ...rule, says: ruleWords(rule, state) })), actions: actionKinds().map((kind) => ({ kind: kind.kind, title: kind.title, says: kind.says })) };
  }

  /** A rule is its project's: it hears what happens there, and what it starts is started there. */
  addRule(body: Pick<AddRuleRequest, 'event' | 'action'>, projectId: string): RuleList {
    const kind = actionKind(body.action.kind);
    if (!kind) throw new BadInputError(`A rule can: ${actionKinds().map((k) => k.kind).join(', ')}.`);
    // What the action names is looked for in the rule's own project, and in what is shared with it.
    const problem = kind.problem(body.action, stateOf(this.hub.state, projectId));
    if (problem) throw new BadInputError(problem);
    if (this.queue.rules.length >= RULES_MAX) throw new ConflictError(`There are ${RULES_MAX} rules; remove one first.`);
    const rule: Rule = { id: newId(), projectId, event: body.event, action: body.action, on: true, createdAt: new Date().toISOString() };
    this.hub.emit({ type: 'rule.changed', rule });
    return this.rules(projectId);
  }

  /** Switches a rule on or off. One that is off is kept and does nothing. */
  switchRule(ruleId: string, on: boolean): RuleList {
    const rule = this.queue.rules.find((r) => r.id === ruleId);
    if (!rule) throw new NotFoundError(`No rule ${ruleId}`);
    if (rule.on !== on) this.hub.emit({ type: 'rule.changed', rule: { ...rule, on } });
    return this.rules(rule.projectId);
  }

  removeRule(ruleId: string): void {
    if (!this.queue.rules.some((rule) => rule.id === ruleId)) throw new NotFoundError(`No rule ${ruleId}`);
    this.hub.emit({ type: 'rule.removed', ruleId });
  }

  private context(projectId: string): ActionContext {
    return {
      // An action sees its own project, and what is shared with it.
      state: stateOf(this.hub.state, projectId),
      notify: this.options.notify,
      runElement: async (elementId, on, task) => {
        let sessionId: string;
        let onNew = false;
        // Nothing of another project: not its terminal, not its canvas, not an element that is its own.
        if (on.kind === 'session' ? projectOfSession(this.hub.state, on.sessionId) !== projectId : this.hub.state.canvases.find((c) => c.id === on.canvasId)?.projectId !== projectId) throw new NotFoundError('What this rule runs on is not in its project any more.');
        if (on.kind === 'new') {
          sessionId = (await this.sessions.create({ agent: 'claude-code', agentArgs: [kickoffLine()], canvasId: on.canvasId, uniqueName: true, name: 'For a rule' })).session.id;
          onNew = true;
        } else sessionId = on.sessionId;
        const run = await this.workflows.startElement(this.drafts.runnable(elementId, projectId), { sessionId, inputs: { task }, replace: false, typeKickoff: !onNew }, { kind: 'person' });
        // Remembered while it goes: what comes about because of this run sets off no rule.
        this.emitSettings(projectId, { ruleRuns: [...this.queue.ruleRuns, run.run.id].slice(-200) });
        return run.run.id;
      },
    };
  }

  /**
   * Something happened that rules listen for. Each rule for it fires at most once for this one happening and at
   * most so many times a minute, and every firing is written down. What comes about because of a run that a rule
   * started (`viaRule` on its source) fires nothing: a rule cannot set itself off.
   */
  happened(occasion: Occasion, source: ItemSource = { kind: 'hand' }): void {
    this.fire(occasion, source);
  }

  private fire(occasion: Occasion, source: ItemSource): void {
    if ((source as { viaRule?: unknown }).viaRule === true) return;
    // A rule hears what happens in its own project, and nothing of another's. An archived project's rules are silent.
    if (!isOpenProject(this.hub.state, occasion.projectId)) return;
    for (const rule of this.queue.rules.filter((r) => r.on && r.event === occasion.event && r.projectId === occasion.projectId)) {
      const key = `${rule.id} ${occasion.id}`;
      if (this.fired.has(key)) continue;
      this.fired.add(key);
      if (this.fired.size > 5000) this.fired.delete(this.fired.values().next().value as string);
      const now = Date.now();
      const lately = (this.firedAt.get(rule.id) ?? []).filter((at) => at > now - 60_000);
      const record = (status: number, outcome: 'ok' | 'limited' | 'error'): void =>
        void this.options.activity.append({ at: new Date().toISOString(), caller: 'rule', tokenId: null, tokenName: `rule ${rule.id}`, action: `rule.${rule.action.kind}`, resource: {}, method: 'RULE', route: occasion.event, status, outcome });
      if (lately.length >= RULE_RATE_PER_MINUTE) {
        this.firedAt.set(rule.id, lately);
        record(429, 'limited');
        continue;
      }
      this.firedAt.set(rule.id, [...lately, now]);
      const kind = actionKind(rule.action.kind);
      if (!kind) {
        record(500, 'error');
        continue;
      }
      this.dispatching = this.dispatching
        .then(() => kind.run(rule.action, occasion, this.context(rule.projectId)))
        .then(
          () => record(200, 'ok'),
          (error: unknown) => {
            record(500, 'error');
            if (!(error instanceof NotFoundError || error instanceof ConflictError || error instanceof BadInputError)) this.options.onError?.(error);
          },
        );
    }
  }
}
