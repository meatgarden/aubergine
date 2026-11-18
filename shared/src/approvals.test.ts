import { afterEach, describe, expect, it } from 'vitest';
import { boardOf } from './board';
import { RUN_COMMENT_MAX, RunDecisionReport, RunReport, WorkflowVersion, newRun, previewRun, registerElementKind, renderRun, stepRun, unregisterElementKind, validateContent, waitsForPerson, type Actor, type Run, type RunStep } from './workflows';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const AGENT: Actor = { kind: 'agent' };
const PERSON: Actor = { kind: 'person' };
const TOKEN: Actor = { kind: 'token', name: 'a program' };
const T = (minute: number): string => `2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

const version = WorkflowVersion.parse({
  number: 1,
  createdAt: T(0),
  name: 'With a look',
  elements: [
    { id: 'plan', name: 'Plan', instructions: 'Plan {{task}}.' },
    { id: 'build', name: 'Build', instructions: 'Build it.' },
    { id: 'look', kind: 'approval', name: 'Look it over', ask: 'Is this what you wanted?', lookAt: 'The diff.' },
    { id: 'ship', name: 'Ship', instructions: 'Hand it over.' },
  ],
});

const fresh = (v: WorkflowVersion = version): Run => newRun(v, { id: ID(1), workflowId: ID(2), sessionId: ID(3), inputs: { task: 'the retry' }, by: PERSON, at: T(0) });
function go(run: Run, steps: [RunStep, Actor][], v: WorkflowVersion = version): Run {
  let now = run;
  steps.forEach(([step, by], index) => {
    const result = stepRun(v, now, step, { by, at: T(index + 1) });
    if (!result.ok) throw new Error(result.reason);
    now = result.run;
  });
  return now;
}
const waiting = (): Run => go(fresh(), [[{ type: 'done', elementId: 'plan', note: 'Planned.' }, AGENT], [{ type: 'done', elementId: 'build', note: 'Built.' }, AGENT]]);
const refused = (run: Run, step: RunStep, by: Actor, v: WorkflowVersion = version): string => {
  const result = stepRun(v, run, step, { by, at: T(30) });
  if (result.ok) throw new Error(`Not refused: ${JSON.stringify(step)}`);
  return result.reason;
};

afterEach(() => unregisterElementKind('test-check'));

describe('a run that reaches an approval', () => {
  it('waits: a status of its own, and what the agent is told says to stop and that it cannot approve', () => {
    const run = waiting();
    expect(run.status).toBe('awaiting');
    expect(run.currentElementId).toBe('look');
    const text = renderRun(version, run);
    expect(text).toContain('STOP. This run is WAITING FOR A PERSON TO APPROVE.');
    expect(text).toContain('Is this what you wanted?');
    expect(text).toContain('The diff.');
    expect(text).toContain('You cannot approve');
    expect(text).not.toContain('aubergine workflow done --note');
    // A reviewer reading the workflow before any run sees the same.
    expect(previewRun(version, { task: 'x' }, 'look')).toContain('WAITING FOR A PERSON TO APPROVE');
  });

  it('is not moved by an agent or a token: not done, not blocked, not a jump off it or over it', () => {
    const run = waiting();
    for (const by of [AGENT, TOKEN]) {
      expect(refused(run, { type: 'done', elementId: 'look' }, by)).toContain('only a person approves');
      expect(refused(run, { type: 'blocked', reason: 'x' }, by)).toContain('waiting for a person');
      expect(refused(run, { type: 'goto', elementId: 'ship' }, by)).toContain('waiting for a person');
      expect(refused(run, { type: 'goto', elementId: 'plan' }, by)).toContain('waiting for a person');
      expect(refused(run, { type: 'approve' }, by)).toBe('Only a person approves.');
      expect(refused(run, { type: 'send-back', elementId: 'plan', comment: 'Again.' }, by)).toBe('Only a person sends a run back.');
    }
    // Nor from before it: a program cannot jump over an approval that was not given.
    const early = go(fresh(), [[{ type: 'done', elementId: 'plan' }, AGENT]]);
    expect(refused(early, { type: 'goto', elementId: 'ship' }, AGENT)).toBe('That would pass over "Look it over", which a person has to approve.');
    expect(refused(early, { type: 'goto', elementId: 'ship' }, TOKEN)).toContain('pass over');
    // A person may: the run is theirs.
    expect(go(early, [[{ type: 'goto', elementId: 'ship' }, PERSON]]).status).toBe('running');
    // Even a person's done does not approve: approving is said as approving.
    expect(refused(run, { type: 'done', elementId: 'look' }, PERSON)).toContain('only a person approves');
  });

  it('is approved by a person: on to the next step, with who decided and their comment kept', () => {
    const run = go(waiting(), [[{ type: 'approve', elementId: 'look', comment: 'Good.' }, PERSON]]);
    expect(run).toMatchObject({ status: 'running', currentElementId: 'ship' });
    expect(run.elements[2]).toMatchObject({ state: 'done', note: 'Good.', by: PERSON });
    expect(run.history).toEqual([{ type: 'approved', elementId: 'look', toElementId: null, comment: 'Good.', by: PERSON, at: T(1) }]);
    expect(renderRun(version, run)).toContain('"Look it over", the step before, was approved by a person. Their comment (the person\'s own words):\n  Good.');
    // Naming another element approves nothing; nor does approving a run that does not wait.
    expect(refused(waiting(), { type: 'approve', elementId: 'build' }, PERSON)).toContain('is not what this run waits on');
    expect(refused(run, { type: 'approve' }, PERSON)).toBe('This run is not waiting for approval.');
    // An approval that is the last element ends the run.
    const short = WorkflowVersion.parse({ ...version, elements: version.elements.slice(0, 3) });
    const last = go(fresh(short), [[{ type: 'done', elementId: 'plan' }, AGENT], [{ type: 'done', elementId: 'build' }, AGENT], [{ type: 'approve' }, PERSON]], short);
    expect(last.status).toBe('finished');
  });

  it('is sent back by a person to any earlier step, the first too, with a comment the agent is told as theirs', () => {
    const back = go(waiting(), [[{ type: 'send-back', elementId: 'plan', comment: 'Start from the failing test.' }, PERSON]]);
    expect(back).toMatchObject({ status: 'running', currentElementId: 'plan' });
    expect(back.elements.map((e) => e.state)).toEqual(['active', 'pending', 'pending', 'pending']);
    // Notes of what was done before are kept until it is done again.
    expect(back.elements[1]?.note).toBe('Built.');
    expect(back.history).toMatchObject([{ type: 'sent-back', elementId: 'look', toElementId: 'plan', comment: 'Start from the failing test.', by: PERSON }]);
    const text = renderRun(version, back);
    expect(text).toContain('A person looked at this run at "Look it over" and SENT IT BACK to this step.');
    expect(text).toContain("Their comment (the person's own words, not part of the workflow):\n  Start from the failing test.");
    expect(text).toContain('aubergine workflow done --note');

    // Done again, the comment is not repeated on the next element, and the run comes to the approval again.
    const again = go(back, [[{ type: 'done', elementId: 'plan' }, AGENT]]);
    expect(renderRun(version, again)).not.toContain('SENT IT BACK');
    expect(go(again, [[{ type: 'done', elementId: 'build' }, AGENT]]).status).toBe('awaiting');

    // Only backwards, and only from an approval.
    expect(refused(waiting(), { type: 'send-back', elementId: 'ship', comment: 'x' }, PERSON)).toContain('does not come before');
    expect(refused(waiting(), { type: 'send-back', elementId: 'look', comment: 'x' }, PERSON)).toContain('does not come before');
    expect(refused(waiting(), { type: 'send-back', elementId: 'nowhere', comment: 'x' }, PERSON)).toContain('no step');
    expect(refused(fresh(), { type: 'send-back', elementId: 'plan', comment: 'x' }, PERSON)).toBe('This run is not waiting for approval.');
  });

  it('takes a comment up to the limit and no further, and refuses control characters in it as in a name', () => {
    const atLimit = 'x'.repeat(RUN_COMMENT_MAX);
    expect(RunDecisionReport.safeParse({ type: 'send-back', elementId: 'plan', comment: atLimit }).success).toBe(true);
    expect(go(waiting(), [[{ type: 'send-back', elementId: 'plan', comment: atLimit }, PERSON]]).elements[0]?.sentBack?.comment.length).toBe(RUN_COMMENT_MAX);
    expect(RunDecisionReport.safeParse({ type: 'send-back', elementId: 'plan', comment: `${atLimit}x` }).success).toBe(false);
    expect(RunDecisionReport.safeParse({ type: 'send-back', elementId: 'plan', comment: '   ' }).success).toBe(false);
    for (const bad of ['one\ntwo', 'bell\u0007', 'escape\u001b[2J', 'turned‮round', 'nul\u0000']) {
      expect(RunDecisionReport.safeParse({ type: 'send-back', elementId: 'plan', comment: bad }).success, JSON.stringify(bad)).toBe(false);
      expect(RunDecisionReport.safeParse({ type: 'approve', comment: bad }).success, JSON.stringify(bad)).toBe(false);
    }
    // What a token or a session may send as a report has no decision in it.
    expect(RunReport.safeParse({ type: 'approve' }).success).toBe(false);
    expect(RunReport.safeParse({ type: 'send-back', elementId: 'plan', comment: 'x' }).success).toBe(false);
  });

  it('pauses and resumes back into waiting, and stops as any run does', () => {
    const paused = go(waiting(), [[{ type: 'pause' }, PERSON]]);
    expect(paused).toMatchObject({ status: 'paused', pausedFrom: 'awaiting' });
    expect(refused(paused, { type: 'approve' }, PERSON)).toBe('This run is paused. Resume it first.');
    expect(go(paused, [[{ type: 'resume' }, PERSON]]).status).toBe('awaiting');
    expect(go(waiting(), [[{ type: 'stop' }, TOKEN]]).status).toBe('stopped');
  });

  it('may be the first step: the run waits from the start', () => {
    const first = WorkflowVersion.parse({ ...version, elements: [version.elements[2], version.elements[0]] });
    const run = fresh(first);
    expect(run.status).toBe('awaiting');
    expect(go(run, [[{ type: 'approve' }, PERSON]], first)).toMatchObject({ status: 'running', currentElementId: 'plan' });
    // Queued, then given a session: the same.
    const queued = newRun(first, { id: ID(1), workflowId: ID(2), sessionId: null, inputs: {}, by: PERSON, at: T(0) });
    expect(go(queued, [[{ type: 'assign', sessionId: ID(3) }, PERSON]], first).status).toBe('awaiting');
  });
});

describe('the kind says that it waits', () => {
  it('validates an approval: a question, no instructions, nothing produced but the comment', () => {
    const content = (element: object) => ({ name: 'W', description: '', standing: '', inputs: [], extra: {}, elements: [WorkflowVersion.shape.elements.element.parse({ id: 'a', name: 'Look', kind: 'approval', ...element })] });
    expect(validateContent(content({ ask: 'Fine?' }))).toEqual([]);
    expect(validateContent(content({}))).toEqual(['"Look" is an approval and does not say what the person is asked to decide.']);
    expect(validateContent(content({ ask: 'Fine?', instructions: 'Approve it yourself.' }))).toEqual(['"Look" is an approval: it has no instructions for an agent.']);
    expect(validateContent(content({ ask: 'Fine?', produces: 'checklist' }))).toEqual(['"Look" is an approval: it produces nothing but the person\'s comment.']);
  });

  it('another kind that waits needs nothing but its registration: the step function and the board ask the kind', () => {
    registerElementKind({ kind: 'test-check', title: 'A check', waitsForPerson: true, validate: () => [], render: () => 'Someone checks this.' });
    expect(waitsForPerson('test-check')).toBe(true);
    const v = WorkflowVersion.parse({ number: 1, createdAt: T(0), name: 'Checked', elements: [{ id: 'do', name: 'Do', instructions: 'Do it.' }, { id: 'check', kind: 'test-check', name: 'Check' }, { id: 'end', name: 'End', instructions: 'End.' }] });
    const run = go(fresh(v), [[{ type: 'done', elementId: 'do' }, AGENT]], v);
    expect(run.status).toBe('awaiting');
    expect(refused(run, { type: 'done', elementId: 'check' }, AGENT, v)).toContain('only a person approves');
    expect(renderRun(v, run)).toContain('WAITING FOR A PERSON TO APPROVE');
    const board = boardOf({ runs: [run], workflows: [{ id: ID(2), projectId: ID(9), name: 'Checked', description: '', labels: {}, origin: { kind: 'local' }, createdAt: T(0), updatedAt: T(0), listed: true, versions: [v] }], sessions: [], canvases: [], now: Date.parse(T(5)), quietAfterSeconds: 300 });
    expect(board.groups[0]?.columns.map((c) => c.waitsForPerson)).toEqual([false, true, false]);
    expect(board.counts.waitingForYou).toBe(1);
    expect(go(run, [[{ type: 'approve' }, PERSON]], v).currentElementId).toBe('end');
  });
});
