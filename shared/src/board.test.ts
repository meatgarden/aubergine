import { describe, expect, it } from 'vitest';
import { BOARD_ENDED_MAX, boardOf, boardText, type BoardInput } from './board';
import type { Canvas, Session } from './entities';
import { WorkflowVersion, newRun, stepRun, type Actor, type ArchivedRun, type Run, type RunStep, type Workflow } from './workflows';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const AGENT: Actor = { kind: 'agent' };
const PERSON: Actor = { kind: 'person' };
const T = (minute: number): string => `2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`;
const NOW = Date.parse(T(30));

const elements = [
  { id: 'plan', name: 'Plan', instructions: 'Plan.' },
  { id: 'look', kind: 'approval', name: 'Look', ask: 'Fine?' },
  { id: 'ship', name: 'Ship', instructions: 'Ship.' },
];
const v1 = WorkflowVersion.parse({ number: 1, createdAt: T(0), name: 'Change', elements: [elements[0], elements[2]] });
const v2 = WorkflowVersion.parse({ number: 2, createdAt: T(1), name: 'Change', elements });
const workflow = (id: number, name: string, versions: WorkflowVersion[], listed = true): Workflow => ({ id: ID(id), projectId: ID(900), name, description: '', labels: {}, origin: { kind: listed ? 'local' : 'element' }, createdAt: T(0), updatedAt: T(0), listed, versions });
const change = workflow(100, 'Change', [v1, v2]);
const other = workflow(101, 'Another', [WorkflowVersion.parse({ number: 1, createdAt: T(0), name: 'Another', elements: [elements[0]] })]);
const lone = (id: number, name: string): Workflow => workflow(id, name, [WorkflowVersion.parse({ number: 1, createdAt: T(0), name, elements: [{ id: 'only', name, instructions: 'Do it.' }] })], false);

const session = (n: number, name: string, tags: string[] = [], lastOutputAt: string | null = null): Session => ({ id: ID(n), name, tags, lastOutputAt }) as unknown as Session;
const canvas = (n: number, name: string, sessionIds: string[]): Canvas => ({ id: ID(n), name, order: n, layout: { nodes: sessionIds.map((sessionId, index) => ({ id: ID(n * 100 + index), sessionId })), frames: [] } }) as unknown as Canvas;

function run(n: number, w: Workflow, version: WorkflowVersion, sessionId: string | null, steps: [RunStep, Actor][] = []): Run {
  let now = newRun(version, { id: ID(n), workflowId: w.id, sessionId, inputs: {}, by: PERSON, at: T(2) });
  steps.forEach(([step, by], index) => {
    const result = stepRun(version, now, step, { by, at: T(3 + index) });
    if (!result.ok) throw new Error(result.reason);
    now = result.run;
  });
  return now;
}

const sessions = [session(1, 'alpha', ['api']), session(2, 'beta', ['Web']), session(3, 'gamma'), session(4, 'delta', ['api'], T(20)), session(5, 'parked'), session(6, 'solo')];
const canvases = [canvas(50, 'Main', [ID(1), ID(2), ID(6)]), canvas(51, 'Side', [ID(3), ID(4)])];
const runs = [
  run(10, change, v1, ID(1)),
  run(11, change, v2, ID(2), [[{ type: 'done', elementId: 'plan' }, AGENT]]),
  run(12, change, v2, ID(3), [[{ type: 'blocked', reason: 'No access.' }, AGENT]]),
  run(13, change, v2, ID(4)),
  run(14, change, v2, null),
  run(15, other, other.versions[0] as WorkflowVersion, ID(5), [[{ type: 'pause' }, PERSON]]),
  run(16, lone(102, 'Tidy up'), lone(102, 'Tidy up').versions[0] as WorkflowVersion, ID(6)),
];
const input: BoardInput = { runs, workflows: [change, other, lone(102, 'Tidy up')], sessions, canvases, now: NOW, quietAfterSeconds: 300 };

describe('the board', () => {
  it('groups by workflow, and by version where live runs are on two; the columns are that version\'s steps in order', () => {
    const board = boardOf(input);
    expect(board.groups.map((g) => [g.workflowName, g.version, g.single])).toEqual([['Another', null, false], ['Change', 1, false], ['Change', 2, false], ['One step by itself', null, true]]);
    const [another, first, second, single] = board.groups;
    expect(first?.columns.map((c) => [c.name, c.cards.map((card) => card.sessionName)])).toEqual([['Plan', ['alpha']], ['Ship', []]]);
    expect(second?.columns.map((c) => [c.name, c.waitsForPerson, c.cards.map((card) => card.sessionName)])).toEqual([['Plan', false, ['gamma', 'delta']], ['Look', true, ['beta']], ['Ship', false, []]]);
    // A run with no terminal yet is beside the columns, not in one.
    expect(second?.queued.map((card) => [card.status, card.sessionName, card.canvasId])).toEqual([['queued', '', null]]);
    expect(another?.version).toBeNull();
    // Runs of one element by itself share a group, and each card names its element.
    expect(single?.workflowId).toBeNull();
    expect(single?.columns.map((c) => c.cards.map((card) => [card.sessionName, card.elementName]))).toEqual([[['solo', 'Tidy up']]]);
  });

  it('says on a card where the terminal is, how the run stands in words, since when, why it is blocked, and whether it has gone quiet', () => {
    const cards = boardOf(input).groups.flatMap((g) => g.columns.flatMap((c) => c.cards));
    const of = (name: string) => cards.find((card) => card.sessionName === name);
    expect(of('beta')).toMatchObject({ canvasName: 'Main', status: 'awaiting', statusWords: 'waiting for approval', waitsForPerson: true, elementName: 'Look', since: T(3), blockedReason: null, tags: ['Web'] });
    expect(of('gamma')).toMatchObject({ canvasName: 'Side', statusWords: 'blocked', blockedReason: 'No access.', waitsForPerson: false, since: T(2) });
    expect(of('alpha')).toMatchObject({ statusWords: 'working', quiet: false });
    // Printing for a while since the last report.
    expect(of('delta')?.quiet).toBe(true);
    // A parked terminal is on no canvas.
    expect(of('parked')).toMatchObject({ canvasId: null, canvasName: '', statusWords: 'paused' });
  });

  it('counts what is shown, in the order a person needs it', () => {
    const board = boardOf(input);
    expect(board.counts).toEqual({ waitingForYou: 1, blocked: 1, working: 3, paused: 1, queued: 1, total: 7 });
    expect(board.summary).toBe('1 waiting for you, 1 blocked, 3 working, 1 paused, 1 queued');
  });

  it('filters by canvas, workflow, status and tag, together, and the counts follow', () => {
    expect(boardOf({ ...input, filters: { canvasId: ID(51) } }).counts).toMatchObject({ total: 2, blocked: 1, working: 1 });
    expect(boardOf({ ...input, filters: { workflowId: other.id } }).groups.map((g) => g.workflowName)).toEqual(['Another']);
    expect(boardOf({ ...input, filters: { status: 'awaiting' } }).summary).toBe('1 waiting for you');
    expect(boardOf({ ...input, filters: { tag: 'API' } }).groups.flatMap((g) => g.columns.flatMap((c) => c.cards.map((card) => card.sessionName)))).toEqual(['alpha', 'delta']);
    expect(boardOf({ ...input, filters: { tag: 'api', canvasId: ID(50) } }).counts.total).toBe(1);
    // With one version left among what is live, the version is still said: it is about the runs there are, not the ones shown.
    expect(boardOf({ ...input, filters: { tag: 'web' } }).groups.map((g) => g.version)).toEqual([2]);
    expect(boardOf({ ...input, filters: { tag: 'nothing has this' } })).toMatchObject({ groups: [], summary: 'No runs are going.' });
  });

  it('is empty when nothing runs', () => {
    const board = boardOf({ ...input, runs: [] });
    expect(board.groups).toEqual([]);
    expect(board.counts.total).toBe(0);
    expect(board.summary).toBe('No runs are going.');
    expect(board.ended).toEqual([]);
    expect(boardText(board, NOW)).toBe('No runs are going.');
  });

  it('lists what ended in the last day, newest first, with a bound, and says when it was cut', () => {
    const ended = (n: number, finishedAt: string, status: 'finished' | 'stopped' = 'finished'): ArchivedRun => ({ run: { ...run(n, change, v1, ID(1)), status, finishedAt, currentElementId: null }, workflowName: 'Change', elements: [{ id: 'plan', name: 'Plan', produces: 'note' }] });
    const board = boardOf({ ...input, ended: [ended(20, T(25)), ended(21, T(10), 'stopped'), ended(22, '2026-04-29T10:00:00.000Z')] });
    expect(board.ended.map((card) => [card.runId, card.statusWords, card.workflowName])).toEqual([[ID(20), 'finished', 'Change'], [ID(21), 'stopped', 'Change']]);
    expect(board.endedCut).toBe(false);
    const many = boardOf({ ...input, ended: Array.from({ length: BOARD_ENDED_MAX + 5 }, (_unused, index) => ended(1000 + index, T(index % 30))) });
    expect(many.ended.length).toBe(BOARD_ENDED_MAX);
    expect(many.endedCut).toBe(true);
    // The filters apply to what ended too.
    expect(boardOf({ ...input, ended: [ended(20, T(25))], filters: { workflowId: other.id } }).ended).toEqual([]);
  });

  it('holds thirty live runs and a few hundred ended ones without trouble, and reads as text', () => {
    const many = Array.from({ length: 30 }, (_unused, index) => run(2000 + index, change, v2, ID(3000 + index), index % 3 === 0 ? [[{ type: 'done', elementId: 'plan' }, AGENT]] : []));
    const manySessions = many.map((r, index) => session(3000 + index, `agent ${index}`));
    const ended = Array.from({ length: 300 }, (_unused, index): ArchivedRun => ({ run: { ...run(5000 + index, change, v1, ID(1)), status: 'finished', finishedAt: T(index % 30) }, workflowName: 'Change', elements: [] }));
    const started = performance.now();
    const board = boardOf({ runs: many, workflows: [change], sessions: manySessions, canvases: [canvas(60, 'Big', manySessions.map((s) => s.id))], ended, now: NOW, quietAfterSeconds: 300 });
    expect(performance.now() - started).toBeLessThan(200);
    expect(board.counts).toMatchObject({ total: 30, waitingForYou: 10, working: 20 });
    const text = boardText(board, NOW);
    expect(text.split('\n')[0]).toBe('10 waiting for you, 20 working');
    expect(text).toContain('  Look  (a person approves here)');
    expect(text).toContain('agent 0 on Big: waiting for approval, 27m');
    expect(text).toContain('Over in the last day');
  });
});
