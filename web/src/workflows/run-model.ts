import { RUN_STATUS_WORDS, isQuiet, outputKind, versionOf, type Actor, type AppState, type ElementState, type Run, type RunRecord, type RunStatus, type WorkflowVersion } from '@aubergine/shared';

/**
 * Runs as the page shows them: pure functions of the page's state. The
 * components only draw what these return.
 */

const bySession = new WeakMap<readonly Run[], Map<string, Run>>();

/** The run each session is on. Worked out once per list of runs. */
export function runsBySession(runs: readonly Run[]): Map<string, Run> {
  let known = bySession.get(runs);
  if (!known) {
    known = new Map(runs.flatMap((run) => (run.sessionId !== null ? [[run.sessionId, run] as const] : [])));
    bySession.set(runs, known);
  }
  return known;
}

export const runOfSession = (app: AppState | null, sessionId: string): Run | null => (app ? (runsBySession(app.runs).get(sessionId) ?? null) : null);

/** The version of its workflow a run goes through, or null when it cannot be found. */
export function versionOfRun(app: AppState, run: Run): WorkflowVersion | null {
  const workflow = app.workflows.find((w) => w.id === run.workflowId);
  return workflow ? versionOf(workflow, run.workflowVersion) : null;
}

export interface Segment {
  id: string;
  name: string;
  /** The kind of thing it produces. */
  produces: string;
  state: ElementState;
}

export interface RunPicture {
  run: Run;
  workflowName: string;
  /** One per element, in order. */
  segments: Segment[];
  /** The element being worked on. */
  current: { id: string; name: string; number: number } | null;
  total: number;
  /** In a few words: `Build · 2 of 3`, or the status when there is no current element. */
  position: string;
  /** The session has printed for a while since the last report: the picture may be behind. */
  quiet: boolean;
}

/** A mark and a word for each status, so that it never rests on color alone. */
export const STATUS_MARK: Record<RunStatus, string> = { queued: '…', running: '▶', paused: '‖', blocked: '!', awaiting: '?', finished: '✓', stopped: '■' };
export const STATUS_WORD: Record<RunStatus, string> = { ...RUN_STATUS_WORDS, running: 'running' };
export const STATE_MARK: Record<ElementState, string> = { pending: '○', active: '▶', done: '✓', skipped: '–' };

/** Everything the strip, the row and the run view need to draw one run. */
export function pictureOf(
  run: Run,
  names: { workflowName: string; elements: readonly { id: string; name: string; produces?: string }[] },
  lastOutputAt: string | null,
  quietAfterSeconds: number,
): RunPicture {
  const segments = names.elements.map((element) => ({ id: element.id, name: element.name, produces: element.produces ?? 'note', state: run.elements.find((e) => e.elementId === element.id)?.state ?? 'pending' }));
  const index = names.elements.findIndex((e) => e.id === run.currentElementId);
  const current = index >= 0 ? { id: (names.elements[index] as { id: string }).id, name: (names.elements[index] as { name: string }).name, number: index + 1 } : null;
  return {
    run,
    workflowName: names.workflowName,
    segments,
    current,
    total: segments.length,
    // A stopped run keeps the step it was stopped on.
    position: !current ? STATUS_WORD[run.status] : run.status === 'stopped' ? `stopped at ${current.name}` : `${current.name} · ${current.number} of ${segments.length}`,
    quiet: isQuiet(run, lastOutputAt, quietAfterSeconds),
  };
}

/** The picture of a live run, from the page's state. Null when its workflow cannot be found. */
export function pictureOfLive(app: AppState, run: Run, quietAfterSeconds: number): RunPicture | null {
  const version = versionOfRun(app, run);
  if (!version) return null;
  const session = run.sessionId !== null ? app.sessions.find((s) => s.id === run.sessionId) : undefined;
  return pictureOf(run, { workflowName: version.name, elements: version.elements }, session?.lastOutputAt ?? null, quietAfterSeconds);
}

/** How long something took, in a few characters: `8s`, `4m`, `1h 20m`. Empty when it has not started. */
export function took(startedAt: string | null, finishedAt: string | null, now: number): string {
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.round(((finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${Math.floor(seconds / 3600)}h${minutes > 0 ? ` ${minutes}m` : ''}`;
}

/** Who moved something, in words. */
export function actorWord(actor: Actor | null): string {
  if (!actor) return '';
  if (actor.kind === 'agent') return 'the agent';
  if (actor.kind === 'person') return 'you';
  return actor.name ? `the token “${actor.name}”` : 'a token';
}

/** Runs in the order the Workflows section lists them: the ones that need someone first, then by when they last moved. */
export function sortRuns(runs: readonly Run[]): Run[] {
  const weight = (run: Run): number => (run.status === 'blocked' || run.status === 'awaiting' ? 0 : run.status === 'paused' ? 1 : run.status === 'running' ? 2 : 3);
  return [...runs].sort((a, b) => weight(a) - weight(b) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

/** Something with items that an element handed in (a checklist), and how far its owner has got through it. */
export interface HandedIn {
  runId: string;
  elementId: string;
  total: number;
  ticked: number;
}

/** The latest thing with items a run's elements handed in, or null. Which kind each element produces comes from its workflow. */
export function handedIn(run: Run, elements: readonly { id: string; produces?: string }[]): HandedIn | null {
  for (let index = run.elements.length - 1; index >= 0; index -= 1) {
    const state = run.elements[index];
    if (!state || state.output === null || state.output === undefined) continue;
    const kind = outputKind(elements.find((element) => element.id === state.elementId)?.produces ?? 'note');
    const total = kind ? kind.items(state.output) : 0;
    if (total > 0) return { runId: run.id, elementId: state.elementId, total, ticked: new Set(state.ticks.map((tick) => tick.item).filter((item) => item < total)).size };
  }
  return null;
}

/**
 * What a session's agent handed in that can be ticked: from the run it is on, else from the latest of its
 * runs that ended lately. Null when there is nothing.
 */
export function handedInBy(app: AppState, sessionId: string, ended: readonly RunRecord[]): HandedIn | null {
  const live = runOfSession(app, sessionId);
  if (live) {
    const version = versionOfRun(app, live);
    const found = version ? handedIn(live, version.elements) : null;
    if (found) return found;
  }
  // Newest first, as the archive gives them.
  for (const record of ended) {
    if (record.run.sessionId !== sessionId) continue;
    const found = handedIn(record.run, record.elements);
    if (found) return found;
  }
  return null;
}

/** In a few words: `list: 1 of 3 ticked`. */
export const handedInWords = (list: HandedIn): string => `list: ${list.ticked} of ${list.total} ticked`;
