import { z } from 'zod';
import { AgentKind, CanvasName, FrameLabel, FrameRect, Labels, NodeColor, NodeRect, Project, Tags } from './entities';
import { EnvironmentKindName } from './environment';
import { ProjectRow } from './projects';
import { Schedule } from './schedules';
import { PlainWords, RuleEvent, TASK_DETAILS_MAX } from './tasks';
import { Element, PlainName } from './workflows';

/**
 * A project as a file.
 *
 * One side writes a project out, the other reads it in, after reading what
 * it holds. It is a copy at one moment, not a link: nothing ties the two
 * afterwards. A template is the same file with `template: true`.
 *
 * What a file holds is a project's shape and its instructions: canvases and
 * their layout, the terminals to make there, pinned notes, rules, schedules,
 * and the workflows and elements they need. What it never holds: anything
 * that ran (tasks, runs, logs, messages), any credential or setting, any
 * path or ID of the computer it was written on. Folders are written as
 * named places; where each is on another computer is asked there.
 *
 * Inside a file, things point at each other by short references of the
 * file's own (`c1`, `t3`, `e2`). Reading it in makes new IDs.
 */

export const PROJECT_FILE_FORMAT = 1;
/** The largest file that is read, in characters. */
export const PROJECT_FILE_MAX_CHARS = 400_000;
export const FILE_CANVASES_MAX = 50;
export const FILE_NODES_MAX = 200;
export const FILE_TERMINALS_MAX = 300;
export const FILE_FRAMES_MAX = 100;
export const FILE_WORKFLOWS_MAX = 50;
export const FILE_ELEMENTS_MAX = 100;
export const FILE_RULES_MAX = 50;
export const FILE_SCHEDULES_MAX = 50;
export const FILE_PLACES_MAX = 20;
export const FILE_NOTE_MAX = 20_000;

/** A reference inside one file: a letter and a number. It means nothing outside the file. */
export const FileRef = z.string().regex(/^[a-z][0-9]{1,4}$/, 'A reference is a letter and a number, like c1');
/** The name of a place: a folder of the project, by a word and never by its path. */
export const PlaceName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'A place is named in lower-case letters, digits and dashes');
/** A folder below a place: relative, never upward, never from the root. */
export const Subfolder = z
  .string()
  .max(400)
  .regex(/^[^\p{Cc}]*$/u, 'A subfolder is plain text')
  .refine((value) => !value.startsWith('/') && !value.startsWith('~') && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes('..'), 'A subfolder is below its place: not from the root, and never upward');
/** The last part of a folder's path, as a hint for whoever is asked where the place is. Never used as a path. */
const Hint = z.string().max(120).regex(/^[^\p{Cc}/\\]*$/u, 'A hint is one name, not a path');
const Note = z.string().max(FILE_NOTE_MAX).regex(/^(?:[^\p{Cc}]|\n|\t)*$/u, 'A note is plain text');

export const FilePlace = z.object({ name: PlaceName.describe('The name of the place: a word, such as `main` or `docs`. Terminals name it.'), hint: Hint.default('').describe('The last part of the folder\'s path where the file was written, to help whoever is asked where the place is. Never used as a path.'), default: z.boolean().default(false).describe('True for the place new terminals start in.') });
export type FilePlace = z.infer<typeof FilePlace>;

/** A terminal to make on a node. Its name, where it starts and what it was; never what it showed or ran. */
export const FileTerminal = z.object({
  ref: FileRef.describe('Its reference inside this file, such as `t1`. Rules and schedules name it.'),
  name: PlainName.describe('What the terminal is called.'),
  tags: Tags.default([]).describe('Its tags.'),
  note: Note.default('').describe('Its pinned note. Left out of a template unless the owner kept the notes.'),
  place: PlaceName.nullable().default(null).describe('The place it starts in. Null: no place; it starts in the home folder of whoever reads the file in.'),
  subfolder: Subfolder.default('').describe('A folder below that place.'),
  agent: AgentKind.nullable().default(null).describe('The agent it ran, by its kind. It is made as a plain shell and says which agent it was meant for: reading a file in never starts an agent.'),
  environment: EnvironmentKindName.nullable().default(null).describe('The kind of place it worked in. Said on the terminal; nothing is prepared by reading the file in.'),
});
export type FileTerminal = z.infer<typeof FileTerminal>;

export const FileCanvas = z.object({
  ref: FileRef.describe('Its reference inside this file, such as `c1`.'),
  name: CanvasName.describe('The name on its tab.'),
  color: NodeColor.default('none').describe('The color of its tab.'),
  labels: Labels.default({}).describe('Pairs of key and value.'),
  frames: z.array(FrameRect.extend({ label: FrameLabel.default(''), color: NodeColor.default('none') })).max(FILE_FRAMES_MAX).default([]).describe('Its frames: a rectangle, a label and a color each.'),
  nodes: z.array(NodeRect.extend({ color: NodeColor.default('none'), terminal: FileTerminal })).max(FILE_NODES_MAX).default([]).describe('Its nodes, in the order they are drawn: a rectangle, a color, and the terminal to make there.'),
});
export type FileCanvas = z.infer<typeof FileCanvas>;

/** A workflow: the same content a workflow file holds. `shared`: it was shared with every project where the file was written. */
export const FileWorkflow = z.object({ ref: FileRef, shared: z.boolean().default(false), file: z.looseObject({ aubergine: z.literal('workflow') }) });
export const FileElement = z.object({ ref: FileRef, shared: z.boolean().default(false), element: Element });

const OnWhat = z.union([z.object({ terminal: FileRef }), z.object({ canvas: FileRef })]);
export const FileRule = z.object({
  event: RuleEvent.describe('What sets it off.'),
  action: z.union([z.object({ kind: z.literal('notify') }), z.object({ kind: z.literal('run-element'), element: FileRef, on: OnWhat })]).describe('What it does: `{"kind":"notify"}`, or `{"kind":"run-element","element":"e1","on":{"terminal":"t1"}}` (or `{"canvas":"c1"}` for a new terminal there). It arrives switched off.'),
});
export type FileRule = z.infer<typeof FileRule>;
export const FileSchedule = z.object({
  name: PlainName.describe('What the schedule is called. It arrives switched off.'),
  time: Schedule.shape.time,
  days: Schedule.shape.days,
  what: z.union([z.object({ element: FileRef }), z.object({ workflow: FileRef })]).describe('What it runs: `{"element":"e1"}` or `{"workflow":"w1"}`.'),
  where: OnWhat.describe('Where: `{"terminal":"t1"}`, or `{"canvas":"c1"}` for a new terminal there.'),
  task: PlainWords(TASK_DETAILS_MAX).default('').describe('What the agent is told to do.'),
});
export type FileSchedule = z.infer<typeof FileSchedule>;

export const ProjectFile = z.looseObject({
  aubergine: z.literal('project').describe('Says what kind of file this is.'),
  format: z.number().int().min(1).describe('The format of the file. This version writes and reads 1; a later one is refused with a sentence.'),
  template: z.boolean().default(false).describe('True for a template: a project to start others from.'),
  description: PlainWords(1000).default('').describe('What it is for, in a few sentences. Shown before it is read in.'),
  name: Project.shape.name.describe('The name of the project. Whoever reads the file in may choose another.'),
  color: NodeColor.default('none').describe('Its color.'),
  labels: Labels.default({}).describe('Pairs of key and value.'),
  places: z.array(FilePlace).max(FILE_PLACES_MAX).default([]).describe("The project's folders, as names. Where each is on a computer is asked there."),
  canvases: z.array(FileCanvas).min(1).max(FILE_CANVASES_MAX).describe('Its canvases, in the order of their tabs. At least one.'),
  workflows: z.array(FileWorkflow).max(FILE_WORKFLOWS_MAX).default([]).describe('The workflows it owns and the shared ones its schedules run. Each has a reference (`w1`), `shared` (true if it was shared with every project where the file was written) and `file`: the workflow as a workflow file.'),
  elements: z.array(FileElement).max(FILE_ELEMENTS_MAX).default([]).describe('The saved steps it owns and the shared ones its rules and schedules run. Each has a reference (`e1`), `shared` and `element` (see the step reference).'),
  rules: z.array(FileRule).max(FILE_RULES_MAX).default([]).describe('Its rules.'),
  schedules: z.array(FileSchedule).max(FILE_SCHEDULES_MAX).default([]).describe('Its schedules.'),
  leftOut: z.array(z.string().max(300)).max(100).default([]).describe('What could not be written into the file, each in a sentence.'),
});
export type ProjectFile = z.infer<typeof ProjectFile>;

const KNOWN = ['aubergine', 'format', 'template', 'description', 'name', 'color', 'labels', 'places', 'canvases', 'workflows', 'elements', 'rules', 'schedules', 'leftOut'];
/** The fields of a file that this version does not know: kept when it is read in, and written out again. */
export const unknownFields = (file: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(file).filter(([key]) => !KNOWN.includes(key)));

export type ReadProjectFile = { ok: true; file: ProjectFile } | { ok: false; problem: string };

/**
 * Reads the text of a file. Everything that is wrong with it is a sentence, and a file that is wrong in any way is
 * not read in part: nothing of it is used.
 */
export function readProjectFile(text: string): ReadProjectFile {
  const no = (problem: string): ReadProjectFile => ({ ok: false, problem });
  if (text.length > PROJECT_FILE_MAX_CHARS) return no(`This file is larger than a project file may be (${PROJECT_FILE_MAX_CHARS} characters).`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return no('This is not a project file: it is not JSON.');
  }
  if (raw === null || typeof raw !== 'object' || (raw as { aubergine?: unknown }).aubergine !== 'project') return no('This is not an Aubergine project file.');
  const format = (raw as { format?: unknown }).format;
  if (typeof format === 'number' && format > PROJECT_FILE_FORMAT) return no(`This file is in format ${format}, and this version reads format ${PROJECT_FILE_FORMAT}. Update Aubergine to read it.`);
  const parsed = ProjectFile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return no(`This project file cannot be read: at ${issue?.path.join('.') || 'the top'}, ${issue?.message ?? 'something is wrong'}.`);
  }
  const file = parsed.data;
  // Every reference names one thing, and everything that is named is in the file.
  const terminals = file.canvases.flatMap((canvas) => canvas.nodes.map((node) => node.terminal));
  if (terminals.length > FILE_TERMINALS_MAX) return no(`This file has ${terminals.length} terminals, and a project file may have ${FILE_TERMINALS_MAX}.`);
  const refs = [...file.canvases.map((c) => c.ref), ...terminals.map((t) => t.ref), ...file.workflows.map((w) => w.ref), ...file.elements.map((e) => e.ref)];
  const twice = refs.find((ref, index) => refs.indexOf(ref) !== index);
  if (twice !== undefined) return no(`Two things in this file have the reference ${twice}.`);
  const places = file.places.map((place) => place.name);
  if (new Set(places).size !== places.length) return no('Two places in this file have one name.');
  const has = (list: readonly { ref: string }[], ref: string): boolean => list.some((thing) => thing.ref === ref);
  for (const terminal of terminals) if (terminal.place !== null && !places.includes(terminal.place)) return no(`The terminal “${terminal.name}” starts in a place, “${terminal.place}”, that the file does not list.`);
  const onProblem = (on: z.infer<typeof OnWhat>, what: string): string | null => ('terminal' in on ? (has(terminals, on.terminal) ? null : `${what} names a terminal that is not in the file.`) : has(file.canvases, on.canvas) ? null : `${what} names a canvas that is not in the file.`);
  for (const rule of file.rules) {
    if (rule.action.kind !== 'run-element') continue;
    if (!has(file.elements, rule.action.element)) return no('A rule runs a step that is not in the file.');
    const problem = onProblem(rule.action.on, 'A rule');
    if (problem) return no(problem);
  }
  for (const schedule of file.schedules) {
    if ('element' in schedule.what ? !has(file.elements, schedule.what.element) : !has(file.workflows, schedule.what.workflow)) return no(`The schedule “${schedule.name}” runs something that is not in the file.`);
    const problem = onProblem(schedule.where, `The schedule “${schedule.name}”`);
    if (problem) return no(problem);
  }
  return { ok: true, file };
}

/* ---------- Over the wire ---------- */

/** What a file holds, as the owner reads it before anything is made. */
export const ProjectFileReading = z.object({
  digest: z.string().describe('Names exactly this text. Reading it in names it again: a text that changed since is not read in.'),
  template: z.boolean(),
  name: z.string(),
  description: z.string(),
  nameTaken: z.boolean().describe('True when a project here already has that name: another must be chosen.'),
  places: z.array(z.object({ name: z.string(), hint: z.string(), default: z.boolean(), terminals: z.number().int() })),
  counts: z.object({ canvases: z.number().int(), terminals: z.number().int(), agents: z.number().int(), frames: z.number().int(), notes: z.number().int(), workflows: z.number().int(), elements: z.number().int(), rules: z.number().int(), schedules: z.number().int() }),
  says: z.array(z.string()).describe('What will be made and what will not be started, each in a sentence.'),
  agents: z.array(z.string()).describe('The terminals that were an agent’s, by name. Each is made as a plain shell.'),
  needs: z.array(z.object({ of: z.string(), needs: z.array(z.string()) })).describe('What its steps say they need, by step.'),
  texts: z.array(z.object({ title: z.string(), text: z.string() })).describe('Everything an agent would be told: every workflow, step, and the task of every schedule, in full.'),
  shared: z.array(z.string()).describe('The workflows and steps that were shared with every project where the file was written, by name.'),
  sharedDefault: z.enum(['shared', 'project']).describe('What they become here unless the owner says otherwise.'),
  leftOut: z.array(z.string()),
});
export type ProjectFileReading = z.infer<typeof ProjectFileReading>;

export const ReadProjectFileRequest = z.object({ text: z.string().max(PROJECT_FILE_MAX_CHARS + 1000).describe('The text of the file.') });
export const ImportProjectFileRequest = z.object({
  text: z.string().max(PROJECT_FILE_MAX_CHARS + 1000),
  digest: z.string().max(200).describe('The digest of the text that was read and shown. A text that is not exactly that one is refused.'),
  name: Project.shape.name.optional().describe('The name of the new project. Left out: the name in the file.'),
  places: z.record(z.string(), z.string().startsWith('/').max(4096).nullable()).default({}).describe('Where each place is on this computer: a folder that exists, or null to leave it unset.'),
  shared: z.enum(['shared', 'project']).optional().describe("What the file's shared workflows and steps become: shared with every project here, or the new project's own."),
  start: z.boolean().default(false).describe('Start a fresh shell in each terminal. Off: each is made as a terminal whose shell has not started, with a button to start it. An agent is never started.'),
});
export type ImportProjectFileRequest = z.infer<typeof ImportProjectFileRequest>;
export const ImportedProject = z.object({ project: ProjectRow, says: z.string(), started: z.number().int() });
export type ImportedProject = z.infer<typeof ImportedProject>;

export const ExportProjectQuery = z.object({
  template: z.enum(['true', 'false']).optional().describe('`true`: write it as a template, without pinned notes unless `notes` is true.'),
  notes: z.enum(['true', 'false']).optional(),
  description: z.string().max(1000).optional(),
});
export const ExportedProject = z.object({ text: z.string().describe('The file, as text.'), digest: z.string(), fileName: z.string(), leftOut: z.array(z.string()) });
export type ExportedProject = z.infer<typeof ExportedProject>;

export const ProjectTemplate = z.object({ id: z.string(), name: z.string(), description: z.string(), from: z.enum(['app', 'yours']), canvases: z.number().int(), terminals: z.number().int() });
export type ProjectTemplate = z.infer<typeof ProjectTemplate>;
export const ProjectTemplates = z.object({ templates: z.array(ProjectTemplate) });
export const ProjectTemplateText = z.object({ text: z.string() });
export const SaveTemplateRequest = z.object({ notes: z.boolean().default(false).describe('Keep the pinned notes in the template.'), description: z.string().max(1000).optional() });
export const TemplateId = z.string().regex(/^(app|yours):[a-z0-9][a-z0-9-]{0,79}$/);

/* ---------- The format, as one place to read ---------- */

/** The format as a Markdown page. The tables are read from the descriptions in the schemas above, so that the page cannot say something else than they do. */
export function projectFileReferencePage(): string {
  const table = (shape: Record<string, { description?: string | undefined }>, fields: readonly string[]): string[] => ['| Field | What it is |', '|---|---|', ...fields.map((field) => `| \`${field}\` | ${(shape[field]?.description ?? '').replaceAll('|', '\\|')} |`)];
  return [
    '# A project as a file',
    '',
    'One side writes a project out, the other reads it in after reading what it holds. The file is a copy of the project at one moment. Nothing links the two afterwards: a change on one side does not reach the other. A template is the same file with `template` set.',
    '',
    'The file is JSON. It begins `{ "aubergine": "project", "format": 1, … }`.',
    '',
    '## What a file never holds',
    '',
    '- Anything that ran: tasks, what was written on the owner\'s list, runs and their notes, the log of notes (only the pinned note is in the file), messages.',
    '- Any credential or setting: no token, nothing from the settings file.',
    '- Anything of the computer it was written on: no path, no user name, no data folder, no working copy, no ID. Folders are written as named places, and things inside the file point at each other by references of the file\'s own (`c1`, `t3`, `e2`). Reading a file in makes new IDs.',
    '- What a terminal showed or did: no screen, no scroll-back, no history, no conversation, no command line.',
    '',
    '## Reading a file in',
    '',
    '- Nothing is made until the owner has read what the file holds and accepted exactly that text.',
    '- Where each place is on this computer is asked, or left unset. No path from a file is ever used as a path. A terminal with no place starts in the home folder.',
    '- No shell is started unless the owner asks for it, and an agent never is: a terminal that was an agent\'s is made as a plain shell and says which agent it was meant for.',
    '- Schedules and rules arrive switched off. Tasks start only when the owner starts them.',
    '- A file that is wrong in any way is refused with a sentence, and nothing of it is used.',
    '',
    '## The file',
    '',
    ...table(ProjectFile.shape, ['aubergine', 'format', 'template', 'description', 'name', 'color', 'labels', 'places', 'canvases', 'workflows', 'elements', 'rules', 'schedules', 'leftOut']),
    '',
    'Fields this version does not know are kept when a file is read in, and written out again when that project is written to a file.',
    '',
    '## A place',
    '',
    ...table(FilePlace.shape, ['name', 'hint', 'default']),
    '',
    '## A canvas',
    '',
    ...table(FileCanvas.shape, ['ref', 'name', 'color', 'labels', 'frames', 'nodes']),
    '',
    '## A terminal, on a node',
    '',
    ...table(FileTerminal.shape, ['ref', 'name', 'tags', 'note', 'place', 'subfolder', 'agent', 'environment']),
    '',
    '## A rule',
    '',
    ...table(FileRule.shape, ['event', 'action']),
    '',
    '## A schedule',
    '',
    ...table(FileSchedule.shape, ['name', 'time', 'days', 'what', 'where', 'task']),
    '',
    '## Bounds',
    '',
    `A file is at most ${PROJECT_FILE_MAX_CHARS} characters. It may hold ${FILE_CANVASES_MAX} canvases, ${FILE_NODES_MAX} nodes and ${FILE_FRAMES_MAX} frames on a canvas, ${FILE_TERMINALS_MAX} terminals in all, ${FILE_PLACES_MAX} places, ${FILE_WORKFLOWS_MAX} workflows, ${FILE_ELEMENTS_MAX} steps, ${FILE_RULES_MAX} rules and ${FILE_SCHEDULES_MAX} schedules.`,
  ].join('\n');
}
