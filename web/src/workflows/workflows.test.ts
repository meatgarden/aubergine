import { afterEach, describe, expect, it } from 'vitest';
import {
  NO_ATTENTION,
  NO_STATUS,
  WorkflowVersion,
  applyEvent,
  createInitialState,
  newId,
  newRun,
  renderRun,
  previewRun,
  stepRun,
  type AppState,
  type LayoutNode,
  type Run,
  type Session,
  type Workflow,
} from '@aubergine/shared';
import { listFilters } from '../list-filters';
import { listModel } from '../list-model';
import { DEFAULT_VIEW, createRowSelector, filterRows, type ListView } from '../terminal-rows';
import { addElement, addInput, changeElement, draftOf, draftProblems, moveElement, removeElement, sameDraft, sampleInputs, versionOfDraft } from './editor-model';
import { elementView, registerElementView, registerRunView, runViewList, unregisterElementView, unregisterRunView } from './registries';
import { actorWord, pictureOf, pictureOfLive, runOfSession, runsBySession, sortRuns, took } from './run-model';
import './element-views';
import './run-views';

const at = '2026-01-01T00:00:00.000Z';
const minutes = (n: number): string => new Date(Date.parse(at) + n * 60_000).toISOString();
const LIMITS = { maxElements: 50, maxElementChars: 20_000 };

const version = WorkflowVersion.parse({
  number: 1,
  createdAt: at,
  name: 'Three steps',
  elements: [
    { id: 'plan', name: 'Plan', instructions: 'Plan {{task}}.', doneWhen: 'There is a plan.' },
    { id: 'build', name: 'Build', instructions: 'Build it.' },
    { id: 'check', name: 'Check', instructions: 'Check it.' },
  ],
});

function session(name: string, extra: Partial<Session> = {}): Session {
  return { id: newId(), projectId: newId(), name, createdAt: at, state: 'open', cwd: null, command: 'zsh', note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null, ...extra };
}

/** A state with a workflow and `count` sessions on the first canvas. */
function world(count: number): { app: AppState; sessions: Session[]; workflow: Workflow } {
  const base = createInitialState(new Date(at));
  const sessions = Array.from({ length: count }, (_, i) => session(`s-${i}`));
  const nodes: LayoutNode[] = sessions.map((s, i) => ({ id: newId(), sessionId: s.id, x: (i % 10) * 700, y: Math.floor(i / 10) * 500, width: 640, height: 400, color: 'none' }));
  const workflow: Workflow = { id: newId(), projectId: base.projects[0]!.id, name: version.name, description: '', labels: {}, origin: { kind: 'local' }, createdAt: at, updatedAt: at, listed: true, versions: [version] };
  return { app: { ...base, sessions, canvases: [{ ...base.canvases[0]!, layout: { nodes, frames: [] } }], workflows: [workflow] }, sessions, workflow };
}

const runFor = (workflow: Workflow, sessionId: string | null, startedAt = at): Run => newRun(version, { id: newId(), workflowId: workflow.id, sessionId, inputs: { task: 'the login bug' }, by: { kind: 'person' }, at: startedAt });
const moved = (run: Run, report: Parameters<typeof stepRun>[2], when = minutes(1)): Run => {
  const result = stepRun(version, run, report, { by: { kind: 'agent' }, at: when });
  if (!result.ok) throw new Error(result.reason);
  return result.run;
};
const view = (extra: Partial<ListView> = {}): ListView => ({ ...DEFAULT_VIEW, filters: [], ...extra });

describe('the picture of a run', () => {
  it('has a segment per step, the current one named and numbered, and a position in words', () => {
    const { app, sessions, workflow } = world(1);
    const run = moved(runFor(workflow, sessions[0]!.id), { type: 'done', elementId: 'plan' });
    const picture = pictureOfLive({ ...app, runs: [run] }, run, 300)!;
    expect(picture.segments.map((s) => `${s.name}:${s.state}`)).toEqual(['Plan:done', 'Build:active', 'Check:pending']);
    expect(picture.current).toEqual({ id: 'build', name: 'Build', number: 2 });
    expect(picture).toMatchObject({ workflowName: 'Three steps', total: 3, position: 'Build · 2 of 3', quiet: false });
  });

  it('says the status when there is no current step, and works from the names an archived run carries', () => {
    const { workflow } = world(0);
    const queued = runFor(workflow, null);
    const names = { workflowName: 'Three steps', elements: version.elements.map((e) => ({ id: e.id, name: e.name })) };
    expect(pictureOf(queued, names, null, 300)).toMatchObject({ current: null, position: 'queued' });
    const stopped = moved(runFor(workflow, newId()), { type: 'stop' });
    expect(pictureOf(stopped, names, null, 300).position).toBe('stopped at Plan');
    // The workflow is gone: there is nothing to draw the live run from.
    expect(pictureOfLive({ ...createInitialState(), runs: [queued] }, queued, 300)).toBeNull();
  });

  it('is quiet when the terminal has printed for a while since the last report, and only while running', () => {
    const { app, workflow } = world(0);
    const worker = session('worker', { lastOutputAt: minutes(8) });
    const state = { ...app, sessions: [worker] };
    const run = moved(runFor(workflow, worker.id), { type: 'done', elementId: 'plan' }, minutes(1));
    expect(pictureOfLive(state, run, 300)?.quiet).toBe(true);
    expect(pictureOfLive(state, run, 600)?.quiet).toBe(false);
    // A report brings it up to date again.
    expect(pictureOfLive(state, moved(run, { type: 'done', elementId: 'build' }, minutes(9)), 300)?.quiet).toBe(false);
    expect(pictureOfLive(state, moved(run, { type: 'pause' }, minutes(1)), 300)?.quiet).toBe(false);
    expect(pictureOfLive(state, moved(run, { type: 'blocked', reason: 'x' }, minutes(1)), 300)?.quiet).toBe(false);
  });

  it('finds the run of a session, and gives the same map until the runs change', () => {
    const { app, sessions, workflow } = world(2);
    const run = runFor(workflow, sessions[1]!.id);
    const state = { ...app, runs: [run, runFor(workflow, null)] };
    expect(runOfSession(state, sessions[1]!.id)).toBe(run);
    expect(runOfSession(state, sessions[0]!.id)).toBeNull();
    expect(runOfSession(null, sessions[0]!.id)).toBeNull();
    expect(runsBySession(state.runs)).toBe(runsBySession(state.runs));
    expect(runsBySession(state.runs).size).toBe(1);
  });

  it('puts the runs that need someone first, then the most recently moved', () => {
    const { workflow } = world(0);
    const a = runFor(workflow, newId());
    const b = moved(runFor(workflow, newId()), { type: 'done', elementId: 'plan' }, minutes(5));
    const blocked = moved(runFor(workflow, newId()), { type: 'blocked', reason: 'x' });
    const paused = moved(runFor(workflow, newId()), { type: 'pause' });
    const queued = runFor(workflow, null);
    expect(sortRuns([queued, a, b, paused, blocked])).toEqual([blocked, paused, b, a, queued]);
  });

  it('says how long something took and who moved it', () => {
    const now = Date.parse(minutes(100));
    expect(took(null, null, now)).toBe('');
    expect(took(at, minutes(0.5), now)).toBe('30s');
    expect(took(at, minutes(4), now)).toBe('4m');
    expect(took(at, minutes(80), now)).toBe('1h 20m');
    expect(took(at, minutes(120), now)).toBe('2h');
    // Still going: up to now.
    expect(took(minutes(97), null, now)).toBe('3m');
    expect(actorWord(null)).toBe('');
    expect(actorWord({ kind: 'agent' })).toBe('the agent');
    expect(actorWord({ kind: 'person' })).toBe('you');
    expect(actorWord({ kind: 'token', name: 'ci' })).toBe('the token “ci”');
  });
});

describe('the workflow filters', () => {
  it('are registered like the others, and narrow the list by run and by status', () => {
    expect(listFilters().map((f) => f.id)).toEqual(expect.arrayContaining(['workflow', 'workflow-running', 'workflow-blocked', 'workflow-paused']));
    const { app, sessions, workflow } = world(5);
    const runs = [
      runFor(workflow, sessions[0]!.id),
      moved(runFor(workflow, sessions[1]!.id), { type: 'blocked', reason: 'x' }),
      moved(runFor(workflow, sessions[2]!.id), { type: 'pause' }),
    ];
    const rows = createRowSelector()(app);
    const by = runsBySession(runs);
    const names = (filters: string[]): string[] => filterRows(rows, view({ filters }), null, by).map((r) => r.session.name);
    expect(names(['workflow'])).toEqual(['s-0', 's-1', 's-2']);
    expect(names(['workflow-running'])).toEqual(['s-0']);
    expect(names(['workflow-blocked'])).toEqual(['s-1']);
    expect(names(['workflow-paused'])).toEqual(['s-2']);
    // They combine with the others, with AND.
    expect(filterRows(rows, view({ filters: ['workflow'], text: 's-1' }), null, by).map((r) => r.session.name)).toEqual(['s-1']);
    expect(names(['workflow', 'parked'])).toEqual([]);
  });

  it('the list follows a run only while a filter looks at runs', () => {
    const { app, sessions, workflow } = world(3);
    const run = runFor(workflow, sessions[1]!.id);
    const withRun = applyEvent(app, { type: 'run.started', run });
    const plain = view();
    // No run filter: a run starting or moving leaves the list exactly as it was.
    const before = listModel(app, plain, null);
    expect(listModel(withRun, plain, null)).toBe(before);
    // With one, the list is worked out again and shows the session.
    const onWorkflow = view({ filters: ['workflow'] });
    expect(listModel(app, onWorkflow, null).filtered).toHaveLength(0);
    expect(listModel(withRun, onWorkflow, null).filtered.map((r) => r.session.name)).toEqual(['s-1']);
    const blocked = applyEvent(withRun, { type: 'run.moved', run: moved(run, { type: 'blocked', reason: 'x' }) });
    expect(listModel(blocked, view({ filters: ['workflow-blocked'] }), null).filtered.map((r) => r.session.name)).toEqual(['s-1']);
    expect(listModel(applyEvent(blocked, { type: 'run.finished', run: moved(run, { type: 'stop' }) }), onWorkflow, null).filtered).toHaveLength(0);
  });
});

describe('a thousand sessions, thirty of them on runs', () => {
  it('a report rebuilds no row and changes one run; the strips of the others see the same run as before', () => {
    const { app, sessions, workflow } = world(1000);
    let state = app;
    for (let i = 0; i < 30; i += 1) state = applyEvent(state, { type: 'run.started', run: runFor(workflow, sessions[i * 30]!.id) });
    const select = createRowSelector();
    const rows = select(state);
    expect(rows).toHaveLength(1000);
    expect(state.runs).toHaveLength(30);

    const target = state.runs[17]!;
    const started = performance.now();
    const after = applyEvent(state, { type: 'run.moved', run: moved(target, { type: 'done', elementId: 'plan' }) });
    const afterRows = select(after);
    const lookups = sessions.map((s) => runOfSession(after, s.id));
    expect(performance.now() - started).toBeLessThan(100);

    // Not one row was rebuilt: the list has nothing to redraw.
    expect(afterRows).toBe(rows);
    // Each strip listens to its own run: twenty-nine are handed the very object they had, one a new one.
    const beforeRuns = sessions.map((s) => runOfSession(state, s.id));
    expect(lookups.filter((run, i) => run !== beforeRuns[i])).toHaveLength(1);
    expect(lookups.filter(Boolean)).toHaveLength(30);
    expect(runOfSession(after, target.sessionId!)?.currentElementId).toBe('build');
    // The page holds live runs only: one that finishes is gone from it.
    expect(applyEvent(after, { type: 'run.finished', run: moved(target, { type: 'stop' }) }).runs).toHaveLength(29);
  });
});

describe('the registries', () => {
  afterEach(() => {
    unregisterElementView('test-approval');
    unregisterRunView('test-timeline');
  });

  it('have the step kind and the run views there are', () => {
    expect(elementView('instructions')).toBeDefined();
    expect(runViewList().map((v) => v.id)).toEqual(['pipeline', 'told']);
  });

  it('take a second kind of step and another view of a run, and nothing that asks is changed', () => {
    const Nothing = (): null => null;
    registerElementView({ kind: 'test-approval', Editor: Nothing, Detail: Nothing });
    expect(elementView('test-approval')?.Editor).toBe(Nothing);
    expect(elementView('nobody-registered-this')).toBeUndefined();

    registerRunView({ id: 'test-timeline', title: 'Timeline', order: 5, Component: Nothing });
    // In order, between the two that were there; the first is still what opens.
    expect(runViewList().map((v) => v.id)).toEqual(['pipeline', 'test-timeline', 'told']);
    registerRunView({ id: 'test-timeline', title: 'Timeline', order: -1, Component: Nothing });
    expect(runViewList()[0]?.id).toBe('test-timeline');
    unregisterRunView('test-timeline');
    expect(runViewList().map((v) => v.id)).toEqual(['pipeline', 'told']);
  });
});

describe('editing a workflow', () => {
  const draft = draftOf(version);

  it('starts from the version, unchanged', () => {
    expect(sameDraft(draft, draftOf(version))).toBe(true);
    expect(draftProblems(draft, LIMITS)).toEqual([]);
  });

  it('adds a step with an ID of its own that renaming does not change', () => {
    const added = addElement(addElement(draft));
    expect(added.elements.map((e) => e.id)).toEqual(['plan', 'build', 'check', 'new-step', 'new-step-2']);
    const renamed = changeElement(added, 'new-step', { ...added.elements[3]!, name: 'Tidy up', instructions: 'Remove what is left over.' });
    expect(renamed.elements[3]).toMatchObject({ id: 'new-step', name: 'Tidy up' });
    expect(sameDraft(renamed, draft)).toBe(false);
    // The empty one cannot be saved, and the problem says which.
    expect(draftProblems(renamed, LIMITS)).toEqual(['"New step" has no instructions.']);
  });

  it('reorders by moving one step to where it was dropped, and removes', () => {
    const order = (d: typeof draft): string => d.elements.map((e) => e.id).join(' ');
    expect(order(moveElement(draft, 0, 2))).toBe('build check plan');
    expect(order(moveElement(draft, 2, 0))).toBe('check plan build');
    expect(order(moveElement(draft, 1, 1))).toBe('plan build check');
    expect(moveElement(draft, 0, 9)).toBe(draft);
    expect(moveElement(draft, -1, 0)).toBe(draft);
    expect(order(removeElement(draft, 'build'))).toBe('plan check');
  });

  it('says what is wrong in words: no name, no steps, a bad key, the limits', () => {
    expect(draftProblems({ ...draft, name: ' ' }, LIMITS)).toEqual(['The workflow needs a name.']);
    expect(draftProblems({ ...draft, elements: [] }, LIMITS)).toEqual(['A workflow needs at least one step.']);
    expect(draftProblems(changeElement(draft, 'build', { ...draft.elements[1]!, name: '' }), LIMITS)).toEqual(['Step 2 needs a name.']);
    expect(draftProblems({ ...draft, inputs: [{ key: 'Bad Key', label: 'x', description: '', required: true }] }, LIMITS)[0]).toContain('Input 1');
    expect(draftProblems(draft, { maxElements: 2, maxElementChars: 20_000 })).toEqual(['It has 3 steps; at most 2 are allowed.']);
  });

  it('adds inputs: the task first when it is missing, then numbered ones', () => {
    expect(addInput({ ...draft, inputs: [] }).inputs.map((i) => i.key)).toEqual(['task']);
    expect(addInput(addInput(draft)).inputs.map((i) => i.key)).toEqual(['task', 'input_2', 'input_3']);
  });

  it('previews the very text a run of the saved workflow prints', () => {
    const edited = changeElement(draft, 'build', { ...draft.elements[1]!, instructions: 'Build it, tests first.' });
    const inputs = sampleInputs(edited.inputs, { task: 'the login bug' });
    const preview = previewRun(versionOfDraft(edited), inputs, 'build');
    expect(preview).toContain('Step 2 of 3: Build');
    expect(preview).toContain('Build it, tests first.');
    // Saved as the next version, a run on that element prints exactly this.
    const saved = { ...versionOfDraft(edited), number: 2 };
    let run = newRun(saved, { id: newId(), workflowId: newId(), sessionId: newId(), inputs, by: { kind: 'person' }, at });
    const next = stepRun(saved, run, { type: 'done', elementId: 'plan' }, { by: { kind: 'agent' }, at });
    if (next.ok) run = next.run;
    expect(renderRun(saved, run)).toBe(preview);
    // Nothing typed yet: the label stands in, so the preview still reads as a sentence.
    expect(sampleInputs(edited.inputs, {})).toEqual({ task: '(task)' });
  });
});

describe('the review screen takes things to review from sources', () => {
  it('lists a draft with what it is, who it is from and how it stands', async () => {
    const { itemOfDraft } = await import('../review/drafts-source');
    const { app, sessions, workflow } = world(1);
    const base = { id: newId(), status: 'waiting' as const, description: 'My to-dos.', sessionId: null, revisesWorkflowId: null, workflow: null, element: null, previous: null, revision: 1, comment: null, createdAt: at, updatedAt: at };
    const element = { ...version.elements[0]!, name: 'Collect my to-dos' };
    expect(itemOfDraft({ ...base, kind: 'element', proposedBy: { kind: 'session', sessionId: sessions[0]!.id }, element }, app)).toMatchObject({
      title: 'Collect my to-dos',
      what: 'A step',
      from: 'the agent in “s-0”',
      asked: 'My to-dos.',
      state: 'waiting',
    });
    expect(itemOfDraft({ ...base, kind: 'workflow', proposedBy: { kind: 'token', tokenId: newId(), name: 'ci' }, workflow: version, revisesWorkflowId: workflow.id, revision: 2 }, app)).toMatchObject({
      title: 'Three steps',
      what: 'A new version of “Three steps”',
      from: 'a program, with the token “ci”',
      revision: 2,
    });
    expect(itemOfDraft({ ...base, kind: 'element', status: 'requested', revision: 0, proposedBy: { kind: 'session', sessionId: newId() } }, app)).toMatchObject({
      title: 'A step, not written yet',
      from: 'the agent in “a terminal that is gone”',
      state: 'requested',
    });
  });

  it('takes a second source, and a second way of showing an output, with nothing that asks changed', async () => {
    const { registerReviewSource, reviewSources, unregisterReviewSource } = await import('../review/registry');
    const { outputView, registerOutputView, unregisterOutputView } = await import('./registries');
    await import('../review/drafts-source');
    await import('./output-views');
    expect(reviewSources().map((s) => s.id)).toEqual(['drafts']);
    registerReviewSource({ id: 'test-installs', title: 'From a library', useItems: () => [], load: async () => ({ text: '', previousText: null, needs: [], proposal: { workflow: null, element: null } }), accept: async () => {}, discard: async () => {} });
    expect(reviewSources().map((s) => s.id)).toEqual(['drafts', 'test-installs']);
    // A source need not be able to send things back.
    expect(reviewSources()[1]?.sendBack).toBeUndefined();
    unregisterReviewSource('test-installs');
    expect(reviewSources()).toHaveLength(1);

    expect(outputView('checklist')).toBeDefined();
    expect(outputView('note')).toBeUndefined();
    registerOutputView({ kind: 'test-link', View: () => null });
    expect(outputView('test-link')).toBeDefined();
    unregisterOutputView('test-link');
  });

  it('a run with a checklist says, per step, what kind of thing was produced', () => {
    const names = { workflowName: 'To-dos', elements: [{ id: 'plan', name: 'Collect', produces: 'checklist' }, { id: 'build', name: 'Do' }] };
    const { workflow } = world(0);
    expect(pictureOf(runFor(workflow, newId()), names, null, 300).segments.map((s) => s.produces)).toEqual(['checklist', 'note']);
  });
});

describe('repository workflows as things to review', () => {
  it('are the files never accepted or changed since, and not the accepted or unreadable ones', async () => {
    const { itemsOfListing, idOf } = await import('../review/repository-source');
    const file = (name: string, state: 'accepted' | 'review' | 'changed' | 'unreadable'): { file: string; name: string | null; elements: string[]; hash: string | null; state: typeof state; reason: string | null } => ({
      file: `${name}.json`,
      name: state === 'unreadable' ? null : name,
      elements: [],
      hash: `hash-of-${name}`,
      state,
      reason: null,
    });
    const listing = [{ root: '/work/project', folder: 'project', sessionIds: [], truncated: false, workflows: [file('release', 'accepted'), file('hotfix', 'review'), file('deploy', 'changed'), file('broken', 'unreadable')] }];
    const items = itemsOfListing(listing);
    expect(items.map((i) => [i.id, i.title, i.what, i.state, i.revision])).toEqual([
      [idOf('/work/project', 'hotfix.json'), 'hotfix', 'A workflow file', 'waiting', 1],
      [idOf('/work/project', 'deploy.json'), 'deploy', 'A workflow file that changed since you accepted it', 'waiting', 2],
    ]);
    expect(items[0]?.from).toBe('the repository “project” (hotfix.json in /work/project/.aubergine/workflows)');
    // Content the owner declined in this browser is not offered again, until it changes.
    expect(itemsOfListing(listing, new Set(['/work/project\nhotfix.json\nhash-of-hotfix'])).map((i) => i.title)).toEqual(['deploy']);
    expect(itemsOfListing(listing, new Set(['/work/project\nhotfix.json\nan-older-hash'])).map((i) => i.title)).toEqual(['hotfix', 'deploy']);
  });

  it('is a source registered with the review screen, beside drafts', async () => {
    const { reviewSources } = await import('../review/registry');
    await import('../review/drafts-source');
    await import('../review/repository-source');
    expect(reviewSources().map((s) => s.id)).toEqual(['drafts', 'repository']);
    // A file cannot be sent back to anyone.
    expect(reviewSources().find((s) => s.id === 'repository')?.sendBack).toBeUndefined();
  });
});
