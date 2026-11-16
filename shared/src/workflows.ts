import { z } from 'zod';
import { Id } from './ids';
import { Tick, outputKind, outputKindNames } from './outputs';

/**
 * Workflows: an ordered list of elements an agent (or a person) goes through,
 * and runs, which record how far one has got.
 *
 * Nothing in a workflow is executed by Aubergine. An element is text for
 * whoever does the work. What moves a run is a report, and every report goes
 * through one function, `stepRun`, further down.
 */

const Timestamp = z.iso.datetime();

/* ---------- Limits ---------- */

/** Limits that keep one workflow from bloating the state or an agent's context. Settings can lower or raise them. */
export interface WorkflowLimits {
  maxElements: number;
  maxElementChars: number;
}
export const DEFAULT_WORKFLOW_LIMITS: WorkflowLimits = { maxElements: 50, maxElementChars: 20_000 };
/** The most the schemas accept at all, whatever the settings say. */
export const ELEMENTS_HARD_MAX = 200;
export const ELEMENT_TEXT_HARD_MAX = 100_000;
export const WORKFLOW_VERSIONS_KEPT = 30;

/* ---------- Where something came from ---------- */

/**
 * The name of a workflow or an element: one line of ordinary text. Control
 * characters and characters that reverse the direction of text are refused,
 * because a name is printed in terminals and shown beside buttons, and such
 * a character there changes what a person sees or what a terminal does.
 */
export const PlainName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\p{Cc}\u202a-\u202e\u2066-\u2069]*$/u, 'A name is one line of plain text, without control characters');

/** Where a workflow or an element came from. Open on purpose: later sources add their own fields. */
export const Origin = z.looseObject({
  /** `local` (made here), `template` (from a built-in template), `import` (from a file), and later others. */
  kind: z.string().min(1).max(40),
  /** For a template: its name. */
  name: z.string().max(200).optional(),
});
export type Origin = z.infer<typeof Origin>;
export const LOCAL: Origin = { kind: 'local' };

/* ---------- Elements ---------- */

export const ElementId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'An element ID is letters, digits, - and _');

/** Fields nobody here knows, kept so that a file from a newer version survives being opened and saved by this one. */
const Extra = z.record(z.string(), z.unknown()).default({});

export const NEEDS_MAX = 20;

/** Something an element needs that Aubergine does not supply. */
export const Need = z.object({
  /** `mcp`: an MCP server. `command`: a program on the PATH. `access`: an account, a network, a permission. `other`: anything else. */
  kind: z.enum(['mcp', 'command', 'access', 'other']),
  name: PlainName,
  /** A few more words, on one line. */
  note: z
    .string()
    .trim()
    .max(200)
    .regex(/^[^\p{Cc}\u202a-\u202e\u2066-\u2069]*$/u, 'A note on a need is one line of plain text')
    .optional(),
});
export type Need = z.infer<typeof Need>;

export const Element = z.object({
  /** Stable inside its workflow: a run points at an element by this. */
  id: ElementId,
  /** What sort of element it is. Looked up in the registry of kinds; today there is one, `instructions`. */
  kind: z.string().min(1).max(40).default('instructions'),
  name: PlainName,
  /** What to do, written for whoever does the work. Plain text or Markdown. */
  instructions: z.string().max(ELEMENT_TEXT_HARD_MAX).default(''),
  /** One line: how to tell that the element is finished. */
  doneWhen: z.string().trim().max(500).default(''),
  /** What whoever does it must have: tools the agent's own setup supplies. Shown before a run; nothing here is checked by the server. */
  needs: z.array(Need).max(NEEDS_MAX).default([]),
  /** The kind of thing it produces, from the registry of output kinds. `note` is what every element can hand over. */
  produces: z.string().min(1).max(40).default('note'),
  origin: Origin.default(LOCAL),
  extra: Extra,
});
export type Element = z.infer<typeof Element>;

/** The needs of every element of a workflow, each once, in the order first met. */
export function needsOf(elements: readonly Pick<Element, 'needs'>[]): Need[] {
  const seen = new Set<string>();
  return elements.flatMap((element) => element.needs).filter((need) => {
    const key = `${need.kind}\u0000${need.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A need in a few words: `an MCP server: chat`. */
export function needWords(need: Need): string {
  const kind = { mcp: 'an MCP server', command: 'the command', access: 'access to', other: '' }[need.kind];
  return `${kind}${kind ? (need.kind === 'mcp' ? ': ' : ' ') : ''}${need.name}${need.note ? ` (${need.note})` : ''}`;
}

/** A named value a run is given when it starts, such as the task. `{{key}}` in an element's text becomes the value. */
export const WorkflowInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'An input key is lower-case letters, digits and _, starting with a letter'),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  required: z.boolean().default(true),
});
export type WorkflowInput = z.infer<typeof WorkflowInput>;

export const TASK_INPUT: WorkflowInput = { key: 'task', label: 'Task', description: 'What this run is about.', required: true };

/** What a workflow says: everything that can be edited. A version is this, frozen. */
export const WorkflowContent = z.object({
  name: PlainName,
  description: z.string().trim().max(2000).default(''),
  /** Text added to every element: rules that hold from start to finish. */
  standing: z.string().max(ELEMENT_TEXT_HARD_MAX).default(''),
  inputs: z.array(WorkflowInput).max(20).default([TASK_INPUT]),
  elements: z.array(Element).min(1).max(ELEMENTS_HARD_MAX),
  extra: Extra,
});
export type WorkflowContent = z.infer<typeof WorkflowContent>;

/** One saved state of a workflow. Never changed after it is written: a run points at one and can rely on it. */
export const WorkflowVersion = WorkflowContent.extend({ number: z.number().int().min(1), createdAt: Timestamp });
export type WorkflowVersion = z.infer<typeof WorkflowVersion>;

export const WorkflowLabels = z.record(z.string().max(63), z.string().max(256)).default({});

export const Workflow = z.object({
  id: Id,
  projectId: Id,
  /** The name and description of the latest version, here too so that lists need not open versions. */
  name: z.string(),
  description: z.string().default(''),
  labels: WorkflowLabels,
  origin: Origin.default(LOCAL),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  /** False for a workflow made only to run one element by itself: it is not among the workflows, and goes when its run is over. */
  listed: z.boolean().default(true),
  /** Oldest first. Editing adds one; none is ever changed. Old ones no run needs are dropped past a limit. */
  versions: z.array(WorkflowVersion).min(1),
});
export type Workflow = z.infer<typeof Workflow>;

export const latestVersion = (workflow: Workflow): WorkflowVersion => workflow.versions.at(-1) as WorkflowVersion;
export const versionOf = (workflow: Workflow, number: number): WorkflowVersion | null => workflow.versions.find((v) => v.number === number) ?? null;

/* ---------- Element kinds: a registry ---------- */

/** What rendering an element's text is given. */
export interface RenderContext {
  /** The inputs of the run, by key. */
  inputs: Record<string, string>;
}

/**
 * A kind of element. A new kind (an approval, a check, a nested workflow) is
 * one more entry: nothing that validates, renders or steps looks at the name
 * of a kind, only at what its entry says.
 */
export interface ElementKind {
  kind: string;
  /** What the editor calls it. */
  title: string;
  /** What is wrong with an element of this kind, in sentences; empty when nothing is. */
  validate(element: Element, limits: WorkflowLimits): string[];
  /** The part of the text an agent is given that is this element's own. */
  render(element: Element, context: RenderContext): string;
}

const elementKinds = new Map<string, ElementKind>();

export function registerElementKind(kind: ElementKind): void {
  elementKinds.set(kind.kind, kind);
}
export function unregisterElementKind(kind: string): void {
  elementKinds.delete(kind);
}
export const elementKind = (kind: string): ElementKind | undefined => elementKinds.get(kind);
export const elementKindNames = (): string[] => [...elementKinds.keys()];

/** `{{key}}` becomes the input of that name. One that names no input is left as it is, so the mistake shows. */
export function fillInputs(text: string, inputs: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (whole, key: string) => (key in inputs ? (inputs[key] as string) : whole));
}

registerElementKind({
  kind: 'instructions',
  title: 'Instructions',
  validate: (element, limits) => {
    const problems: string[] = [];
    if (element.instructions.trim() === '') problems.push(`"${element.name}" has no instructions.`);
    if (element.instructions.length > limits.maxElementChars) problems.push(`The instructions of "${element.name}" are ${element.instructions.length} characters; at most ${limits.maxElementChars} are allowed.`);
    return problems;
  },
  render: (element, context) => {
    const lines = [fillInputs(element.instructions.trim(), context.inputs)];
    if (element.doneWhen) lines.push('', `Done when: ${fillInputs(element.doneWhen, context.inputs)}`);
    return lines.join('\n');
  },
});

/** Everything wrong with a workflow's content, in sentences. Empty means it can be saved. */
export function validateContent(content: WorkflowContent, limits: WorkflowLimits = DEFAULT_WORKFLOW_LIMITS): string[] {
  const problems: string[] = [];
  if (content.elements.length > limits.maxElements) problems.push(`It has ${content.elements.length} elements; at most ${limits.maxElements} are allowed.`);
  if (content.standing.length > limits.maxElementChars) problems.push(`The standing text is ${content.standing.length} characters; at most ${limits.maxElementChars} are allowed.`);
  const ids = new Set<string>();
  for (const element of content.elements) {
    if (ids.has(element.id)) problems.push(`Two elements have the ID "${element.id}".`);
    ids.add(element.id);
    const kind = elementKind(element.kind);
    if (!kind) problems.push(`"${element.name}" is of a kind this version does not know: ${element.kind}.`);
    else problems.push(...kind.validate(element, limits));
    if (!outputKind(element.produces)) problems.push(`"${element.name}" produces a kind of output this version does not know: ${element.produces}.`);
  }
  const keys = new Set<string>();
  for (const input of content.inputs) {
    if (keys.has(input.key)) problems.push(`Two inputs have the key "${input.key}".`);
    keys.add(input.key);
  }
  return problems;
}

/** An ID for a new element: its name in lower case with dashes, made unique among the others. */
export function elementIdFor(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'element';
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}

/* ---------- Runs ---------- */

/** Who moved a run. */
export const Actor = z.object({
  /** `agent`: a program in the session, with the session's own token. `person`: the owner, in the browser or at the command line. `token`: a program with an API token. */
  kind: z.enum(['agent', 'person', 'token']),
  /** For a token: its name. */
  name: z.string().max(120).optional(),
});
export type Actor = z.infer<typeof Actor>;

export const RunStatus = z.enum(['queued', 'running', 'paused', 'blocked', 'finished', 'stopped']);
export type RunStatus = z.infer<typeof RunStatus>;
export const LIVE_STATUSES: readonly RunStatus[] = ['queued', 'running', 'paused', 'blocked'];
export const isLive = (status: RunStatus): boolean => LIVE_STATUSES.includes(status);

export const ElementState = z.enum(['pending', 'active', 'done', 'skipped']);
export type ElementState = z.infer<typeof ElementState>;

/** How one element of a run stands. */
export const RunElement = z.object({
  elementId: ElementId,
  state: ElementState.default('pending'),
  startedAt: Timestamp.nullable().default(null),
  finishedAt: Timestamp.nullable().default(null),
  /** What was handed in when it was finished: what the next element is told about it. */
  note: z.string().max(10_000).default(''),
  /** What it produced besides the note, as its output kind stores it. Null for a note, and until it is done. */
  output: z.unknown().nullable().default(null),
  /** The items of the output the owner ticked. */
  ticks: z.array(Tick).max(1000).default([]),
  /** Who finished or skipped it. */
  by: Actor.nullable().default(null),
  /** The session that worked on it. Recorded per element: later, different sessions may do different ones. */
  sessionId: Id.nullable().default(null),
});
export type RunElement = z.infer<typeof RunElement>;

export const RunInputs = z.record(z.string().max(40), z.string().max(20_000)).default({});

export const Run = z.object({
  id: Id,
  workflowId: Id,
  /** The version of the workflow this run goes through. Editing the workflow does not change it. */
  workflowVersion: z.number().int().min(1),
  /** The session doing the work. None yet for a run that is queued. */
  sessionId: Id.nullable().default(null),
  inputs: RunInputs,
  status: RunStatus,
  /** The element being worked on; null before the first and after the last. */
  currentElementId: ElementId.nullable().default(null),
  /** One entry per element of the version, in its order. */
  elements: z.array(RunElement),
  /** With `blocked`: why. */
  blockedReason: z.string().max(2000).nullable().default(null),
  /** What it was before it was paused, to return to. */
  pausedFrom: z.enum(['running', 'blocked']).nullable().default(null),
  startedBy: Actor,
  createdAt: Timestamp,
  /** When it was last moved by a report. */
  updatedAt: Timestamp,
  finishedAt: Timestamp.nullable().default(null),
});
export type Run = z.infer<typeof Run>;

/** A new run of a version. With a session it starts at once on the first element; without one it waits, queued. */
export function newRun(version: WorkflowVersion, input: { id: string; workflowId: string; sessionId: string | null; inputs: Record<string, string>; by: Actor; at: string }): Run {
  const first = version.elements[0];
  const started = input.sessionId !== null && first !== undefined;
  return {
    id: input.id,
    workflowId: input.workflowId,
    workflowVersion: version.number,
    sessionId: input.sessionId,
    inputs: input.inputs,
    status: started ? 'running' : 'queued',
    currentElementId: started ? first.id : null,
    elements: version.elements.map((element, index) => ({
      elementId: element.id,
      state: started && index === 0 ? 'active' : 'pending',
      startedAt: started && index === 0 ? input.at : null,
      finishedAt: null,
      note: '',
      output: null,
      ticks: [],
      by: null,
      sessionId: started && index === 0 ? input.sessionId : null,
    })),
    blockedReason: null,
    pausedFrom: null,
    startedBy: input.by,
    createdAt: input.at,
    updatedAt: input.at,
    finishedAt: null,
  };
}

/** What is missing or unknown among the inputs given for a version. Empty when they will do. */
export function inputProblems(version: WorkflowVersion, inputs: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const input of version.inputs) {
    if (input.required && (inputs[input.key] ?? '').trim() === '') problems.push(`"${input.label}" is needed (${input.key}).`);
  }
  for (const key of Object.keys(inputs)) {
    if (!version.inputs.some((input) => input.key === key)) problems.push(`This workflow has no input named "${key}".`);
  }
  return problems;
}

/* ---------- Reports, and the one function that applies them ---------- */

/**
 * Something said about a run that may move it. Every way of moving a run
 * (the command in a session, a button in the browser, the API) sends one of
 * these, and all of them are applied by `stepRun`.
 */
export const RunReport = z.discriminatedUnion('type', [
  /** The current element is finished. It names the element, so that a report sent twice cannot finish two. */
  z.object({
    type: z.literal('done'),
    elementId: ElementId,
    note: z.string().max(10_000).optional(),
    /** What the element produced, for an element that declares an output kind other than a note. */
    output: z.unknown().optional(),
  }),
  /** The work cannot go on without a person. */
  z.object({ type: z.literal('blocked'), reason: z.string().trim().min(1).max(2000) }),
  /** Jump to an element: back to redo it, or forward, skipping what lies between. */
  z.object({ type: z.literal('goto'), elementId: ElementId }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('stop') }),
  /** Give a queued run the session that will do it. It starts on the first element. */
  z.object({ type: z.literal('assign'), sessionId: Id }),
]);
export type RunReport = z.infer<typeof RunReport>;

export type StepResult = { ok: true; run: Run } | { ok: false; reason: string };

const refuse = (reason: string): StepResult => ({ ok: false, reason });

/**
 * The next state of a run, given the version it goes through and a report.
 * Pure: nothing is read or written but what is passed in. This is the only
 * place that knows how a run moves; branches, loops and retries, when they
 * come, change this function and nothing that calls it.
 */
export function stepRun(version: WorkflowVersion, run: Run, report: RunReport, context: { by: Actor; at: string }): StepResult {
  const { by, at } = context;
  if (run.status === 'finished' || run.status === 'stopped') return refuse(`This run is ${run.status}; nothing more can be reported on it.`);
  const nameOf = (id: string | null): string => version.elements.find((e) => e.id === id)?.name ?? id ?? 'nothing';
  const touch = (changes: Partial<Run>): StepResult => ({ ok: true, run: { ...run, ...changes, updatedAt: at } });
  const patch = (elements: RunElement[], id: string, change: Partial<RunElement>): RunElement[] => elements.map((e) => (e.elementId === id ? { ...e, ...change } : e));

  switch (report.type) {
    case 'assign': {
      if (run.status !== 'queued') return refuse('This run already has a session.');
      const first = version.elements[0];
      if (!first) return refuse('This workflow has no elements.');
      return touch({ sessionId: report.sessionId, status: 'running', currentElementId: first.id, elements: patch(run.elements, first.id, { state: 'active', startedAt: at, sessionId: report.sessionId }) });
    }

    case 'stop':
      return touch({ status: 'stopped', finishedAt: at, pausedFrom: null });

    case 'pause':
      if (run.status === 'paused') return refuse('This run is already paused.');
      if (run.status === 'queued') return refuse('This run has not started yet.');
      return touch({ status: 'paused', pausedFrom: run.status });

    case 'resume':
      if (run.status !== 'paused') return refuse('This run is not paused.');
      return touch({ status: run.pausedFrom ?? 'running', pausedFrom: null });

    case 'blocked':
      if (run.status === 'queued') return refuse('This run has not started yet.');
      if (run.status === 'paused') return refuse('This run is paused. Resume it first.');
      return touch({ status: 'blocked', blockedReason: report.reason });

    case 'done': {
      if (run.status === 'queued') return refuse('This run has not started yet.');
      if (run.status === 'paused') return refuse('This run is paused. Resume it first.');
      if (report.elementId !== run.currentElementId) {
        const state = run.elements.find((e) => e.elementId === report.elementId)?.state;
        if (state === undefined) return refuse(`This workflow has no element "${report.elementId}".`);
        // The usual cause: the same report sent twice. Nothing moves.
        return refuse(`"${nameOf(report.elementId)}" is not the current element (it is ${state}). The current element is "${nameOf(run.currentElementId)}".`);
      }
      // What it hands in is checked by the kind of output the element declares.
      const declared = version.elements.find((e) => e.id === report.elementId);
      const kind = outputKind(declared?.produces ?? 'note');
      let output: unknown = null;
      if (kind?.required) {
        if (report.output === undefined || report.output === null) return refuse(`"${nameOf(report.elementId)}" produces ${kind.title.toLowerCase()}, and none was handed in. ${kind.expects}`);
        const checked = kind.check(report.output);
        if (!checked.ok) return refuse(`What was handed in for "${nameOf(report.elementId)}" is not right. ${checked.problems.join(' ')} ${kind.expects}`);
        output = checked.value;
      } else if (report.output !== undefined && report.output !== null) {
        return refuse(`"${nameOf(report.elementId)}" produces a note only: hand it in with --note.`);
      }
      const done = patch(run.elements, report.elementId, { state: 'done', finishedAt: at, note: report.note ?? '', output, ticks: [], by });
      // The next element that has not been done or skipped, in the order of the version.
      const position = version.elements.findIndex((e) => e.id === report.elementId);
      const next = version.elements.slice(position + 1).find((e) => done.find((r) => r.elementId === e.id)?.state === 'pending');
      if (!next) return touch({ status: 'finished', currentElementId: null, elements: done, blockedReason: null, finishedAt: at });
      return touch({ status: 'running', currentElementId: next.id, blockedReason: null, elements: patch(done, next.id, { state: 'active', startedAt: at, sessionId: run.sessionId }) });
    }

    case 'goto': {
      if (run.status === 'queued') return refuse('This run has not started yet.');
      const target = version.elements.findIndex((e) => e.id === report.elementId);
      if (target < 0) return refuse(`This workflow has no element "${report.elementId}".`);
      if (report.elementId === run.currentElementId) return refuse(`"${nameOf(report.elementId)}" is already the current element.`);
      const from = version.elements.findIndex((e) => e.id === run.currentElementId);
      const elements = run.elements.map((entry): RunElement => {
        const index = version.elements.findIndex((e) => e.id === entry.elementId);
        if (index === target) return { ...entry, state: 'active', startedAt: at, finishedAt: null, by: null, sessionId: run.sessionId };
        // Forward: what is passed over, and was not done, is skipped.
        if (target > from && index >= from && index < target && entry.state !== 'done') return { ...entry, state: 'skipped', finishedAt: at, by };
        // Back: the target and everything after it is to be done again. Notes are kept until it is.
        if (target < from && index > target) return { ...entry, state: 'pending', startedAt: null, finishedAt: null, by: null };
        return entry;
      });
      // A person paused it; jumping does not start it again behind their back.
      return touch({ status: run.status === 'paused' ? 'paused' : 'running', pausedFrom: run.status === 'paused' ? 'running' : null, currentElementId: report.elementId, blockedReason: null, elements });
    }
  }
}

/**
 * Ticks or unticks one item of what an element produced. Not a report: it
 * does not move the run, and it also works on a run that is over, because
 * the owner reads a list after the work is done.
 */
export function tickRun(version: { elements: readonly { id: string; produces: string }[] } | null, run: Run, tick: { elementId: string; item: number; ticked: boolean }, context: { by: Actor; at: string }): StepResult {
  const entry = run.elements.find((e) => e.elementId === tick.elementId);
  if (!entry) return refuse(`This run has no element "${tick.elementId}".`);
  if (entry.state !== 'done') return refuse('Only what a finished element produced can be ticked.');
  // The kind is the element's own where the version is still known; an archived run's output says what it is by its shape.
  const produces = version?.elements.find((e) => e.id === tick.elementId)?.produces;
  const count = Math.max(...(produces ? [outputKind(produces)?.items(entry.output) ?? 0] : outputKindNames().map((name) => outputKind(name)?.items(entry.output) ?? 0)), 0);
  if (tick.item < 0 || tick.item >= count) return refuse(count === 0 ? 'There is nothing to tick here.' : `There are ${count} items; ${tick.item + 1} is not one of them.`);
  const others = entry.ticks.filter((t) => t.item !== tick.item);
  const ticks = tick.ticked ? [...others, { item: tick.item, by: context.by, at: context.at }].sort((a, b) => a.item - b.item) : others;
  return { ok: true, run: { ...run, elements: run.elements.map((e) => (e.elementId === tick.elementId ? { ...e, ticks } : e)) } };
}

/* ---------- What an agent is told ---------- */

/**
 * A stored name, made safe to be typed into a terminal as keys. A name can be
 * written by a token or come from an imported file, and what is typed reaches
 * whatever program has the keyboard: a control character there is a key press
 * (interrupt, end of input, Enter), not text. So only letters, digits, spaces
 * and a short list of punctuation are kept; anything else becomes a space.
 */
export function safeForTyping(text: string): string {
  return text
    .replace(/[^\p{L}\p{N} \-_.,:()/&+']/gu, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * The line that sets an agent off on a run. A fixed sentence: nothing stored
 * is in it, because it is typed into a terminal and names of workflows and
 * elements can be written by agents. What the run is called, and everything
 * else, the agent reads with the command.
 */
export const KICKOFF_LINE =
  'You are on an Aubergine workflow. Run `aubergine workflow status` to read your current element and follow it. When its "done when" is true, run `aubergine workflow done --note "<what you did>"` and follow what it prints.';
export const kickoffLine = (): string => KICKOFF_LINE;

/** The line that asks an agent for a recap. Fixed, like the others: what is wanted is read with the command, never typed. */
export const RECAP_LINE = 'Your owner asked for a recap of this session. Run `aubergine recap --write` to read what is wanted, and follow what it prints.';

/** The line that asks an agent to write a draft. Fixed too: the owner's description is read with the command, never typed. */
export const BRIEF_LINE = 'You have been asked to write something for Aubergine. Run `aubergine workflow brief` to read the request, and follow what it prints.';

/** The one line that points at the guide for agents, at the end of what an agent is told about a run or a request. */
export const GUIDE_POINTER = 'For everything else you can do here: aubergine guide';

const HOW_TO_REPORT = [
  'How to report:',
  '- When the "done when" above is true:',
  '    aubergine workflow done --note "<what you did, for whoever comes next>"',
  '- When you cannot go on without a person:',
  '    aubergine workflow blocked "<what you need>"',
  '- To read this again:',
  '    aubergine workflow status',
  '',
  GUIDE_POINTER,
].join('\n');

/**
 * Exactly what whoever is on a run is told about where it stands: the
 * workflow, the position, the standing text, the current element with the
 * inputs filled in, what the element before handed over, and how to report.
 *
 * The preview in the browser and `aubergine workflow status` both print what
 * this returns, so what a person reads before starting a run is what the
 * agent reads during it.
 */
export function renderRun(version: WorkflowVersion, run: Run): string {
  const lines: string[] = [`Workflow: ${version.name}`];
  const total = version.elements.length;
  const index = version.elements.findIndex((e) => e.id === run.currentElementId);
  const element = version.elements[index];

  if (run.status === 'finished') return [...lines, `This run is finished: all ${total} elements are done. There is nothing more to do for it.`].join('\n');
  if (run.status === 'stopped') return [...lines, 'This run was stopped. There is nothing more to do for it.'].join('\n');
  if (run.status === 'queued' || !element) return [...lines, 'This run has not started yet: it is waiting for a session.'].join('\n');

  lines.push(`Element ${index + 1} of ${total}: ${element.name}`);
  if (run.status === 'paused') lines.push('', 'This run is PAUSED by a person. Do not work on it until it is resumed.');
  if (run.status === 'blocked') lines.push('', `This run is BLOCKED: ${run.blockedReason ?? ''}`, 'If that is resolved, carry on and report as usual.');

  const given = version.inputs.filter((input) => (run.inputs[input.key] ?? '') !== '');
  if (given.length > 0) lines.push('', ...given.map((input) => `${input.label}: ${run.inputs[input.key]}`));
  if (version.standing.trim()) lines.push('', 'For every element:', fillInputs(version.standing.trim(), run.inputs));

  const kind = elementKind(element.kind);
  lines.push('', kind ? kind.render(element, { inputs: run.inputs }) : `(This element is of a kind this version does not know: ${element.kind}.)`);
  if (element.needs.length > 0) lines.push('', `This element needs: ${element.needs.map(needWords).join('; ')}. If you do not have one of these, report blocked and say which.`);
  const produces = outputKind(element.produces);
  if (produces?.required) lines.push('', `This element produces ${produces.title.toLowerCase()}. ${produces.expects}`);

  // What the element before handed over: the nearest one before this that was done (skipped ones handed over nothing).
  const before = version.elements
    .slice(0, index)
    .reverse()
    .map((e) => ({ element: e, state: run.elements.find((r) => r.elementId === e.id) }))
    .find((entry) => entry.state?.state === 'done');
  if (before?.state) {
    const handed = outputKind(before.element.produces)?.render(before.state.output, new Set(before.state.ticks.map((t) => t.item))) ?? '';
    const parts = [before.state.note.trim(), handed].filter((part) => part !== '');
    if (parts.length > 0) lines.push('', `From "${before.element.name}", the element before:`, ...parts);
  }

  const later = version.elements.slice(index + 1).map((e) => e.name);
  lines.push('', later.length > 0 ? `After this: ${later.join(', ')}.` : 'This is the last element.');
  lines.push('', HOW_TO_REPORT);
  return lines.join('\n');
}

/**
 * What an agent would be told on each element of a workflow, before any run
 * exists: the same text as during a run, as if every earlier element had
 * been done without a note.
 */
export function previewRun(version: WorkflowVersion, inputs: Record<string, string>, elementId?: string): string {
  const at = '1970-01-01T00:00:00.000Z';
  const by: Actor = { kind: 'person' };
  let run = newRun(version, { id: '00000000-0000-7000-8000-000000000000', workflowId: '00000000-0000-7000-8000-000000000000', sessionId: '00000000-0000-7000-8000-000000000000', inputs, by, at });
  if (elementId !== undefined && elementId !== run.currentElementId) {
    const moved = stepRun(version, run, { type: 'goto', elementId }, { by, at });
    if (moved.ok) run = { ...moved.run, elements: moved.run.elements.map((e) => (e.state === 'skipped' ? { ...e, state: 'done' as const } : e)) };
  }
  return renderRun(version, run);
}

/** The summary added to a session's notes when its run finishes: each element and what was handed in. */
export function runSummary(version: WorkflowVersion, run: Run): string {
  const lines = [`Workflow "${version.name}" ${run.status}.`];
  for (const element of version.elements) {
    const state = run.elements.find((e) => e.elementId === element.id);
    if (!state || state.state === 'pending' || state.state === 'active') continue;
    lines.push(`- ${element.name}${state.state === 'skipped' ? ' (skipped)' : ''}${state.note.trim() ? `: ${state.note.trim()}` : ''}`);
  }
  return lines.join('\n');
}

/** Where a run stands, in a few words: `Review · 3 of 5`. */
export function runPosition(version: WorkflowVersion, run: Run): string {
  if (run.status === 'finished') return 'finished';
  if (run.status === 'stopped') return 'stopped';
  if (run.status === 'queued') return 'queued';
  const index = version.elements.findIndex((e) => e.id === run.currentElementId);
  return `${version.elements[index]?.name ?? '?'} · ${index + 1} of ${version.elements.length}`;
}

/**
 * Whether a run has gone quiet: its session has been printing for a while
 * since the last report, so the picture may be behind what is really going on.
 */
export function isQuiet(run: Pick<Run, 'status' | 'updatedAt'>, lastOutputAt: string | null, quietAfterSeconds: number): boolean {
  if (run.status !== 'running' || lastOutputAt === null) return false;
  return Date.parse(lastOutputAt) - Date.parse(run.updatedAt) >= quietAfterSeconds * 1000;
}

/* ---------- A finished run, as the archive keeps it ---------- */

/**
 * A run that is over, with enough beside it to be read without the workflow:
 * the workflow may have been edited or removed since.
 */
export const ArchivedRun = z.object({
  run: Run,
  workflowName: z.string(),
  /** Each element's name as it was, and the kind of thing it produced. */
  elements: z.array(z.object({ id: ElementId, name: z.string(), produces: z.string().default('note') })),
});
export type ArchivedRun = z.infer<typeof ArchivedRun>;

/**
 * A line of the archive. Besides a run it may say that the run is withdrawn: it was part of something
 * removed whole (the demo). The archive only grows, so taking a run back is a later line; readers leave it out.
 */
export const ArchiveLine = ArchivedRun.extend({ withdrawn: z.boolean().default(false) });
export type ArchiveLine = z.infer<typeof ArchiveLine>;

/* ---------- The file a workflow is exported to and imported from ---------- */

export const WORKFLOW_FILE_FORMAT = 1;

/**
 * One workflow as a file, for passing to someone else. The format has a
 * number; fields this version does not know are kept (in `extra`) and written
 * out again, so that a file from a newer version is not damaged by passing
 * through this one.
 */
export const WorkflowFile = z.looseObject({
  aubergine: z.literal('workflow'),
  format: z.number().int().min(1),
  workflow: z.looseObject({
    name: z.string(),
    description: z.string().optional(),
    standing: z.string().optional(),
    inputs: z.array(z.looseObject({ key: z.string(), label: z.string() })).optional(),
    elements: z.array(z.looseObject({ id: z.string().optional(), name: z.string() })),
    labels: z.record(z.string(), z.string()).optional(),
  }),
});
export type WorkflowFile = z.infer<typeof WorkflowFile>;

const KNOWN_ELEMENT = ['id', 'kind', 'name', 'instructions', 'doneWhen', 'needs', 'produces', 'origin'];
const KNOWN_WORKFLOW = ['name', 'description', 'standing', 'inputs', 'elements', 'labels', 'origin'];
const KNOWN_FILE = ['aubergine', 'format', 'workflow'];

const unknownOf = (value: Record<string, unknown>, known: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([key]) => !known.includes(key)));

export function exportWorkflow(workflow: Workflow): Record<string, unknown> {
  const version = latestVersion(workflow);
  const { $file, ...rest } = version.extra as { $file?: Record<string, unknown> } & Record<string, unknown>;
  return {
    aubergine: 'workflow',
    format: WORKFLOW_FILE_FORMAT,
    ...$file,
    workflow: {
      name: version.name,
      description: version.description,
      standing: version.standing,
      inputs: version.inputs,
      elements: version.elements.map(({ extra, ...element }) => ({ ...element, ...extra })),
      labels: workflow.labels,
      origin: workflow.origin,
      ...rest,
    },
  };
}

/** Reads a file into the content of a workflow. Throws, with a sentence, when it is not one. */
export function importWorkflow(file: unknown): { content: WorkflowContent; labels: Record<string, string>; origin: Origin } {
  const parsed = WorkflowFile.safeParse(file);
  if (!parsed.success) throw new Error('This is not an Aubergine workflow file.');
  const source = parsed.data.workflow as Record<string, unknown> & { elements: Record<string, unknown>[] };
  const taken: string[] = [];
  const elements = source.elements.map((raw) => {
    const id = typeof raw.id === 'string' && ElementId.safeParse(raw.id).success && !taken.includes(raw.id) ? raw.id : elementIdFor(String(raw.name ?? 'element'), taken);
    taken.push(id);
    return { ...Object.fromEntries(KNOWN_ELEMENT.filter((key) => key in raw).map((key) => [key, raw[key]])), id, extra: unknownOf(raw, KNOWN_ELEMENT) };
  });
  const fileExtra = unknownOf(parsed.data as Record<string, unknown>, KNOWN_FILE);
  const content = WorkflowContent.parse({
    name: source.name,
    ...(source.description !== undefined ? { description: source.description } : {}),
    ...(source.standing !== undefined ? { standing: source.standing } : {}),
    ...(source.inputs !== undefined ? { inputs: source.inputs } : {}),
    elements,
    extra: { ...unknownOf(source, KNOWN_WORKFLOW), ...(Object.keys(fileExtra).length > 0 ? { $file: fileExtra } : {}) },
  });
  return { content, labels: WorkflowLabels.parse(source.labels ?? {}), origin: { kind: 'import' } };
}
