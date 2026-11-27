import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LOCAL_HOME,
  LOCAL_HOST,
  NO_ATTENTION,
  NO_STATUS,
  PROJECTS_MAX,
  PROJECT_FILE_FORMAT,
  RULES_MAX,
  SCHEDULES_MAX,
  TemplateId,
  exportWorkflow,
  importWorkflow,
  isLocalHome,
  newCanvas,
  newId,
  projectById,
  readProjectFile,
  reviewText,
  unknownFields,
  type AppState,
  type ExportedProject,
  type FileCanvas,
  type FileRule,
  type FileSchedule,
  type ImportProjectFileRequest,
  type ImportedProject,
  type Project,
  type ProjectFile,
  type ProjectFileReading,
  type ProjectTemplate,
  type Session,
} from '@aubergine/shared';
import type { Drafts } from './drafts';
import { inProject } from './project-context';
import type { Projects } from './projects';
import type { Queue } from './queue';
import { actionKind } from './rules';
import type { Schedules } from './schedules';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { Workflows } from './workflows';

/**
 * A project as a file: writing one out, reading one in, and templates,
 * which are the same file.
 *
 * Writing out names nothing outside the project and nothing of this
 * computer: folders become named places, IDs become references of the
 * file's own. Reading in makes nothing until the owner has accepted exactly
 * the text that was shown (by its digest), and then makes everything in one
 * step that wholly happens or leaves nothing. It starts no shell unless the
 * owner asked, and never an agent. No path from a file is used as a path:
 * where a place is, is what the owner said here.
 */

export const digestOf = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const slug = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const isFolder = (candidate: string): boolean => {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
};

export interface ProjectFilesOptions {
  /** Where the owner's own templates are kept: `templates/` in the data folder. Null: this server keeps none. */
  templatesDir: string | null;
  /** The templates that come with the app: plain files in this copy's own folder. */
  appTemplatesDir: string | null;
}

export class ProjectFiles {
  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly workflows: Workflows,
    private readonly drafts: Drafts,
    private readonly queue: Queue,
    private readonly schedules: Schedules,
    private readonly projects: Projects,
    private readonly options: ProjectFilesOptions,
  ) {}

  private get state(): AppState {
    return this.hub.state;
  }

  /* ---------- Writing out ---------- */

  /** The file of a project, as it stands now. Nothing outside the project is named in it. */
  file(projectId: string, options: { template?: boolean; notes?: boolean; description?: string } = {}): { file: ProjectFile; leftOut: string[] } {
    const state = this.state;
    const project = projectById(state, projectId);
    if (!project) throw new NotFoundError(`No project ${projectId}`);
    // Its record must be this server's to write out: of a project kept elsewhere this server holds a copy, not the thing.
    if (!isLocalHome(project)) throw new ConflictError('This project is not kept on this server: it cannot be written to a file here.');
    const leftOut: string[] = [];
    const template = options.template === true;
    const keepNotes = !template || options.notes === true;

    // Folders become named places. The path stays here; only its last part goes along, as a hint.
    const taken = new Set<string>();
    const places = project.folders.map((folder) => {
      const isDefault = folder === project.defaultFolder;
      let name = isDefault ? 'main' : slug(path.basename(folder)) || 'folder';
      for (let n = 2; taken.has(name); n += 1) name = `${(isDefault ? 'main' : slug(path.basename(folder)) || 'folder').slice(0, 36)}-${n}`;
      taken.add(name);
      return { name, hint: path.basename(folder).replace(/[\p{Cc}/\\]/gu, '').slice(0, 120), default: isDefault, folder };
    });
    const placeOf = (cwd: string | null): { place: string | null; subfolder: string } => {
      if (cwd === null) return { place: null, subfolder: '' };
      const within = places.filter((place) => cwd === place.folder || cwd.startsWith(`${place.folder}${path.sep}`)).sort((a, b) => b.folder.length - a.folder.length)[0];
      // A terminal that worked outside every folder of the project: where it was is not written.
      return within ? { place: within.name, subfolder: path.relative(within.folder, cwd).split(path.sep).join('/') } : { place: null, subfolder: '' };
    };

    let count = 0;
    const ref = (letter: string): string => `${letter}${(count += 1)}`;
    const terminalRefs = new Map<string, string>();
    const canvasRefs = new Map<string, string>();
    const canvases: FileCanvas[] = state.canvases
      .filter((canvas) => canvas.projectId === projectId)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
      .map((canvas) => {
        const canvasRef = ref('c');
        canvasRefs.set(canvas.id, canvasRef);
        return {
          ref: canvasRef,
          name: canvas.name,
          color: canvas.color,
          labels: canvas.labels,
          frames: canvas.layout.frames.map(({ id: _id, ...frame }) => frame),
          nodes: canvas.layout.nodes.flatMap((node) => {
            const session = state.sessions.find((s) => s.id === node.sessionId);
            if (!session) return [];
            const terminalRef = ref('t');
            terminalRefs.set(session.id, terminalRef);
            const environment = state.environments.find((e) => e.sessionId === session.id);
            // A terminal in a working copy worked on the project's folder: that is its place, not the copy.
            const where = placeOf(environment ? environment.projectFolder : session.cwd);
            const { id: _id, sessionId: _sessionId, ...rect } = node;
            return [{ ...rect, terminal: { ref: terminalRef, name: session.name, tags: session.tags, note: keepNotes ? session.note.slice(0, 20_000).replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\t' ? c : '')) : '', ...where, agent: session.agent?.kind ?? session.meantFor?.agent ?? null, environment: environment?.kind ?? session.meantFor?.environment ?? null } as FileCanvas['nodes'][number]['terminal'] }];
          }),
        };
      });
    const parked = state.sessions.filter((s) => s.projectId === projectId && s.state === 'parked').length;
    if (parked > 0) leftOut.push(`${parked} parked ${parked === 1 ? 'terminal is' : 'terminals are'} on no canvas and not in the file.`);

    // What the project owns of the shared kinds, and the shared ones its rules and schedules run.
    const elementRefs = new Map<string, string>();
    const workflowRefs = new Map<string, string>();
    const elements: ProjectFile['elements'] = [];
    const workflows: ProjectFile['workflows'] = [];
    const needElement = (id: string): string | null => {
      const known = elementRefs.get(id);
      if (known) return known;
      const item = state.shelf.find((e) => e.id === id && (e.projectId === null || e.projectId === projectId));
      if (!item) return null;
      const made = ref('e');
      elementRefs.set(id, made);
      elements.push({ ref: made, shared: item.projectId === null, element: { ...item.element, source: null } });
      return made;
    };
    const needWorkflow = (id: string): string | null => {
      const known = workflowRefs.get(id);
      if (known) return known;
      const workflow = state.workflows.find((w) => w.id === id && w.listed && (w.projectId === null || w.projectId === projectId));
      if (!workflow) return null;
      const made = ref('w');
      workflowRefs.set(id, made);
      workflows.push({ ref: made, shared: workflow.projectId === null, file: exportWorkflow(workflow) as { aubergine: 'workflow' } });
      return made;
    };
    for (const item of state.shelf) if (item.projectId === projectId) needElement(item.id);
    for (const workflow of state.workflows) if (workflow.projectId === projectId && workflow.listed) needWorkflow(workflow.id);

    const on = (where: { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string }): { terminal: string } | { canvas: string } | null => {
      const found = where.kind === 'session' ? terminalRefs.get(where.sessionId) : canvasRefs.get(where.canvasId);
      return found === undefined ? null : where.kind === 'session' ? { terminal: found } : { canvas: found };
    };
    const rules: FileRule[] = [];
    for (const rule of state.queue.rules.filter((r) => r.projectId === projectId)) {
      if (rule.action.kind === 'notify') rules.push({ event: rule.event, action: { kind: 'notify' } });
      else {
        const action = rule.action as { elementId?: string; on?: { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string } };
        const element = typeof action.elementId === 'string' ? needElement(action.elementId) : null;
        const where = action.on ? on(action.on) : null;
        if (rule.action.kind === 'run-element' && element && where) rules.push({ event: rule.event, action: { kind: 'run-element', element, on: where } });
        else leftOut.push('A rule is not in the file: what it runs, or the terminal it runs on, could not be written.');
      }
    }
    const schedules: FileSchedule[] = [];
    for (const schedule of state.schedules.items.filter((s) => s.projectId === projectId)) {
      const what = schedule.what.kind === 'element' ? needElement(schedule.what.elementId) : needWorkflow(schedule.what.workflowId);
      const where = on(schedule.where);
      if (what && where) schedules.push({ name: schedule.name, time: schedule.time, days: schedule.days, what: schedule.what.kind === 'element' ? { element: what } : { workflow: what }, where, task: schedule.task });
      else leftOut.push(`The schedule “${schedule.name}” is not in the file: what it runs, or the terminal it runs on, could not be written.`);
    }

    const file: ProjectFile = {
      // What a file it was read from held that this version does not know goes out again as it came.
      ...(project.fileExtra ?? {}),
      aubergine: 'project',
      format: PROJECT_FILE_FORMAT,
      template,
      description: options.description ?? '',
      name: project.name,
      color: project.color as ProjectFile['color'],
      labels: project.labels,
      places: places.map(({ folder: _folder, ...place }) => place),
      canvases,
      workflows,
      elements,
      rules,
      schedules,
      leftOut,
    };
    return { file, leftOut };
  }

  export(projectId: string, options: { template?: boolean; notes?: boolean; description?: string } = {}): ExportedProject {
    const { file, leftOut } = this.file(projectId, options);
    const text = `${JSON.stringify(file, null, 2)}\n`;
    return { text, digest: digestOf(text), fileName: `${slug(file.name) || 'project'}.${options.template ? 'template' : 'project'}.json`, leftOut };
  }

  /* ---------- Reading in ---------- */

  /** What a file holds, for the owner to read before anything is made. Makes nothing. */
  read(text: string): ProjectFileReading {
    const read = readProjectFile(text);
    if (!read.ok) throw new BadInputError(read.problem);
    const file = read.file;
    const terminals = file.canvases.flatMap((canvas) => canvas.nodes.map((node) => node.terminal));
    const agents = terminals.filter((t) => t.agent !== null);
    const texts: ProjectFileReading['texts'] = [];
    const needs: ProjectFileReading['needs'] = [];
    for (const { file: workflowFile } of file.workflows) {
      const { content } = this.contentOf(workflowFile);
      texts.push({ title: `The workflow “${content.name}”`, text: reviewText({ workflow: content, element: null }) });
      for (const element of content.elements) if (element.needs.length > 0) needs.push({ of: `${content.name}: ${element.name}`, needs: element.needs.map((need) => `${need.kind}: ${need.name}`) });
    }
    for (const { element } of file.elements) {
      texts.push({ title: `The step “${element.name}”`, text: reviewText({ workflow: null, element }) });
      if (element.needs.length > 0) needs.push({ of: element.name, needs: element.needs.map((need) => `${need.kind}: ${need.name}`) });
    }
    for (const schedule of file.schedules) if (schedule.task.trim() !== '') texts.push({ title: `The task of the schedule “${schedule.name}”`, text: schedule.task });
    const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
    return {
      digest: digestOf(text),
      template: file.template,
      name: file.name,
      description: file.description,
      nameTaken: this.nameTaken(file.name),
      places: file.places.map((place) => ({ ...place, terminals: terminals.filter((t) => t.place === place.name).length })),
      counts: { canvases: file.canvases.length, terminals: terminals.length, agents: agents.length, frames: file.canvases.reduce((n, c) => n + c.frames.length, 0), notes: terminals.filter((t) => t.note.trim() !== '').length, workflows: file.workflows.length, elements: file.elements.length, rules: file.rules.length, schedules: file.schedules.length },
      says: [
        `This is a copy of a project as it was when the file was written. Nothing links it to where it came from.`,
        `It makes ${count(file.canvases.length, 'canvas', 'canvases')} and ${count(terminals.length, 'terminal', 'terminals')}. No shell is started unless you tick “Start the terminals”.`,
        ...(agents.length > 0 ? [`${count(agents.length, 'terminal was', 'terminals were')} an agent’s. Each is made as a plain shell and says which agent it was meant for: no agent is started.`] : []),
        ...(file.schedules.length > 0 ? [`${count(file.schedules.length, 'schedule arrives', 'schedules arrive')} switched off.`] : []),
        ...(file.rules.length > 0 ? [`${count(file.rules.length, 'rule arrives', 'rules arrive')} switched off.`] : []),
        'Tasks start only when you start them: automatic starting is off, and three may be at work at once.',
        ...(terminals.some((t) => t.place === null) ? ['A terminal with no place starts in your home folder.'] : []),
      ],
      agents: agents.map((t) => t.name),
      needs,
      texts,
      shared: [...file.workflows.filter((w) => w.shared).map((w) => this.contentOf(w.file).content.name), ...file.elements.filter((e) => e.shared).map((e) => e.element.name)],
      sharedDefault: this.state.sharing.workflow === 'project' || this.state.sharing.element === 'project' ? 'project' : 'shared',
      leftOut: file.leftOut,
    };
  }

  private nameTaken(name: string): boolean {
    return this.state.projects.some((project) => project.name.toLowerCase() === name.trim().toLowerCase());
  }

  private contentOf(workflowFile: unknown): ReturnType<typeof importWorkflow> {
    try {
      const read = importWorkflow(workflowFile);
      return { ...read, content: this.workflows.checked(read.content) };
    } catch (error) {
      throw new BadInputError(`A workflow in this file cannot be read: ${(error as Error).message}`);
    }
  }

  /**
   * Reads a file in. The digest names the text the owner read: another text is refused. Everything is made in one
   * step; if any of it cannot be made, nothing is. Shells are started afterwards, and only if the owner asked.
   */
  async import(body: ImportProjectFileRequest): Promise<ImportedProject> {
    if (digestOf(body.text) !== body.digest) throw new ConflictError('This is not the text that was read: read the file again before it is taken in. Nothing was made.');
    const read = readProjectFile(body.text);
    if (!read.ok) throw new BadInputError(read.problem);
    const file = read.file;
    const name = (body.name ?? file.name).trim();
    if (this.nameTaken(name)) throw new ConflictError(`There is already a project named “${name}”. Choose another name; nothing was made.`);
    if (this.state.projects.length >= PROJECTS_MAX) throw new ConflictError(`There are ${PROJECTS_MAX} projects; remove one first.`);
    // Where each place is, is what the owner said here. Nothing from the file is a path.
    const where = new Map<string, string | null>();
    for (const place of file.places) {
      const said = body.places[place.name] ?? null;
      if (said !== null && (!path.isAbsolute(said) || !isFolder(said))) throw new BadInputError(`“${said}” is not a folder on this computer. Say where the place “${place.name}” is, or leave it unset. Nothing was made.`);
      where.set(place.name, said === null ? null : path.resolve(said));
    }
    for (const given of Object.keys(body.places)) if (!where.has(given)) throw new BadInputError(`The file has no place named “${given}”. Nothing was made.`);
    const sharedHere = (body.shared ?? this.read(body.text).sharedDefault) === 'shared';
    const at = new Date();
    const now = at.toISOString();
    const projectId = newId();
    const made: Session[] = [];

    this.hub.atomically(() => {
      const folders = [...new Set([...where.values()].filter((folder): folder is string => folder !== null))];
      const defaultPlace = file.places.find((place) => place.default)?.name;
      const project: Project = {
        id: projectId,
        workspaceId: this.state.workspace.id,
        name,
        color: file.color,
        order: Math.max(0, ...this.state.projects.map((p) => p.order)) + 1,
        labels: file.labels,
        folders,
        defaultFolder: (defaultPlace ? where.get(defaultPlace) : null) ?? null,
        // Read in here: this server's own from now on, whatever server wrote the file.
        home: LOCAL_HOME,
        state: 'open',
        ...(Object.keys(unknownFields(file)).length > 0 ? { fileExtra: unknownFields(file) } : {}),
        createdAt: now,
      };
      this.hub.emit({ type: 'project.changed', project });
      const canvasIds = new Map<string, string>();
      const terminalIds = new Map<string, string>();
      let order = Math.max(0, ...this.state.canvases.map((canvas) => canvas.order));
      for (const canvas of file.canvases) {
        order += 1;
        const fresh = { ...newCanvas(projectId, canvas.name, order, at), color: canvas.color, labels: canvas.labels };
        canvasIds.set(canvas.ref, fresh.id);
        this.hub.emit({ type: 'canvas.created', canvas: fresh });
        for (const frame of canvas.frames) this.hub.emit({ type: 'frame.created', canvasId: fresh.id, frame: { ...frame, id: newId() } });
        for (const { terminal, color, ...rect } of canvas.nodes) {
          const place = terminal.place === null ? null : (where.get(terminal.place) ?? null);
          // Below the folder the owner named, and nowhere else: a subfolder that is not there is left for the shell to find missing.
          const cwd = place === null ? null : terminal.subfolder === '' ? place : path.join(place, terminal.subfolder);
          if (cwd !== null && place !== null && cwd !== place && !cwd.startsWith(`${place}${path.sep}`)) throw new BadInputError(`The terminal “${terminal.name}” would start outside its place. Nothing was made.`);
          const session: Session = {
            id: newId(),
            projectId,
            host: LOCAL_HOST,
            // Made as a terminal whose shell has not started: its node offers to start it. What it was is said, and nothing is done because of it.
            meantFor: { agent: terminal.agent, environment: terminal.environment, placeUnset: place === null },
            name: terminal.name,
            createdAt: now,
            state: 'exited',
            cwd,
            command: null,
            note: terminal.note,
            status: NO_STATUS,
            attention: NO_ATTENTION,
            noteLog: [],
            agent: null,
            lastInputAt: null,
            lastOutputAt: null,
            tags: terminal.tags, fields: [],
            parkedFrom: null,
            links: [],
            written: {},
            suggested: {},
            found: null,
            peopleOnly: false,
            typedBy: null,
            recap: null,
            takesMessages: false, theme: null,
            untold: null,
            messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
          };
          terminalIds.set(terminal.ref, session.id);
          made.push(session);
          this.hub.emit({ type: 'session.created', session, canvasId: fresh.id, node: { ...rect, id: newId(), sessionId: session.id, color } });
        }
      }
      // What is made for the project is made in it; what the file calls shared becomes shared here or the project's own, as the owner chose.
      inProject(projectId, () => {
        const elementIds = new Map<string, string>();
        const workflowIds = new Map<string, string>();
        for (const { ref, shared, element } of file.elements) {
          const item = this.drafts.addToShelf({ ...element, source: null });
          const owner = shared && sharedHere ? null : projectId;
          if (item.projectId !== owner) this.hub.emit({ type: 'sharing.moved', kind: 'element', id: item.id, projectId: owner });
          elementIds.set(ref, item.id);
        }
        for (const { ref, shared, file: workflowFile } of file.workflows) {
          const { content, origin } = this.contentOf(workflowFile);
          const workflow = this.workflows.createAccepted(content, origin);
          const owner = shared && sharedHere ? null : projectId;
          const now = this.state.workflows.find((w) => w.id === workflow.id);
          if (now && now.projectId !== owner) this.hub.emit({ type: 'workflow.changed', workflow: { ...now, projectId: owner } });
          workflowIds.set(ref, workflow.id);
        }
        const on = (target: { terminal: string } | { canvas: string }): { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string } => ('terminal' in target ? { kind: 'session', sessionId: terminalIds.get(target.terminal) as string } : { kind: 'new', canvasId: canvasIds.get(target.canvas) as string });
        if (this.state.queue.rules.length + file.rules.length > RULES_MAX) throw new ConflictError(`With this file there would be more than ${RULES_MAX} rules. Nothing was made.`);
        for (const rule of file.rules) {
          const action = rule.action.kind === 'notify' ? { kind: 'notify' } : { kind: 'run-element', elementId: elementIds.get(rule.action.element) as string, on: on(rule.action.on) };
          if (!actionKind(action.kind)) throw new BadInputError(`A rule in this file does something this version does not know (${action.kind}). Nothing was made.`);
          // Switched off: it is the owner here who says when it begins to do anything.
          this.hub.emit({ type: 'rule.changed', rule: { id: newId(), projectId, event: rule.event, action, on: false, createdAt: now } });
        }
        if (this.state.schedules.items.length + file.schedules.length > SCHEDULES_MAX) throw new ConflictError(`With this file there would be more than ${SCHEDULES_MAX} schedules. Nothing was made.`);
        for (const schedule of file.schedules) {
          this.schedules.add({ name: schedule.name, time: schedule.time, days: schedule.days, what: 'element' in schedule.what ? { kind: 'element', elementId: elementIds.get(schedule.what.element) as string } : { kind: 'workflow', workflowId: workflowIds.get(schedule.what.workflow) as string }, where: on(schedule.where), task: schedule.task, on: false }, projectId);
        }
      });
      this.afterMaking?.();
    });

    // Only now, and only if the owner asked: a fresh shell in each terminal. One that cannot start stays as it is, with its button.
    let started = 0;
    if (body.start) {
      for (const session of made) {
        try {
          await this.sessions.restart(session.id);
          started += 1;
        } catch {
          // Its node still offers to start it.
        }
      }
    }
    const unset = made.filter((s) => s.cwd === null).length;
    return {
      project: this.projects.get(projectId),
      started,
      says: `Made “${name}”: ${file.canvases.length} ${file.canvases.length === 1 ? 'canvas' : 'canvases'}, ${made.length} ${made.length === 1 ? 'terminal' : 'terminals'}${body.start ? `, ${started} started` : ', none started'}.${file.schedules.length + file.rules.length > 0 ? ' Its schedules and rules are switched off.' : ''}${unset > 0 ? ` ${unset} ${unset === 1 ? 'terminal has' : 'terminals have'} no place and will start in your home folder.` : ''}`,
    };
  }

  /** For a test: called as the last thing of the one step, so that it can be made to fail there. */
  afterMaking: (() => void) | null = null;

  /* ---------- Templates: the same file ---------- */

  private async templatesIn(dir: string | null, from: 'app' | 'yours'): Promise<{ template: ProjectTemplate; text: string }[]> {
    if (dir === null) return [];
    const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.endsWith('.json')).sort();
    const found: { template: ProjectTemplate; text: string }[] = [];
    for (const name of names.slice(0, 200)) {
      const id = `${from}:${slug(name.replace(/\.json$/, ''))}`;
      if (!TemplateId.safeParse(id).success) continue;
      const text = await readFile(path.join(dir, name), 'utf8').catch(() => null);
      const read = text === null ? null : readProjectFile(text);
      // A file that cannot be read as a project file is not offered.
      if (text === null || !read?.ok) continue;
      found.push({ text, template: { id, name: read.file.name, description: read.file.description, from, canvases: read.file.canvases.length, terminals: read.file.canvases.reduce((n, c) => n + c.nodes.length, 0) } });
    }
    return found;
  }

  private async allTemplates(): Promise<{ template: ProjectTemplate; text: string }[]> {
    return [...(await this.templatesIn(this.options.appTemplatesDir, 'app')), ...(await this.templatesIn(this.options.templatesDir, 'yours'))];
  }

  async templates(): Promise<ProjectTemplate[]> {
    return (await this.allTemplates()).map((found) => found.template);
  }

  async template(id: string): Promise<{ text: string }> {
    // An ID is `app:` or `yours:` and a name in lower-case letters, digits and dashes: anything else names no template.
    const found = TemplateId.safeParse(id).success ? (await this.allTemplates()).find((one) => one.template.id === id) : undefined;
    if (!found) throw new NotFoundError(`No template ${id}`);
    return { text: found.text };
  }

  /** Writes a project into the owner's templates, as a template: without its pinned notes unless they are kept. */
  async saveTemplate(projectId: string, options: { notes?: boolean; description?: string }): Promise<ProjectTemplate> {
    const dir = this.options.templatesDir;
    if (dir === null) throw new ConflictError('This server has no folder to keep templates in.');
    const exported = this.export(projectId, { template: true, ...(options.notes !== undefined ? { notes: options.notes } : {}), ...(options.description !== undefined ? { description: options.description } : {}) });
    const name = slug(projectById(this.state, projectId)?.name ?? 'project') || 'project';
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = path.join(dir, `${name}.json`);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, exported.text, { mode: 0o600 });
    await rename(tmp, target);
    const made = (await this.templatesIn(dir, 'yours')).find((one) => one.template.id === `yours:${name}`);
    if (!made) throw new ConflictError('The template was written and cannot be read back.');
    return made.template;
  }
}
