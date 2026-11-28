import { z } from 'zod';
import { CanvasName, NodeColor, PROJECT_FOLDERS_MAX, Project, type AppState, type Canvas, type Session } from './entities';
import { Id } from './ids';
import { ThemeId } from './themes';

/**
 * Projects: what belongs to one, and what is shared.
 *
 * A canvas belongs to a project, and through it its terminals, their runs
 * and what they work in. Tasks, what is asked of the owner, rules and
 * schedules each carry their project. Workflows, shelf elements, library
 * sources and installed items, and API tokens are shared with every project
 * (`projectId: null`) or belong to one: `visibleIn` is the one function that
 * says whether a project may see such a thing.
 */

/** `null` where a project is asked for means every project. */
export type ProjectScope = string | null;

/**
 * Whether a project may see a thing that is shared or owned: shared with every project, or its own. Asked for every
 * listing and every use of a workflow, a shelf element, a library source, an installed item and a token.
 * A scope of every project (`null`) sees everything.
 */
export function visibleIn(thing: { projectId?: string | null | undefined }, projectId: ProjectScope): boolean {
  return thing.projectId === null || thing.projectId === undefined || projectId === null || thing.projectId === projectId;
}

/** Whether a thing that belongs to exactly one project is of the project asked for. A scope of every project takes all. */
export const ofProject = (thing: { projectId?: string | undefined }, projectId: ProjectScope): boolean => projectId === null || thing.projectId === projectId;

/** Projects in their order. */
export function sortedProjects(state: Pick<AppState, 'projects'>): Project[] {
  return [...state.projects].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
/** Projects that are open, in their order. An archived project is in no switcher and starts nothing. */
export const openProjects = (state: Pick<AppState, 'projects'>): Project[] => sortedProjects(state).filter((project) => project.state === 'open');
/** The project that is meant where none is named: the first open one. */
export const firstProject = (state: Pick<AppState, 'projects'>): Project => openProjects(state)[0] ?? (sortedProjects(state)[0] as Project);
export const projectById = (state: Pick<AppState, 'projects'>, projectId: string | null | undefined): Project | undefined => state.projects.find((project) => project.id === projectId);
/** A project's name, for a row that names its project. */
export const projectName = (state: Pick<AppState, 'projects'>, projectId: string | null | undefined): string => (projectId === null || projectId === undefined ? 'every project' : (projectById(state, projectId)?.name ?? 'a project that is gone'));
/** Whether something may be started in a project: it is there and open. */
export const isOpenProject = (state: Pick<AppState, 'projects'>, projectId: string | null | undefined): boolean => projectById(state, projectId)?.state === 'open';

/** The canvases of a project, in tab order. */
export function canvasesOf(state: Pick<AppState, 'canvases'>, projectId: ProjectScope): Canvas[] {
  return state.canvases.filter((canvas) => ofProject(canvas, projectId)).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
/** The project of a session, or undefined when the session is not there. */
export const projectOfSession = (state: Pick<AppState, 'sessions'>, sessionId: string | null | undefined): string | undefined => (sessionId ? state.sessions.find((session) => session.id === sessionId)?.projectId : undefined);
/** The project of a run: its session's while that is there, else the one it was started in. */
export const projectOfRun = (state: Pick<AppState, 'sessions'>, run: { sessionId: string | null; projectId?: string | undefined }): string | undefined => projectOfSession(state, run.sessionId) ?? run.projectId;
export const sessionsOf = (state: Pick<AppState, 'sessions'>, projectId: ProjectScope): Session[] => state.sessions.filter((session) => ofProject(session, projectId));

/** The state as one project sees it: its own canvases, terminals, runs, tasks, schedules and working copies, and what is shared with it. For the pure functions that are asked about one project. */
export function stateOf(state: AppState, projectId: ProjectScope): AppState {
  if (projectId === null) return state;
  const mine = <T extends { projectId?: string | undefined }>(things: readonly T[]): T[] => things.filter((thing) => thing.projectId === projectId);
  const sessions = mine(state.sessions);
  const ids = new Set(sessions.map((session) => session.id));
  return {
    ...state,
    sessions,
    canvases: mine(state.canvases),
    runs: state.runs.filter((run) => (run.sessionId !== null && ids.has(run.sessionId)) || (run.sessionId === null && run.projectId === projectId) || (run.sessionId !== null && !state.sessions.some((s) => s.id === run.sessionId) && run.projectId === projectId)),
    drafts: state.drafts.filter((draft) => draft.sessionId === null || draft.sessionId === undefined || ids.has(draft.sessionId) || !state.sessions.some((s) => s.id === draft.sessionId)),
    workflows: state.workflows.filter((workflow) => visibleIn(workflow, projectId)),
    shelf: state.shelf.filter((item) => visibleIn(item, projectId)),
    library: { ...state.library, sources: state.library.sources.filter((source) => visibleIn(source, projectId)), installed: state.library.installed.filter((item) => visibleIn(item, projectId)) },
    environments: mine(state.environments),
    queue: { ...state.queue, tasks: mine(state.queue.tasks), asks: mine(state.queue.asks), rules: mine(state.queue.rules) },
    schedules: { ...state.schedules, items: mine(state.schedules.items) },
  };
}

/* ---------- Over the wire ---------- */

const Folder = z.string().startsWith('/').max(4096);
const ProjectName = Project.shape.name;

/** Body of making a project. */
export const AddProjectRequest = z.object({
  name: ProjectName.describe('What it is called.'),
  color: NodeColor.optional().describe('A named color, or `#rrggbb`.'),
  folders: z.array(Folder).max(PROJECT_FOLDERS_MAX).optional().describe('The folders its work is in.'),
  defaultFolder: Folder.nullable().optional().describe('Where a new terminal starts when it names no folder. It is added to the folders when it is not among them.'),
  canvasName: CanvasName.optional().describe('The name of its first canvas. Left out: Main.'),
});
export type AddProjectRequest = z.infer<typeof AddProjectRequest>;

/** Body of changing a project. What is left out stays as it was. */
export const ChangeProjectRequest = z.object({
  name: ProjectName.optional(),
  color: NodeColor.optional(),
  folders: z.array(Folder).max(PROJECT_FOLDERS_MAX).optional(),
  defaultFolder: Folder.nullable().optional(),
  labels: Project.shape.labels.unwrap().optional(),
  themes: z
    .object({
      light: ThemeId.nullable().optional().describe('The theme of the light page while this project is looked at: a light one, built-in or a theme file the server has read (another is refused with 400). Null: the page’s own. Left out: as it was.'),
      dark: ThemeId.nullable().optional().describe('The theme of the dark page while this project is looked at: a dark one, built-in or a theme file the server has read (another is refused with 400). Null: the page’s own. Left out: as it was.'),
    })
    .optional()
    .describe('The color themes the page is drawn in while this project is looked at. Each that is left out stays as it was.'),
  before: Id.nullable().optional().describe('Put it before this project in the order; null puts it last.'),
});
export type ChangeProjectRequest = z.infer<typeof ChangeProjectRequest>;

/** A project as it is listed: with how many canvases and terminals it has and how many things wait on the owner in it. */
export const ProjectRow = Project.extend({
  canvases: z.number().int(),
  sessions: z.number().int().describe('Its terminals whose shell is running.'),
  waiting: z.number().int().describe('How many things wait on the owner in it.'),
});
export type ProjectRow = z.infer<typeof ProjectRow>;

/** Body of archiving a project. What becomes of its terminals that are still running is said here; without it, a project with running terminals is not archived. */
export const ArchiveProjectRequest = z.object({ sessions: z.enum(['park', 'end']).optional().describe('`park`: its terminals leave their canvases and keep running. `end`: their shells are ended for good.') });
export type ArchiveProjectRequest = z.infer<typeof ArchiveProjectRequest>;

export const MoveCanvasToProjectRequest = z.object({ projectId: Id.describe('The project it moves to.') });
export type MoveCanvasToProjectRequest = z.infer<typeof MoveCanvasToProjectRequest>;

/** One thing of a kind that is shared or owned, as the sharing page lists it. */
export const SharedThing = z.object({ id: z.string(), name: z.string(), projectId: Id.nullable().describe('Null: shared with every project.') });
export type SharedThing = z.infer<typeof SharedThing>;
export const SharingDefault = z.enum(['shared', 'project']);
export type SharingDefault = z.infer<typeof SharingDefault>;
export const SharingPage = z.object({
  kinds: z.array(z.object({ kind: z.string(), title: z.string(), says: z.string().describe('What the kind is, in a sentence.'), default: SharingDefault.describe('What a new thing of this kind is: shared with every project, or of the project it is made in.'), things: z.array(SharedThing) })),
  perServer: z.string().describe('What is neither shared nor owned because there is one of it for the whole server.'),
});
export type SharingPage = z.infer<typeof SharingPage>;
export const ChangeSharingRequest = z.object({ kind: z.string().max(40), default: SharingDefault });
export type ChangeSharingRequest = z.infer<typeof ChangeSharingRequest>;
export const MoveSharedThingRequest = z.object({ kind: z.string().max(40), id: z.string().max(200), projectId: Id.nullable().describe('The project it belongs to from now on. Null: shared with every project.') });
export type MoveSharedThingRequest = z.infer<typeof MoveSharedThingRequest>;
