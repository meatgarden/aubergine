import { z } from 'zod';
import { needsUser, type AppState, type Session } from './entities';
import { messagesWantOwner } from './messages';
import { outputKind } from './outputs';
import { addedByWords, sourceWords, taskSource } from './tasks';
import { versionOf, type ArchivedRun, type Run } from './workflows';

/**
 * "For you": everything that waits on a person, in one list, gathered from
 * what exists. One pure function makes it; the screen, the route, the
 * command and the tool all show what it returns.
 *
 * An item that is gathered is never ticked: it goes when the thing itself is
 * done. Only what was written on the list is marked done by the owner.
 *
 * The count in the toolbar and the waiting queue are this list too: they are
 * the items here that are about a terminal waiting (`waits`), from the same
 * function, `sessionsWaiting`.
 */

/** One thing that waits on the owner. */
export const ForYouItem = z.object({
  id: z.string().describe('Stays the same while the thing waits: its kind and what it is about.'),
  kind: z.string(),
  title: z.string().describe("What its kind is called: `Approval`, `A draft to read`."),
  sentence: z.string().describe('What waits, in a sentence. Where part of it was written by an agent or a program, it is their words.'),
  from: z.string().describe('Where it came from: a terminal by name, a program, the library.'),
  at: z.iso.datetime().nullable().describe('Since when, when that is known.'),
  act: z.string().describe('Where one acts on it: `run:<id>`, `session:<id>`, `task:<id>`, `ask:<id>`, `copy:<id>`, `schedule:<id>`, `review`.'),
  waits: z.boolean().describe('True for a terminal that waits for the owner: these are what the count in the toolbar counts.'),
  written: z.boolean().describe('True for something written on the list, which the owner marks done. False for what is gathered: that goes when the thing is done.'),
  sessionId: z.string().nullable(),
  runId: z.string().nullable(),
  taskId: z.string().nullable(),
  askId: z.string().nullable(),
  environmentId: z.string().nullable(),
  /** For a checklist: the element that handed it in. */
  elementId: z.string().nullable(),
});
export type ForYouItem = z.infer<typeof ForYouItem>;

export const ForYou = z.object({
  items: z.array(ForYouItem),
  /** How many of them are terminals waiting: the number the toolbar shows. */
  waiting: z.number().int(),
  summary: z.string(),
});
export type ForYou = z.infer<typeof ForYou>;

export interface ForYouInput {
  state: AppState;
  now: number;
  /** Runs that ended lately, newest first: a list handed in is still to be read after its run is over. */
  ended: readonly ArchivedRun[];
}

type Made = Partial<ForYouItem> & Pick<ForYouItem, 'id' | 'sentence' | 'from' | 'act'>;

/**
 * A kind of thing that waits on the owner. A later stage adds one by
 * registering it; nothing that lists or draws the items knows a kind by name.
 */
export interface ForYouKind {
  kind: string;
  title: string;
  /** Lower numbers come first. */
  order: number;
  items(input: ForYouInput): Made[];
}
const kinds = new Map<string, ForYouKind>();
export function registerForYouKind(kind: ForYouKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterForYouKind(kind: string): void {
  kinds.delete(kind);
}
export const forYouKinds = (): ForYouKind[] => [...kinds.values()].sort((a, b) => a.order - b.order || a.kind.localeCompare(b.kind));

/* ---------- Terminals that wait: the one test the toolbar and this list share ---------- */

export type WaitingFor = 'approval' | 'blocked' | 'question' | 'finished' | 'message';

/** Why a terminal waits for the owner, or null when it does not. */
export function waitingFor(session: Session, run: Pick<Run, 'status'> | undefined): WaitingFor | null {
  if (session.state === 'exited') return null;
  if (run?.status === 'awaiting') return 'approval';
  if (run?.status === 'blocked') return 'blocked';
  if (session.attention.state === 'waiting') return 'question';
  if (session.attention.state === 'done') return 'finished';
  if (messagesWantOwner(session.messages)) return 'message';
  return null;
}

export interface WaitingSession {
  session: Session;
  run: Run | null;
  why: WaitingFor;
  at: string | null;
}

/**
 * The terminals that wait for the owner, the one that has waited longest first. This is the waiting queue: the
 * count in the toolbar is its length, "next waiting" walks it, and the owner's list holds one item for each.
 */
export function sessionsWaiting(sessions: readonly Session[], runs: readonly Run[]): WaitingSession[] {
  const onRun = new Map(runs.flatMap((run) => (run.sessionId ? [[run.sessionId, run] as const] : [])));
  const found: WaitingSession[] = [];
  for (const session of sessions) {
    const run = onRun.get(session.id) ?? null;
    const why = waitingFor(session, run ?? undefined);
    if (why === null) continue;
    const at = why === 'approval' || why === 'blocked' ? (run?.updatedAt ?? null) : needsUser(session.attention) ? session.attention.at : session.messages.at;
    found.push({ session, run, why, at });
  }
  return found.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.session.id.localeCompare(b.session.id));
}

const terminalKind = (kind: string, title: string, order: number, why: WaitingFor, sentence: (w: WaitingSession) => string): void =>
  registerForYouKind({
    kind,
    title,
    order,
    items: ({ state }) =>
      sessionsWaiting(state.sessions, state.runs)
        .filter((w) => w.why === why)
        .map((w) => ({ id: `${kind}:${w.session.id}`, sentence: sentence(w), from: w.session.name, at: w.at, act: w.run && (why === 'approval' || why === 'blocked') ? `run:${w.run.id}` : `session:${w.session.id}`, waits: true, sessionId: w.session.id, runId: w.run?.id ?? null })),
  });

terminalKind('approval', 'Approval', 10, 'approval', (w) => `“${w.session.name}” waits for your approval${w.session.attention.message ? `: ${w.session.attention.message}` : '.'}`);
terminalKind('blocked', 'Blocked', 11, 'blocked', (w) => `“${w.session.name}” is blocked${w.run?.blockedReason ? `: ${w.run.blockedReason}` : '.'}`);
terminalKind('question', 'A terminal waits', 12, 'question', (w) => `“${w.session.name}” waits for you${w.session.attention.message ? `: ${w.session.attention.message}` : '.'}`);
terminalKind('message', 'A message', 13, 'message', (w) => (w.session.messages.paused > 0 ? `“${w.session.name}” and another terminal have exchanged many messages. Continue?` : `“${w.session.name}” has a message for you.`));
terminalKind('finished', 'Finished', 30, 'finished', (w) => `“${w.session.name}” has finished${w.session.attention.message ? `: ${w.session.attention.message}` : '.'}`);

/* ---------- The other kinds there are today ---------- */

registerForYouKind({
  kind: 'proposal',
  title: 'A task for your yes',
  order: 20,
  items: ({ state }) =>
    state.queue.tasks.filter((task) => task.state === 'proposed').map((task) => ({ id: `proposal:${task.id}`, sentence: `Proposed for the queue: “${task.title}”.`, from: `${addedByWords(task.addedBy)}, ${sourceWords(task.source)}`, at: task.createdAt, act: `task:${task.id}`, taskId: task.id })),
});

registerForYouKind({
  kind: 'ask',
  title: 'Asked of you',
  order: 21,
  items: ({ state }) => state.queue.asks.map((ask) => ({ id: `ask:${ask.id}`, sentence: ask.text, from: `${addedByWords(ask.addedBy)}, ${sourceWords(ask.source)}`, at: ask.createdAt, act: `ask:${ask.id}`, written: true, askId: ask.id })),
});

registerForYouKind({
  kind: 'task-failed',
  title: 'A task failed',
  order: 22,
  items: ({ state }) =>
    state.queue.tasks.filter((task) => task.state === 'failed').map((task) => ({ id: `task-failed:${task.id}`, sentence: `The task “${task.title}” failed${task.reason ? `: ${task.reason}` : '.'}`, from: sessionName(state, task.sessionId) ?? 'the queue', at: task.endedAt, act: `task:${task.id}`, taskId: task.id, runId: task.runId })),
});

registerForYouKind({
  kind: 'task-done',
  title: 'A task is done',
  order: 23,
  items: ({ state }) =>
    state.queue.tasks.filter((task) => task.state === 'done').map((task) => ({ id: `task-done:${task.id}`, sentence: `The task “${task.title}” is done. Look at what was made.`, from: sessionName(state, task.sessionId) ?? 'the queue', at: task.endedAt, act: `task:${task.id}`, taskId: task.id, runId: task.runId, sessionId: task.sessionId })),
});

registerForYouKind({
  kind: 'draft',
  title: 'A draft to read',
  order: 24,
  items: ({ state }) =>
    state.drafts
      .filter((draft) => draft.status === 'waiting')
      .map((draft) => ({ id: `draft:${draft.id}`, sentence: `A draft of ${draft.kind === 'workflow' ? 'a workflow' : 'an element'} waits to be read: “${draft.workflow?.name ?? draft.element?.name ?? 'unnamed'}”.`, from: sessionName(state, draft.sessionId) ?? 'a program', at: draft.updatedAt, act: 'review' })),
});

registerForYouKind({
  kind: 'library',
  title: 'An install to read',
  order: 25,
  items: ({ state }) => state.library.requests.map((request) => ({ id: `library:${request.id}`, sentence: `An item of the library waits to be read before it is installed: “${request.itemId}”.`, from: 'the library', at: request.at, act: 'review' })),
});

/** The latest list a run handed in, with how far the owner has got through it. */
function listOf(run: Run, elements: readonly { id: string; name: string; produces?: string }[]): { elementId: string; name: string; total: number; ticked: number } | null {
  for (let index = run.elements.length - 1; index >= 0; index -= 1) {
    const entry = run.elements[index];
    if (!entry || entry.output === null || entry.output === undefined) continue;
    const element = elements.find((e) => e.id === entry.elementId);
    const total = outputKind(element?.produces ?? 'note')?.items(entry.output) ?? 0;
    if (total > 0) return { elementId: entry.elementId, name: element?.name ?? entry.elementId, total, ticked: new Set(entry.ticks.map((tick) => tick.item).filter((item) => item < total)).size };
  }
  return null;
}

registerForYouKind({
  kind: 'checklist',
  title: 'A list handed in',
  order: 26,
  items: ({ state, ended, now }) => {
    const made: Made[] = [];
    const add = (run: Run, workflowName: string, elements: readonly { id: string; name: string; produces?: string }[]): void => {
      const list = listOf(run, elements);
      // A list with every line ticked has been dealt with.
      if (!list || list.ticked >= list.total) return;
      made.push({ id: `checklist:${run.id}`, sentence: `A list was handed in by “${list.name}” of “${workflowName}”: ${list.ticked} of ${list.total} ticked.`, from: `${sessionName(state, run.sessionId) ?? 'a terminal that is gone'}${cameFrom(state, run.id)}`, at: run.updatedAt, act: `run:${run.id}`, runId: run.id, sessionId: run.sessionId, elementId: list.elementId });
    };
    for (const run of state.runs) {
      const workflow = state.workflows.find((w) => w.id === run.workflowId);
      const version = workflow ? versionOf(workflow, run.workflowVersion) : null;
      if (version) add(run, version.name, version.elements);
    }
    // After its run is over a list is still to be read, for a day.
    for (const entry of ended) if (entry.run.finishedAt !== null && Date.parse(entry.run.finishedAt) >= now - 24 * 3600 * 1000) add(entry.run, entry.workflowName, entry.elements);
    return made;
  },
});

registerForYouKind({
  kind: 'copy',
  title: 'A working copy to decide about',
  order: 40,
  items: ({ state }) => {
    const done = new Set(state.queue.tasks.flatMap((task) => (task.state === 'done' && task.sessionId ? [task.sessionId] : [])));
    return state.environments
      .filter((environment) => environment.sessionId === null || done.has(environment.sessionId))
      .map((environment) => ({
        id: `copy:${environment.id}`,
        sentence: environment.sessionId === null ? `The terminal of “${environment.sessionName}” is gone and what it worked in is still there${environment.branch ? `, on the branch ${environment.branch}` : ''}.` : `The task of “${environment.sessionName}” is done. Decide what becomes of what it worked in${environment.branch ? `, on the branch ${environment.branch}` : ''}.`,
        from: environment.sessionName,
        at: environment.changes?.at ?? environment.createdAt,
        act: `copy:${environment.id}`,
        environmentId: environment.id,
        sessionId: environment.sessionId,
      }));
  },
});

/** For a run that a task became, where that task's source says it is worth saying: `, from the schedule "…"`. Else nothing. */
function cameFrom(state: AppState, runId: string): string {
  const task = state.queue.tasks.find((t) => t.runId === runId);
  return task && taskSource(task.source.kind)?.says ? `, ${sourceWords(task.source)}` : '';
}

registerForYouKind({
  kind: 'schedule',
  title: 'A schedule could not run',
  order: 27,
  // One item for a schedule for as long as it cannot run as it is written: not one for each of its times.
  items: ({ state }) =>
    state.schedules.items
      .filter((schedule) => schedule.on && schedule.problem !== null)
      .map((schedule) => ({ id: `schedule:${schedule.id}`, sentence: `The schedule “${schedule.name}” could not run: ${schedule.problem ?? ''}`, from: 'a schedule', at: schedule.last?.at ?? schedule.updatedAt, act: `schedule:${schedule.id}` })),
});

function sessionName(state: AppState, sessionId: string | null): string | null {
  return sessionId ? (state.sessions.find((s) => s.id === sessionId)?.name ?? null) : null;
}

/** Everything that waits on the owner, the kinds in their order, the oldest first within a kind. */
export function forYou(state: AppState, now: number, ended: readonly ArchivedRun[] = []): ForYou {
  const items: ForYouItem[] = [];
  for (const kind of forYouKinds()) {
    const made = kind.items({ state, now, ended });
    made.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id));
    for (const item of made) items.push({ kind: kind.kind, title: kind.title, at: null, waits: false, written: false, sessionId: null, runId: null, taskId: null, askId: null, environmentId: null, elementId: null, ...item });
  }
  const waiting = items.filter((item) => item.waits).length;
  return { items, waiting, summary: items.length === 0 ? 'Nothing waits for you.' : `${items.length} ${items.length === 1 ? 'thing waits' : 'things wait'} for you${waiting > 0 ? `, ${waiting} of them ${waiting === 1 ? 'a terminal' : 'terminals'}` : ''}.` };
}

/** What to type to act on an item, for a terminal: the command that goes where its address points. */
export function actWords(item: Pick<ForYouItem, 'act' | 'from'>): string {
  const [what, id] = item.act.split(':');
  if (what === 'run') return `aubergine workflow approve "${item.from}"   (or send-back; see: aubergine board)`;
  if (what === 'session') return `aubergine attach "${item.from}"`;
  if (what === 'task') return `aubergine task show ${id ?? ''}`;
  if (what === 'ask') return `aubergine todo done ${id ?? ''}`;
  if (what === 'copy') return 'aubergine copies';
  if (what === 'schedule') return 'aubergine schedule list';
  return 'in the browser: Review';
}

/** The list as plain text, for a terminal and for a program that reads text. */
export function forYouText(list: ForYou): string {
  if (list.items.length === 0) return list.summary;
  return [list.summary, '', ...list.items.flatMap((item) => [`${item.title}: ${item.sentence}`, `    from ${item.from}${item.written ? '' : ''}  →  ${actWords(item)}`])].join('\n');
}
