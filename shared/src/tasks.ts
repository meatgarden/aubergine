import { z } from 'zod';
import { EnvironmentKindName } from './environment';
import { Id } from './ids';
import { PlainName, type Run } from './workflows';

/**
 * The queue: work written once by the owner, taken by an agent that is free.
 *
 * A task is not executed by Aubergine. Starting one starts a run on a
 * terminal, by the existing start, and the task then follows its run. How a
 * task goes from one state to the next is one function, `stepTask`; which
 * task starts next, and where, is another, `nextToStart`. Both are pure.
 *
 * What an agent or a program adds here waits for the owner's yes first.
 */

const Timestamp = z.iso.datetime();

export const TASK_DETAILS_MAX = 4000;
export const TASKS_MAX = 500;
/** How many proposals of one session, or of one token, may wait for the owner at once. */
export const PROPOSALS_WAITING_MAX = 10;
export const TASK_LABELS_MAX = 8;
export const QUEUE_LIMIT_MAX = 20;

/** Text a person or an agent wrote for someone to read: several lines, no control characters, nothing that reverses direction. */
export const PlainWords = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^(?:[^\p{Cc}‪-‮⁦-⁩]|\n)*$/u, 'This is plain text, without control characters');

/** Who added something to one of the two lists. The same shape as who moved a run, with which session or token where it was one. */
export const AddedBy = z.object({
  kind: z.enum(['agent', 'person', 'token']),
  /** For a token: its name. For an agent: the name of its session, as it was then. */
  name: z.string().max(120).optional(),
  sessionId: Id.optional(),
  tokenId: Id.optional(),
});
export type AddedBy = z.infer<typeof AddedBy>;

/** `you`, `the agent in "api"`, `the program "ci"`. */
export function addedByWords(by: AddedBy): string {
  if (by.kind === 'person') return 'you';
  if (by.kind === 'agent') return by.name ? `the agent in “${by.name}”` : 'an agent';
  return by.name ? `the program “${by.name}”` : 'a program';
}

/* ---------- Where an item came from: a seam ---------- */

/** Where a task or a written item came from. Open on purpose: a later source adds its own fields. */
export const ItemSource = z.looseObject({ kind: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/) });
export type ItemSource = z.infer<typeof ItemSource>;

/**
 * A kind of source. Today: written by hand, a line of a run's checklist, the
 * API. A later kind (a schedule, something that arrives from outside) is one
 * more registration: nothing that stores, lists or draws an item looks at
 * the name of a source, only at what its entry says.
 */
export interface TaskSourceKind {
  kind: string;
  /** What it is called in a list of sources. */
  title: string;
  /** Where this one item came from, in a few words, for the row that shows it. */
  words(source: ItemSource): string;
  /** True where what a task from here hands in should say where the task came from. */
  says?: boolean;
}
const sourceKinds = new Map<string, TaskSourceKind>();
export function registerTaskSource(kind: TaskSourceKind): void {
  sourceKinds.set(kind.kind, kind);
}
export function unregisterTaskSource(kind: string): void {
  sourceKinds.delete(kind);
}
export const taskSource = (kind: string): TaskSourceKind | undefined => sourceKinds.get(kind);
export const taskSourceNames = (): string[] => [...sourceKinds.keys()];
/** Where an item came from, in words; for a source this version does not know, its kind. */
export const sourceWords = (source: ItemSource): string => sourceKinds.get(source.kind)?.words(source) ?? `from “${source.kind}”`;

registerTaskSource({ kind: 'hand', title: 'Written by hand', words: () => 'written by hand' });
registerTaskSource({ kind: 'checklist', title: 'A line of a checklist', words: (source) => (typeof source.from === 'string' && source.from ? `from a checklist of “${source.from}”` : 'from a checklist') });
registerTaskSource({ kind: 'api', title: 'Through the API', words: () => 'through the API' });

/* ---------- Tasks ---------- */

/** Who may take a task. */
export const TaskTaker = z.discriminatedUnion('kind', [
  /** Any terminal on a canvas where an agent is seen in front and is free. */
  z.object({ kind: z.literal('any') }),
  /** One terminal, when its agent is free. */
  z.object({ kind: z.literal('session'), sessionId: Id }),
  /** A new agent terminal, started for it on this canvas. */
  z.object({ kind: z.literal('new'), canvasId: Id }),
]);
export type TaskTaker = z.infer<typeof TaskTaker>;

export const TaskState = z.enum(['proposed', 'queued', 'taken', 'working', 'needs-owner', 'done', 'failed', 'withdrawn']);
export type TaskState = z.infer<typeof TaskState>;
export const TASK_STATE_WORDS: Record<TaskState, string> = {
  proposed: 'waits for your yes',
  queued: 'next',
  taken: 'starting',
  working: 'working',
  'needs-owner': 'needs you',
  done: 'done',
  failed: 'failed',
  withdrawn: 'withdrawn',
};
/** The states in which a task holds one of the places that may work at once. */
export const BUSY_STATES: readonly TaskState[] = ['taken', 'working', 'needs-owner'];
/** The states after which nothing more happens to a task. */
export const OVER_STATES: readonly TaskState[] = ['done', 'failed', 'withdrawn'];

export const TaskLabel = z.string().trim().min(1).max(32).regex(/^[^\p{Cc}‪-‮⁦-⁩]*$/u);

export const Task = z.object({
  id: Id,
  projectId: Id.describe('The project it belongs to. Set by the server from where it was made.'),
  title: PlainName.describe('What it is, in one line. Shown in lists and in terminals.'),
  details: PlainWords(TASK_DETAILS_MAX).default('').describe('What to do, for the agent that takes it. Plain text.'),
  folder: z.string().startsWith('/').max(4096).nullable().default(null).describe('The folder it is done in. For a new terminal: where it starts. Null: the folder new terminals start in.'),
  workflowId: Id.nullable().default(null).describe('The workflow it goes through. Null: it is told as one element, with the details as its task.'),
  elementId: Id.nullable().default(null).describe('The shelf element it runs, where it runs one and no workflow. Set by the server for what a schedule adds.'),
  unattended: z
    .boolean()
    .default(false)
    .describe('True for what the owner arranged beforehand, such as a time of a schedule. It starts when a place is free without being started by hand, still within the limit and the hold, and what its agent adds sets off no rule. Set by the server, never by a caller.'),
  environment: EnvironmentKindName.nullable().default(null).describe('Where a new terminal for it works. Null: in a working copy of its own where the folder can have one, else in the folder itself.'),
  taker: TaskTaker.default({ kind: 'any' }).describe('Who may take it.'),
  addedBy: AddedBy,
  source: ItemSource.default({ kind: 'hand' }),
  labels: z.array(TaskLabel).max(TASK_LABELS_MAX).default([]),
  order: z.number().finite().describe('Its place among the tasks that wait: lower is sooner.'),
  state: TaskState,
  sessionId: Id.nullable().default(null).describe('The terminal that took it.'),
  runId: Id.nullable().default(null).describe('The run it became.'),
  reason: z.string().max(600).nullable().default(null).describe('With `failed` and `needs-owner`: why, in a sentence.'),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  endedAt: Timestamp.nullable().default(null),
});
export type Task = z.infer<typeof Task>;

/** What can happen to a task. Every route, button, command and change of a run sends one of these. */
export type TaskStep =
  /** The owner says yes to a proposal. */
  | { type: 'accept' }
  /** The owner says no to a proposal. */
  | { type: 'decline' }
  /** Taken back before it started: by the owner, or by whoever proposed it. */
  | { type: 'withdraw' }
  /** A terminal is chosen for it. */
  | { type: 'take'; sessionId: string }
  /** Its run began. */
  | { type: 'started'; runId: string }
  /** It could not be started, or what it ran on is gone. */
  | { type: 'fail'; reason: string }
  /** Its run moved: the task follows. */
  | { type: 'run'; status: Run['status']; reason?: string | null }
  /** The owner put it back among the waiting ones, after it failed. Nothing does this by itself. */
  | { type: 'again' };

export type TaskStepResult = { ok: true; task: Task } | { ok: false; reason: string };

/**
 * The next state of a task. Pure. This is the only place that knows how a
 * task moves. A task follows its run: a run that waits for approval or is
 * blocked needs the owner, a finished run is a done task, a stopped one a
 * failed task. Nothing here starts anything again.
 */
export function stepTask(task: Task, step: TaskStep, at: string): TaskStepResult {
  const to = (state: TaskState, more: Partial<Task> = {}): TaskStepResult => ({ ok: true, task: { ...task, ...more, state, updatedAt: at, endedAt: OVER_STATES.includes(state) ? at : null } });
  const no = (reason: string): TaskStepResult => ({ ok: false, reason });
  const words = TASK_STATE_WORDS[task.state];
  switch (step.type) {
    case 'accept':
      return task.state === 'proposed' ? to('queued') : no(`This task does not wait for a yes: it is ${words}.`);
    case 'decline':
      return task.state === 'proposed' ? to('withdrawn', { reason: 'Declined.' }) : no(`This task does not wait for a yes: it is ${words}.`);
    case 'withdraw':
      return task.state === 'proposed' || task.state === 'queued' ? to('withdrawn', { reason: null }) : no(`This task can no longer be withdrawn: it is ${words}. Stop its run instead.`);
    case 'take':
      return task.state === 'queued' ? to('taken', { sessionId: step.sessionId, reason: null }) : no(`This task is not waiting to be started: it is ${words}.`);
    case 'started':
      return task.state === 'taken' ? to('working', { runId: step.runId }) : no(`This task was not being started: it is ${words}.`);
    case 'fail':
      return BUSY_STATES.includes(task.state) || task.state === 'queued' ? to('failed', { reason: step.reason.slice(0, 600) }) : no(`This task is ${words}.`);
    case 'again':
      return task.state === 'failed' ? to('queued', { sessionId: null, runId: null, reason: null }) : no(`Only a task that failed can be put back: this one is ${words}.`);
    case 'run': {
      if (task.state !== 'working' && task.state !== 'needs-owner') return no(`This task is not on a run: it is ${words}.`);
      if (step.status === 'finished') return to('done', { reason: null });
      if (step.status === 'stopped') return to('failed', { reason: 'Its run was stopped before it finished.' });
      if (step.status === 'awaiting') return to('needs-owner', { reason: (step.reason ?? 'Its run waits for your approval.').slice(0, 600) });
      if (step.status === 'blocked') return to('needs-owner', { reason: (step.reason ? `Blocked: ${step.reason}` : 'Its run is blocked.').slice(0, 600) });
      return to('working', { reason: null });
    }
  }
}

/* ---------- Dispatch ---------- */

/** What dispatch needs to know of a terminal. */
export interface DispatchSession {
  id: string;
  state: string;
  /** The program in front, when known. */
  command: string | null;
  agent: { program: string | null } | null;
  attention: { state: string };
  /** Whether it is on a canvas (a parked terminal is on none). */
  onCanvas: boolean;
}

/**
 * Whether a terminal can be given a task now: on a canvas, its shell running, an agent seen in front (the program
 * that was in front when the agent last reported is in front now), not on a run, and not in the middle of its own
 * work or waiting on a question. A terminal where no agent is seen in front is never free for a task.
 */
export function isFreeAgent(session: DispatchSession, onRun: ReadonlySet<string>): boolean {
  if (session.state !== 'open' || !session.onCanvas || onRun.has(session.id)) return false;
  if (session.agent === null || session.agent.program === null || session.command !== session.agent.program) return false;
  return session.attention.state !== 'working' && session.attention.state !== 'waiting';
}

export interface ToStart {
  taskId: string;
  /** The terminal that takes it; null for a task that gets a new one. */
  sessionId: string | null;
}

/**
 * Which tasks to start now, and on which terminal. Pure. At most `limit`
 * tasks hold a place at once; nothing starts while `hold` is on; tasks are
 * looked at in their order, and one that nobody can take now is passed over,
 * not waited for. No terminal is given two tasks, nor one while it is on a run.
 */
export function nextToStart(tasks: readonly Task[], sessions: readonly DispatchSession[], runs: readonly Pick<Run, 'sessionId'>[], limit: number, hold: boolean, canvasIds: readonly string[] = []): ToStart[] {
  if (hold) return [];
  let places = limit - tasks.filter((task) => BUSY_STATES.includes(task.state)).length;
  if (places <= 0) return [];
  const taken = new Set<string>([...runs.flatMap((run) => (run.sessionId ? [run.sessionId] : [])), ...tasks.flatMap((task) => (BUSY_STATES.includes(task.state) && task.sessionId ? [task.sessionId] : []))]);
  const starts: ToStart[] = [];
  for (const task of waitingTasks(tasks)) {
    if (places <= 0) break;
    let sessionId: string | null | undefined;
    if (task.taker.kind === 'new') sessionId = canvasIds.length === 0 || canvasIds.includes(task.taker.canvasId) ? null : undefined;
    else if (task.taker.kind === 'session') {
      const wanted = task.taker.sessionId;
      sessionId = sessions.find((session) => session.id === wanted && isFreeAgent(session, taken))?.id;
    } else sessionId = sessions.find((session) => isFreeAgent(session, taken))?.id;
    if (sessionId === undefined) continue;
    if (sessionId !== null) taken.add(sessionId);
    starts.push({ taskId: task.id, sessionId });
    places -= 1;
  }
  return starts;
}

/** The tasks that wait to be started, in their order. */
export const waitingTasks = (tasks: readonly Task[]): Task[] => tasks.filter((task) => task.state === 'queued').sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/** Why a task that waits cannot be started on anything now, in a sentence; null when it can. */
export function whyNotNow(task: Task, sessions: readonly DispatchSession[], runs: readonly Pick<Run, 'sessionId'>[], canvasIds: readonly string[]): string | null {
  const onRun = new Set(runs.flatMap((run) => (run.sessionId ? [run.sessionId] : [])));
  if (task.taker.kind === 'new') return canvasIds.includes(task.taker.canvasId) ? null : 'The canvas its new terminal was to start on is gone.';
  if (task.taker.kind === 'session') {
    const wanted = task.taker.sessionId;
    const session = sessions.find((s) => s.id === wanted);
    if (!session) return 'The terminal it was meant for is gone.';
    return isFreeAgent(session, onRun) ? null : 'The terminal it is meant for is not free: no agent is seen in front there, or it is at work.';
  }
  return sessions.some((session) => isFreeAgent(session, onRun)) ? null : 'No terminal has a free agent in front. Start one, or give the task a new terminal of its own.';
}

/* ---------- What is asked of the owner in writing ---------- */

export const WRITTEN_MAX = 1000;
export const ASKS_MAX = 200;
export const ASKS_WAITING_MAX = 10;

/** Something written on the owner's list: by the owner, or asked of them by a session or a program. */
export const Ask = z.object({
  id: Id,
  projectId: Id.describe('The project it belongs to. Set by the server from where it was made.'),
  text: PlainWords(WRITTEN_MAX).min(1),
  addedBy: AddedBy,
  source: ItemSource.default({ kind: 'hand' }),
  createdAt: Timestamp,
});
export type Ask = z.infer<typeof Ask>;

/* ---------- Rules: when something happens, do something ---------- */

export const RuleEvent = z.enum(['task.done', 'task.failed', 'task.needs-owner', 'ask.added', 'schedule.fired', 'schedule.failed']);
export type RuleEvent = z.infer<typeof RuleEvent>;
export const RULE_EVENT_WORDS: Record<RuleEvent, string> = {
  'task.done': 'a task is done',
  'task.failed': 'a task failed',
  'task.needs-owner': 'a task needs you',
  'ask.added': 'something is asked of you',
  'schedule.fired': 'a schedule fired',
  'schedule.failed': 'a schedule could not run or was missed',
};
export const RULES_MAX = 50;
/** How often one rule may fire in a minute. What comes after that is dropped, and said in the activity log. */
export const RULE_RATE_PER_MINUTE = 6;

/** What a rule does. The kind is one of the registered kinds of action; the rest is that kind's own. */
export const RuleAction = z.looseObject({ kind: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/) });
export type RuleAction = z.infer<typeof RuleAction>;

/** "When this happens, do that." Written by the owner alone. */
export const Rule = z.object({
  id: Id,
  projectId: Id.describe('The project it belongs to. Set by the server from where it was made.'),
  event: RuleEvent,
  action: RuleAction,
  /** False: it is kept and does nothing. A rule that came in a project file arrives so, until the owner switches it on. */
  on: z.boolean().default(true),
  createdAt: Timestamp,
});
export type Rule = z.infer<typeof Rule>;

/** What happened, as a rule's action is told it: one sentence, and what it is about. */
export interface Occasion {
  /** Unique to this one happening: a rule fires at most once for it. */
  id: string;
  event: RuleEvent;
  sentence: string;
  taskId: string | null;
  askId: string | null;
  /** The project it happened in. A rule hears only what happens in its own. */
  projectId: string;
}

/** The sentence for something that happened to a task. */
export function occasionOfTask(task: Task, event: 'task.done' | 'task.failed' | 'task.needs-owner'): Occasion {
  const what = event === 'task.done' ? 'is done' : event === 'task.failed' ? `failed${task.reason ? `: ${task.reason}` : ''}` : `needs you${task.reason ? `: ${task.reason}` : ''}`;
  return { id: `${event} ${task.id} ${task.updatedAt}`, event, sentence: `The task “${task.title}” ${what}`.slice(0, 500), taskId: task.id, askId: null, projectId: task.projectId };
}

/* ---------- The queue, as the state keeps it ---------- */

/** How one project's tasks are started. */
export const QueueProjectSettings = z.object({
  /** How many tasks may hold a place at once. */
  limit: z.number().int().min(1).max(QUEUE_LIMIT_MAX).default(3),
  /** No new task is started while this is on. What is running is not touched. */
  hold: z.boolean().default(false),
  /** Tasks start by themselves when a place is free. Off unless the owner switched it on. */
  automatic: z.boolean().default(false),
});
export type QueueProjectSettings = z.infer<typeof QueueProjectSettings>;
export const QUEUE_SETTINGS_AT_FIRST: QueueProjectSettings = { limit: 3, hold: false, automatic: false };
/** How a project's tasks are started. */
export const queueSettingsOf = (queue: { settings: Record<string, QueueProjectSettings> }, projectId: string): QueueProjectSettings => queue.settings[projectId] ?? QUEUE_SETTINGS_AT_FIRST;

export const QueueState = z.object({
  tasks: z.array(Task).max(TASKS_MAX).default([]),
  asks: z.array(Ask).max(ASKS_MAX).default([]),
  rules: z.array(Rule).max(RULES_MAX).default([]),
  /** How tasks are started, for each project that changed it. A project that is not here has the settings every project starts with. */
  settings: z.record(z.string(), QueueProjectSettings).default({}),
  /** Runs a rule started and that are still going: what happens because of one of them sets off no rule. */
  ruleRuns: z.array(Id).max(200).default([]),
});
export type QueueState = z.infer<typeof QueueState>;

/** `2 working, 3 next, 1 waits for your yes`. */
export function queueWords(tasks: readonly Task[]): string {
  const count = (states: readonly TaskState[]): number => tasks.filter((task) => states.includes(task.state)).length;
  const parts = [
    count(['needs-owner']) > 0 ? `${count(['needs-owner'])} need you` : '',
    `${count(['taken', 'working'])} working`,
    `${count(['queued'])} next`,
    count(['proposed']) > 0 ? `${count(['proposed'])} for your yes` : '',
    count(['done']) > 0 ? `${count(['done'])} done to look at` : '',
    count(['failed']) > 0 ? `${count(['failed'])} failed` : '',
  ].filter((part) => part !== '');
  return parts.join(', ');
}

/** The place for a task put last among those that wait. */
export const orderAtEnd = (tasks: readonly Task[]): number => Math.max(0, ...tasks.map((task) => task.order)) + 1;

/** The task that a one-element run is told: the details where there are any, else the title. */
export const taskText = (task: Pick<Task, 'title' | 'details'>): string => (task.details.trim() !== '' ? `${task.title}\n\n${task.details}` : task.title);

/** A task as plain lines, for a terminal. */
export function taskLine(task: Task): string {
  return `${TASK_STATE_WORDS[task.state].padEnd(18)} ${task.title}  (added by ${addedByWords(task.addedBy)}${task.reason ? `; ${task.reason}` : ''})  [${task.id}]`;
}
