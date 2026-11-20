import { z } from 'zod';
import type { Canvas, Session } from './entities';
import { Id } from './ids';
import { RUN_STATUS_WORDS, RunStatus, isQuiet, versionOf, waitsForPerson, type ArchivedRun, type Run, type Workflow } from './workflows';

/**
 * The board: every run that is going, on every canvas, laid out by workflow
 * and by element. One pure function makes it; the screen, the route, the
 * command and the tool all show what it returns.
 *
 * Nothing here names a kind of element. A column knows whether its element
 * waits for a person because the kind says so.
 */

/** One run on one terminal. */
export const BoardCard = z.object({
  runId: Id,
  projectId: Id.nullable().describe('The project it runs in. Null where that is not known.'),
  workflowId: Id,
  sessionId: Id.nullable().describe('The terminal doing the run. Null for a run that is queued.'),
  sessionName: z.string().describe('The name of that terminal; empty for a queued run.'),
  canvasId: Id.nullable().describe('The canvas the terminal is on. Null when it is parked, or the run is queued.'),
  canvasName: z.string(),
  tags: z.array(z.string()),
  status: RunStatus,
  statusWords: z.string().describe('The status as the interface says it: `working`, `waiting for approval`, `blocked` and so on.'),
  elementId: z.string().nullable(),
  elementName: z.string(),
  since: z.iso.datetime().nullable().describe('When the run came to the step it is on.'),
  quiet: z.boolean().describe('The terminal has printed for a while since the last report: the card may be behind.'),
  blockedReason: z.string().nullable(),
  waitsForPerson: z.boolean().describe('True when the run waits for a person to approve or send back. Only the owner can do either.'),
  finishedAt: z.iso.datetime().nullable(),
});
export type BoardCard = z.infer<typeof BoardCard>;

export const BoardColumn = z.object({
  elementId: z.string(),
  name: z.string(),
  waitsForPerson: z.boolean().describe('A step where a run stops until a person has decided.'),
  cards: z.array(BoardCard),
});
export type BoardColumn = z.infer<typeof BoardColumn>;

export const BoardGroup = z.object({
  key: z.string().describe('Stays the same while the group exists: the workflow and its version, or `single`.'),
  workflowId: Id.nullable().describe('Null for the group of runs of one step by itself.'),
  workflowName: z.string(),
  version: z.number().int().nullable().describe('Said only when live runs are on more than one version of the workflow.'),
  single: z.boolean().describe('The group of runs of one step by itself: each card names its step.'),
  queued: z.array(BoardCard).describe('Runs that wait for a terminal.'),
  columns: z.array(BoardColumn).describe("That version's steps, in order."),
});
export type BoardGroup = z.infer<typeof BoardGroup>;

export const BoardCounts = z.object({ waitingForYou: z.number().int(), blocked: z.number().int(), working: z.number().int(), paused: z.number().int(), queued: z.number().int(), total: z.number().int() });
export type BoardCounts = z.infer<typeof BoardCounts>;

export const Board = z.object({
  counts: BoardCounts.describe('Of the live runs shown, after the filters.'),
  /** The counts in one line: `3 waiting for you, 2 blocked, 9 working`. */
  summary: z.string(),
  groups: z.array(BoardGroup),
  ended: z.array(BoardCard.extend({ workflowName: z.string() })).describe('Runs that finished or were stopped in the last day, newest first, at most a set number.'),
  endedCut: z.boolean().describe('True when there were more ended runs than are shown.'),
});
export type Board = z.infer<typeof Board>;

/** Which runs the board shows. Each is one value or nothing; they combine with AND. */
export const BoardFilters = z.object({
  canvasId: Id.optional().describe('Only runs whose terminal is on this canvas.'),
  workflowId: Id.optional().describe('Only runs of this workflow.'),
  status: RunStatus.optional().describe('Only runs with this status.'),
  tag: z.string().max(64).optional().describe('Only runs whose terminal has this tag.'),
  projectId: z.union([Id, z.literal('all')]).optional().describe('Only runs of this project; `all`: of every project. Left out: the first project the caller reaches.'),
});
export type BoardFilters = z.infer<typeof BoardFilters>;

export const BOARD_ENDED_MAX = 50;
export const BOARD_ENDED_HOURS = 24;

export interface BoardInput {
  runs: readonly Run[];
  workflows: readonly Workflow[];
  sessions: readonly Session[];
  canvases: readonly Pick<Canvas, 'id' | 'name' | 'layout' | 'order'>[];
  /** Runs that are over, newest first: as the archive gives them. */
  ended?: readonly ArchivedRun[];
  now: number;
  quietAfterSeconds: number;
  filters?: BoardFilters;
}

export function boardSummary(counts: BoardCounts): string {
  const parts = [
    counts.waitingForYou > 0 ? `${counts.waitingForYou} waiting for you` : '',
    counts.blocked > 0 ? `${counts.blocked} blocked` : '',
    counts.working > 0 ? `${counts.working} working` : '',
    counts.paused > 0 ? `${counts.paused} paused` : '',
    counts.queued > 0 ? `${counts.queued} queued` : '',
  ].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(', ') : 'Nothing is running.';
}

/** Cards that need someone come first in a column; then the one that has been there longest. */
const weight = (card: BoardCard): number => (card.waitsForPerson ? 0 : card.status === 'blocked' ? 1 : card.status === 'paused' ? 3 : 2);
const byNeed = (a: BoardCard, b: BoardCard): number => weight(a) - weight(b) || (a.since ?? '').localeCompare(b.since ?? '') || a.runId.localeCompare(b.runId);

export function boardOf(input: BoardInput): Board {
  const filters = input.filters ?? {};
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const canvasOf = new Map<string, { id: string; name: string }>();
  for (const canvas of input.canvases) for (const node of canvas.layout.nodes) canvasOf.set(node.sessionId, { id: canvas.id, name: canvas.name });
  const workflows = new Map(input.workflows.map((w) => [w.id, w]));
  const tag = filters.tag?.toLowerCase();

  const cardOf = (run: Run, names: readonly { id: string; name: string; kind?: string }[]): BoardCard => {
    const session = run.sessionId !== null ? sessions.get(run.sessionId) : undefined;
    const canvas = run.sessionId !== null ? canvasOf.get(run.sessionId) : undefined;
    const element = names.find((e) => e.id === run.currentElementId);
    return {
      runId: run.id,
      projectId: session?.projectId ?? run.projectId ?? null,
      workflowId: run.workflowId,
      sessionId: run.sessionId,
      sessionName: session?.name ?? '',
      canvasId: canvas?.id ?? null,
      canvasName: canvas?.name ?? '',
      tags: session?.tags ?? [],
      status: run.status,
      statusWords: RUN_STATUS_WORDS[run.status],
      elementId: run.currentElementId,
      elementName: element?.name ?? '',
      since: run.elements.find((e) => e.elementId === run.currentElementId)?.startedAt ?? null,
      quiet: isQuiet(run, session?.lastOutputAt ?? null, input.quietAfterSeconds),
      blockedReason: run.status === 'blocked' ? run.blockedReason : null,
      waitsForPerson: run.status === 'awaiting',
      finishedAt: run.finishedAt,
    };
  };
  const shown = (card: BoardCard): boolean =>
    (filters.canvasId === undefined || card.canvasId === filters.canvasId) &&
    (filters.workflowId === undefined || card.workflowId === filters.workflowId) &&
    (filters.status === undefined || card.status === filters.status) &&
    (tag === undefined || card.tags.some((t) => t.toLowerCase() === tag));

  // Which versions of each workflow have live runs: the version is said only where there are two.
  const versionsLive = new Map<string, Set<number>>();
  for (const run of input.runs.filter((r) => filters.projectId === undefined || filters.projectId === 'all' || ((r.sessionId !== null ? sessions.get(r.sessionId)?.projectId : undefined) ?? r.projectId) === filters.projectId)) versionsLive.set(run.workflowId, (versionsLive.get(run.workflowId) ?? new Set()).add(run.workflowVersion));

  // One project's runs, where one is asked for: a run is of its terminal's project.
  const inProject = (run: Run): boolean => filters.projectId === undefined || filters.projectId === 'all' || ((run.sessionId !== null ? sessions.get(run.sessionId)?.projectId : undefined) ?? run.projectId) === filters.projectId;
  const groups = new Map<string, BoardGroup>();
  const counts: BoardCounts = { waitingForYou: 0, blocked: 0, working: 0, paused: 0, queued: 0, total: 0 };
  for (const run of input.runs) {
    if (!inProject(run)) continue;
    const workflow = workflows.get(run.workflowId);
    const version = workflow ? versionOf(workflow, run.workflowVersion) : null;
    const elements = version?.elements ?? [];
    const card = cardOf(run, elements);
    if (!shown(card)) continue;
    counts.total += 1;
    if (card.waitsForPerson) counts.waitingForYou += 1;
    else if (run.status === 'blocked') counts.blocked += 1;
    else if (run.status === 'running') counts.working += 1;
    else if (run.status === 'paused') counts.paused += 1;
    else if (run.status === 'queued') counts.queued += 1;

    // A workflow made to run one element by itself: all of those share a group.
    const single = workflow !== undefined && !workflow.listed && elements.length === 1;
    const several = (versionsLive.get(run.workflowId)?.size ?? 0) > 1;
    const key = single ? 'single' : `${run.workflowId} ${run.workflowVersion}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        workflowId: single ? null : run.workflowId,
        workflowName: single ? 'One step by itself' : (version?.name ?? workflow?.name ?? '(removed workflow)'),
        version: single || !several ? null : run.workflowVersion,
        single,
        queued: [],
        columns: single ? [{ elementId: 'single', name: 'Being done', waitsForPerson: false, cards: [] }] : elements.map((e) => ({ elementId: e.id, name: e.name, waitsForPerson: waitsForPerson(e.kind), cards: [] })),
      };
      groups.set(key, group);
    }
    const column = single ? group.columns[0] : group.columns.find((c) => c.elementId === run.currentElementId);
    (column?.cards ?? group.queued).push(card);
  }
  for (const group of groups.values()) {
    group.queued.sort(byNeed);
    for (const column of group.columns) column.cards.sort(byNeed);
  }

  const since = input.now - BOARD_ENDED_HOURS * 3600 * 1000;
  const recent = (input.ended ?? [])
    .filter((entry) => entry.run.finishedAt !== null && Date.parse(entry.run.finishedAt) >= since && inProject(entry.run))
    // A stopped run keeps the element it was stopped on.
    .map((entry) => ({ ...cardOf(entry.run, entry.elements), workflowName: entry.workflowName }))
    .filter(shown)
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || a.runId.localeCompare(b.runId));

  return {
    counts,
    summary: boardSummary(counts),
    // By name, then older versions first; the single elements last.
    groups: [...groups.values()].sort((a, b) => Number(a.single) - Number(b.single) || a.workflowName.localeCompare(b.workflowName) || (a.version ?? 0) - (b.version ?? 0) || a.key.localeCompare(b.key)),
    ended: recent.slice(0, BOARD_ENDED_MAX),
    endedCut: recent.length > BOARD_ENDED_MAX,
  };
}

/** How long, in a few characters: `8s`, `4m`, `1h 20m`. */
export function howLong(from: string | null, to: number): string {
  if (!from) return '';
  const seconds = Math.max(0, Math.round((to - Date.parse(from)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${Math.floor(seconds / 3600)}h${minutes > 0 ? ` ${minutes}m` : ''}`;
}

/** The board as plain text, for a terminal and for a program that reads text. */
export function boardText(board: Board, now: number): string {
  const lines: string[] = [board.summary];
  const line = (card: BoardCard): string =>
    `    ${card.sessionName || '(no terminal yet)'}${card.canvasName ? ` on ${card.canvasName}` : ''}: ${card.statusWords}${card.since ? `, ${howLong(card.since, now)}` : ''}${card.quiet ? ', quiet' : ''}${card.blockedReason ? `: ${card.blockedReason}` : ''}  [run ${card.runId}]`;
  for (const group of board.groups) {
    lines.push('', `${group.workflowName}${group.version !== null ? ` (version ${group.version})` : ''}`);
    if (group.queued.length > 0) lines.push('  Queued', ...group.queued.map(line));
    for (const column of group.columns) {
      if (column.cards.length === 0) continue;
      lines.push(`  ${column.name}${column.waitsForPerson ? '  (a person approves here)' : ''}`);
      for (const card of column.cards) lines.push(group.single ? line({ ...card, sessionName: `${card.elementName}: ${card.sessionName}` }) : line(card));
    }
  }
  if (board.ended.length > 0) {
    lines.push('', 'Over in the last day');
    for (const card of board.ended) lines.push(`    ${card.sessionName || '(terminal gone)'}: ${card.workflowName} ${card.statusWords}${card.finishedAt ? `, ${howLong(card.finishedAt, now)} ago` : ''}  [run ${card.runId}]`);
    if (board.endedCut) lines.push('    (there are more; these are the newest)');
  }
  return lines.join('\n');
}

/**
 * The runs page's columns of runs that no task stands for. A run started for a task is shown as its task, in the
 * queue's own lists; every other run is a card here, by where it stands: waiting for a terminal, running, or over in
 * the last day. A run that waits for a person, or is blocked, is not here: it is on the owner's list (`forYou`), the
 * column of what waits for you. Laid out from what `boardOf` returned, so the two never disagree.
 */
export interface RunLanes {
  waiting: BoardCard[];
  running: BoardCard[];
  ended: Board['ended'];
}

export function runLanesOf(board: Board, taskRunIds: ReadonlySet<string>): RunLanes {
  const free = (card: BoardCard): boolean => !taskRunIds.has(card.runId);
  const live = board.groups.flatMap((group) => group.columns.flatMap((column) => column.cards));
  return {
    waiting: board.groups.flatMap((group) => group.queued).filter(free),
    running: live.filter((card) => free(card) && !card.waitsForPerson && card.status !== 'blocked'),
    ended: board.ended.filter(free),
  };
}
