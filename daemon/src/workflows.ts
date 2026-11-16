import {
  WORKFLOW_TEMPLATES,
  WORKFLOW_VERSIONS_KEPT,
  WorkflowContent,
  elementIdFor,
  inputProblems,
  isLive,
  kickoffLine,
  latestVersion,
  newId,
  newRun,
  recordOfRun,
  renderRun,
  runPosition,
  runSummary,
  stepRun,
  tickRun,
  validateContent,
  versionOf,
  workflowTemplate,
  type Actor,
  type ArchivedRun,
  type CreateWorkflowRequest,
  type Element,
  type ElementInput,
  type Origin,
  type ReportOwnRunRequest,
  type Run,
  type RunDetail,
  type RunRecord,
  type RunReport,
  type RunDecisionReport,
  type RunStep,
  type StartRunsRequest,
  type StartedRuns,
  type Board,
  type BoardFilters,
  boardOf,
  BOARD_ENDED_MAX,
  BOARD_ENDED_HOURS,
  type RunsQuery,
  type UpdateWorkflowRequest,
  type Workflow,
  type WorkflowLimits,
  type WorkflowVersion,
  carrySources,
  copyStatus,
  decideUpdate,
} from '@aubergine/shared';
import { paginate } from './public-api';
import type { RunArchive } from './run-archive';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';

export interface WorkflowsOptions {
  limits: () => WorkflowLimits;
  onError?: (error: unknown) => void;
  /** After how long without a report a run that keeps printing is called quiet. */
  quietAfterSeconds?: () => number;
}

/** What starting a run is given. */
export interface StartRun {
  workflowId: string;
  sessionId?: string | undefined;
  inputs: Record<string, string>;
  replace: boolean;
  /** Type the kickoff line into the terminal. The caller decides whether it may: only the owner. */
  typeKickoff: boolean;
}

const BLOCKED = 'Blocked on';
const APPROVAL = 'Approval needed at';
const OURS = (message: string | null | undefined): boolean => message?.startsWith(BLOCKED) === true || message?.startsWith(APPROVAL) === true;

/**
 * Workflows and their runs. Every change is a change event; a run moves only
 * through `stepRun`, whoever asked. Runs that are over go to the archive and
 * leave the state.
 */
export class Workflows {
  /** Runs being written to the archive right now: nothing more may be reported on them. */
  private readonly ending = new Set<string>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly archive: RunArchive,
    private readonly options: WorkflowsOptions,
  ) {
    // A session that is ended for good takes its run with it.
    this.unsubscribe = hub.subscribe((event) => {
      if (event.type !== 'session.closed') return;
      const run = this.liveRunOf(event.sessionId);
      if (run) void this.apply(run, { type: 'stop' }, { kind: 'person' }).catch(this.options.onError ?? (() => {}));
    });
  }

  close(): void {
    this.unsubscribe();
  }

  /**
   * After a start: a run the archive already has is over, whatever the state
   * file says (the server stopped between writing the two).
   */
  async reconcile(): Promise<void> {
    for (const run of this.hub.state.runs) {
      const archived = await this.archive.get(run.id);
      if (archived) this.hub.emit({ type: 'run.finished', run: archived.run });
    }
    // A workflow that existed only to run one element goes with its run.
    for (const workflow of this.hub.state.workflows) this.dropIfSpent(workflow.id);
  }

  /* ---------- Workflows ---------- */

  /** The workflows there are. One made only to run an element by itself is not among them. */
  list(): Workflow[] {
    return [...this.hub.state.workflows].filter((w) => w.listed).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  get(workflowId: string, unlisted = false): Workflow {
    const workflow = this.hub.state.workflows.find((w) => w.id === workflowId);
    if (!workflow || (!workflow.listed && !unlisted)) throw new NotFoundError(`No workflow ${workflowId}`);
    return workflow;
  }

  /** Checks content against the kinds and the limits, and gives every element an ID. */
  /** Content checked against the kinds and the limits, for a caller that keeps it as a draft. */
  checked(input: Parameters<Workflows['content']>[0]): WorkflowContent {
    return this.content(input);
  }

  private content(input: Omit<CreateWorkflowRequest, 'elements' | 'labels' | 'origin'> & { elements: readonly ElementInput[] }): WorkflowContent {
    const taken = input.elements.flatMap((e) => (e.id !== undefined ? [e.id] : []));
    const elements = input.elements.map((element) => {
      if (element.id !== undefined) return element;
      const id = elementIdFor(element.name, taken);
      taken.push(id);
      return { ...element, id };
    });
    const parsed = WorkflowContent.safeParse({ ...input, elements });
    if (!parsed.success) throw new BadInputError(parsed.error.issues[0]?.message ?? 'This is not a workflow');
    const problems = validateContent(parsed.data, this.options.limits());
    if (problems.length > 0) throw new BadInputError(problems.join(' '));
    return parsed.data;
  }

  /**
   * `byOwner`: only the owner says where a copy came from. For anyone else the elements carry no source mark:
   * a token cannot say that an element is a copy of a shelf element, or that one was brought up to date.
   */
  create(body: CreateWorkflowRequest, byOwner = true): Workflow {
    const { labels, origin, ...rest } = body;
    return this.add(this.content(byOwner ? rest : { ...rest, elements: carrySources(rest.elements, []) }), labels ?? {}, origin ?? { kind: 'local' });
  }

  private dropIfSpent(workflowId: string): void {
    const workflow = this.hub.state.workflows.find((w) => w.id === workflowId);
    if (workflow && !workflow.listed && !this.hub.state.runs.some((r) => r.workflowId === workflowId)) this.hub.emit({ type: 'workflow.removed', workflowId });
  }

  /** Makes a workflow from content that was already read and accepted by the owner (a draft). */
  createAccepted(content: WorkflowContent, origin: Origin): Workflow {
    const { extra, ...rest } = content;
    // What a draft says about where its elements came from is not taken over: only the owner says that.
    return this.add({ ...this.content({ ...rest, elements: carrySources(rest.elements, []) }), extra }, {}, origin);
  }

  /**
   * The owner's decision about the newer version on the shelf, for one copy: take it, or keep their own. It saves
   * a new version of the workflow, as any edit does. Nothing is merged, and nothing calls this but the owner.
   */
  decideCopy(workflowId: string, elementId: string, decision: 'take' | 'keep'): Workflow {
    const workflow = this.get(workflowId);
    const element = latestVersion(workflow).elements.find((e) => e.id === elementId);
    if (!element) throw new NotFoundError(`This workflow has no element ${elementId}`);
    const status = copyStatus(element, this.hub.state.shelf);
    if (status.state === 'none') throw new ConflictError('This element is not a copy of a shelf element.');
    if (status.shelf === null) throw new ConflictError('Its source is not on the shelf any more, so there is no newer version to take.');
    const item = status.shelf;
    const elements = latestVersion(workflow).elements.map((e) => (e.id === elementId ? decideUpdate(e, item, decision) : e));
    return this.update(workflowId, { elements });
  }

  private add(content: WorkflowContent, labels: Record<string, string>, origin: Origin, listed = true): Workflow {
    const at = new Date().toISOString();
    const workflow: Workflow = {
      id: newId(),
      projectId: this.hub.state.project.id,
      name: content.name,
      description: content.description,
      labels,
      origin,
      createdAt: at,
      updatedAt: at,
      listed,
      versions: [{ ...content, number: 1, createdAt: at }],
    };
    this.hub.emit({ type: 'workflow.changed', workflow });
    return workflow;
  }

  /** A change of content is a new version. Runs keep to the version they started on. */
  /**
   * `byOwner`: only the owner says where a copy came from. For anyone else (a token, an accepted draft) each element
   * keeps the source mark the element of the same ID had, and a new one has none.
   */
  update(workflowId: string, body: UpdateWorkflowRequest, byOwner = true): Workflow {
    const workflow = this.get(workflowId);
    const { number, createdAt: _createdAt, ...current } = latestVersion(workflow);
    const { labels, ...changes } = byOwner || body.elements === undefined ? body : { ...body, elements: carrySources(body.elements, current.elements) };
    const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const content = this.content({ ...current, ...given });
    const at = new Date().toISOString();
    const same = JSON.stringify(content) === JSON.stringify(current);
    if (same && labels === undefined) return workflow;

    const needed = new Set(this.hub.state.runs.filter((r) => r.workflowId === workflowId).map((r) => r.workflowVersion));
    const versions = same ? workflow.versions : [...workflow.versions, { ...content, number: number + 1, createdAt: at }];
    const next: Workflow = {
      ...workflow,
      name: content.name,
      description: content.description,
      labels: labels ?? workflow.labels,
      updatedAt: at,
      // Old versions are dropped past a limit, never one a run still going points at.
      versions: versions.filter((v, index) => index >= versions.length - WORKFLOW_VERSIONS_KEPT || needed.has(v.number)),
    };
    this.hub.emit({ type: 'workflow.changed', workflow: next });
    return next;
  }

  remove(workflowId: string): void {
    this.get(workflowId);
    const live = this.hub.state.runs.filter((r) => r.workflowId === workflowId).length;
    if (live > 0) throw new ConflictError(`${live === 1 ? 'A run' : `${live} runs`} of this workflow ${live === 1 ? 'is' : 'are'} still going. Stop ${live === 1 ? 'it' : 'them'} first.`);
    this.hub.emit({ type: 'workflow.removed', workflowId });
  }

  private freeName(wanted: string): string {
    const names = new Set(this.hub.state.workflows.map((w) => w.name));
    let name = wanted;
    for (let n = 2; names.has(name); n += 1) name = `${wanted} ${n}`;
    return name.slice(0, 120);
  }

  copy(workflowId: string, name?: string): Workflow {
    const workflow = this.get(workflowId);
    const { number: _number, createdAt: _createdAt, ...content } = latestVersion(workflow);
    return this.add({ ...content, name: name ?? this.freeName(`${content.name} copy`) }, workflow.labels, workflow.origin);
  }

  /** Newest first. */
  versions(workflowId: string): WorkflowVersion[] {
    return [...this.get(workflowId).versions].reverse();
  }

  templates(): { name: string; title: string; description: string; content: WorkflowContent }[] {
    return WORKFLOW_TEMPLATES.map((t) => ({ ...t }));
  }

  useTemplate(templateName: string, name?: string): Workflow {
    const template = workflowTemplate(templateName);
    if (!template) throw new NotFoundError(`No template named ${templateName}`);
    return this.add({ ...template.content, name: name ?? this.freeName(template.title) }, {}, { kind: 'template', name: template.name });
  }

  /* ---------- Runs ---------- */

  liveRunOf(sessionId: string): Run | null {
    return this.hub.state.runs.find((r) => r.sessionId === sessionId) ?? null;
  }

  private versionFor(run: Run): WorkflowVersion {
    const workflow = this.hub.state.workflows.find((w) => w.id === run.workflowId);
    const version = workflow ? versionOf(workflow, run.workflowVersion) : null;
    // Cannot happen while removing a workflow and dropping versions both look at live runs.
    if (!version) throw new ConflictError('The workflow of this run is gone');
    return version;
  }

  private record(run: Run): RunRecord {
    return recordOfRun(
      run,
      this.hub.state.workflows.find((w) => w.id === run.workflowId),
    );
  }

  private detail(run: Run, kickoffTyped = false): RunDetail {
    const version = this.versionFor(run);
    return { ...this.record(run), position: runPosition(version, run), text: renderRun(version, run), kickoff: kickoffLine(), kickoffTyped };
  }

  private detailOfArchived(entry: ArchivedRun): RunDetail {
    const position = entry.run.status;
    const text = [`Workflow: ${entry.workflowName}`, entry.run.status === 'finished' ? `This run is finished: all ${entry.elements.length} elements are done. There is nothing more to do for it.` : 'This run was stopped. There is nothing more to do for it.'].join('\n');
    return { ...entry, position, text, kickoff: kickoffLine(), kickoffTyped: false };
  }

  /** The line to give an agent that is started (again) in a session with a run still going; none otherwise. */
  kickoffFor(sessionId: string): string | null {
    const run = this.liveRunOf(sessionId);
    return run ? kickoffLine() : null;
  }

  async start(input: StartRun, by: Actor, unlisted = false): Promise<RunDetail> {
    const workflow = this.get(input.workflowId, unlisted);
    const version = latestVersion(workflow);
    const session = input.sessionId !== undefined ? this.sessions.get(input.sessionId) : null;
    if (session?.state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    const problems = inputProblems(version, input.inputs);
    if (problems.length > 0) throw new BadInputError(problems.join(' '));

    const existing = session ? this.liveRunOf(session.id) : null;
    if (existing) {
      if (!input.replace) throw new ConflictError(`This session is already on "${this.record(existing).workflowName}". Stop that run first, or start with replace.`);
      await this.apply(existing, { type: 'stop' }, by);
    }

    const run = newRun(version, { id: newId(), workflowId: workflow.id, sessionId: session?.id ?? null, inputs: input.inputs, by, at: new Date().toISOString() });
    this.hub.emit({ type: 'run.started', run });

    // The line is the server's own words; it is typed only where an agent is there to read it.
    // In a plain shell it would be run as a command.
    let typed = false;
    if (session && input.typeKickoff) typed = await this.tellAgent(session.id);
    // A workflow may begin with an approval: then the run waits for the owner from the start.
    this.afterMove(version, null, run);
    return this.detail(run, typed);
  }

  /** Types the fixed sentence that tells an agent to read its status, where an agent is there to read it. */
  private async tellAgent(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) return false;
    const session = this.sessions.get(sessionId);
    if (session.agent === null || session.status.state === 'idle') return false;
    return this.sessions.tell(sessionId, kickoffLine()).catch(() => false);
  }

  /**
   * A person's decision on a run that waits for them: approve, or send back. The caller has made sure it is the
   * owner; the step function refuses anyone else again. Afterwards the agent is told, with the same fixed sentence
   * that starts a run, to read its status: nothing of the comment is typed.
   */
  async decide(runId: string, decision: RunDecisionReport, by: Actor): Promise<RunDetail> {
    const run = this.live(runId);
    if (!run) {
      const archived = await this.archive.get(runId);
      if (!archived) throw new NotFoundError(`No run ${runId}`);
      throw new ConflictError(`This run is ${archived.run.status}; there is nothing to decide on it.`);
    }
    const detail = await this.apply(run, decision, by);
    const typed = detail.run.sessionId !== null && detail.run.status === 'running' ? await this.tellAgent(detail.run.sessionId) : false;
    return { ...detail, kickoffTyped: typed };
  }

  /** Starts one workflow on several sessions: each through `start`, each with its own answer. */
  async startMany(workflowId: string, body: StartRunsRequest, by: Actor, mayType: (sessionId: string) => boolean): Promise<StartedRuns> {
    this.get(workflowId);
    const results: StartedRuns['results'] = [];
    for (const sessionId of [...new Set(body.sessionIds)]) {
      try {
        const run = await this.start({ workflowId, sessionId, inputs: body.inputsBySession?.[sessionId] ?? body.inputs, replace: body.replace, typeKickoff: body.kickoff && mayType(sessionId) }, by);
        results.push({ sessionId, started: true, run, reason: null });
      } catch (error) {
        if (!(error instanceof NotFoundError || error instanceof ConflictError || error instanceof BadInputError)) throw error;
        results.push({ sessionId, started: false, run: null, reason: error instanceof NotFoundError ? 'There is no such session.' : error.message });
      }
    }
    return { results };
  }

  /** The board: every live run, and the ones that ended in the last day, read from the archive with a bound. */
  async board(filters: BoardFilters): Promise<Board> {
    const now = Date.now();
    const since = now - BOARD_ENDED_HOURS * 3600 * 1000;
    const ended: ArchivedRun[] = [];
    let cursor: string | undefined;
    // Newest first: stop at the first page that reaches back past a day, or at the bound.
    for (let pages = 0; pages < 4; pages += 1) {
      const page = await this.archive.read({ sessionId: undefined, workflowId: undefined, status: undefined, limit: 100, cursor });
      ended.push(...page.items);
      const last = page.items.at(-1);
      if (page.nextCursor === null || !last || (last.run.finishedAt !== null && Date.parse(last.run.finishedAt) < since) || ended.length > BOARD_ENDED_MAX * 4) break;
      cursor = page.nextCursor;
    }
    const { runs, workflows, sessions, canvases } = this.hub.state;
    return boardOf({ runs, workflows, sessions, canvases, ended, now, quietAfterSeconds: this.options.quietAfterSeconds?.() ?? 300, filters });
  }

  /**
   * Runs one element by itself: a run of a workflow of that one element. The
   * workflow is made for the run, is not among the workflows, and is removed
   * when the run is over; the archive keeps the run with the element's name.
   */
  async startElement(element: Element, input: Omit<StartRun, 'workflowId'>, by: Actor): Promise<RunDetail> {
    if (input.sessionId !== undefined && this.sessions.get(input.sessionId).state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    const uses = `${element.instructions}\n${element.doneWhen}`.includes('{{task}}');
    const content = this.content({ name: element.name, inputs: [{ key: 'task', label: 'Task', description: 'What this run is about.', required: uses }], elements: [element] });
    const problems = inputProblems({ ...content, number: 1, createdAt: '' }, input.inputs);
    if (problems.length > 0) throw new BadInputError(problems.join(' '));
    return this.startUnlisted(content, input, by, { kind: 'element' });
  }

  /**
   * Runs content that is not one of the listed workflows: a workflow of its
   * own is made for the run from exactly this content, and removed with it.
   */
  async startContent(content: WorkflowContent, input: Omit<StartRun, 'workflowId'>, by: Actor, origin: Origin): Promise<RunDetail> {
    if (input.sessionId !== undefined && this.sessions.get(input.sessionId).state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    const { extra, ...rest } = content;
    const checked = { ...this.content(rest), extra };
    const problems = inputProblems({ ...checked, number: 1, createdAt: '' }, input.inputs);
    if (problems.length > 0) throw new BadInputError(problems.join(' '));
    return this.startUnlisted(checked, input, by, origin);
  }

  private async startUnlisted(content: WorkflowContent, input: Omit<StartRun, 'workflowId'>, by: Actor, origin: Origin): Promise<RunDetail> {
    const workflow = this.add(content, {}, origin, false);
    try {
      return await this.start({ ...input, workflowId: workflow.id }, by, true);
    } catch (error) {
      this.dropIfSpent(workflow.id);
      throw error;
    }
  }

  /** Takes back the past runs of these sessions: they are no longer listed. For the demo's removal only. */
  withdrawRuns(sessionIds: ReadonlySet<string>): Promise<void> {
    return this.archive.withdraw(sessionIds);
  }

  /** Ticks an item of what an element produced. Also for a run that is over: the list is read after the work. */
  async tick(runId: string, tick: { elementId: string; item: number; ticked: boolean }, by: Actor): Promise<RunDetail> {
    const context = { by, at: new Date().toISOString() };
    const run = this.live(runId);
    if (run) {
      const result = tickRun(this.versionFor(run), run, tick, context);
      if (!result.ok) throw new ConflictError(result.reason);
      this.hub.emit({ type: 'run.ticked', run: result.run });
      return this.detail(result.run);
    }
    const archived = await this.archive.get(runId);
    if (!archived) throw new NotFoundError(`No run ${runId}`);
    const result = tickRun({ elements: archived.elements }, archived.run, tick, context);
    if (!result.ok) throw new ConflictError(result.reason);
    const entry = { ...archived, run: result.run };
    await this.archive.amend(entry);
    return this.detailOfArchived(entry);
  }

  private live(runId: string): Run | null {
    return this.hub.state.runs.find((r) => r.id === runId) ?? null;
  }

  async getRun(runId: string): Promise<RunDetail> {
    const run = this.live(runId);
    if (run) return this.detail(run);
    const archived = await this.archive.get(runId);
    if (!archived) throw new NotFoundError(`No run ${runId}`);
    return this.detailOfArchived(archived);
  }

  async listRuns(query: RunsQuery): Promise<{ items: RunRecord[]; nextCursor: string | null }> {
    const { status, sessionId, workflowId, limit, cursor } = query;
    if (status === 'ended' || status === 'finished' || status === 'stopped') {
      return this.archive.read({ sessionId, workflowId, status: status === 'ended' ? undefined : status, limit, cursor });
    }
    const wanted = this.hub.state.runs.filter(
      (r) => (status === 'live' || r.status === status) && (sessionId === undefined || r.sessionId === sessionId) && (workflowId === undefined || r.workflowId === workflowId),
    );
    const page = paginate(wanted, (r) => r.id, { limit, cursor });
    return { items: page.items.map((run) => this.record(run)), nextCursor: page.nextCursor };
  }

  ownRun(sessionId: string): RunDetail {
    this.sessions.get(sessionId);
    const run = this.liveRunOf(sessionId);
    if (!run) throw new NotFoundError('This session is on no workflow');
    return this.detail(run);
  }

  async report(runId: string, report: RunReport, by: Actor): Promise<RunDetail> {
    const run = this.live(runId);
    if (!run) {
      const archived = await this.archive.get(runId);
      if (!archived) throw new NotFoundError(`No run ${runId}`);
      throw new ConflictError(`This run is ${archived.run.status}; nothing more can be reported on it.`);
    }
    if (report.type === 'assign') {
      const session = this.sessions.get(report.sessionId);
      if (session.state === 'exited') throw new ConflictError('This shell has ended; restart it first');
      if (this.liveRunOf(report.sessionId)) throw new ConflictError('That session is already on a run.');
    }
    return this.apply(run, report, by);
  }

  async reportOwn(sessionId: string, report: ReportOwnRunRequest, by: Actor): Promise<RunDetail> {
    this.sessions.get(sessionId);
    const run = this.liveRunOf(sessionId);
    if (!run) throw new NotFoundError('This session is on no workflow');
    if (report.type === 'done') {
      // Without a name it means the current element. A caller that may repeat itself should name it.
      const elementId = report.elementId ?? run.currentElementId;
      if (elementId === null) throw new ConflictError('This run has no current element.');
      return this.apply(run, { type: 'done', elementId, ...(report.note !== undefined ? { note: report.note } : {}), ...(report.output !== undefined ? { output: report.output } : {}) }, by);
    }
    return this.apply(run, report, by);
  }

  /** The one place a run is moved: through `stepRun`, then one event. */
  private async apply(run: Run, report: RunStep, by: Actor): Promise<RunDetail> {
    if (this.ending.has(run.id)) throw new ConflictError('This run is over; nothing more can be reported on it.');
    const version = this.versionFor(run);
    const result = stepRun(version, run, report, { by, at: new Date().toISOString() });
    if (!result.ok) throw new ConflictError(result.reason);
    const next = result.run;

    if (isLive(next.status)) {
      this.hub.emit({ type: 'run.moved', run: next });
      this.afterMove(version, run, next);
      return this.detail(next);
    }

    // Over: first into the archive, then out of the state, so that it is never in neither.
    this.ending.add(run.id);
    try {
      const entry: ArchivedRun = { run: next, workflowName: version.name, elements: version.elements.map((e) => ({ id: e.id, name: e.name, produces: e.produces })) };
      await this.archive.append(entry);
      this.hub.emit({ type: 'run.finished', run: next });
      this.afterEnd(version, next);
      this.dropIfSpent(next.workflowId);
      return this.detailOfArchived(entry);
    } finally {
      this.ending.delete(run.id);
    }
  }

  /** A blocked run asks for the owner, naming the element; one that moves on stops asking. */
  private afterMove(version: WorkflowVersion, before: Run | null, after: Run): void {
    const sessionId = after.sessionId;
    if (sessionId === null || !this.sessions.has(sessionId)) return;
    const name = version.elements.find((e) => e.id === after.currentElementId)?.name ?? '';
    if (after.status === 'blocked') {
      this.sessions.setAttention(sessionId, 'waiting', `${BLOCKED} "${name}": ${after.blockedReason ?? ''}`.slice(0, 500));
    } else if (after.status === 'awaiting') {
      // A run that waits for the owner's decision is in the waiting queue, like one that is blocked.
      this.sessions.setAttention(sessionId, 'waiting', `${APPROVAL} "${name}" of "${version.name}"`.slice(0, 500));
    } else if (before !== null && (before.status === 'blocked' || before.status === 'awaiting') && OURS(this.sessions.get(sessionId).attention.message)) {
      this.sessions.setAttention(sessionId, 'none');
    }
  }

  /** A finished run says so in the waiting queue and leaves a summary in the session's notes. */
  private afterEnd(version: WorkflowVersion, run: Run): void {
    const sessionId = run.sessionId;
    if (sessionId === null || !this.sessions.has(sessionId)) return;
    if (run.status === 'finished') {
      const last = version.elements.at(-1)?.name ?? '';
      this.sessions.setAttention(sessionId, 'done', `Workflow "${version.name}" finished after "${last}"`.slice(0, 500));
    } else if (OURS(this.sessions.get(sessionId).attention.message)) {
      this.sessions.setAttention(sessionId, 'none');
    }
    this.sessions.appendNote(sessionId, { author: 'agent', kind: 'event', text: runSummary(version, run).slice(0, 20_000) });
  }
}

/** Who moved a run, from who made the request. */
export function actorOf(principal: { kind: 'user' } | { kind: 'session' } | { kind: 'token'; name: string }): Actor {
  if (principal.kind === 'user') return { kind: 'person' };
  if (principal.kind === 'session') return { kind: 'agent' };
  return { kind: 'token', name: principal.name.slice(0, 120) };
}
