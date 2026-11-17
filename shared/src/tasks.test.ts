import { afterEach, describe, expect, it } from 'vitest';
import { AddAskRequest, AddTaskRequest } from './tasks-api';
import { QueueState, Task, isFreeAgent, nextToStart, queueWords, registerTaskSource, sourceWords, stepTask, taskText, unregisterTaskSource, whyNotNow, type DispatchSession, type TaskState, type TaskStep } from './tasks';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const T = (minute: number): string => `2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

const task = (n: number, state: TaskState = 'queued', more: Partial<Task> = {}): Task =>
  Task.parse({ id: ID(n), title: `Task ${n}`, addedBy: { kind: 'person' }, order: n, state, createdAt: T(0), updatedAt: T(0), ...more });
const free = (n: number, more: Partial<DispatchSession> = {}): DispatchSession => ({ id: ID(100 + n), state: 'open', command: 'the-agent', agent: { program: 'the-agent' }, attention: { state: 'none' }, onCanvas: true, ...more });
function go(start: Task, steps: TaskStep[]): Task {
  let now = start;
  steps.forEach((step, index) => {
    const result = stepTask(now, step, T(index + 1));
    if (!result.ok) throw new Error(result.reason);
    now = result.task;
  });
  return now;
}
const refused = (start: Task, step: TaskStep): string => {
  const result = stepTask(start, step, T(30));
  if (result.ok) throw new Error(`Not refused: ${JSON.stringify(step)}`);
  return result.reason;
};

describe('how a task moves', () => {
  it('waits for a yes when proposed, and a no keeps a record of it', () => {
    const proposed = task(1, 'proposed');
    expect(go(proposed, [{ type: 'accept' }]).state).toBe('queued');
    expect(go(proposed, [{ type: 'decline' }])).toMatchObject({ state: 'withdrawn', reason: 'Declined.', endedAt: T(1) });
    // A proposal starts nothing: it cannot be taken before it was accepted.
    expect(refused(proposed, { type: 'take', sessionId: ID(101) })).toContain('not waiting to be started');
    expect(refused(task(1), { type: 'accept' })).toContain('does not wait for a yes');
  });

  it('is taken, starts, and then follows its run: approval and blocked need the owner, finished is done, stopped is failed', () => {
    const working = go(task(1), [{ type: 'take', sessionId: ID(101) }, { type: 'started', runId: ID(201) }]);
    expect(working).toMatchObject({ state: 'working', sessionId: ID(101), runId: ID(201), endedAt: null });
    expect(go(working, [{ type: 'run', status: 'awaiting' }])).toMatchObject({ state: 'needs-owner', reason: 'Its run waits for your approval.' });
    expect(go(working, [{ type: 'run', status: 'blocked', reason: 'No access.' }])).toMatchObject({ state: 'needs-owner', reason: 'Blocked: No access.' });
    // Approved, or unblocked: it works again.
    expect(go(working, [{ type: 'run', status: 'awaiting' }, { type: 'run', status: 'running' }])).toMatchObject({ state: 'working', reason: null });
    expect(go(working, [{ type: 'run', status: 'paused' }]).state).toBe('working');
    expect(go(working, [{ type: 'run', status: 'finished' }])).toMatchObject({ state: 'done', endedAt: T(1) });
    expect(go(working, [{ type: 'run', status: 'stopped' }])).toMatchObject({ state: 'failed', reason: 'Its run was stopped before it finished.' });
    // A start that did not work.
    expect(go(task(1), [{ type: 'take', sessionId: ID(101) }, { type: 'fail', reason: 'This shell has ended; restart it first' }])).toMatchObject({ state: 'failed', reason: 'This shell has ended; restart it first' });
  });

  it('never tries again by itself: a failed task stays failed until the owner puts it back', () => {
    const failed = go(task(1), [{ type: 'take', sessionId: ID(101) }, { type: 'started', runId: ID(201) }, { type: 'run', status: 'stopped' }]);
    for (const step of [{ type: 'run', status: 'running' }, { type: 'take', sessionId: ID(102) }, { type: 'started', runId: ID(202) }, { type: 'accept' }] as TaskStep[]) expect(stepTask(failed, step, T(9)).ok, step.type).toBe(false);
    expect(go(failed, [{ type: 'again' }])).toMatchObject({ state: 'queued', sessionId: null, runId: null, reason: null, endedAt: null });
    expect(refused(task(1, 'done'), { type: 'again' })).toContain('Only a task that failed');
  });

  it('can be withdrawn only before it starts', () => {
    expect(go(task(1), [{ type: 'withdraw' }]).state).toBe('withdrawn');
    expect(go(task(1, 'proposed'), [{ type: 'withdraw' }]).state).toBe('withdrawn');
    expect(refused(task(1, 'working'), { type: 'withdraw' })).toContain('can no longer be withdrawn');
    expect(refused(task(1, 'done'), { type: 'withdraw' })).toContain('can no longer be withdrawn');
  });
});

describe('which task starts next, and where', () => {
  const sessions = [free(1), free(2), free(3)];
  const ids = (found: { taskId: string }[]): string[] => found.map((f) => f.taskId);

  it('starts tasks in their order, as many as the limit leaves room for', () => {
    const tasks = [task(3), task(1), task(2), task(4)];
    expect(nextToStart(tasks, sessions, [], 2, false)).toEqual([{ taskId: ID(1), sessionId: ID(101) }, { taskId: ID(2), sessionId: ID(102) }]);
    expect(ids(nextToStart(tasks, sessions, [], 10, false))).toEqual([ID(1), ID(2), ID(3)]);
    // Tasks that are at work, being started, or waiting on the owner hold a place; ones that are over do not.
    const some = [task(1, 'working', { sessionId: ID(101) }), task(2, 'needs-owner', { sessionId: ID(102) }), task(3, 'done'), task(4, 'failed'), task(5), task(6)];
    expect(ids(nextToStart(some, sessions, [], 3, false))).toEqual([ID(5)]);
    expect(nextToStart(some, sessions, [], 2, false)).toEqual([]);
    expect(ids(nextToStart([task(1, 'taken', { sessionId: ID(101) }), task(2)], sessions, [], 1, false))).toEqual([]);
  });

  it('starts nothing while held, and nothing that is only proposed', () => {
    expect(nextToStart([task(1), task(2)], sessions, [], 3, true)).toEqual([]);
    expect(nextToStart([task(1, 'proposed'), task(2, 'withdrawn')], sessions, [], 3, false)).toEqual([]);
  });

  it('gives a task only to who may take it: a free agent, the terminal named, or a new one', () => {
    // A named terminal that is busy is waited for; the task after it is not held up.
    const named = [task(1, 'queued', { taker: { kind: 'session', sessionId: ID(102) } }), task(2)];
    expect(nextToStart(named, sessions, [{ sessionId: ID(102) }], 3, false)).toEqual([{ taskId: ID(2), sessionId: ID(101) }]);
    expect(nextToStart(named, sessions, [], 3, false)).toEqual([{ taskId: ID(1), sessionId: ID(102) }, { taskId: ID(2), sessionId: ID(101) }]);
    // A new terminal needs no one to be free, only its canvas to be there.
    const fresh = [task(1, 'queued', { taker: { kind: 'new', canvasId: ID(900) } })];
    expect(nextToStart(fresh, [], [], 3, false, [ID(900)])).toEqual([{ taskId: ID(1), sessionId: null }]);
    expect(nextToStart(fresh, [], [], 3, false, [ID(901)])).toEqual([]);
    // No terminal gets two, and none that is on a run or already has a task.
    expect(nextToStart([task(1), task(2)], [free(1)], [], 3, false)).toEqual([{ taskId: ID(1), sessionId: ID(101) }]);
    expect(nextToStart([task(1, 'working', { sessionId: ID(101) }), task(2)], [free(1)], [], 3, false)).toEqual([]);
  });

  it('counts a terminal as free only where an agent is seen in front and is not at work', () => {
    const none = new Set<string>();
    expect(isFreeAgent(free(1), none)).toBe(true);
    // A plain shell, a shell in front of an agent that exited, another program, a parked or ended terminal, an agent mid-work or with a question open.
    for (const not of [free(1, { agent: null }), free(1, { agent: { program: null } }), free(1, { command: 'zsh' }), free(1, { command: 'vim' }), free(1, { onCanvas: false }), free(1, { state: 'exited' }), free(1, { state: 'parked' }), free(1, { attention: { state: 'working' } }), free(1, { attention: { state: 'waiting' } })]) {
      expect(isFreeAgent(not, none), JSON.stringify(not)).toBe(false);
      expect(nextToStart([task(1)], [not], [], 3, false)).toEqual([]);
    }
    expect(isFreeAgent(free(1, { attention: { state: 'done' } }), none)).toBe(true);
    expect(isFreeAgent(free(1), new Set([ID(101)]))).toBe(false);
    expect(whyNotNow(task(1), [free(1, { agent: null })], [], [])).toContain('No terminal has a free agent in front');
    expect(whyNotNow(task(1, 'queued', { taker: { kind: 'session', sessionId: ID(555) } }), [free(1)], [], [])).toBe('The terminal it was meant for is gone.');
    expect(whyNotNow(task(1), [free(1)], [], [])).toBeNull();
  });
});

describe('what is written', () => {
  afterEach(() => unregisterTaskSource('test-schedule'));

  it('refuses control characters and text that reverses direction, in a title, details, a label and what is asked', () => {
    for (const bad of ['bell\u0007', 'escape\u001b[2J', 'turned‮round', 'nul\u0000']) {
      expect(AddTaskRequest.safeParse({ title: bad }).success, JSON.stringify(bad)).toBe(false);
      expect(AddTaskRequest.safeParse({ title: 'ok', details: bad }).success, JSON.stringify(bad)).toBe(false);
      expect(AddTaskRequest.safeParse({ title: 'ok', labels: [bad] }).success, JSON.stringify(bad)).toBe(false);
      expect(AddAskRequest.safeParse({ text: bad }).success, JSON.stringify(bad)).toBe(false);
    }
    // A title is one line; details and what is asked may have several.
    expect(AddTaskRequest.safeParse({ title: 'two\nlines' }).success).toBe(false);
    expect(AddTaskRequest.safeParse({ title: 'ok', details: 'two\nlines' }).success).toBe(true);
    expect(AddAskRequest.safeParse({ text: 'Rotate the staging key.\nIt expires on Friday.' }).success).toBe(true);
    expect(AddAskRequest.safeParse({ text: '   ' }).success).toBe(false);
    expect(AddTaskRequest.safeParse({ title: 'ok', details: 'x'.repeat(4001) }).success).toBe(false);
    expect(AddAskRequest.safeParse({ text: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('says where an item came from by its source, and another kind of source needs only its registration', () => {
    expect(sourceWords({ kind: 'hand' })).toBe('written by hand');
    expect(sourceWords({ kind: 'checklist', from: 'Review' })).toBe('from a checklist of “Review”');
    expect(sourceWords({ kind: 'api' })).toBe('through the API');
    expect(sourceWords({ kind: 'test-schedule' })).toBe('from “test-schedule”');
    registerTaskSource({ kind: 'test-schedule', title: 'On a schedule', words: (source) => `every ${String(source.every)}` });
    expect(sourceWords({ kind: 'test-schedule', every: 'Monday' })).toBe('every Monday');
    expect(Task.parse({ ...task(1), source: { kind: 'test-schedule', every: 'Monday' } }).source).toEqual({ kind: 'test-schedule', every: 'Monday' });
  });

  it('has closed defaults: three at once, nothing held, nothing by itself', () => {
    expect(QueueState.parse({})).toEqual({ tasks: [], asks: [], rules: [], limit: 3, hold: false, automatic: false, ruleRuns: [] });
    expect(queueWords([task(1, 'working'), task(2), task(3), task(4, 'proposed'), task(5, 'needs-owner'), task(6, 'done')])).toBe('1 need you, 1 working, 2 next, 1 for your yes, 1 done to look at');
    expect(taskText({ title: 'Fix it', details: '' })).toBe('Fix it');
    expect(taskText({ title: 'Fix it', details: 'The login page.' })).toBe('Fix it\n\nThe login page.');
  });
});
