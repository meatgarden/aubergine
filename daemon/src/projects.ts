import {
  FIRST_CANVAS_NAME,
  LOCAL_HOME,
  PROJECTS_MAX,
  forYou,
  isLocalHome,
  newCanvas,
  newId,
  openProjects,
  projectById,
  sortedProjects,
  type AddProjectRequest,
  type AppState,
  type ArchiveProjectRequest,
  type ChangeProjectRequest,
  type Project,
  type ProjectRow,
  type SharedThing,
  type SharingDefault,
  type SharingPage,
} from '@aubergine/shared';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';

/**
 * Projects: several in the one server, each with its own canvases,
 * terminals, queue, schedules and rules. Making one, changing it, moving a
 * canvas into it, archiving, reopening and removing are the owner's alone.
 *
 * A project made here is this server's own (`home`), and that is set here
 * and nowhere else.
 */
export class Projects {
  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
  ) {}

  private get state(): AppState {
    return this.hub.state;
  }

  private find(projectId: string): Project {
    const project = projectById(this.state, projectId);
    if (!project) throw new NotFoundError(`No project ${projectId}`);
    return project;
  }

  row(project: Project): ProjectRow {
    const state = this.state;
    return {
      ...project,
      canvases: state.canvases.filter((canvas) => canvas.projectId === project.id).length,
      sessions: state.sessions.filter((session) => session.projectId === project.id && session.state !== 'exited').length,
      // The same function the owner's list is made by, asked about this one project.
      waiting: project.state === 'open' ? forYou(state, Date.now(), [], project.id).items.length : 0,
    };
  }

  /** The projects in their order, open ones and archived ones. `reaches`: which of them the caller may see. */
  list(reaches: (projectId: string) => boolean = () => true): ProjectRow[] {
    return sortedProjects(this.state)
      .filter((project) => reaches(project.id))
      .map((project) => this.row(project));
  }

  get(projectId: string): ProjectRow {
    return this.row(this.find(projectId));
  }

  /** The folders of a project as they are kept: each once, and the default among them. */
  private folders(folders: readonly string[], defaultFolder: string | null): string[] {
    return [...new Set([...folders, ...(defaultFolder !== null ? [defaultFolder] : [])])];
  }

  /** A new project, with one empty canvas: a project always has a canvas to look at. */
  add(body: AddProjectRequest): ProjectRow {
    if (this.state.projects.length >= PROJECTS_MAX) throw new ConflictError(`There are ${PROJECTS_MAX} projects; remove one first.`);
    if (this.state.projects.some((project) => project.name.toLowerCase() === body.name.toLowerCase())) throw new ConflictError(`There is already a project named “${body.name}”.`);
    const now = new Date();
    const defaultFolder = body.defaultFolder ?? null;
    const project: Project = {
      id: newId(),
      workspaceId: this.state.workspace.id,
      name: body.name,
      color: body.color ?? 'none',
      order: Math.max(0, ...this.state.projects.map((p) => p.order)) + 1,
      labels: {},
      folders: this.folders(body.folders ?? [], defaultFolder),
      defaultFolder,
      // Made here: this server's own. No caller says otherwise.
      home: LOCAL_HOME,
      state: 'open',
      createdAt: now.toISOString(),
    };
    this.hub.emit({ type: 'project.changed', project });
    const last = Math.max(0, ...this.state.canvases.map((canvas) => canvas.order));
    this.hub.emit({ type: 'canvas.created', canvas: newCanvas(project.id, body.canvasName ?? FIRST_CANVAS_NAME, last + 1, now) });
    return this.row(project);
  }

  /** What is not sent stays as it was. */
  change(projectId: string, body: ChangeProjectRequest): ProjectRow {
    const project = this.find(projectId);
    if (!isLocalHome(project)) throw new ConflictError('This project is not kept on this server: it cannot be changed here.');
    if (body.name !== undefined && this.state.projects.some((p) => p.id !== projectId && p.name.toLowerCase() === body.name?.toLowerCase())) throw new ConflictError(`There is already a project named “${body.name}”.`);
    const defaultFolder = body.defaultFolder !== undefined ? body.defaultFolder : project.defaultFolder;
    const folders = this.folders(body.folders ?? project.folders, defaultFolder);
    let order = project.order;
    if (body.before !== undefined) {
      const others = sortedProjects(this.state).filter((p) => p.id !== projectId);
      if (body.before === null) order = Math.max(0, ...others.map((p) => p.order)) + 1;
      else {
        const index = others.findIndex((p) => p.id === body.before);
        if (index < 0) throw new NotFoundError(`No project ${body.before}`);
        const after = others[index] as Project;
        const previous = others[index - 1];
        order = previous ? (previous.order + after.order) / 2 : after.order - 1;
      }
    }
    // Its themes: each kind that is sent replaces what was there (null: the page's own); one left out stays.
    const themes = body.themes === undefined ? project.themes : { light: body.themes.light !== undefined ? body.themes.light : (project.themes?.light ?? null), dark: body.themes.dark !== undefined ? body.themes.dark : (project.themes?.dark ?? null) };
    const next: Project = {
      ...project,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.labels !== undefined ? { labels: body.labels } : {}),
      ...(themes !== undefined ? { themes } : {}),
      folders,
      defaultFolder,
      order,
    };
    this.hub.emit({ type: 'project.changed', project: next });
    return this.row(next);
  }

  /**
   * A canvas moves to another project. Its terminals go with it, with their runs and what they work in, and so do
   * the tasks that wait for one of its terminals or are at work on one. Nothing else moves: a task for any free
   * agent stays where it was, and so do rules and schedules.
   */
  moveCanvas(canvasId: string, projectId: string): ProjectRow {
    const canvas = this.sessions.getCanvas(canvasId);
    const target = this.find(projectId);
    if (target.state !== 'open') throw new ConflictError('That project is archived. Reopen it first.');
    if (canvas.projectId === projectId) return this.row(target);
    if (this.state.canvases.filter((c) => c.projectId === canvas.projectId).length === 1) throw new ConflictError('This is the last canvas of its project, and a project keeps one. Make another canvas there first, or archive the project.');
    this.hub.emit({ type: 'canvas.project', canvasId, projectId });
    return this.row(target);
  }

  /**
   * Archives a project: it leaves the switcher and starts nothing. Refused while it has terminals that are running,
   * unless the owner says what becomes of them, in the words closing a canvas uses: park them, or end them.
   */
  async archive(projectId: string, body: ArchiveProjectRequest): Promise<ProjectRow> {
    const project = this.find(projectId);
    if (project.state === 'archived') return this.row(project);
    if (openProjects(this.state).length === 1) throw new ConflictError('The last open project cannot be archived.');
    const running = this.state.sessions.filter((session) => session.projectId === projectId && session.state === 'open');
    const parked = this.state.sessions.filter((session) => session.projectId === projectId && session.state === 'parked');
    if (running.length > 0 && body.sessions === undefined) throw new ConflictError('This project still has sessions: say whether to park them or end them');
    if (body.sessions === 'park') for (const session of running) this.sessions.park(session.id);
    if (body.sessions === 'end') for (const session of [...running, ...parked]) await this.sessions.close(session.id);
    const next: Project = { ...this.find(projectId), state: 'archived' };
    this.hub.emit({ type: 'project.changed', project: next });
    return this.row(next);
  }

  /** Back in the switcher. A schedule's time that passed while it was archived is not its own: it first runs at its next time. */
  reopen(projectId: string): ProjectRow {
    const project = this.find(projectId);
    if (project.state === 'open') return this.row(project);
    const at = new Date().toISOString();
    for (const schedule of this.state.schedules.items.filter((s) => s.projectId === projectId)) this.hub.emit({ type: 'schedule.changed', schedule: { ...schedule, since: at, updatedAt: at } });
    const next: Project = { ...project, state: 'open' };
    this.hub.emit({ type: 'project.changed', project: next });
    return this.row(next);
  }

  /** What a project still holds, in words; empty when it holds nothing. */
  private holds(projectId: string): string[] {
    const state = this.state;
    const count = (n: number, one: string, many: string): string[] => (n === 0 ? [] : [`${n} ${n === 1 ? one : many}`]);
    return [
      ...count(state.sessions.filter((s) => s.projectId === projectId).length, 'terminal', 'terminals'),
      ...count(state.queue.tasks.filter((t) => t.projectId === projectId).length, 'task', 'tasks'),
      ...count(state.queue.asks.filter((a) => a.projectId === projectId).length, 'thing written on its list', 'things written on its list'),
      ...count(state.queue.rules.filter((r) => r.projectId === projectId).length, 'rule', 'rules'),
      ...count(state.schedules.items.filter((s) => s.projectId === projectId).length, 'schedule', 'schedules'),
      ...count(state.environments.filter((e) => e.projectId === projectId).length, 'working copy', 'working copies'),
      ...count(state.runs.filter((r) => r.projectId === projectId).length, 'run that is going', 'runs that are going'),
      ...count(sharedKinds().reduce((n, kind) => n + kind.things(state).filter((thing) => thing.projectId === projectId).length, 0), 'thing that is its own on the sharing page', 'things that are its own on the sharing page'),
    ];
  }

  /** Removes a project for good. Only an archived one, and only when it holds nothing: its empty canvases go with it. */
  remove(projectId: string): void {
    const project = this.find(projectId);
    if (project.state !== 'archived') throw new ConflictError('Archive the project first: only an archived project is removed.');
    if (this.state.projects.length === 1) throw new ConflictError('The last project cannot be removed.');
    const holds = this.holds(projectId);
    if (holds.length > 0) throw new ConflictError(`This project is not empty: it still has ${holds.join(', ')}. Remove or move them first.`);
    for (const canvas of this.state.canvases.filter((c) => c.projectId === projectId)) this.hub.emit({ type: 'canvas.removed', canvasId: canvas.id });
    this.hub.emit({ type: 'project.removed', projectId });
  }

  /* ---------- What is shared ---------- */

  /** The sharing page: for each kind that can be shared, what a new one is, and where each existing one belongs. */
  sharing(): SharingPage {
    const state = this.state;
    return {
      kinds: sharedKinds().map((kind) => ({ kind: kind.kind, title: kind.title, says: kind.says, default: state.sharing[kind.kind] ?? 'shared', things: kind.things(state).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) })),
      perServer: 'Settings are for the whole server, not a project: the settings file, the keys, the limits and the terminal application.',
    };
  }

  setDefault(kindName: string, value: SharingDefault): SharingPage {
    if (!sharedKind(kindName)) throw new BadInputError(`What can be shared is one of: ${sharedKinds().map((kind) => kind.kind).join(', ')}.`);
    this.hub.emit({ type: 'sharing.default', kind: kindName, default: value });
    return this.sharing();
  }

  /** One thing now belongs to a project, or to all. A run that is going is not touched by this: it keeps going. */
  moveThing(kindName: string, id: string, projectId: string | null): SharingPage {
    const kind = sharedKind(kindName);
    if (!kind) throw new BadInputError(`What can be shared is one of: ${sharedKinds().map((k) => k.kind).join(', ')}.`);
    if (projectId !== null) this.find(projectId);
    if (!kind.things(this.state).some((thing) => thing.id === id)) throw new NotFoundError(`No ${kind.title.toLowerCase()} with the ID ${id}`);
    kind.move(id, projectId, this.hub);
    return this.sharing();
  }
}

/* ---------- Kinds of thing that are shared or owned ---------- */

/**
 * A kind of thing that is shared with every project or belongs to one. Registered, so that the sharing page knows no
 * kind by name: a kind added later appears there by its registration.
 */
export interface SharedKind {
  kind: string;
  title: string;
  /** What the kind is, in a sentence, for the page. */
  says: string;
  things(state: AppState): SharedThing[];
  /** Makes one thing belong to a project, or to all (null). Through a change event, like every change. */
  move(id: string, projectId: string | null, hub: StateHub): void;
}
const kinds = new Map<string, SharedKind>();
export function registerSharedKind(kind: SharedKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterSharedKind(kind: string): void {
  kinds.delete(kind);
}
export const sharedKind = (kind: string): SharedKind | undefined => kinds.get(kind);
export const sharedKinds = (): SharedKind[] => [...kinds.values()];

registerSharedKind({
  kind: 'workflow',
  title: 'Workflows',
  says: 'A shared workflow can be run in any project. One kept to a project is listed and run only there. Moving a workflow does not stop its runs.',
  things: (state) => state.workflows.filter((workflow) => workflow.listed).map((workflow) => ({ id: workflow.id, name: workflow.name, projectId: workflow.projectId })),
  move: (id, projectId, hub) => {
    const workflow = hub.state.workflows.find((w) => w.id === id);
    if (workflow) hub.emit({ type: 'workflow.changed', workflow: { ...workflow, projectId } });
  },
});
registerSharedKind({
  kind: 'element',
  title: 'Saved steps',
  says: 'A shared step is among every project’s saved steps. When a step is kept to one project, a schedule or a rule of another project that ran it stops, and says so once on your list.',
  things: (state) => state.shelf.map((item) => ({ id: item.id, name: item.element.name, projectId: item.projectId })),
  move: (id, projectId, hub) => hub.emit({ type: 'sharing.moved', kind: 'element', id, projectId }),
});
registerSharedKind({
  kind: 'source',
  title: 'Library sources',
  says: 'Where workflows and steps are read from. A shared source is in every project’s library.',
  things: (state) => state.library.sources.map((source) => ({ id: source.id, name: source.name || source.claims || source.address || source.kind, projectId: source.projectId })),
  move: (id, projectId, hub) => hub.emit({ type: 'sharing.moved', kind: 'source', id, projectId }),
});
registerSharedKind({
  kind: 'installed',
  title: 'Installed from the library',
  says: 'What was installed from a source, and where it came from. Moving one does not move the workflow or the step it became: move those in their own lists above.',
  things: (state) => state.library.installed.map((item) => ({ id: item.id, name: item.name, projectId: item.projectId })),
  move: (id, projectId, hub) => hub.emit({ type: 'sharing.moved', kind: 'installed', id, projectId }),
});
registerSharedKind({
  kind: 'token',
  title: 'API tokens',
  says: 'Where a token is listed, not what it may reach. The projects a token reaches are chosen when it is made and cannot be widened afterwards.',
  things: (state) => state.tokens.filter((token) => token.revokedAt === null || token.revokedAt === undefined).map((token) => ({ id: token.id, name: token.name, projectId: token.projectId })),
  move: (id, projectId, hub) => hub.emit({ type: 'sharing.moved', kind: 'token', id, projectId }),
});
