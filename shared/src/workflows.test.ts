import { describe, expect, it } from 'vitest';
import { WORKFLOW_TEMPLATES } from './workflow-templates';
import {
  DEFAULT_WORKFLOW_LIMITS,
  WorkflowContent,
  WorkflowVersion,
  elementIdFor,
  elementKind,
  elementKindNames,
  exportWorkflow,
  fillInputs,
  importWorkflow,
  inputProblems,
  isQuiet,
  BRIEF_LINE,
  KICKOFF_LINE,
  kickoffLine,
  PlainName,
  safeForTyping,
  newRun,
  previewRun,
  registerElementKind,
  renderRun,
  runPosition,
  runSummary,
  stepRun,
  unregisterElementKind,
  validateContent,
  type Actor,
  type Run,
  type RunReport,
  type Workflow,
} from './workflows';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const AGENT: Actor = { kind: 'agent' };
const PERSON: Actor = { kind: 'person' };
const T = (minute: number): string => `2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

const version: WorkflowVersion = WorkflowVersion.parse({
  number: 1,
  createdAt: T(0),
  name: 'Three steps',
  standing: 'Keep changes small. The task is {{task}}.',
  elements: [
    { id: 'plan', name: 'Plan', instructions: 'Plan how to do {{task}}.', doneWhen: 'There is a plan.' },
    { id: 'build', name: 'Build', instructions: 'Build it.', doneWhen: 'It builds.' },
    { id: 'check', name: 'Check', instructions: 'Check it.', doneWhen: 'Checks pass.' },
  ],
});

const start = (sessionId: string | null = ID(1)): Run => newRun(version, { id: ID(9), workflowId: ID(8), sessionId, inputs: { task: 'the login bug' }, by: PERSON, at: T(0) });

/** Applies reports in order, each a minute after the last; fails the test if one is refused. */
function after(run: Run, ...reports: RunReport[]): Run {
  let current = run;
  reports.forEach((report, index) => {
    const result = stepRun(version, current, report, { by: AGENT, at: T(index + 1) });
    if (!result.ok) throw new Error(`refused: ${result.reason}`);
    current = result.run;
  });
  return current;
}
const states = (run: Run): string => run.elements.map((e) => e.state).join(' ');
const done = (elementId: string, note?: string): RunReport => ({ type: 'done', elementId, ...(note !== undefined ? { note } : {}) });

describe('a new run', () => {
  it('starts on the first element when it has a session', () => {
    const run = start();
    expect(run).toMatchObject({ status: 'running', currentElementId: 'plan', workflowVersion: 1, sessionId: ID(1) });
    expect(states(run)).toBe('active pending pending');
    expect(run.elements[0]).toMatchObject({ startedAt: T(0), sessionId: ID(1) });
  });

  it('waits, queued, when it has none', () => {
    const run = start(null);
    expect(run).toMatchObject({ status: 'queued', currentElementId: null, sessionId: null });
    expect(states(run)).toBe('pending pending pending');
  });
});

describe('stepRun', () => {
  // Each row: where the run stands (reports already applied), a report, and what comes of it.
  const table: { name: string; from: RunReport[]; report: RunReport; status?: string; current?: string | null; states?: string; refused?: RegExp; queued?: boolean }[] = [
    { name: 'done moves to the next element', from: [], report: done('plan', 'planned'), status: 'running', current: 'build', states: 'done active pending' },
    { name: 'done on the last element finishes the run', from: [done('plan'), done('build')], report: done('check'), status: 'finished', current: null, states: 'done done done' },
    { name: 'the same done sent twice is refused, and nothing is skipped', from: [done('plan')], report: done('plan'), refused: /"Plan" is not the current element \(it is done\).*"Build"/ },
    { name: 'done for a later element is refused', from: [], report: done('check'), refused: /not the current element \(it is pending\)/ },
    { name: 'done for an element that does not exist is refused', from: [], report: done('nope'), refused: /no element "nope"/ },
    { name: 'blocked keeps the element and records why', from: [], report: { type: 'blocked', reason: 'need the API key' }, status: 'blocked', current: 'plan', states: 'active pending pending' },
    { name: 'done after blocked carries on', from: [{ type: 'blocked', reason: 'x' }], report: done('plan'), status: 'running', current: 'build', states: 'done active pending' },
    { name: 'pause holds the run', from: [], report: { type: 'pause' }, status: 'paused', current: 'plan' },
    { name: 'pause twice is refused', from: [{ type: 'pause' }], report: { type: 'pause' }, refused: /already paused/ },
    { name: 'done while paused is refused', from: [{ type: 'pause' }], report: done('plan'), refused: /paused/ },
    { name: 'blocked while paused is refused', from: [{ type: 'pause' }], report: { type: 'blocked', reason: 'x' }, refused: /paused/ },
    { name: 'resume returns to running', from: [{ type: 'pause' }], report: { type: 'resume' }, status: 'running', current: 'plan' },
    { name: 'resume returns to blocked when that is what was paused', from: [{ type: 'blocked', reason: 'x' }, { type: 'pause' }], report: { type: 'resume' }, status: 'blocked', current: 'plan' },
    { name: 'resume of a run that is not paused is refused', from: [], report: { type: 'resume' }, refused: /not paused/ },
    { name: 'goto forward skips what lies between', from: [], report: { type: 'goto', elementId: 'check' }, status: 'running', current: 'check', states: 'skipped skipped active' },
    { name: 'goto forward leaves what was done as done', from: [done('plan')], report: { type: 'goto', elementId: 'check' }, status: 'running', current: 'check', states: 'done skipped active' },
    { name: 'goto back makes the later ones pending again', from: [done('plan'), done('build')], report: { type: 'goto', elementId: 'plan' }, status: 'running', current: 'plan', states: 'active pending pending' },
    { name: 'goto the current element is refused', from: [], report: { type: 'goto', elementId: 'plan' }, refused: /already the current element/ },
    { name: 'goto an unknown element is refused', from: [], report: { type: 'goto', elementId: 'nope' }, refused: /no element "nope"/ },
    { name: 'goto unblocks', from: [{ type: 'blocked', reason: 'x' }], report: { type: 'goto', elementId: 'build' }, status: 'running', current: 'build' },
    { name: 'goto while paused stays paused', from: [{ type: 'pause' }], report: { type: 'goto', elementId: 'build' }, status: 'paused', current: 'build' },
    { name: 'stop ends a running run', from: [done('plan')], report: { type: 'stop' }, status: 'stopped', current: 'build' },
    { name: 'stop ends a paused run', from: [{ type: 'pause' }], report: { type: 'stop' }, status: 'stopped' },
    { name: 'stop ends a blocked run', from: [{ type: 'blocked', reason: 'x' }], report: { type: 'stop' }, status: 'stopped' },
    { name: 'nothing moves a finished run', from: [done('plan'), done('build'), done('check')], report: { type: 'goto', elementId: 'plan' }, refused: /finished/ },
    { name: 'nothing moves a stopped run', from: [{ type: 'stop' }], report: { type: 'resume' }, refused: /stopped/ },
    { name: 'a stopped run cannot be stopped again', from: [{ type: 'stop' }], report: { type: 'stop' }, refused: /stopped/ },
    { name: 'assign is refused for a run that has a session', from: [], report: { type: 'assign', sessionId: ID(2) }, refused: /already has a session/ },
    { name: 'assign starts a queued run on the first element', queued: true, from: [], report: { type: 'assign', sessionId: ID(2) }, status: 'running', current: 'plan', states: 'active pending pending' },
    { name: 'done on a queued run is refused', queued: true, from: [], report: done('plan'), refused: /not started/ },
    { name: 'pause on a queued run is refused', queued: true, from: [], report: { type: 'pause' }, refused: /not started/ },
    { name: 'goto on a queued run is refused', queued: true, from: [], report: { type: 'goto', elementId: 'build' }, refused: /not started/ },
    { name: 'blocked on a queued run is refused', queued: true, from: [], report: { type: 'blocked', reason: 'x' }, refused: /not started/ },
    { name: 'stop ends a queued run', queued: true, from: [], report: { type: 'stop' }, status: 'stopped' },
  ];

  it.each(table)('$name', (row) => {
    const before = after(start(row.queued ? null : ID(1)), ...row.from);
    const frozen = JSON.stringify(before);
    const result = stepRun(version, before, row.report, { by: AGENT, at: T(30) });
    // Pure: what was passed in is never changed.
    expect(JSON.stringify(before)).toBe(frozen);
    if (row.refused) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(row.refused);
      return;
    }
    if (!result.ok) throw new Error(result.reason);
    if (row.status !== undefined) expect(result.run.status).toBe(row.status);
    if (row.current !== undefined) expect(result.run.currentElementId).toBe(row.current);
    if (row.states !== undefined) expect(states(result.run)).toBe(row.states);
    expect(result.run.updatedAt).toBe(T(30));
  });

  it('records the note, who finished an element and when, and times the next', () => {
    const run = after(start(), done('plan', 'Chose the short way.'));
    expect(run.elements[0]).toMatchObject({ state: 'done', note: 'Chose the short way.', by: AGENT, startedAt: T(0), finishedAt: T(1) });
    expect(run.elements[1]).toMatchObject({ state: 'active', startedAt: T(1), finishedAt: null, sessionId: ID(1) });
  });

  it('records who skipped an element, and that a person stopped a run', () => {
    const skipped = stepRun(version, start(), { type: 'goto', elementId: 'check' }, { by: PERSON, at: T(2) });
    expect(skipped.ok && skipped.run.elements[0]).toMatchObject({ state: 'skipped', by: PERSON, finishedAt: T(2) });
    const stopped = stepRun(version, start(), { type: 'stop' }, { by: PERSON, at: T(3) });
    expect(stopped.ok && stopped.run).toMatchObject({ status: 'stopped', finishedAt: T(3) });
  });

  it('after a jump forward and back, done goes to the next element that is still to do', () => {
    // Skip to check, finish it: nothing pending follows, so the run is finished with two skipped.
    const run = after(start(), { type: 'goto', elementId: 'check' }, done('check'));
    expect(run.status).toBe('finished');
    expect(states(run)).toBe('skipped skipped done');
  });

  it('walks a whole run and keeps the version it started on', () => {
    const run = after(start(), done('plan', 'a'), done('build', 'b'), done('check', 'c'));
    expect(run).toMatchObject({ status: 'finished', workflowVersion: 1, currentElementId: null, finishedAt: T(3) });
    expect(run.elements.map((e) => e.note)).toEqual(['a', 'b', 'c']);
  });
});

describe('what an agent is told', () => {
  it('has the standing text, the element, the done-when, the inputs filled in and how to report', () => {
    const text = renderRun(version, start());
    expect(text).toContain('Workflow: Three steps');
    expect(text).toContain('Element 1 of 3: Plan');
    expect(text).toContain('Task: the login bug');
    expect(text).toContain('Keep changes small. The task is the login bug.');
    expect(text).toContain('Plan how to do the login bug.');
    expect(text).toContain('Done when: There is a plan.');
    expect(text).toContain('After this: Build, Check.');
    expect(text).toContain('aubergine workflow done --note');
    expect(text).not.toContain('{{task}}');
  });

  it('hands over the note of the element before', () => {
    const text = renderRun(version, after(start(), done('plan', 'Use the retry helper in net.ts.')));
    expect(text).toContain('Element 2 of 3: Build');
    expect(text).toContain('From "Plan", the element before:\nUse the retry helper in net.ts.');
    expect(text).toContain('After this: Check.');
    expect(renderRun(version, after(start(), done('plan'), done('build')))).toContain('This is the last element.');
    // Only the element before hands over. An older note is not passed off as its.
    expect(renderRun(version, after(start(), done('plan', 'an older note'), done('build')))).not.toContain('an older note');
    // A skipped element handed over nothing; the one done before it did.
    expect(renderRun(version, after(start(), done('plan', 'from the plan'), { type: 'goto', elementId: 'check' }))).toContain('From "Plan", the element before:\nfrom the plan');
  });

  it('says so when the run is paused, blocked, finished, stopped or queued', () => {
    expect(renderRun(version, after(start(), { type: 'pause' }))).toContain('PAUSED');
    expect(renderRun(version, after(start(), { type: 'blocked', reason: 'no access' }))).toContain('BLOCKED: no access');
    expect(renderRun(version, after(start(), done('plan'), done('build'), done('check')))).toContain('finished');
    expect(renderRun(version, after(start(), { type: 'stop' }))).toContain('stopped');
    expect(renderRun(version, start(null))).toContain('waiting for a session');
  });

  it('previews, before any run exists, the very text a run prints', () => {
    const inputs = { task: 'the login bug' };
    expect(previewRun(version, inputs)).toBe(renderRun(version, start()));
    // On a later element the preview is what a run prints there when nothing was noted on the way.
    expect(previewRun(version, inputs, 'build')).toBe(renderRun(version, after(start(), done('plan'))));
    expect(previewRun(version, inputs, 'check')).toBe(renderRun(version, after(start(), done('plan'), done('build'))));
  });

  it('leaves a placeholder that names no input as it is', () => {
    expect(fillInputs('Do {{task}} for {{ who }} and {{other}}.', { task: 'X', who: 'Y' })).toBe('Do X for Y and {{other}}.');
  });

  it('gives a kickoff line, a position and a summary', () => {
    expect(kickoffLine()).toContain('aubergine workflow status');
    expect(runPosition(version, after(start(), done('plan')))).toBe('Build · 2 of 3');
    const summary = runSummary(version, after(start(), done('plan', 'planned'), { type: 'goto', elementId: 'check' }, done('check', 'all green')));
    expect(summary).toBe('Workflow "Three steps" finished.\n- Plan: planned\n- Build (skipped)\n- Check: all green');
  });
});

describe('inputs', () => {
  it('says what is missing and what is not asked for', () => {
    expect(inputProblems(version, { task: 'x' })).toEqual([]);
    expect(inputProblems(version, {})).toEqual(['"Task" is needed (task).']);
    expect(inputProblems(version, { task: 'x', colour: 'red' })).toEqual(['This workflow has no input named "colour".']);
  });
});

describe('element kinds', () => {
  it('has the one kind there is', () => {
    expect(elementKindNames()).toEqual(['instructions']);
  });

  it('takes a second kind without anything that validates, renders or steps being touched', () => {
    registerElementKind({
      kind: 'approval',
      title: 'Approval',
      validate: (element) => (element.doneWhen ? [] : [`"${element.name}" must say who approves.`]),
      render: (element) => `Stop here. A person must approve: ${element.doneWhen}`,
    });
    try {
      const content = WorkflowContent.parse({
        name: 'With approval',
        elements: [
          { id: 'build', name: 'Build', instructions: 'Build it.' },
          { id: 'ok', name: 'Sign-off', kind: 'approval', doneWhen: 'the owner said yes' },
        ],
      });
      expect(validateContent(content)).toEqual([]);
      expect(validateContent({ ...content, elements: [content.elements[0]!, { ...content.elements[1]!, doneWhen: '' }] })).toEqual(['"Sign-off" must say who approves.']);

      const v: WorkflowVersion = { ...content, number: 1, createdAt: T(0) };
      let run = newRun(v, { id: ID(9), workflowId: ID(8), sessionId: ID(1), inputs: {}, by: PERSON, at: T(0) });
      const moved = stepRun(v, run, { type: 'done', elementId: 'build' }, { by: AGENT, at: T(1) });
      if (!moved.ok) throw new Error(moved.reason);
      run = moved.run;
      expect(renderRun(v, run)).toContain('Stop here. A person must approve: the owner said yes');
    } finally {
      unregisterElementKind('approval');
    }
    expect(elementKind('approval')).toBeUndefined();
  });

  it('reports an element of a kind nobody registered, and still renders the run', () => {
    const content = WorkflowContent.parse({ name: 'x', elements: [{ id: 'a', name: 'A', kind: 'mystery', instructions: 'x' }] });
    expect(validateContent(content)).toEqual(['"A" is of a kind this version does not know: mystery.']);
    const v: WorkflowVersion = { ...content, number: 1, createdAt: T(0) };
    expect(renderRun(v, newRun(v, { id: ID(9), workflowId: ID(8), sessionId: ID(1), inputs: {}, by: PERSON, at: T(0) }))).toContain('a kind this version does not know');
  });
});

describe('validating a workflow', () => {
  const content = (elements: unknown[], more: object = {}): WorkflowContent => WorkflowContent.parse({ name: 'x', elements, ...more });

  it('finds empty instructions, repeated IDs and repeated input keys', () => {
    expect(validateContent(content([{ id: 'a', name: 'A', instructions: ' ' }]))).toEqual(['"A" has no instructions.']);
    expect(validateContent(content([{ id: 'a', name: 'A', instructions: 'x' }, { id: 'a', name: 'B', instructions: 'y' }]))).toEqual(['Two elements have the ID "a".']);
    expect(validateContent(content([{ id: 'a', name: 'A', instructions: 'x' }], { inputs: [{ key: 'task', label: 'Task' }, { key: 'task', label: 'Again' }] }))).toEqual(['Two inputs have the key "task".']);
  });

  it('holds a workflow to the limits it is given', () => {
    const limits = { maxElements: 2, maxElementChars: 10 };
    const three = content([1, 2, 3].map((n) => ({ id: `e${n}`, name: `E${n}`, instructions: 'short' })));
    expect(validateContent(three, limits)).toEqual(['It has 3 elements; at most 2 are allowed.']);
    expect(validateContent(content([{ id: 'a', name: 'A', instructions: 'much too long for this' }]), limits)[0]).toMatch(/22 characters; at most 10/);
    expect(validateContent(content([{ id: 'a', name: 'A', instructions: 'ok' }], { standing: 'x'.repeat(11) }), limits)[0]).toMatch(/standing text is 11 characters/);
    expect(validateContent(three, DEFAULT_WORKFLOW_LIMITS)).toEqual([]);
  });

  it('makes element IDs from names, unique among the others', () => {
    expect(elementIdFor('Find the cause!', [])).toBe('find-the-cause');
    expect(elementIdFor('Build', ['build', 'build-2'])).toBe('build-3');
    expect(elementIdFor('???', [])).toBe('element');
  });
});

describe('the built-in templates', () => {
  it('are four, each valid, each asking for the task', () => {
    expect(WORKFLOW_TEMPLATES.map((t) => t.title)).toEqual(['Plan, build, check', 'Fix a bug', 'Review a change', 'Specify, design, then build']);
    for (const template of WORKFLOW_TEMPLATES) {
      expect(validateContent(template.content), template.name).toEqual([]);
      expect(template.content.inputs.map((i) => i.key)).toEqual(['task']);
      expect(template.content.elements[0]?.instructions).toContain('{{task}}');
      for (const element of template.content.elements) expect(element.doneWhen, `${template.name}/${element.id}`).not.toBe('');
    }
    expect(WORKFLOW_TEMPLATES.find((t) => t.name === 'fix-a-bug')?.content.elements.map((e) => e.name)).toEqual(['Reproduce', 'Find the cause', 'Fix', 'Test', 'Summarise']);
  });
});

describe('quiet', () => {
  const run = { status: 'running' as const, updatedAt: T(0) };
  it('is a running run whose session printed long after the last report', () => {
    expect(isQuiet(run, T(6), 300)).toBe(true);
    expect(isQuiet(run, T(4), 300)).toBe(false);
    expect(isQuiet(run, null, 300)).toBe(false);
    expect(isQuiet({ ...run, status: 'paused' }, T(6), 300)).toBe(false);
    expect(isQuiet({ ...run, status: 'blocked' }, T(6), 300)).toBe(false);
  });
});

describe('the workflow file', () => {
  const workflow = (content: WorkflowContent, labels: Record<string, string> = {}): Workflow => ({
    id: ID(8),
    projectId: ID(7),
    name: content.name,
    description: content.description,
    labels,
    origin: { kind: 'local' },
    createdAt: T(0),
    updatedAt: T(0),
    listed: true,
    versions: [{ ...content, number: 1, createdAt: T(0) }],
  });

  it('round-trips a workflow', () => {
    const { number: _n, createdAt: _c, ...content } = version;
    const file = exportWorkflow(workflow(content, { team: 'web' }));
    expect(file).toMatchObject({ aubergine: 'workflow', format: 1 });
    const back = importWorkflow(JSON.parse(JSON.stringify(file)));
    expect(back.content).toEqual(content);
    expect(back.labels).toEqual({ team: 'web' });
    expect(back.origin).toEqual({ kind: 'import' });
  });

  it('keeps fields it does not know, at every level, through import and export', () => {
    const fromTheFuture = {
      aubergine: 'workflow',
      format: 2,
      signedBy: 'someone',
      workflow: {
        name: 'From a newer version',
        description: 'd',
        standing: '',
        inputs: [{ key: 'task', label: 'Task', description: '', required: true }],
        budget: { minutes: 30 },
        elements: [
          { id: 'one', kind: 'instructions', name: 'One', instructions: 'Do one.', doneWhen: 'Done.', needs: [{ kind: 'command', name: 'git' }], produces: 'note', origin: { kind: 'local' }, expects: ['spec'], retries: 2 },
          { id: 'two', kind: 'instructions', name: 'Two', instructions: 'Do two.', doneWhen: '', needs: [], produces: 'checklist', origin: { kind: 'shelf', shelfId: 'abc' } },
        ],
        labels: {},
        origin: { kind: 'local' },
      },
    };
    const imported = importWorkflow(fromTheFuture);
    expect(imported.content.elements[0]?.extra).toEqual({ expects: ['spec'], retries: 2 });
    expect(imported.content.elements[1]?.origin).toEqual({ kind: 'shelf', shelfId: 'abc' });
    expect(imported.content.extra).toEqual({ budget: { minutes: 30 }, $file: { signedBy: 'someone' } });

    const out = exportWorkflow(workflow(imported.content)) as typeof fromTheFuture;
    expect(out.signedBy).toBe('someone');
    expect(out.workflow.budget).toEqual({ minutes: 30 });
    expect(out.workflow.elements).toEqual(fromTheFuture.workflow.elements);
    // And once more around changes nothing.
    expect(exportWorkflow(workflow(importWorkflow(JSON.parse(JSON.stringify(out))).content))).toEqual(out);
  });

  it('gives elements without a usable ID one, and refuses what is not a workflow file', () => {
    const imported = importWorkflow({ aubergine: 'workflow', format: 1, workflow: { name: 'x', elements: [{ name: 'First step', instructions: 'a' }, { id: 'bad id!', name: 'First step', instructions: 'b' }] } });
    expect(imported.content.elements.map((e) => e.id)).toEqual(['first-step', 'first-step-2']);
    expect(() => importWorkflow({ name: 'x' })).toThrow('not an Aubergine workflow file');
    expect(() => importWorkflow('nope')).toThrow('not an Aubergine workflow file');
  });
});

describe('names', () => {
  it('refuses control characters and direction overrides, and takes ordinary text in any script', () => {
    for (const bad of ['a\u0003b', 'a\nb', 'a\u001b[2Jb', 'a\u202eb', 'a\u007fb']) expect(PlainName.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    for (const good of ['Fix a bug', '修复错误', 'Étape 2 — revue', 'Ship it 🚀', "Ana's `flow` (v2)"]) expect(PlainName.safeParse(good).success, good).toBe(true);
  });
});

describe('the kickoff line', () => {
  it('is a fixed sentence: nothing stored is in what is typed, so nothing anyone wrote can become key presses', () => {
    expect(kickoffLine()).toBe(KICKOFF_LINE);
    expect(kickoffLine.length).toBe(0);
    for (const line of [KICKOFF_LINE, BRIEF_LINE]) {
      expect(line).not.toMatch(/\p{C}/u);
      expect(line).toMatch(/^[A-Za-z0-9 `"<>.,:'-]+$/);
    }
    expect(KICKOFF_LINE).toContain('aubergine workflow status');
    expect(BRIEF_LINE).toContain('aubergine workflow brief');
  });

  it('can make a stored name safe for typing, should one ever be needed there', () => {
    const hostile = 'Fix\u0003 a bug\r\nrm -rf ~\u001b[2J `id` $(id) "x" ; | > \u0004\u202e';
    expect(safeForTyping(hostile)).toBe('Fix a bug rm -rf 2J id (id) x');
  });

  it('keeps ordinary names as they are', () => {
    expect(safeForTyping("Plan, build, check (v2): Ana's flow & more")).toBe("Plan, build, check (v2): Ana's flow & more");
    expect(safeForTyping('修复错误 — étape')).toBe('修复错误 étape');
  });
});
