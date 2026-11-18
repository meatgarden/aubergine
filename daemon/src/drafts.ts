import { ownerOfNew, projectNow } from './project-context';
import {
  BRIEF_LINE,
  Element,
  elementIdFor,
  needsOfProposal,
  newId,
  renderBrief,
  reviewText,
  validateContent,
  type AcceptDraftRequest,
  type Brief,
  type Draft,
  type DraftRecord,
  type OwnerCaller,
  type DraftDetail,
  type ElementInput,
  type ProposeDraftRequest,
  type Proposer,
  type RequestDraftRequest,
  type ShelfElement,
  type UpdateShelfElementRequest,
  type WorkflowContent,
  type WorkflowLimits,
  elementHash,
  keptVersions,
  usesOf,
  versionsInUse,
  withFirstVersion,
  type Actor,
  type ShelfUsage,
  type ShelfVersion,
  visibleIn,
} from '@aubergine/shared';
import { MemoryDraftLog, type DraftLog } from './draft-log';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { Workflows } from './workflows';

/** How many drafts may wait at once. A proposer that fills this up is refused until the owner has read some. */
export const DRAFTS_MAX = 200;
export const SHELF_MAX = 500;

/**
 * Drafts and the shelf.
 *
 * A draft is what an agent or a program proposed. It is inert: this class
 * never starts a run of one, never lists one among the workflows, and never
 * hands one to an agent as instructions. The only way out of here into
 * something that can be run is `accept`, which only the owner may call.
 *
 * Nothing proposed is ever typed into a terminal. The one thing typed from
 * here is `BRIEF_LINE`, a fixed sentence.
 */
/** The owner, as who saved a version. */
const OWNER: Actor = { kind: 'person' };

export class Drafts {
  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly workflows: Workflows,
    private readonly limits: () => WorkflowLimits,
    private readonly log: DraftLog = new MemoryDraftLog(),
  ) {
    // A session that is ended for good takes what was asked of it, and never answered, with it.
    hub.subscribe((event) => {
      if (event.type !== 'session.closed') return;
      for (const draft of this.hub.state.drafts) {
        if (draft.sessionId === event.sessionId && draft.status === 'requested') this.hub.emit({ type: 'draft.removed', draftId: draft.id });
      }
    });
  }

  /* ---------- Reading ---------- */

  /** Oldest first: the order they should be read in. */
  list(): Draft[] {
    return [...this.hub.state.drafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  get(draftId: string): Draft {
    const draft = this.hub.state.drafts.find((d) => d.id === draftId);
    if (!draft) throw new NotFoundError(`No draft ${draftId}`);
    return draft;
  }

  detail(draft: Draft): DraftDetail {
    return { draft, text: reviewText(draft), previousText: draft.previous ? reviewText(draft.previous) : null, needs: needsOfProposal(draft) };
  }

  /** The drafts of one session: what it was asked for and what it proposed. */
  ofSession(sessionId: string): Draft[] {
    this.sessions.get(sessionId);
    return this.list().filter((d) => d.sessionId === sessionId);
  }

  /** What a session is asked to write now: the newest request not yet answered, or draft sent back. */
  brief(sessionId: string): Brief {
    const open = this.ofSession(sessionId)
      .filter((d) => d.status === 'requested' || d.status === 'returned')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!open) throw new NotFoundError('Nothing is asked of this session');
    return { text: renderBrief(open, this.limits()), kind: open.kind, status: open.status };
  }

  /* ---------- Proposing ---------- */

  /** Checks what was handed in, against the same rules as a workflow that is saved. Nothing is kept of what fails. */
  private proposal(body: ProposeDraftRequest): { kind: 'workflow' | 'element'; workflow: WorkflowContent | null; element: Element | null } {
    const withIds = (elements: readonly ElementInput[]): unknown[] => {
      const taken = elements.flatMap((e) => (e.id !== undefined ? [e.id] : []));
      return elements.map((element) => {
        if (element.id !== undefined) return element;
        const id = elementIdFor(element.name, taken);
        taken.push(id);
        return { ...element, id };
      });
    };
    if (body.element !== undefined) {
      const element = Element.parse(withIds([body.element])[0]);
      const problems = validateContent({ name: element.name, description: '', standing: '', inputs: [], elements: [element], extra: {} }, this.limits());
      if (problems.length > 0) throw new BadInputError(problems.join(' '));
      return { kind: 'element', workflow: null, element };
    }
    const workflow = body.workflow;
    if (workflow === undefined) throw new BadInputError('Give a workflow or an element');
    const content = this.workflows.checked({ ...workflow, elements: withIds(workflow.elements) as ElementInput[] });
    return { kind: 'workflow', workflow: content, element: null };
  }

  private room(): void {
    if (this.hub.state.drafts.length >= DRAFTS_MAX) throw new ConflictError(`${DRAFTS_MAX} drafts are waiting to be read. No more can be proposed until some are accepted or discarded.`);
  }

  private save(draft: Draft): Draft {
    this.hub.emit({ type: 'draft.changed', draft });
    return draft;
  }

  /** A new draft from a program with a token, or from the owner's own tools. */
  propose(body: ProposeDraftRequest, by: Proposer): Draft {
    const proposal = this.proposal(body);
    if (body.revisesWorkflowId !== undefined) {
      if (proposal.kind !== 'workflow') throw new BadInputError('Only a workflow can revise a workflow');
      this.workflows.get(body.revisesWorkflowId);
    }
    this.room();
    const at = new Date().toISOString();
    return this.save({
      id: newId(),
      kind: proposal.kind,
      status: 'waiting',
      description: body.description ?? '',
      proposedBy: by,
      sessionId: null,
      revisesWorkflowId: body.revisesWorkflowId ?? null,
      workflow: proposal.workflow,
      element: proposal.element,
      previous: null,
      revision: 1,
      comment: null,
      createdAt: at,
      updatedAt: at,
    });
  }

  /** A new version of a draft: what was there becomes "the version before", so that the reviewer sees what changed. */
  revise(draftId: string, body: ProposeDraftRequest): Draft {
    return this.replace(this.get(draftId), body);
  }

  private replace(draft: Draft, body: ProposeDraftRequest): Draft {
    const proposal = this.proposal(body);
    if (proposal.kind !== draft.kind) throw new ConflictError(`This draft is ${draft.kind === 'element' ? 'an element' : 'a workflow'}; what was handed in is not.`);
    const had = draft.workflow !== null || draft.element !== null;
    return this.save({
      ...draft,
      status: 'waiting',
      workflow: proposal.workflow,
      element: proposal.element,
      previous: had ? { workflow: draft.workflow, element: draft.element } : null,
      revision: draft.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * What a session hands in. It answers the request made of the session, or
   * revises the session's draft that was sent back; when there is neither,
   * it is a new draft of the session's own.
   */
  proposeFromSession(sessionId: string, body: ProposeDraftRequest): Draft {
    const kind = body.element !== undefined ? 'element' : 'workflow';
    const open = this.ofSession(sessionId)
      .filter((d) => d.kind === kind && (d.status === 'requested' || d.status === 'returned'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (open) return this.replace(open, body);
    // A session cannot say which workflow its draft revises: it cannot read workflows.
    const { revisesWorkflowId: _revises, ...rest } = body;
    const draft = this.propose(rest, { kind: 'session', sessionId });
    return this.save({ ...draft, sessionId });
  }

  /* ---------- The owner's part ---------- */

  /**
   * Asks the agent in a session for a draft. The description is kept here and
   * read by the agent with a command. What is typed into the terminal is one
   * fixed sentence, and only where an agent is there to read it.
   */
  async request(body: RequestDraftRequest): Promise<{ draft: Draft; told: boolean; line: string }> {
    const session = this.sessions.get(body.sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    this.room();
    const at = new Date().toISOString();
    const draft = this.save({
      id: newId(),
      kind: body.kind,
      status: 'requested',
      description: body.description,
      proposedBy: { kind: 'session', sessionId: session.id },
      sessionId: session.id,
      revisesWorkflowId: null,
      workflow: null,
      element: null,
      previous: null,
      revision: 0,
      comment: null,
      createdAt: at,
      updatedAt: at,
    });
    return { draft, told: body.tell ? await this.tell(session.id) : false, line: BRIEF_LINE };
  }

  /** Types the fixed request line, where an agent is running. Never anything else. */
  private async tell(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) return false;
    const session = this.sessions.get(sessionId);
    if (session.agent === null || session.status.state === 'idle') return false;
    return this.sessions.tell(sessionId, BRIEF_LINE).catch(() => false);
  }

  private waiting(draftId: string): Draft {
    const draft = this.get(draftId);
    if (draft.status !== 'waiting') throw new ConflictError(draft.status === 'requested' ? 'Nothing has been handed in for this yet.' : 'This draft was sent back and has not been revised yet.');
    return draft;
  }

  /** Sends a draft back. The comment is read by the proposer with a command or the API; only the fixed line is typed. */
  async sendBack(draftId: string, comment: string): Promise<Draft> {
    const draft = this.save({ ...this.waiting(draftId), status: 'returned', comment, updatedAt: new Date().toISOString() });
    if (draft.sessionId !== null) await this.tell(draft.sessionId);
    return draft;
  }

  discard(draftId: string, by: OwnerCaller): void {
    const draft = this.get(draftId);
    this.hub.emit({ type: 'draft.removed', draftId });
    this.resolved(draft, 'discarded', by);
  }

  /** Keeps a short record of what became of a draft: not what it said. */
  private resolved(draft: Draft, outcome: DraftRecord['outcome'], by: OwnerCaller): void {
    void this.log.append({ at: new Date().toISOString(), draftId: draft.id, kind: draft.kind, proposedBy: draft.proposedBy, revisions: draft.revision, outcome, by });
  }

  /** Takes back the records of drafts these sessions proposed. For the demo's removal only. */
  withdrawRecords(sessionIds: ReadonlySet<string>): Promise<void> {
    return this.log.withdraw(sessionIds);
  }

  /** What became of drafts, newest first. */
  records(): Promise<DraftRecord[]> {
    return this.log.read();
  }

  /**
   * Accepts a draft, as it stands or as the owner edited it. A workflow draft
   * becomes a workflow, or a new version of the one it revises; an element
   * draft goes on the shelf. This is the only way a draft becomes something
   * that can be run.
   */
  accept(draftId: string, edited: AcceptDraftRequest, by: OwnerCaller): { workflowId: string | null; elementId: string | null } {
    const draft = this.waiting(draftId);
    // Which session it came from is kept with what it became, so that something removed whole (the demo) can take that along.
    const origin = { kind: 'draft', by: draft.proposedBy.kind, ...(draft.proposedBy.kind === 'token' ? { name: draft.proposedBy.name } : {}), ...(draft.proposedBy.kind === 'session' ? { sessionId: draft.proposedBy.sessionId } : {}) };
    if (draft.kind === 'element') {
      const element = edited.element !== undefined ? this.proposal({ element: edited.element }).element : draft.element;
      if (!element) throw new ConflictError('Nothing has been handed in for this yet.');
      const item = this.addToShelf({ ...element, origin });
      this.hub.emit({ type: 'draft.removed', draftId });
      this.resolved(draft, 'accepted', by);
      return { workflowId: null, elementId: item.id };
    }
    const content = edited.workflow !== undefined ? this.proposal({ workflow: edited.workflow }).workflow : draft.workflow;
    if (!content) throw new ConflictError('Nothing has been handed in for this yet.');
    const revised = draft.revisesWorkflowId !== null ? this.hub.state.workflows.find((w) => w.id === draft.revisesWorkflowId && w.listed) : undefined;
    const { extra: _extra, ...fields } = content;
    // A draft says nothing about where an element came from: each keeps the mark it had in the workflow it revises.
    const workflow = revised ? this.workflows.update(revised.id, fields, false) : this.workflows.createAccepted(content, origin);
    this.hub.emit({ type: 'draft.removed', draftId });
    this.resolved(draft, 'accepted', by);
    return { workflowId: workflow.id, elementId: null };
  }

  /* ---------- The shelf ---------- */

  shelf(): ShelfElement[] {
    return [...this.hub.state.shelf].sort((a, b) => a.element.name.localeCompare(b.element.name) || a.id.localeCompare(b.id));
  }

  shelfElement(elementId: string): ShelfElement {
    const item = this.hub.state.shelf.find((e) => e.id === elementId);
    if (!item) throw new NotFoundError(`No element ${elementId} on the shelf`);
    return item;
  }

  /** A new element on the shelf: what it says is its version 1. Where a copy came from is not something a shelf element has. */
  addToShelf(input: Element, by: Actor = OWNER): ShelfElement {
    if (this.hub.state.shelf.length >= SHELF_MAX) throw new ConflictError(`The shelf holds ${SHELF_MAX} elements; take some off first.`);
    const at = new Date().toISOString();
    const element: Element = { ...input, source: null };
    const item: ShelfElement = { id: newId(), projectId: ownerOfNew(this.hub.state, 'element'), element, createdAt: at, updatedAt: at, version: 1, versions: [{ version: 1, element, at, by, note: '' }], state: 'current', replacedBy: null };
    this.hub.emit({ type: 'shelf.changed', item });
    return item;
  }

  createOnShelf(input: ElementInput, by: Actor = OWNER): ShelfElement {
    const element = this.proposal({ element: input }).element as Element;
    return this.addToShelf(element, by);
  }

  /**
   * Changes a shelf element by adding a version: what it said before stays as it was. Copies in workflows are
   * not touched. The newest versions are kept, and any a copy was made from.
   */
  updateOnShelf(elementId: string, changes: UpdateShelfElementRequest, by: Actor = OWNER): ShelfElement {
    const item = withFirstVersion(this.shelfElement(elementId));
    const { note, ...fields } = changes;
    const given = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const element: Element = { ...(this.proposal({ element: { ...item.element, ...given } }).element as Element), source: null };
    // Saved as it was: no new version for nothing.
    if (elementHash(element) === elementHash(item.element)) return item;
    const at = new Date().toISOString();
    const version = item.version + 1;
    const versions = keptVersions([...item.versions, { version, element, at, by, note: note ?? '' }], versionsInUse(item.id, this.hub.state.workflows));
    const next: ShelfElement = { ...item, element, updatedAt: at, version, versions };
    this.hub.emit({ type: 'shelf.changed', item: next });
    return next;
  }

  copyOnShelf(elementId: string, by: Actor = OWNER): ShelfElement {
    const { element } = this.shelfElement(elementId);
    const names = new Set(this.hub.state.shelf.map((e) => e.element.name));
    let name = `${element.name} copy`.slice(0, 120);
    for (let n = 2; names.has(name); n += 1) name = `${element.name} copy ${n}`.slice(0, 120);
    return this.addToShelf({ ...element, name }, by);
  }

  /** Newest first. */
  shelfVersions(elementId: string): ShelfVersion[] {
    return [...withFirstVersion(this.shelfElement(elementId)).versions].reverse();
  }

  /** The workflows that hold a copy, and what can be told about each. */
  shelfUsage(elementId: string): ShelfUsage {
    this.shelfElement(elementId);
    return { uses: usesOf(elementId, this.hub.state.workflows, this.hub.state.shelf) };
  }

  /** Retires an element: kept, and still working where it is used; not offered, and not run by itself. The owner's alone. */
  retire(elementId: string, replacedBy: string | null): ShelfElement {
    const item = this.shelfElement(elementId);
    if (replacedBy !== null) {
      if (replacedBy === elementId) throw new BadInputError('An element cannot be replaced by itself.');
      const other = this.shelfElement(replacedBy);
      if (other.state === 'retired') throw new ConflictError(`"${other.element.name}" is retired too. Name one that is in use, or none.`);
    }
    const next: ShelfElement = { ...item, state: 'retired', replacedBy, updatedAt: new Date().toISOString() };
    this.hub.emit({ type: 'shelf.changed', item: next });
    return next;
  }

  /** Brings a retired element back. The owner's alone. */
  restore(elementId: string): ShelfElement {
    const item = this.shelfElement(elementId);
    if (item.state === 'current') return item;
    const next: ShelfElement = { ...item, state: 'current', replacedBy: null, updatedAt: new Date().toISOString() };
    this.hub.emit({ type: 'shelf.changed', item: next });
    return next;
  }

  /** The element to run by itself. A retired one is not run. */
  runnable(elementId: string, projectId: string = projectNow(this.hub.state)): Element {
    const item = this.shelfElement(elementId);
    // An element that is another project's own is, to this project, not there.
    if (!visibleIn(item, projectId)) throw new NotFoundError(`No shelf element ${elementId}`);
    if (item.state === 'retired') {
      const other = item.replacedBy ? this.hub.state.shelf.find((e) => e.id === item.replacedBy) : undefined;
      throw new ConflictError(`"${item.element.name}" is retired and is not run by itself.${other ? ` Use "${other.element.name}".` : ''}`);
    }
    return item.element;
  }

  /**
   * Takes an element off the shelf. Copies of it in workflows stay as they are, and say from then on that their
   * source was removed. An element named as the replacement of a retired one is no longer named.
   */
  removeFromShelf(elementId: string): void {
    this.shelfElement(elementId);
    for (const other of this.hub.state.shelf) if (other.replacedBy === elementId) this.hub.emit({ type: 'shelf.changed', item: { ...other, replacedBy: null } });
    this.hub.emit({ type: 'shelf.removed', elementId });
  }
}
