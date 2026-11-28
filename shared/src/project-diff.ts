import { z } from 'zod';
import { lineDiff, reviewText } from './drafts';
import type { FileCanvas, FileRule, FileSchedule, FileTerminal, ProjectFile } from './project-file';
import { RULE_EVENT_WORDS } from './tasks';
import { showControl } from './text';
import { importWorkflow, type Element } from './workflows';

/**
 * A project file compared with a project.
 *
 * One function decides, and it compares two values of the file's own shape:
 * the file as `readProjectFile` gave it, and the project as the same code
 * that writes a file out would write it now. So what is in a file is said
 * in one place, and a thing a file does not carry cannot show as a
 * difference.
 *
 * Things are matched by name, never by an ID and never by their order: a
 * canvas by its name, a terminal by its name on its canvas, a frame by its
 * label on its canvas, a schedule, a workflow and a saved step by their
 * names. A rule has no name in a file: it is the whole of what it says, so
 * a rule is on both sides or on one, and never "differs". Where a name is
 * on a side more than once and the things of that name are not the same on
 * both sides, the function says that they cannot be told apart; it does not
 * guess.
 *
 * It reads and answers. It changes nothing, and nothing here applies a file
 * to a project.
 */

export const DIFFERENCE_GROUPS = ['project', 'places', 'canvases', 'terminals', 'frames', 'rules', 'schedules', 'workflows', 'steps'] as const;
export const DifferenceGroup = z.enum(DIFFERENCE_GROUPS);
export type DifferenceGroup = z.infer<typeof DifferenceGroup>;
export const DifferenceKind = z.enum(['only-in-file', 'only-here', 'differs', 'cannot-tell']);
export type DifferenceKind = z.infer<typeof DifferenceKind>;

/** How far a terminal or a frame may stand from where the file has it, in each direction, and still count as in its place. */
export const LAYOUT_TOLERANCE = 1;

export const DifferentField = z.object({
  field: z.string().describe('What differs, in a word or two: `color`, `tags`, `summary`, `starts in`, `moved`, `resized`, `time`, `days`, `instructions`.'),
  file: z.string().nullable().describe('What the file has, where that is short enough to say in a line. Null for a text and for layout.'),
  here: z.string().nullable().describe('What the project has. Null for a text and for layout.'),
});
export type DifferentField = z.infer<typeof DifferentField>;

export const DifferentText = z.object({
  title: z.string().describe('Which text: the summary of a terminal, the task of a schedule, what an agent is told by a step or a workflow.'),
  file: z.string().describe('The text in the file.'),
  here: z.string().describe('The text in the project.'),
});
export type DifferentText = z.infer<typeof DifferentText>;

export const ProjectDifference = z.object({
  group: DifferenceGroup.describe('What kind of thing it is about.'),
  kind: DifferenceKind.describe('`only-in-file`: the file has it and the project does not. `only-here`: the project has it and the file does not. `differs`: both have it, differently. `cannot-tell`: a name is on a side more than once and the things of that name are not the same on both sides, so they were not matched.'),
  name: z.string().describe('The name of the thing: a canvas by its name, a terminal by its name, a frame by its label, a place, a schedule, a workflow, a saved step. A rule has no name: it is said in words. For the project itself, its name here.'),
  canvas: z.string().nullable().describe('For a terminal and a frame: the name of its canvas. Null otherwise.'),
  count: z.number().int().min(1).describe('How many things the line is about. 1, except for several rules that say the same.'),
  inFile: z.number().int().min(0).describe('How many things of that name the file has.'),
  here: z.number().int().min(0).describe('How many things of that name the project has.'),
  what: z.array(DifferentField).describe('For `differs`: each thing that differs.'),
  texts: z.array(DifferentText).describe('For `differs`: the texts that differ, in full on both sides.'),
});
export type ProjectDifference = z.infer<typeof ProjectDifference>;

export const ProjectComparison = z.object({
  matches: z.boolean().describe('True when nothing that was compared differs.'),
  counts: z.object({
    onlyInFile: z.number().int().describe('Things the file has that the project does not.'),
    onlyHere: z.number().int().describe('Things the project has that the file does not.'),
    differ: z.number().int().describe('Things both have, differently.'),
    cannotTell: z.number().int().describe('Names that could not be matched.'),
  }),
  differences: z.array(ProjectDifference).describe('Every difference, in the order of the groups.'),
  summaries: z.boolean().describe("True when the terminals' summaries were compared. A template written without them does not say what they are, so then they are not."),
  says: z.array(z.string()).describe('How the comparison was made, each in a sentence.'),
  notCompared: z.string().describe('What a file does not hold, and so what this comparison says nothing about, in one sentence.'),
});
export type ProjectComparison = z.infer<typeof ProjectComparison>;

/** The last line of every comparison: so that nobody reads "no difference" as "the same in everything". */
export const NOT_COMPARED =
  'A file does not hold what ran (tasks, runs, logs of notes, messages), fields, links, themes, whether a rule or a schedule is switched on, where a thing came from, the order terminals are drawn in, parked terminals, or any path of this computer: none of that was compared.';

/* ---------- Telling two values apart ---------- */

/** A value as text in which the order of an object's keys does not matter. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const sorted = (list: readonly string[]): string[] => [...list].sort();

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const moved = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) > LAYOUT_TOLERANCE || Math.abs(a.y - b.y) > LAYOUT_TOLERANCE;
const resized = (a: Rect, b: Rect): boolean => Math.abs(a.width - b.width) > LAYOUT_TOLERANCE || Math.abs(a.height - b.height) > LAYOUT_TOLERANCE;

interface Matched<T> {
  pairs: { name: string; file: T; here: T }[];
  onlyInFile: { name: string; things: T[] }[];
  onlyHere: { name: string; things: T[] }[];
  /** A name that is on a side more than once, with things that are not the same on both sides. */
  unclear: { name: string; inFile: number; here: number }[];
}

/**
 * Matches the things of two lists by name. A name that is once on each side is a pair. A name on one side only is
 * that side's. A name that is on a side more than once is looked at as a whole: where both sides have the very same
 * things of that name, in any order, there is nothing to say; otherwise they cannot be told apart, and nothing is
 * guessed from the order they stand in.
 */
function matchByName<T>(file: readonly T[], here: readonly T[], nameOf: (thing: T) => string, whole: (thing: T) => unknown): Matched<T> {
  const names: string[] = [];
  for (const thing of [...file, ...here]) if (!names.includes(nameOf(thing))) names.push(nameOf(thing));
  const matched: Matched<T> = { pairs: [], onlyInFile: [], onlyHere: [], unclear: [] };
  for (const name of names) {
    const inFile = file.filter((thing) => nameOf(thing) === name);
    const inHere = here.filter((thing) => nameOf(thing) === name);
    if (inHere.length === 0) matched.onlyInFile.push({ name, things: inFile });
    else if (inFile.length === 0) matched.onlyHere.push({ name, things: inHere });
    else if (inFile.length === 1 && inHere.length === 1) matched.pairs.push({ name, file: inFile[0] as T, here: inHere[0] as T });
    else if (!same(sorted(inFile.map((thing) => canonical(whole(thing)))), sorted(inHere.map((thing) => canonical(whole(thing)))))) matched.unclear.push({ name, inFile: inFile.length, here: inHere.length });
  }
  return matched;
}

/* ---------- The parts of a file, without what is the file's own ---------- */

/** Where a terminal starts, as a file says it: a place by its name and a folder below it. Never a path of a computer. */
const startsIn = (terminal: Pick<FileTerminal, 'place' | 'subfolder'>): string => (terminal.place === null ? 'no place' : terminal.subfolder === '' ? terminal.place : `${terminal.place}/${terminal.subfolder}`);

type FileNode = FileCanvas['nodes'][number];
type FileFrame = FileCanvas['frames'][number];

/** A node without the reference that only means something inside its file, and with its place rounded: for telling whether two are the very same. */
const wholeNode = (node: FileNode, summaries: boolean): unknown => {
  const { ref: _ref, note, tags, ...terminal } = node.terminal;
  return { x: Math.round(node.x), y: Math.round(node.y), width: Math.round(node.width), height: Math.round(node.height), color: node.color, terminal: { ...terminal, tags: sorted(tags), ...(summaries ? { note } : {}) } };
};
const wholeFrame = (frame: FileFrame): unknown => ({ ...frame, x: Math.round(frame.x), y: Math.round(frame.y), width: Math.round(frame.width), height: Math.round(frame.height) });
const wholeCanvas = (canvas: FileCanvas, summaries: boolean): unknown => ({ name: canvas.name, color: canvas.color, labels: canvas.labels, frames: sorted(canvas.frames.map((frame) => canonical(wholeFrame(frame)))), nodes: sorted(canvas.nodes.map((node) => canonical(wholeNode(node, summaries)))) });

/** A step without what says where it came from and which one it is: its ID inside a workflow, its origin, the mark of a copy. */
const wholeElement = (element: Element): Record<string, unknown> => {
  const { id: _id, origin: _origin, source: _source, ...rest } = element;
  return rest;
};

interface ReadWorkflow {
  name: string;
  shared: boolean;
  /** What is compared: the content without where it came from. */
  whole: Record<string, unknown>;
  /** What an agent would be told, for a difference of texts. */
  text: string;
}
/** A workflow of a file, read by the one reader of workflow files. One that cannot be read is compared as it is written. */
function readWorkflow(entry: ProjectFile['workflows'][number]): ReadWorkflow {
  try {
    const { content, labels } = importWorkflow(entry.file);
    return { name: content.name, shared: entry.shared, whole: { description: content.description, standing: content.standing, inputs: content.inputs, steps: content.elements.map(wholeElement), labels, extra: content.extra }, text: reviewText({ workflow: content, element: null }) };
  } catch {
    const inner = (entry.file as { workflow?: { name?: unknown } }).workflow;
    return { name: typeof inner?.name === 'string' ? inner.name : '(a workflow that cannot be read)', shared: entry.shared, whole: { steps: entry.file }, text: '' };
  }
}

/** The fields of two records that are not the same, by key. */
const keysThatDiffer = (a: Record<string, unknown>, b: Record<string, unknown>): string[] => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !same(a[key], b[key]));

const ELEMENT_WORDS: Record<string, string> = { kind: 'kind', instructions: 'instructions', ask: 'what is asked', lookAt: 'what to look at', doneWhen: 'done when', needs: 'needs', produces: 'what it hands over', extra: 'other fields' };
const WORKFLOW_WORDS: Record<string, string> = { description: 'description', standing: 'standing instructions', inputs: 'inputs', steps: 'steps', labels: 'labels', extra: 'other fields' };

/* ---------- Rules and schedules: what they name, by name ---------- */

interface Names {
  canvas: Map<string, string>;
  terminal: Map<string, { name: string; canvas: string }>;
  element: Map<string, string>;
  workflow: Map<string, string>;
}
function namesOf(file: ProjectFile, workflows: readonly ReadWorkflow[]): Names {
  return {
    canvas: new Map(file.canvases.map((canvas) => [canvas.ref, canvas.name])),
    terminal: new Map(file.canvases.flatMap((canvas) => canvas.nodes.map((node) => [node.terminal.ref, { name: node.terminal.name, canvas: canvas.name }] as const))),
    element: new Map(file.elements.map((entry) => [entry.ref, entry.element.name])),
    workflow: new Map(file.workflows.map((entry, index) => [entry.ref, (workflows[index] as ReadWorkflow).name])),
  };
}
type On = { terminal: string } | { canvas: string };
const onWords = (on: On, names: Names): string => {
  if ('terminal' in on) {
    const terminal = names.terminal.get(on.terminal);
    return terminal ? `on the terminal “${terminal.name}” on “${terminal.canvas}”` : 'on a terminal that is not in the file';
  }
  return `on a new terminal on “${names.canvas.get(on.canvas) ?? '?'}”`;
};
/** A rule in words: all of what a file says of it, with the things it names by their names. */
const ruleWords = (rule: FileRule, names: Names): string => `when ${RULE_EVENT_WORDS[rule.event]}: ${rule.action.kind === 'notify' ? 'notify' : `run the step “${names.element.get(rule.action.element) ?? '?'}” ${onWords(rule.action.on, names)}`}`;
const runsWords = (what: FileSchedule['what'], names: Names): string => ('element' in what ? `the step “${names.element.get(what.element) ?? '?'}”` : `the workflow “${names.workflow.get(what.workflow) ?? '?'}”`);

/* ---------- The one function ---------- */

/**
 * How a project file differs from a project. Both are given in the file's own shape: `file` as it was read, `here` as
 * the project would be written out now by the code that writes files. Pure: it reads its two arguments and nothing else.
 */
export function diffProject(file: ProjectFile, here: ProjectFile): ProjectComparison {
  const differences: ProjectDifference[] = [];
  const says: string[] = [];
  const add = (group: DifferenceGroup, kind: DifferenceKind, name: string, more: Partial<Pick<ProjectDifference, 'canvas' | 'count' | 'inFile' | 'here' | 'what' | 'texts'>> = {}): void => {
    differences.push({ group, kind, name, canvas: null, count: 1, inFile: kind === 'only-here' ? 0 : 1, here: kind === 'only-in-file' ? 0 : 1, what: [], texts: [], ...more });
  };
  const field = (name: string, inFile: string | null = null, inHere: string | null = null): DifferentField => ({ field: name, file: inFile, here: inHere });
  const oneSided = <T>(group: DifferenceGroup, matched: Matched<T>, canvas: string | null = null): void => {
    for (const { name, things } of matched.onlyInFile) add(group, 'only-in-file', name, { canvas, count: things.length, inFile: things.length, here: 0 });
    for (const { name, things } of matched.onlyHere) add(group, 'only-here', name, { canvas, count: things.length, inFile: 0, here: things.length });
    for (const { name, inFile, here: inHere } of matched.unclear) add(group, 'cannot-tell', name, { canvas, inFile, here: inHere });
  };

  // A template is written without its terminals' summaries unless they were kept: one that has none does not say what they are.
  const summaries = !file.template || file.canvases.some((canvas) => canvas.nodes.some((node) => node.terminal.note !== ''));
  says.push('Things are matched by name: a canvas by its name, a terminal by its name on its canvas, a frame by its label, a schedule, a workflow and a saved step by their names. A rule is all of what it says. A thing that was renamed shows as one only in the file and one only here.');
  says.push(`A terminal or a frame counts as moved or resized when it is more than ${LAYOUT_TOLERANCE} away from where the file has it.`);
  says.push(summaries ? 'The project was written out as a file is, with its summaries, and that was compared.' : 'The file is a template without summaries: the project was written out as a file is, and summaries were not compared.');

  /* The project itself. */
  const about: DifferentField[] = [];
  if (file.name !== here.name) about.push(field('name', file.name, here.name));
  if (file.color !== here.color) about.push(field('color', file.color, here.color));
  if (!same(file.labels, here.labels)) about.push(field('labels'));

  /* Places: a name and whether it is where new terminals start. Where a place is on a computer is not in a file. */
  const places = matchByName(file.places, here.places, (place) => place.name, (place) => ({ default: place.default }));
  oneSided('places', places);
  for (const pair of places.pairs) if (pair.file.default !== pair.here.default) add('places', 'differs', pair.name, { what: [field('where new terminals start', pair.file.default ? 'this place' : 'another', pair.here.default ? 'this place' : 'another')] });

  /* Canvases, and on each its terminals and frames. */
  const canvases = matchByName(file.canvases, here.canvases, (canvas) => canvas.name, (canvas) => wholeCanvas(canvas, summaries));
  const paired = new Set(canvases.pairs.map((pair) => pair.name));
  if (!same(file.canvases.filter((c) => paired.has(c.name)).map((c) => c.name), here.canvases.filter((c) => paired.has(c.name)).map((c) => c.name))) about.push(field('the order of the canvases'));
  if (about.length > 0) add('project', 'differs', here.name, { what: about });
  oneSided('canvases', canvases);
  const terminalDifferences: ProjectDifference[] = [];
  const frameDifferences: ProjectDifference[] = [];
  for (const pair of canvases.pairs) {
    const what: DifferentField[] = [];
    if (pair.file.color !== pair.here.color) what.push(field('color', pair.file.color, pair.here.color));
    if (!same(pair.file.labels, pair.here.labels)) what.push(field('labels'));
    if (what.length > 0) add('canvases', 'differs', pair.name, { what });

    const before = differences.length;
    const nodes = matchByName(pair.file.nodes, pair.here.nodes, (node) => node.terminal.name, (node) => wholeNode(node, summaries));
    oneSided('terminals', nodes, pair.name);
    for (const { name, file: inFile, here: inHere } of nodes.pairs) {
      const [a, b] = [inFile.terminal, inHere.terminal];
      const fields: DifferentField[] = [];
      const texts: DifferentText[] = [];
      if (inFile.color !== inHere.color) fields.push(field('color', inFile.color, inHere.color));
      if (!same(sorted(a.tags), sorted(b.tags))) fields.push(field('tags', sorted(a.tags).join(', ') || 'none', sorted(b.tags).join(', ') || 'none'));
      if (summaries && a.note !== b.note) {
        fields.push(field('summary'));
        texts.push({ title: `The summary of the terminal “${name}” on “${pair.name}”`, file: a.note, here: b.note });
      }
      if (startsIn(a) !== startsIn(b)) fields.push(field('starts in', startsIn(a), startsIn(b)));
      if (a.agent !== b.agent) fields.push(field('agent', a.agent ?? 'none', b.agent ?? 'none'));
      if (a.environment !== b.environment) fields.push(field('works in', a.environment ?? 'its folder', b.environment ?? 'its folder'));
      if (moved(inFile, inHere)) fields.push(field('moved'));
      if (resized(inFile, inHere)) fields.push(field('resized'));
      if (fields.length > 0) add('terminals', 'differs', name, { canvas: pair.name, what: fields, texts });
    }
    terminalDifferences.push(...differences.splice(before));

    const frames = matchByName(pair.file.frames, pair.here.frames, (frame) => frame.label, wholeFrame);
    oneSided('frames', frames, pair.name);
    for (const { name, file: inFile, here: inHere } of frames.pairs) {
      const fields: DifferentField[] = [];
      if (inFile.color !== inHere.color) fields.push(field('color', inFile.color, inHere.color));
      if (moved(inFile, inHere)) fields.push(field('moved'));
      if (resized(inFile, inHere)) fields.push(field('resized'));
      if (fields.length > 0) add('frames', 'differs', name, { canvas: pair.name, what: fields });
    }
    frameDifferences.push(...differences.splice(before));
  }
  differences.push(...terminalDifferences, ...frameDifferences);
  if (canvases.unclear.length > 0) says.push('Nothing on a canvas that could not be told apart was compared.');

  /* Workflows and saved steps, read before the rules and schedules that name them. */
  const fileWorkflows = file.workflows.map(readWorkflow);
  const hereWorkflows = here.workflows.map(readWorkflow);
  const [fileNames, hereNames] = [namesOf(file, fileWorkflows), namesOf(here, hereWorkflows)];

  /* Rules: all of what each says. The same rule twice on a side is two. */
  const rules = matchByName(file.rules.map((rule) => ruleWords(rule, fileNames)), here.rules.map((rule) => ruleWords(rule, hereNames)), (words) => words, (words) => words);
  for (const { name, things } of rules.onlyInFile) add('rules', 'only-in-file', name, { count: things.length, inFile: things.length, here: 0 });
  for (const { name, things } of rules.onlyHere) add('rules', 'only-here', name, { count: things.length, inFile: 0, here: things.length });
  // The same words on both sides, more often on one: the rest is that side's.
  for (const name of new Set(file.rules.map((rule) => ruleWords(rule, fileNames)))) {
    const inFile = file.rules.filter((rule) => ruleWords(rule, fileNames) === name).length;
    const inHere = here.rules.filter((rule) => ruleWords(rule, hereNames) === name).length;
    if (inHere > 0 && inFile !== inHere) add('rules', inFile > inHere ? 'only-in-file' : 'only-here', name, { count: Math.abs(inFile - inHere), inFile, here: inHere });
  }

  /* Schedules. */
  const schedules = matchByName(file.schedules, here.schedules, (schedule) => schedule.name, (schedule) => ({ time: schedule.time, days: sorted(schedule.days), runs: runsWords(schedule.what, file.schedules.includes(schedule) ? fileNames : hereNames), on: onWords(schedule.where, file.schedules.includes(schedule) ? fileNames : hereNames), task: schedule.task }));
  oneSided('schedules', schedules);
  for (const { name, file: a, here: b } of schedules.pairs) {
    const fields: DifferentField[] = [];
    const texts: DifferentText[] = [];
    if (a.time !== b.time) fields.push(field('time', a.time, b.time));
    if (!same(sorted(a.days), sorted(b.days))) fields.push(field('days', a.days.join(', '), b.days.join(', ')));
    if (runsWords(a.what, fileNames) !== runsWords(b.what, hereNames)) fields.push(field('runs', runsWords(a.what, fileNames), runsWords(b.what, hereNames)));
    if (onWords(a.where, fileNames) !== onWords(b.where, hereNames)) fields.push(field('where', onWords(a.where, fileNames), onWords(b.where, hereNames)));
    if (a.task !== b.task) {
      fields.push(field('task'));
      texts.push({ title: `The task of the schedule “${name}”`, file: a.task, here: b.task });
    }
    if (fields.length > 0) add('schedules', 'differs', name, { what: fields, texts });
  }

  /* Workflows. */
  const workflows = matchByName(fileWorkflows, hereWorkflows, (workflow) => workflow.name, (workflow) => ({ shared: workflow.shared, whole: workflow.whole }));
  oneSided('workflows', workflows);
  for (const { name, file: a, here: b } of workflows.pairs) {
    const fields = keysThatDiffer(a.whole, b.whole).map((key) => field(WORKFLOW_WORDS[key] ?? key));
    if (a.shared !== b.shared) fields.push(field('shared with every project', a.shared ? 'yes' : 'no', b.shared ? 'yes' : 'no'));
    if (fields.length > 0) add('workflows', 'differs', name, { what: fields, texts: a.text !== b.text ? [{ title: `What an agent is told by the workflow “${name}”`, file: a.text, here: b.text }] : [] });
  }

  /* Saved steps. */
  const steps = matchByName(file.elements, here.elements, (entry) => entry.element.name, (entry) => ({ shared: entry.shared, whole: wholeElement(entry.element) }));
  oneSided('steps', steps);
  for (const { name, file: a, here: b } of steps.pairs) {
    const fields = keysThatDiffer(wholeElement(a.element), wholeElement(b.element)).map((key) => field(ELEMENT_WORDS[key] ?? key));
    if (a.shared !== b.shared) fields.push(field('shared with every project', a.shared ? 'yes' : 'no', b.shared ? 'yes' : 'no'));
    const [told, toldHere] = [reviewText({ workflow: null, element: a.element }), reviewText({ workflow: null, element: b.element })];
    if (fields.length > 0) add('steps', 'differs', name, { what: fields, texts: told !== toldHere ? [{ title: `What an agent is told by the step “${name}”`, file: told, here: toldHere }] : [] });
  }

  differences.sort((a, b) => DIFFERENCE_GROUPS.indexOf(a.group) - DIFFERENCE_GROUPS.indexOf(b.group));
  const count = (kind: DifferenceKind): number => differences.filter((difference) => difference.kind === kind).reduce((n, difference) => n + (kind === 'cannot-tell' ? 1 : difference.count), 0);
  return {
    matches: differences.length === 0,
    counts: { onlyInFile: count('only-in-file'), onlyHere: count('only-here'), differ: count('differs'), cannotTell: count('cannot-tell') },
    differences,
    summaries,
    says,
    notCompared: NOT_COMPARED,
  };
}

/* ---------- In words ---------- */

/** Two texts as a unified difference: lines only here begin with `-`, lines only in the file with `+`, three lines of what both have around them. */
export function unifiedDifference(here: string, file: string): string {
  const lines = lineDiff(here, file);
  const CONTEXT = 3;
  const near = lines.map((_line, index) => lines.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some((line) => line.kind !== 'same'));
  const out: string[] = ['--- here', '+++ in the file'];
  let [a, b] = [1, 1];
  for (let index = 0; index < lines.length; ) {
    if (!near[index]) {
      a += 1;
      b += 1;
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && near[end]) end += 1;
    const hunk = lines.slice(index, end);
    const [taken, put] = [hunk.filter((line) => line.kind !== 'added').length, hunk.filter((line) => line.kind !== 'removed').length];
    out.push(`@@ -${a},${taken} +${b},${put} @@`, ...hunk.map((line) => `${line.kind === 'same' ? ' ' : line.kind === 'removed' ? '-' : '+'}${line.text}`));
    a += taken;
    b += put;
    index = end;
  }
  return out.join('\n');
}

const GROUP_TITLES: Record<DifferenceGroup, string> = { project: 'The project', places: 'Places', canvases: 'Canvases', terminals: 'Terminals', frames: 'Frames', rules: 'Rules', schedules: 'Schedules', workflows: 'Workflows', steps: 'Saved steps' };
const GROUP_ONE: Record<DifferenceGroup, [string, string]> = { project: ['project', 'projects'], places: ['place', 'places'], canvases: ['canvas', 'canvases'], terminals: ['terminal', 'terminals'], frames: ['frame', 'frames'], rules: ['rule', 'rules'], schedules: ['schedule', 'schedules'], workflows: ['workflow', 'workflows'], steps: ['saved step', 'saved steps'] };
/** A name or a value on one line: what a file wrote is shown, never acted on, and cannot begin a line of its own. */
const inline = (text: string): string => showControl(text).replace(/\n/g, '␤').replace(/\t/g, '␉');
const quoted = (difference: ProjectDifference): string => (difference.group === 'rules' ? inline(difference.name) : difference.group === 'frames' && difference.name === '' ? 'a frame with no label' : `“${inline(difference.name)}”`);

/** One difference as a line that begins with a word. */
export function differenceLine(difference: ProjectDifference): string {
  const many = difference.count > 1 ? ` (${difference.count} of them)` : '';
  switch (difference.kind) {
    case 'only-in-file':
      return `only in the file: ${quoted(difference)}${many}`;
    case 'only-here':
      return `only here: ${quoted(difference)}${many}`;
    case 'cannot-tell': {
      const [one, several] = GROUP_ONE[difference.group];
      const named = difference.group === 'frames' && difference.name === '' ? 'with no label' : `named “${inline(difference.name)}”`;
      const where = difference.canvas !== null ? ` on the canvas “${inline(difference.canvas)}”` : '';
      return `cannot be told apart: ${difference.inFile} ${difference.inFile === 1 ? one : several} ${named}${where} in the file, ${difference.here} here`;
    }
    case 'differs':
      return `differs: ${quoted(difference)}: ${difference.what.map((what) => (what.file !== null && what.here !== null ? `${what.field} (${inline(what.file)} in the file, ${inline(what.here)} here)` : what.field)).join('; ')}`;
  }
}

/** How many of each, or that the two agree, in one line. */
export function countLine(comparison: ProjectComparison): string {
  if (comparison.matches) return 'The project matches the file.';
  const { onlyInFile, onlyHere, differ, cannotTell } = comparison.counts;
  return `${[onlyInFile > 0 ? `${onlyInFile} only in the file` : '', onlyHere > 0 ? `${onlyHere} only here` : '', differ > 0 ? `${differ} ${differ === 1 ? 'differs' : 'differ'}` : '', cannotTell > 0 ? `${cannotTell} cannot be told apart` : ''].filter((part) => part !== '').join(', ')}.`;
}

/**
 * A comparison in words: grouped, every line beginning with a word, the counts, and last what a file does not hold.
 * Names are made safe for a line here; whoever prints the whole passes it through `showControl` as well.
 */
export function renderComparison(comparison: ProjectComparison, options: { text?: boolean } = {}): string {
  const out: string[] = [];
  let heading = '';
  for (const difference of comparison.differences) {
    const title = difference.canvas !== null ? `${GROUP_TITLES[difference.group]} on “${inline(difference.canvas)}”` : GROUP_TITLES[difference.group];
    if (title !== heading) out.push(...(out.length > 0 ? [''] : []), title);
    heading = title;
    out.push(`  ${differenceLine(difference)}`);
    if (options.text) for (const text of difference.texts) out.push('', `    ${inline(text.title)}`, ...showControl(unifiedDifference(text.here, text.file)).split('\n').map((line) => `    ${line}`), '');
  }
  if (out.length > 0) out.push('');
  out.push(countLine(comparison));
  if (!comparison.summaries) out.push('The file is a template without summaries: summaries were not compared.');
  if (!options.text && comparison.differences.some((difference) => difference.texts.length > 0)) out.push('To see how the texts differ, line by line: --text');
  out.push(comparison.notCompared);
  return out.join('\n');
}
