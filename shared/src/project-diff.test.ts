import { describe, expect, it } from 'vitest';
import { ProjectComparison, countLine, diffProject, differenceLine, renderComparison, unifiedDifference, type ProjectDifference } from './project-diff';
import { readProjectFile, type ProjectFile } from './project-file';
import { showControl } from './text';

/**
 * A project file compared with a project: the one function that decides.
 * Both sides are values of the file's own shape, made here from made-up
 * files read by the one reader.
 */

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- a made-up file is changed field by field

const step = (name: string, instructions: string): Loose => ({ name, instructions });
const workflow = (name: string, steps: Loose[], more: Loose = {}): Loose => ({ aubergine: 'workflow', format: 1, workflow: { name, description: '', elements: steps, ...more } });

/** A made-up project with one of everything a file holds, as plain data a test changes before it is read. */
const full = (): Loose => ({
  aubergine: 'project',
  format: 1,
  name: 'Garden site',
  color: 'green',
  labels: { team: 'beds' },
  places: [
    { name: 'main', hint: 'garden', default: true },
    { name: 'docs', hint: 'docs', default: false },
  ],
  canvases: [
    {
      ref: 'c1',
      name: 'Build',
      color: 'purple',
      labels: {},
      frames: [{ x: 10, y: 10, width: 900, height: 500, label: 'Agents', color: 'none' }],
      nodes: [
        { x: 40, y: 40, width: 700, height: 420, color: 'blue', terminal: { ref: 't1', name: 'builder', tags: ['agent'], note: 'Keep the tests green.', place: 'main', subfolder: '', agent: 'claude-code', environment: null } },
        { x: 800, y: 40, width: 700, height: 420, color: 'none', terminal: { ref: 't2', name: 'shell', tags: [], note: '', place: 'docs', subfolder: 'guide', agent: null, environment: null } },
      ],
    },
    { ref: 'c2', name: 'Notes', color: 'none', labels: {}, frames: [], nodes: [{ x: 0, y: 0, width: 640, height: 400, color: 'none', terminal: { ref: 't3', name: 'writer', tags: [], note: '', place: null, subfolder: '', agent: null, environment: null } }] },
  ],
  workflows: [{ ref: 'w1', shared: false, file: workflow('Build and look', [step('Build', 'Build {{task}}.'), { name: 'Look', kind: 'approval', ask: 'Fine?' }]) }],
  elements: [{ ref: 'e1', shared: true, element: { id: 'morning-list', name: 'Morning list', instructions: 'Gather: {{task}}\nOne line each.', produces: 'checklist' } }],
  rules: [
    { event: 'task.done', action: { kind: 'notify' } },
    { event: 'task.failed', action: { kind: 'run-element', element: 'e1', on: { terminal: 't1' } } },
  ],
  schedules: [
    { name: 'Every morning', time: '08:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'], what: { element: 'e1' }, where: { terminal: 't1' }, task: 'what is open' },
    { name: 'Weekly build', time: '09:00', days: ['mon'], what: { workflow: 'w1' }, where: { canvas: 'c1' }, task: 'the weekly build' },
  ],
});

const read = (raw: Loose): ProjectFile => {
  const result = readProjectFile(JSON.stringify(raw));
  if (!result.ok) throw new Error(result.problem);
  return result.file;
};
/** The made-up project with one thing changed. */
const changed = (change: (raw: Loose) => void): ProjectFile => {
  const raw = full();
  change(raw);
  return read(raw);
};
const lines = (file: ProjectFile, here: ProjectFile): string[] => diffProject(file, here).differences.map((difference) => `${difference.group}${difference.canvas === null ? '' : `@${difference.canvas}`}| ${differenceLine(difference)}`);
/** The same change seen from both sides: put into the file, and put into the project. */
const one = (change: (raw: Loose) => void): { file: string[]; here: string[] } => ({ file: lines(changed(change), read(full())), here: lines(read(full()), changed(change)) });

describe('a file and a project that agree', () => {
  it('have no difference, say so, and still say what a file does not hold', () => {
    const comparison = diffProject(read(full()), read(full()));
    expect(comparison).toMatchObject({ matches: true, differences: [], counts: { onlyInFile: 0, onlyHere: 0, differ: 0, cannotTell: 0 }, summaries: true });
    expect(ProjectComparison.safeParse(comparison).success).toBe(true);
    const words = renderComparison(comparison);
    expect(words.split('\n')[0]).toBe('The project matches the file.');
    expect(words.split('\n').at(-1)).toMatch(/^A file does not hold what ran .*none of that was compared\.$/);
  });

  it('whatever references the two files use, in whatever order their keys, tags and days stand', () => {
    const other = changed((raw) => {
      // Another writer: other references for everything, tags and days in another order, keys in another order.
      const renamed = JSON.parse(JSON.stringify(raw).replaceAll('"t1"', '"t91"').replaceAll('"e1"', '"e77"').replaceAll('"c1"', '"c40"').replaceAll('"w1"', '"w5"')) as Loose;
      for (const key of Object.keys(raw)) delete raw[key];
      for (const key of Object.keys(renamed).reverse()) raw[key] = renamed[key];
      raw.canvases[0].nodes[0].terminal.tags = ['agent'];
      raw.schedules[0].days = ['fri', 'thu', 'wed', 'tue', 'mon'];
      // What is the file's own and not the project's: its description, what it left out, a place's hint.
      raw.description = 'Written somewhere else.';
      raw.leftOut = ['1 parked terminal is on no canvas and not in the file.'];
      raw.places[0].hint = 'another-folder-name';
      // Where a step came from, and which one it is inside its workflow, is not compared.
      raw.elements[0].element.id = 'another-id';
      raw.elements[0].element.origin = { kind: 'import' };
    });
    expect(lines(other, read(full()))).toEqual([]);
  });

  it('an empty project and a file with one empty canvas', () => {
    const empty = (): ProjectFile => read({ aubergine: 'project', format: 1, name: 'Empty', canvases: [{ ref: 'c1', name: 'Main' }] });
    expect(diffProject(empty(), empty()).matches).toBe(true);
    // The full file against the empty project, and the other way round: everything is on one side.
    const all = diffProject(read(full()), empty());
    expect(all.differences.filter((d) => d.kind !== 'only-in-file').map(differenceLine)).toEqual(['differs: “Empty”: name (Garden site in the file, Empty here); color (green in the file, none here); labels', 'only here: “Main”']);
    expect(all.counts).toEqual({ onlyInFile: 2 + 2 + 2 + 2 + 1 + 1, onlyHere: 1, differ: 1, cannotTell: 0 });
    // Terminals and frames of a canvas that is on one side only are not listed one by one: the canvas is.
    expect(all.differences.some((d) => d.group === 'terminals' || d.group === 'frames')).toBe(false);
    const none = diffProject(empty(), read(full()));
    expect(none.counts).toEqual({ onlyInFile: 1, onlyHere: 10, differ: 1, cannotTell: 0 });
  });
});

describe('one thing on one side only', () => {
  it.each([
    ['a place', (raw: Loose) => raw.places.push({ name: 'tools', hint: 'x', default: false }), 'places| only in the file: “tools”'],
    ['a canvas', (raw: Loose) => raw.canvases.push({ ref: 'c9', name: 'Later', nodes: [] }), 'canvases| only in the file: “Later”'],
    ['a terminal', (raw: Loose) => raw.canvases[1].nodes.push({ x: 700, y: 0, width: 640, height: 400, terminal: { ref: 't9', name: 'reader' } }), 'terminals@Notes| only in the file: “reader”'],
    ['a frame', (raw: Loose) => raw.canvases[1].frames.push({ x: 0, y: 0, width: 800, height: 600, label: 'Reading' }), 'frames@Notes| only in the file: “Reading”'],
    ['a rule', (raw: Loose) => raw.rules.push({ event: 'ask.added', action: { kind: 'notify' } }), 'rules| only in the file: when something is asked of you: notify'],
    ['a schedule', (raw: Loose) => raw.schedules.push({ name: 'At noon', time: '12:00', days: ['sat'], what: { element: 'e1' }, where: { canvas: 'c2' } }), 'schedules| only in the file: “At noon”'],
    ['a workflow', (raw: Loose) => raw.workflows.push({ ref: 'w9', file: workflow('Tidy up', [step('Tidy', 'Tidy.')]) }), 'workflows| only in the file: “Tidy up”'],
    ['a saved step', (raw: Loose) => raw.elements.push({ ref: 'e9', element: { id: 'sweep', name: 'Sweep', instructions: 'Sweep.' } }), 'steps| only in the file: “Sweep”'],
  ])('%s', (_what, change, line) => {
    const seen = one(change);
    expect(seen.file).toEqual([line]);
    expect(seen.here).toEqual([line.replace('only in the file', 'only here')]);
  });
});

describe('one field that differs', () => {
  it.each([
    ['the name of the project', (raw: Loose) => (raw.name = 'Orchard'), 'project| differs: “Garden site”: name (Orchard in the file, Garden site here)'],
    ['its color', (raw: Loose) => (raw.color = 'red'), 'project| differs: “Garden site”: color (red in the file, green here)'],
    ['its labels', (raw: Loose) => (raw.labels = { team: 'trees' }), 'project| differs: “Garden site”: labels'],
    ['the order of its canvases', (raw: Loose) => raw.canvases.reverse(), 'project| differs: “Garden site”: the order of the canvases'],
    ["a canvas's color", (raw: Loose) => (raw.canvases[0].color = 'teal'), 'canvases| differs: “Build”: color (teal in the file, purple here)'],
    ["a canvas's labels", (raw: Loose) => (raw.canvases[0].labels = { stage: 'two' }), 'canvases| differs: “Build”: labels'],
    ["a terminal's color", (raw: Loose) => (raw.canvases[0].nodes[0].color = 'red'), 'terminals@Build| differs: “builder”: color (red in the file, blue here)'],
    ['its tags', (raw: Loose) => (raw.canvases[0].nodes[0].terminal.tags = ['agent', 'slow']), 'terminals@Build| differs: “builder”: tags (agent, slow in the file, agent here)'],
    ['its summary', (raw: Loose) => (raw.canvases[0].nodes[0].terminal.note = 'Keep the tests red.'), 'terminals@Build| differs: “builder”: summary'],
    ['the place it starts in', (raw: Loose) => (raw.canvases[0].nodes[1].terminal.place = 'main'), 'terminals@Build| differs: “shell”: starts in (main/guide in the file, docs/guide here)'],
    ['the folder below its place', (raw: Loose) => (raw.canvases[0].nodes[1].terminal.subfolder = 'guide/part two'), 'terminals@Build| differs: “shell”: starts in (docs/guide/part two in the file, docs/guide here)'],
    ['having no place', (raw: Loose) => (raw.canvases[0].nodes[1].terminal = { ...raw.canvases[0].nodes[1].terminal, place: null, subfolder: '' }), 'terminals@Build| differs: “shell”: starts in (no place in the file, docs/guide here)'],
    ['the agent it was meant for', (raw: Loose) => (raw.canvases[0].nodes[0].terminal.agent = null), 'terminals@Build| differs: “builder”: agent (none in the file, claude-code here)'],
    ['what it works in', (raw: Loose) => (raw.canvases[0].nodes[0].terminal.environment = 'working-copy'), 'terminals@Build| differs: “builder”: works in (working-copy in the file, its folder here)'],
    ['where it stands', (raw: Loose) => (raw.canvases[0].nodes[0].x = 400), 'terminals@Build| differs: “builder”: moved'],
    ['its size', (raw: Loose) => (raw.canvases[0].nodes[0].height = 600), 'terminals@Build| differs: “builder”: resized'],
    ["a frame's color", (raw: Loose) => (raw.canvases[0].frames[0].color = 'red'), 'frames@Build| differs: “Agents”: color (red in the file, none here)'],
    ['where a frame stands and its size', (raw: Loose) => ((raw.canvases[0].frames[0].y = 300), (raw.canvases[0].frames[0].width = 1200)), 'frames@Build| differs: “Agents”: moved; resized'],
    ["a schedule's time", (raw: Loose) => (raw.schedules[0].time = '07:15'), 'schedules| differs: “Every morning”: time (07:15 in the file, 08:30 here)'],
    ['its days', (raw: Loose) => (raw.schedules[0].days = ['mon', 'wed']), 'schedules| differs: “Every morning”: days (mon, wed in the file, mon, tue, wed, thu, fri here)'],
    ['what it runs', (raw: Loose) => (raw.schedules[0].what = { workflow: 'w1' }), 'schedules| differs: “Every morning”: runs (the workflow “Build and look” in the file, the step “Morning list” here)'],
    ['where it runs', (raw: Loose) => (raw.schedules[0].where = { canvas: 'c2' }), 'schedules| differs: “Every morning”: where (on a new terminal on “Notes” in the file, on the terminal “builder” on “Build” here)'],
    ['its task', (raw: Loose) => (raw.schedules[0].task = 'what is closed'), 'schedules| differs: “Every morning”: task'],
    ["a workflow's steps", (raw: Loose) => (raw.workflows[0].file.workflow.elements[0].instructions = 'Build {{task}} twice.'), 'workflows| differs: “Build and look”: steps'],
    ['its description', (raw: Loose) => (raw.workflows[0].file.workflow.description = 'For the garden.'), 'workflows| differs: “Build and look”: description'],
    ['whether it is shared', (raw: Loose) => (raw.workflows[0].shared = true), 'workflows| differs: “Build and look”: shared with every project (yes in the file, no here)'],
    ["a saved step's instructions", (raw: Loose) => (raw.elements[0].element.instructions = 'Gather: {{task}}\nTwo lines each.'), 'steps| differs: “Morning list”: instructions'],
    ['what it hands over', (raw: Loose) => (raw.elements[0].element.produces = 'note'), 'steps| differs: “Morning list”: what it hands over'],
  ])('%s', (_what, change, line) => {
    expect(lines(changed(change), read(full()))).toEqual([line]);
  });

  it('which place new terminals start in is said of both places', () => {
    expect(lines(changed((raw) => ((raw.places[0].default = false), (raw.places[1].default = true))), read(full()))).toEqual(['places| differs: “main”: where new terminals start (another in the file, this place here)', 'places| differs: “docs”: where new terminals start (this place in the file, another here)']);
  });

  it('a rule never differs: one that says something else is one only in the file and one only here', () => {
    const seen = one((raw) => (raw.rules[1].action.on = { canvas: 'c2' }));
    expect(seen.file).toEqual(['rules| only in the file: when a task failed: run the step “Morning list” on a new terminal on “Notes”', 'rules| only here: when a task failed: run the step “Morning list” on the terminal “builder” on “Build”']);
    // The same rule twice on one side is one more on that side.
    expect(one((raw) => raw.rules.push(raw.rules[0])).file).toEqual(['rules| only in the file: when a task is done: notify']);
  });

  it('a thing that was renamed is one only in the file and one only here, and what names it changes with it', () => {
    const seen = one((raw) => (raw.canvases[1].nodes[0].terminal.name = 'author'));
    expect(seen.file).toEqual(['terminals@Notes| only in the file: “author”', 'terminals@Notes| only here: “writer”']);
    // A canvas renamed: the canvas, and the schedule that makes a terminal on it.
    expect(one((raw) => (raw.canvases[0].name = 'Make')).file).toEqual([
      'canvases| only in the file: “Make”',
      'canvases| only here: “Build”',
      'rules| only in the file: when a task failed: run the step “Morning list” on the terminal “builder” on “Make”',
      'rules| only here: when a task failed: run the step “Morning list” on the terminal “builder” on “Build”',
      'schedules| differs: “Every morning”: where (on the terminal “builder” on “Make” in the file, on the terminal “builder” on “Build” here)',
      'schedules| differs: “Weekly build”: where (on a new terminal on “Make” in the file, on a new terminal on “Build” here)',
    ]);
  });

  it('a terminal or a frame within the tolerance has not moved', () => {
    expect(lines(changed((raw) => ((raw.canvases[0].nodes[0].x = 40.6), (raw.canvases[0].nodes[0].width = 699.2), (raw.canvases[0].frames[0].y = 11))), read(full()))).toEqual([]);
    expect(lines(changed((raw) => (raw.canvases[0].nodes[0].x = 41.5)), read(full()))).toEqual(['terminals@Build| differs: “builder”: moved']);
  });

  it('gives the texts that differ in full, and a unified difference of them on request', () => {
    const comparison = diffProject(changed((raw) => ((raw.elements[0].element.instructions = 'Gather: {{task}}\nTwo lines each.'), (raw.schedules[0].task = 'what is closed'))), read(full()));
    expect(comparison.differences.flatMap((d) => d.texts.map((t) => t.title))).toEqual(['The task of the schedule “Every morning”', 'What an agent is told by the step “Morning list”']);
    const words = renderComparison(comparison, { text: true });
    expect(words).toContain('    --- here\n    +++ in the file');
    expect(words).toContain('    -what is open\n    +what is closed');
    expect(words).toContain('    -One line each.\n    +Two lines each.');
    expect(renderComparison(comparison)).toContain('To see how the texts differ, line by line: --text');
    expect(renderComparison(comparison)).not.toContain('+what is closed');
  });
});

describe('two things of one name', () => {
  const twin = (raw: Loose): void => void raw.canvases[0].nodes.push({ x: 1600, y: 40, width: 700, height: 420, color: 'none', terminal: { ref: 't8', name: 'shell', tags: [], note: '', place: 'docs', subfolder: 'guide', agent: null, environment: null } });

  it('on both sides and the very same on both: nothing to say, in whatever order they stand', () => {
    const file = changed((raw) => (twin(raw), raw.canvases[0].nodes.reverse()));
    expect(lines(file, changed(twin))).toEqual([]);
  });

  it('cannot be told apart when they are not the same on both sides: it says so, compares the rest, and guesses nothing from the order', () => {
    const file = changed((raw) => (twin(raw), (raw.canvases[0].nodes[2].color = 'red'), (raw.canvases[0].nodes[0].color = 'teal')));
    const comparison = diffProject(file, changed(twin));
    expect(comparison.differences.map(differenceLine)).toEqual(['cannot be told apart: 2 terminals named “shell” on the canvas “Build” in the file, 2 here', 'differs: “builder”: color (teal in the file, blue here)']);
    expect(comparison.counts).toEqual({ onlyInFile: 0, onlyHere: 0, differ: 1, cannotTell: 1 });
    expect(comparison.matches).toBe(false);
    expect(countLine(comparison)).toBe('1 differs, 1 cannot be told apart.');
    // Two on one side and one on the other: which of the two is the other's is not known.
    expect(lines(changed(twin), read(full()))).toEqual(['terminals@Build| cannot be told apart: 2 terminals named “shell” on the canvas “Build” in the file, 1 here']);
    // Two on one side and none on the other is certain.
    expect(lines(changed((raw) => (twin(raw), (raw.canvases[0].nodes[1].terminal.name = 'spare'), (raw.canvases[0].nodes[2].terminal.name = 'spare'))), read(full()))).toEqual(['terminals@Build| only in the file: “spare” (2 of them)', 'terminals@Build| only here: “shell”']);
  });

  it('frames with no label, canvases, schedules and steps alike; nothing on such a canvas is compared', () => {
    const frames = (raw: Loose): void => void raw.canvases[1].frames.push({ x: 0, y: 0, width: 500, height: 500, label: '' }, { x: 600, y: 0, width: 500, height: 500, label: '' });
    expect(lines(changed(frames), changed(frames))).toEqual([]);
    expect(lines(changed((raw) => (frames(raw), (raw.canvases[1].frames[1].x = 900))), changed(frames))).toEqual(['frames@Notes| cannot be told apart: 2 frames with no label on the canvas “Notes” in the file, 2 here']);
    const canvases = (raw: Loose): void => void raw.canvases.push({ ref: 'c7', name: 'Notes', nodes: [{ x: 0, y: 0, width: 640, height: 400, terminal: { ref: 't7', name: 'second' } }] });
    const comparison = diffProject(changed((raw) => (canvases(raw), (raw.canvases[2].nodes[0].terminal.tags = ['x']))), changed(canvases));
    expect(comparison.differences.map(differenceLine)).toEqual(['cannot be told apart: 2 canvases named “Notes” in the file, 2 here']);
    expect(comparison.says).toContain('Nothing on a canvas that could not be told apart was compared.');
    const schedules = (raw: Loose): void => void raw.schedules.push({ ...raw.schedules[0] });
    expect(lines(changed((raw) => (schedules(raw), (raw.schedules[2].time = '10:00'))), changed(schedules))).toEqual(['schedules| cannot be told apart: 2 schedules named “Every morning” in the file, 2 here']);
    const steps = (raw: Loose): void => void raw.elements.push({ ref: 'e8', element: { id: 'again', name: 'Morning list', instructions: 'Another.' } });
    expect(lines(changed(steps), read(full()))).toEqual(['steps| cannot be told apart: 2 saved steps named “Morning list” in the file, 1 here']);
  });
});

describe('a template', () => {
  it('without summaries is compared without them, and says so; one that kept them is compared with them', () => {
    const bare = changed((raw) => ((raw.template = true), raw.canvases.forEach((canvas: Loose) => canvas.nodes.forEach((node: Loose) => (node.terminal.note = '')))));
    const comparison = diffProject(bare, read(full()));
    expect(comparison).toMatchObject({ matches: true, summaries: false });
    expect(renderComparison(comparison)).toContain('The file is a template without summaries: summaries were not compared.');
    const kept = changed((raw) => ((raw.template = true), (raw.canvases[0].nodes[0].terminal.note = 'Another summary.')));
    expect(diffProject(kept, read(full())).differences.map(differenceLine)).toEqual(['differs: “builder”: summary']);
  });
});

describe('what a file wrote', () => {
  it('is shown, never acted on: control characters and characters that reverse the direction of text', () => {
    const hostile = 'Build\u001b[2J‮evil\u0007';
    const comparison = diffProject(changed((raw) => ((raw.canvases[0].name = hostile), (raw.canvases[0].nodes[0].terminal.tags = ['a‮b']), (raw.canvases[0].labels = {}))), changed((raw) => ((raw.canvases[0].name = hostile), (raw.canvases[0].color = 'red'))));
    const words = renderComparison(comparison, { text: true });
    expect(words).toContain('differs: “Build␛[2J<U+202E>evil␇”: color (purple in the file, red here)');
    expect(words).toContain('Terminals on “Build␛[2J<U+202E>evil␇”');
    expect(words).toContain('tags (a<U+202E>b in the file, agent here)');
    expect(showControl(words)).toBe(words);
    // A text that differs is shown the same way, and a name cannot begin a line of its own.
    const text = renderComparison(diffProject(changed((raw) => (raw.elements[0].element.instructions = 'open\u001b]0;title\u0007')), read(full())), { text: true });
    expect(text).toContain('open␛]0;title␇');
    expect(text).toMatch(/^ {4}\+.*open␛/m);
    expect(showControl(text)).toBe(text);
    const line: ProjectDifference = { group: 'canvases', kind: 'only-here', name: 'one\nonly in the file: “two”', canvas: null, count: 1, inFile: 0, here: 1, what: [], texts: [] };
    expect(differenceLine(line)).toBe('only here: “one␤only in the file: “two””');
  });
});

describe('a unified difference', () => {
  it('has what is only here with -, what is only in the file with +, and three lines around', () => {
    const here = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].join('\n');
    expect(unifiedDifference(here, here.replace('six', 'SIX')).split('\n')).toEqual(['--- here', '+++ in the file', '@@ -3,7 +3,7 @@', ' three', ' four', ' five', '-six', '+SIX', ' seven', ' eight', ' nine']);
    expect(unifiedDifference('same', 'same').split('\n')).toEqual(['--- here', '+++ in the file']);
  });
});
