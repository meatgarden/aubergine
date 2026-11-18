import { describe, expect, it } from 'vitest';
import { Draft, lineDiff, needsOfProposal, needsShowAll, renderBrief, reviewText, REVIEW_LINES_SHOWN } from './drafts';
import { CHECKLIST_MAX_ITEMS, Checklist, outputKind, outputKindNames, registerOutputKind, unregisterOutputKind } from './outputs';
import { Element, WorkflowContent, WorkflowVersion, needWords, needsOf, newRun, previewRun, renderRun, stepRun, tickRun, validateContent, type Actor, type Run, type RunReport } from './workflows';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const T = (minute: number): string => `2026-05-01T10:${String(minute).padStart(2, '0')}:00.000Z`;
const AGENT: Actor = { kind: 'agent' };
const OWNER: Actor = { kind: 'person' };
const LIMITS = { maxElements: 50, maxElementChars: 20_000 };

/** The example of this stage: an element that needs a chat tool and produces a checklist, then one that works from it. */
const collect = Element.parse({
  id: 'collect',
  name: 'Collect my to-dos',
  instructions: 'Read my unread messages in the team chat and list everything someone asked me to do.',
  doneWhen: 'Every request is on the list, one per item.',
  needs: [{ kind: 'mcp', name: 'team chat', note: 'read access is enough' }],
  produces: 'checklist',
});
const version = WorkflowVersion.parse({
  number: 1,
  createdAt: T(0),
  name: 'To-dos',
  elements: [collect, { id: 'do', name: 'Do the chosen ones', instructions: 'Do the items the owner ticked, in order.', needs: [{ kind: 'command', name: 'git' }, { kind: 'mcp', name: 'Team Chat' }] }],
});
const list = { items: [{ text: 'Review the retry change' }, { text: 'Answer about the release date', detail: 'Asked twice.\nSecond time on Tuesday.' }, { text: 'Book the room' }] };

const start = (): Run => newRun(version, { id: ID(9), workflowId: ID(8), sessionId: ID(1), inputs: {}, by: OWNER, at: T(0) });
const step = (run: Run, report: RunReport, by: Actor = AGENT, at = T(1)): Run => {
  const result = stepRun(version, run, report, { by, at });
  if (!result.ok) throw new Error(result.reason);
  return result.run;
};

describe('output kinds', () => {
  it('are the note and the checklist', () => {
    expect(outputKindNames()).toEqual(['note', 'checklist']);
    expect(outputKind('note')?.required).toBe(false);
    expect(outputKind('checklist')?.required).toBe(true);
  });

  it('take another kind without anything that steps, ticks or renders being touched', () => {
    registerOutputKind({
      kind: 'link',
      title: 'A link',
      required: true,
      expects: 'A JSON file of the form {"url": "https://…"}.',
      check: (value) => (typeof (value as { url?: unknown })?.url === 'string' ? { ok: true, value } : { ok: false, problems: ['It has no url.'] }),
      items: () => 0,
      render: (value) => `Link: ${(value as { url: string }).url}`,
    });
    try {
      const v = WorkflowVersion.parse({ number: 1, createdAt: T(0), name: 'x', elements: [{ id: 'a', name: 'A', instructions: 'x', produces: 'link' }, { id: 'b', name: 'B', instructions: 'y' }] });
      expect(validateContent(v)).toEqual([]);
      const run = newRun(v, { id: ID(9), workflowId: ID(8), sessionId: ID(1), inputs: {}, by: OWNER, at: T(0) });
      expect(renderRun(v, run)).toContain('This step produces a link. A JSON file of the form {"url": "https://…"}.');
      const refused = stepRun(v, run, { type: 'done', elementId: 'a' }, { by: AGENT, at: T(1) });
      expect(refused.ok === false && refused.reason).toContain('produces a link, and none was handed in');
      const wrong = stepRun(v, run, { type: 'done', elementId: 'a', output: {} }, { by: AGENT, at: T(1) });
      expect(wrong.ok === false && wrong.reason).toContain('It has no url.');
      const done = stepRun(v, run, { type: 'done', elementId: 'a', output: { url: 'https://example.test/x' } }, { by: AGENT, at: T(1) });
      if (!done.ok) throw new Error(done.reason);
      expect(renderRun(v, done.run)).toContain('From "A", the step before:\nLink: https://example.test/x');
      // Nothing to tick in a link.
      const tick = tickRun(v, done.run, { elementId: 'a', item: 0, ticked: true }, { by: OWNER, at: T(2) });
      expect(tick.ok === false && tick.reason).toBe('There is nothing to tick here.');
    } finally {
      unregisterOutputKind('link');
    }
    const orphan = WorkflowContent.parse({ name: 'x', elements: [{ id: 'a', name: 'A', instructions: 'x', produces: 'link' }] });
    expect(validateContent(orphan)).toEqual(['"A" produces a kind of output this version does not know: link.']);
  });

  it('hold a checklist to its limits, and say what is wrong item by item', () => {
    const kind = outputKind('checklist')!;
    expect(kind.check(list)).toEqual({ ok: true, value: list });
    const bad = (value: unknown): string => {
      const result = kind.check(value);
      return result.ok ? 'accepted' : result.problems.join(' ');
    };
    expect(bad({ items: [] })).toContain(`The checklist needs 1 to ${CHECKLIST_MAX_ITEMS} items.`);
    expect(bad('a list')).toBe('This is not a checklist.');
    expect(bad({ items: [{ text: 'fine' }, { text: '' }] })).toContain('Item 2 (text)');
    expect(bad({ items: [{ text: 'x'.repeat(301) }] })).toContain('Item 1 (text)');
    expect(bad({ items: Array.from({ length: CHECKLIST_MAX_ITEMS + 1 }, () => ({ text: 'x' })) })).toContain('1 to 100 items');
    // An item is one line of plain text: nothing that a terminal or a reader would take for something else.
    for (const text of ['two\nlines', 'esc\u001b[2J', 'flip‮']) expect(bad({ items: [{ text }] }), JSON.stringify(text)).toContain('Item 1 (text)');
    expect(Checklist.parse({ items: [{ text: '  trimmed  ', extra: 'dropped' }] })).toEqual({ items: [{ text: 'trimmed' }] });
  });
});

describe('a step that produces a checklist', () => {
  it('is told what it produces and in what format, and cannot be done without one', () => {
    const run = start();
    const text = renderRun(version, run);
    expect(text).toContain('This step produces a checklist.');
    expect(text).toContain('aubergine workflow done --output <file>');
    const without = stepRun(version, run, { type: 'done', elementId: 'collect', note: 'here you go' }, { by: AGENT, at: T(1) });
    expect(without.ok).toBe(false);
    if (!without.ok) {
      expect(without.reason).toContain('"Collect my to-dos" produces a checklist, and none was handed in.');
      expect(without.reason).toContain('{"items": [{"text": "one line"');
    }
    const wrong = stepRun(version, run, { type: 'done', elementId: 'collect', output: { items: [{ text: '' }] } }, { by: AGENT, at: T(1) });
    expect(wrong.ok === false && wrong.reason).toContain('is not right. Item 1 (text)');
  });

  it('keeps the checklist with the run, lets the owner tick items, and tells the next step which', () => {
    let run = step(start(), { type: 'done', elementId: 'collect', note: 'Three requests.', output: list });
    expect(run.elements[0]).toMatchObject({ state: 'done', note: 'Three requests.', output: list, ticks: [] });
    expect(run.currentElementId).toBe('do');

    const told = renderRun(version, run);
    expect(told).toContain('From "Collect my to-dos", the step before:\nThree requests.\n[ ] 1. Review the retry change\n[ ] 2. Answer about the release date\n      Asked twice.\n      Second time on Tuesday.\n[ ] 3. Book the room\nThe owner has ticked none of these yet.');

    const tick = (item: number, ticked: boolean, at: string): void => {
      const result = tickRun(version, run, { elementId: 'collect', item, ticked }, { by: OWNER, at });
      if (!result.ok) throw new Error(result.reason);
      run = result.run;
    };
    tick(2, true, T(3));
    tick(0, true, T(4));
    tick(0, true, T(5));
    expect(run.elements[0]?.ticks).toEqual([
      { item: 0, by: OWNER, at: T(5) },
      { item: 2, by: OWNER, at: T(3) },
    ]);
    // A tick does not move the run.
    expect(run).toMatchObject({ status: 'running', currentElementId: 'do', updatedAt: T(1) });
    expect(renderRun(version, run)).toContain('[x] 1. Review the retry change\n[ ] 2. Answer about the release date');
    expect(renderRun(version, run)).toContain('[x] 3. Book the room\nThe owner ticked 2 of 3: the ones marked [x].');
    tick(0, false, T(6));
    expect(run.elements[0]?.ticks.map((t) => t.item)).toEqual([2]);

    // What cannot be ticked is refused in words.
    const refuse = (elementId: string, item: number): string => {
      const result = tickRun(version, run, { elementId, item, ticked: true }, { by: OWNER, at: T(7) });
      return result.ok ? 'ticked' : result.reason;
    };
    expect(refuse('collect', 3)).toBe('There are 3 items; 4 is not one of them.');
    expect(refuse('do', 0)).toBe('Only what a finished step produced can be ticked.');
    expect(refuse('nope', 0)).toBe('This run has no step "nope".');

    // It still works when the run is over, and without the workflow (an archived run): the output says what it is.
    const over = step(run, { type: 'done', elementId: 'do' });
    expect(over.status).toBe('finished');
    const later = tickRun(null, over, { elementId: 'collect', item: 1, ticked: true }, { by: OWNER, at: T(9) });
    expect(later.ok && later.run.elements[0]?.ticks.map((t) => t.item)).toEqual([1, 2]);
  });

  it('starts from a clean list when the step is done again', () => {
    let run = step(start(), { type: 'done', elementId: 'collect', output: list });
    const ticked = tickRun(version, run, { elementId: 'collect', item: 0, ticked: true }, { by: OWNER, at: T(2) });
    if (!ticked.ok) throw new Error(ticked.reason);
    run = step(ticked.run, { type: 'goto', elementId: 'collect' }, OWNER);
    run = step(run, { type: 'done', elementId: 'collect', output: { items: [{ text: 'Only this now' }] } });
    expect(run.elements[0]).toMatchObject({ output: { items: [{ text: 'Only this now' }] }, ticks: [] });
  });

  it('a note step takes no output, and behaves as it always did', () => {
    const run = step(start(), { type: 'done', elementId: 'collect', output: list });
    const refused = stepRun(version, run, { type: 'done', elementId: 'do', output: list }, { by: AGENT, at: T(2) });
    expect(refused.ok === false && refused.reason).toBe('"Do the chosen ones" produces a note only: hand it in with --note.');
    const done = step(run, { type: 'done', elementId: 'do', note: 'did them' });
    expect(done.elements[1]).toMatchObject({ note: 'did them', output: null, ticks: [] });
  });
});

describe('needs', () => {
  it('are told to whoever does the step, with what to do when one is missing', () => {
    expect(renderRun(version, start())).toContain('This step needs: an MCP server: team chat (read access is enough). If you do not have one of these, report blocked and say which.');
    expect(previewRun(version, {}, 'do')).toContain('This step needs: the command git; an MCP server: Team Chat.');
    expect(needWords({ kind: 'access', name: 'the staging database' })).toBe('access to the staging database');
    expect(needWords({ kind: 'other', name: 'a second monitor' })).toBe('a second monitor');
  });

  it('of a workflow are those of its steps, each once', () => {
    expect(needsOf(version.elements).map(needWords)).toEqual(['an MCP server: team chat (read access is enough)', 'the command git']);
    expect(needsOf([])).toEqual([]);
  });

  it('are short and plain: a kind from the list, a one-line name, at most twenty', () => {
    const element = (needs: unknown): boolean => Element.safeParse({ id: 'a', name: 'A', instructions: 'x', needs }).success;
    expect(element([{ kind: 'mcp', name: 'chat' }])).toBe(true);
    expect(element([{ kind: 'plugin', name: 'chat' }])).toBe(false);
    expect(element([{ kind: 'mcp', name: 'two\nlines' }])).toBe(false);
    expect(element([{ kind: 'mcp', name: 'x', note: 'a\u001b[31mred' }])).toBe(false);
    expect(element(Array.from({ length: 21 }, (_, n) => ({ kind: 'other', name: `n${n}` })))).toBe(false);
  });
});

describe('a draft as text for the reviewer', () => {
  const proposal = { workflow: null, element: collect };
  const draft = (more: Partial<Draft> = {}): Draft =>
    Draft.parse({ id: ID(5), kind: 'element', status: 'requested', description: 'Give me my to-do list from the team chat.', proposedBy: { kind: 'session', sessionId: ID(1) }, sessionId: ID(1), createdAt: T(0), updatedAt: T(0), ...more });

  it('is what an agent would be told, made by the function that tells agents', () => {
    const text = reviewText(proposal);
    expect(text).toContain('Workflow: Collect my to-dos');
    expect(text).toContain('Step 1 of 1: Collect my to-dos');
    expect(text).toContain('Read my unread messages in the team chat');
    expect(text).toContain('This step needs: an MCP server: team chat');
    expect(text).toContain('This step produces a checklist.');
    // A workflow: every element, in order, each as it would be told.
    const whole = reviewText({ workflow: version, element: null });
    expect(whole.split('────────────────────────────────────────')).toHaveLength(2);
    expect(whole).toContain('Step 2 of 2: Do the chosen ones');
    expect(reviewText({ workflow: null, element: null })).toBe('');
    expect(needsOfProposal(proposal).map((n) => n.name)).toEqual(['team chat']);
  });

  it('shows what changed between two versions, line by line', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
    expect(lineDiff('same', 'same').every((line) => line.kind === 'same')).toBe(true);
    const shorter = { ...collect, instructions: 'List what people asked me to do in the team chat.' };
    const changes = lineDiff(reviewText(proposal), reviewText({ workflow: null, element: shorter })).filter((line) => line.kind !== 'same');
    expect(changes).toEqual([
      { kind: 'removed', text: 'Read my unread messages in the team chat and list everything someone asked me to do.' },
      { kind: 'added', text: 'List what people asked me to do in the team chat.' },
    ]);
  });

  it('must be shown whole before it is accepted, when it is longer than the view', () => {
    expect(needsShowAll('short')).toBe(false);
    expect(needsShowAll(Array(REVIEW_LINES_SHOWN).fill('x').join('\n'))).toBe(false);
    expect(needsShowAll(Array(REVIEW_LINES_SHOWN + 1).fill('x').join('\n'))).toBe(true);
  });

  it('the brief gives the description, the format with an example, the limits and how to hand in', () => {
    const brief = renderBrief(draft(), LIMITS);
    expect(brief).toContain('You have been asked to write a step for Aubergine.');
    expect(brief).toContain('Give me my to-do list from the team chat.');
    expect(brief).toContain('"produces": "checklist"');
    expect(brief).toContain('at most 20000 characters');
    expect(brief).toContain('kind (mcp, command, access or other)');
    expect(brief).toContain('aubergine element propose --file <file>');
    expect(brief).not.toContain('sent back');

    const workflow = renderBrief(draft({ kind: 'workflow' }), LIMITS);
    expect(workflow).toContain('aubergine workflow propose --file <file>');
    expect(workflow).toContain('A workflow has 1 to 50 steps.');
  });

  it('after a draft is sent back, the brief has the comment and the last version', () => {
    const brief = renderBrief(draft({ status: 'returned', element: collect, comment: 'Shorter, and also include email.' }), LIMITS);
    expect(brief).toContain('Your last version was read and sent back with this comment:\n\nShorter, and also include email.');
    expect(brief).toContain('"name": "Collect my to-dos"');
    expect(brief).toContain('Change it as the comment asks and hand it in again.');
  });
});
