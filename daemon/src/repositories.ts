import os from 'node:os';
import path from 'node:path';
import {
  NEEDS_REVIEW,
  exportWorkflow,
  needsOf,
  reviewText,
  type AcceptedRepositoryWorkflow,
  type Actor,
  type RepositoryOffer,
  type RepositoryWorkflow,
  type RepositoryWorkflowDetail,
  type RunDetail,
  type WorkflowLimits,
} from '@aubergine/shared';
import { RepositoryWriteError, findRepository, hashOf, readRepositoryFile, readRepositoryFolder, writeRepositoryFile, type FoundFile } from './repository-files';
import { BadInputError, ConflictError, NotFoundError, type Sessions } from './sessions';
import type { StateHub } from './state-hub';
import type { StartRun, Workflows } from './workflows';

/**
 * Workflows kept in a project's repository.
 *
 * The files are read when asked for and never remembered: what a repository
 * offers is what is on disk now. What is remembered is what the owner
 * accepted: this content (by a hash of the file's bytes), of this file, in
 * this repository. Only that exact content can be run, and a run is made
 * from the accepted content, so a later change to the file never reaches it.
 *
 * A folder is only ever read as the repository of a session there is: no
 * caller can name a folder of its own choosing.
 */
export class Repositories {
  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly workflows: Workflows,
    private readonly limits: () => WorkflowLimits,
    private readonly home: string = os.homedir(),
  ) {}

  /** The repository a session's folder is in, when it has one. */
  private async rootOf(sessionId: string): Promise<string | null> {
    // A folder is read on this computer only: a session that runs elsewhere has none here.
    const { cwd } = this.sessions.here(sessionId);
    return cwd ? findRepository(cwd, this.home) : null;
  }

  private accepted(root: string, file: string): AcceptedRepositoryWorkflow | undefined {
    return this.hub.state.repositoryAccepted.find((entry) => entry.root === root && entry.file === file);
  }

  private describe(root: string, found: FoundFile): RepositoryWorkflow {
    if (!found.ok) return { file: found.file, name: null, elements: [], hash: found.hash, state: 'unreadable', reason: found.reason };
    const accepted = this.accepted(root, found.file);
    return {
      file: found.file,
      name: found.content.name,
      elements: found.content.elements.map((e) => e.name),
      hash: found.hash,
      state: !accepted ? 'review' : accepted.hash === found.hash ? 'accepted' : 'changed',
      reason: null,
    };
  }

  private async offerOf(root: string): Promise<RepositoryOffer> {
    const { files, truncated } = await readRepositoryFolder(root, this.limits());
    return { root, folder: path.basename(root), workflows: files.map((found) => this.describe(root, found)), truncated };
  }

  /** What the repository of a session's folder offers, read now. */
  async offer(sessionId: string): Promise<RepositoryOffer> {
    const root = await this.rootOf(sessionId);
    if (!root) return { root: null, folder: null, workflows: [], truncated: false };
    const offer = await this.offerOf(root);
    return offer.workflows.length === 0 ? { root: null, folder: null, workflows: [], truncated: false } : offer;
  }

  /** The repository of each session, once each, with the sessions that are in it. */
  private async roots(): Promise<Map<string, string[]>> {
    const roots = new Map<string, string[]>();
    for (const session of this.hub.state.sessions) {
      if (session.state === 'exited' || !session.cwd) continue;
      const root = await findRepository(session.cwd, this.home);
      if (root) roots.set(root, [...(roots.get(root) ?? []), session.id]);
    }
    return roots;
  }

  /** Every repository that offers workflows to a session there is. */
  async listing(): Promise<(RepositoryOffer & { root: string; folder: string; sessionIds: string[] })[]> {
    const items = [];
    for (const [root, sessionIds] of await this.roots()) {
      const offer = await this.offerOf(root);
      if (offer.workflows.length > 0) items.push({ ...offer, root, folder: path.basename(root), sessionIds });
    }
    return items.sort((a, b) => a.root.localeCompare(b.root));
  }

  /** One file of a repository, read now. The repository must be a session's: nothing else is ever opened. */
  private async read(root: string, file: string): Promise<FoundFile> {
    if (!(await this.roots()).has(root)) throw new NotFoundError('No session is in a repository at that folder');
    const found = await readRepositoryFile(root, file, this.limits());
    if (!found) throw new NotFoundError(`No workflow file ${file} in that repository`);
    return found;
  }

  /** What the owner reads before accepting: the whole text, and what the accepted content said when the file has changed since. */
  async detail(root: string, file: string): Promise<RepositoryWorkflowDetail> {
    const found = await this.read(root, file);
    const workflow = this.describe(root, found);
    if (!found.ok) return { workflow, root, text: '', previousText: null, needs: [], content: null };
    const accepted = this.accepted(root, file);
    return {
      workflow,
      root,
      text: reviewText({ workflow: found.content, element: null }),
      previousText: accepted && accepted.hash !== found.hash ? reviewText({ workflow: accepted.content, element: null }) : null,
      needs: needsOf(found.content.elements),
      content: found.content,
    };
  }

  /** Accepts a file's content as it is now. `hash` is of what the owner read: if the file changed meanwhile, nothing is accepted. */
  async accept(root: string, file: string, hash: string): Promise<RepositoryWorkflow> {
    const found = await this.read(root, file);
    if (!found.ok) throw new ConflictError(`${file} cannot be read as a workflow: ${found.reason}`);
    if (found.hash !== hash) throw new ConflictError(`${file} has changed since it was read. Read it again before accepting.`);
    this.hub.emit({ type: 'repository.accepted', entry: { root, file, hash, content: found.content, acceptedAt: new Date().toISOString() } });
    return this.describe(root, found);
  }

  /**
   * Starts a run of a repository workflow on a session whose folder is in
   * that repository. Only content the owner accepted can be run: the file is
   * read now, and must be exactly what was accepted.
   */
  async run(sessionId: string, file: string, input: Omit<StartRun, 'workflowId' | 'sessionId'>, by: Actor): Promise<RunDetail> {
    const root = await this.rootOf(sessionId);
    const found = root ? await readRepositoryFile(root, file, this.limits()) : null;
    if (!root || !found) throw new NotFoundError(`The repository of this session has no workflow file ${file}`);
    if (!found.ok) throw new ConflictError(`${file} cannot be read as a workflow: ${found.reason}`);
    const accepted = this.accepted(root, file);
    if (!accepted || accepted.hash !== found.hash) throw new ConflictError(`"${found.content.name}" cannot be run yet. ${NEEDS_REVIEW}`);
    // From the accepted content, as a workflow of its own that is not listed: a change to the file later does not reach this run.
    return this.workflows.startContent(accepted.content, { ...input, sessionId }, by, { kind: 'repository', file, hash: accepted.hash });
  }

  /**
   * Writes a workflow into the repository of a session, as a file named
   * after it. Only for the owner, and only when asked. What was written is
   * accepted as it is: the owner wrote it.
   */
  async save(sessionId: string, workflowId: string, overwrite: boolean): Promise<{ root: string; file: string; path: string; overwritten: boolean }> {
    const workflow = this.workflows.get(workflowId);
    const root = await this.rootOf(sessionId);
    if (!root) throw new BadInputError("This session's folder is not inside a Git repository.");
    const text = `${JSON.stringify(exportWorkflow(workflow), null, 2)}\n`;
    let written;
    try {
      written = await writeRepositoryFile(root, workflow.name, text, overwrite);
    } catch (error) {
      if (error instanceof RepositoryWriteError) throw new ConflictError(error.message);
      throw error;
    }
    const found = await readRepositoryFile(root, written.file, this.limits());
    if (found?.ok && found.hash === hashOf(text)) this.hub.emit({ type: 'repository.accepted', entry: { root, file: written.file, hash: found.hash, content: found.content, acceptedAt: new Date().toISOString() } });
    return { root, ...written };
  }
}
