import path from 'node:path';
import {
  newId,
  type ChangeEvent,
  type Difference,
  type EndEnvironmentRequest,
  type EndedEnvironment,
  type Endings,
  type EnvironmentDetail,
  type EnvironmentOffers,
  type ListedEnvironment,
  type SessionEnvironment,
} from '@aubergine/shared';
import './environments/full';
import './environments/working-copy';
import { environmentKind, environmentKinds, plainKind, type EnvironmentKind, type WhatChanged } from './environments/kind';
import { GitProblem } from './git/copies';
import { paginate } from './public-api';
import { BadInputError, ConflictError, NotFoundError } from './sessions';
import type { StateHub } from './state-hub';

export interface EnvironmentsOptions {
  /** The folder of the data folder that kinds make things in. Null on a server that has none: nothing can be prepared there. */
  keptIn: string | null;
  /** The folder a session starts in when none is named. */
  defaultFolder: () => string;
  /** The least time between two readings of what changed in one environment that nobody asked for. */
  quietMs?: number;
  onError?: (error: unknown) => void;
}

/** Not oftener than this, when it is a change of a session's status that asks and not a person. */
const QUIET_MS = 10_000;

/**
 * What was prepared for sessions to work in. It knows no kind by name: it
 * asks the registry, keeps a record of what a kind made, and asks the kind
 * again for everything else.
 *
 * What changed in an environment is read when someone asks, and when the
 * session in it changes its status or what it waits for (a command ended,
 * an agent went idle): at most once in ten seconds for one environment, and
 * never on a timer of its own.
 */
export class Environments {
  private readonly unsubscribe: () => void;
  private readonly lastRead = new Map<string, number>();
  private readonly waiting = new Map<string, NodeJS.Timeout>();
  private closed = false;

  constructor(
    private readonly hub: StateHub,
    private readonly options: EnvironmentsOptions,
  ) {
    this.unsubscribe = hub.subscribe((event) => this.on(event));
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
    for (const timer of this.waiting.values()) clearTimeout(timer);
    this.waiting.clear();
  }

  /** Where kinds keep what they make. Asked only about something that was made, so it is there. */
  private get keptIn(): string {
    return this.options.keptIn ?? '';
  }

  private get all(): readonly SessionEnvironment[] {
    return this.hub.state.environments;
  }

  private on(event: ChangeEvent): void {
    if (event.type === 'session.closed') {
      // Its session is gone. The environment stays, and says so: nothing is ever removed because a session ended.
      for (const environment of this.all.filter((e) => e.sessionId === event.sessionId)) this.hub.emit({ type: 'environment.changed', environment: { ...environment, sessionId: null } });
      return;
    }
    if (event.type === 'session.renamed') {
      const environment = this.ofSession(event.sessionId);
      if (environment) this.hub.emit({ type: 'environment.changed', environment: { ...environment, sessionName: event.name.slice(0, 120) } });
      return;
    }
    if (event.type === 'session.status' || event.type === 'session.attention') {
      const environment = this.ofSession(event.sessionId);
      if (environment && environment.broken === null) this.later(environment.id);
    }
  }

  /** Reads what changed in a while, unless it was read just now: then when that while is over, once. */
  private later(environmentId: string): void {
    if (this.closed || this.waiting.has(environmentId)) return;
    const quiet = this.options.quietMs ?? QUIET_MS;
    const wait = Math.max(500, (this.lastRead.get(environmentId) ?? 0) + quiet - Date.now());
    const timer = setTimeout(() => {
      this.waiting.delete(environmentId);
      const environment = this.all.find((e) => e.id === environmentId);
      if (environment) void this.read(environment).catch(this.options.onError ?? (() => {}));
    }, wait);
    timer.unref();
    this.waiting.set(environmentId, timer);
  }

  private kindOf(environment: Pick<SessionEnvironment, 'kind'>): EnvironmentKind {
    const kind = environmentKind(environment.kind);
    if (!kind) throw new ConflictError(`This was made by a kind of environment this version does not know: ${environment.kind}.`);
    return kind;
  }

  ofSession(sessionId: string): SessionEnvironment | null {
    return this.all.find((e) => e.sessionId === sessionId) ?? null;
  }

  private get(environmentId: string): SessionEnvironment {
    const found = this.all.find((e) => e.id === environmentId);
    if (!found) throw new NotFoundError(`No environment ${environmentId}`);
    return found;
  }

  /** Every kind, with whether it can be had for a folder. Reads only. */
  async offers(folder?: string): Promise<EnvironmentOffers> {
    const where = folder ?? this.options.defaultFolder();
    const offers = [];
    for (const kind of environmentKinds()) {
      const offer = await kind.offer(where).catch((error: unknown) => ({ available: false, reason: (error as Error).message, notes: [] }));
      offers.push({ kind: kind.kind, title: kind.title, words: kind.words, ...offer });
    }
    return { folder: where, offers };
  }

  /**
   * The kind a new terminal for a task works in when the owner named none: one that keeps its work apart, where the
   * folder can have it, and otherwise the folder itself. No kind is named: the first that prepares something and is
   * available is taken.
   */
  async suggestedFor(folder: string | null): Promise<string> {
    const where = folder ?? this.options.defaultFolder();
    if (this.options.keptIn !== null) {
      for (const kind of environmentKinds()) {
        if (kind.nothingPrepared) continue;
        const offer = await kind.offer(where).catch(() => null);
        if (offer?.available) return kind.kind;
      }
    }
    return plainKind().kind;
  }

  /**
   * Prepares the place a new session will work in, and says which folder its shell starts in. For the kind that
   * prepares nothing, that is the folder itself and no record is kept.
   */
  async prepare(kindName: string, session: { id: string; name: string; folder: string | null }): Promise<{ cwd: string | null }> {
    const kind = environmentKind(kindName);
    if (!kind) throw new BadInputError(`A session works in one of: ${environmentKinds().map((k) => k.kind).join(', ')}.`);
    if (kind.nothingPrepared) return { cwd: session.folder };
    if (this.options.keptIn === null) throw new ConflictError('This server has no folder to keep working copies in.');
    const folder = session.folder ?? this.options.defaultFolder();
    const id = newId();
    let made;
    try {
      made = await kind.prepare({ id, folder, sessionName: session.name, keptIn: this.options.keptIn });
    } catch (error) {
      if (error instanceof GitProblem) throw new ConflictError(error.message);
      throw error;
    }
    const environment: SessionEnvironment = { id, kind: kind.kind, title: kind.title, words: kind.words, sessionId: session.id, sessionName: session.name.slice(0, 120), ...made, createdAt: new Date().toISOString(), changes: null, broken: null };
    this.hub.emit({ type: 'environment.changed', environment });
    return { cwd: made.startFolder };
  }

  /** The session could not be started after all: what was prepared for it is taken away again. */
  async abandon(sessionId: string): Promise<void> {
    const environment = this.ofSession(sessionId);
    if (!environment) return;
    await this.kindOf(environment).cleanUp(environment, this.keptIn).catch(this.options.onError ?? (() => {}));
    this.hub.emit({ type: 'environment.removed', environmentId: environment.id });
  }

  /**
   * A session that starts inside an environment whose own session is gone takes its place: an agent moved onto
   * the canvas from a terminal that was in a working copy, or a new terminal the owner starts there.
   */
  adopt(sessionId: string, name: string, cwd: string | null): void {
    if (cwd === null || this.ofSession(sessionId)) return;
    const live = new Set(this.hub.state.sessions.map((s) => s.id));
    const found = this.all.find((e) => (e.sessionId === null || !live.has(e.sessionId)) && (cwd === e.folder || cwd.startsWith(`${e.folder}${path.sep}`)));
    if (found) this.hub.emit({ type: 'environment.changed', environment: { ...found, sessionId, sessionName: name.slice(0, 120) } });
  }

  /** Reads what changed, and whether it is whole, and keeps the counts. */
  private async read(environment: SessionEnvironment): Promise<{ environment: SessionEnvironment; changed: WhatChanged | null }> {
    const kind = this.kindOf(environment);
    this.lastRead.set(environment.id, Date.now());
    const broken = await kind.broken(environment, this.keptIn);
    let changed: WhatChanged | null = null;
    if (broken === null) {
      try {
        changed = await kind.changes(environment);
      } catch (error) {
        if (!(error instanceof GitProblem)) throw error;
      }
    }
    const now = this.all.find((e) => e.id === environment.id);
    if (!now) return { environment, changed };
    const counts = changed ? { changed: changed.changed, added: changed.added, removed: changed.removed, commits: changed.commits, uncommitted: changed.uncommitted } : null;
    const same = now.broken === broken && (counts === null || (now.changes !== null && (Object.keys(counts) as (keyof typeof counts)[]).every((key) => now.changes?.[key] === counts[key])));
    if (same) return { environment: now, changed };
    const next: SessionEnvironment = { ...now, broken, changes: counts ? { ...counts, at: new Date().toISOString() } : now.changes };
    this.hub.emit({ type: 'environment.changed', environment: next });
    return { environment: next, changed };
  }

  private async detailOf(found: SessionEnvironment): Promise<EnvironmentDetail> {
    const { environment, changed } = await this.read(found);
    return {
      kind: environment.kind,
      title: environment.title,
      words: environment.words,
      environment,
      files: changed?.files ?? [],
      filesCut: changed?.filesCut ?? false,
      onBranch: changed?.onBranch ?? null,
      note: environment.broken ?? changed?.note ?? null,
    };
  }

  /** Where a session works and which files changed there, read afresh. */
  async ofSessionDetail(sessionId: string): Promise<EnvironmentDetail> {
    const found = this.ofSession(sessionId);
    if (found) return this.detailOf(found);
    const plain = plainKind();
    return { kind: plain.kind, title: plain.title, words: plain.words, environment: null, files: [], filesCut: false, onBranch: null, note: null };
  }

  detail(environmentId: string): Promise<EnvironmentDetail> {
    return this.detailOf(this.get(environmentId));
  }

  /** The difference of one file. The file must be one the environment lists as different: no other path is opened. */
  private async differenceIn(environment: SessionEnvironment, file: string): Promise<Difference> {
    if (environment.broken !== null) throw new ConflictError(environment.broken);
    const kind = this.kindOf(environment);
    let changed;
    try {
      changed = await kind.changes(environment);
    } catch (error) {
      throw error instanceof GitProblem ? new ConflictError(error.message) : error;
    }
    const listed = changed.files.find((entry) => entry.path === file);
    if (!listed) throw new NotFoundError('That is not one of the files that changed there.');
    try {
      return await kind.difference(environment, listed);
    } catch (error) {
      throw error instanceof GitProblem ? new ConflictError(error.message) : error;
    }
  }

  differenceForSession(sessionId: string, file: string): Promise<Difference> {
    const found = this.ofSession(sessionId);
    if (!found) throw new NotFoundError('This session works in the folder it was started in: nothing is kept track of for it.');
    return this.differenceIn(found, file);
  }

  difference(environmentId: string, file: string): Promise<Difference> {
    return this.differenceIn(this.get(environmentId), file);
  }

  /** Every environment, newest first, with what its folder takes on disk. */
  async list(query: { limit: number; cursor?: string | undefined }): Promise<{ items: ListedEnvironment[]; nextCursor: string | null }> {
    const sorted = [...this.all].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const page = paginate(sorted, (e) => e.id, query);
    const items: ListedEnvironment[] = [];
    for (const found of page.items) {
      const { environment } = await this.read(found).catch(() => ({ environment: found }));
      const size = await (environmentKind(environment.kind)?.size(environment) ?? Promise.resolve({ bytes: null, atLeast: false }));
      items.push({ ...environment, bytes: size.bytes, bytesAtLeast: size.atLeast });
    }
    return { items, nextCursor: page.nextCursor };
  }

  async endings(environmentId: string): Promise<Endings> {
    const environment = this.get(environmentId);
    return { environmentId, endings: await this.kindOf(environment).endings(environment, this.keptIn) };
  }

  /**
   * The owner's choice. Refused when it is not one the kind offers now; refused with the question to ask when it
   * would lose work that exists nowhere else and the owner has not said yes a second time.
   */
  async end(environmentId: string, body: EndEnvironmentRequest): Promise<EndedEnvironment> {
    const environment = this.get(environmentId);
    const kind = this.kindOf(environment);
    const ending = (await kind.endings(environment, this.keptIn)).find((entry) => entry.choice === body.choice);
    if (!ending) throw new BadInputError('That is not one of the things that can be done with it.');
    if (!ending.available) throw new ConflictError(ending.reason ?? 'That cannot be done now.');
    if (ending.asksAgain !== null && !body.confirm) throw new ConflictError(ending.asksAgain);
    let done;
    try {
      done = await kind.end(environment, body.choice, this.keptIn);
    } catch (error) {
      throw error instanceof GitProblem ? new ConflictError(error.message) : error;
    }
    if (done.removed) {
      const timer = this.waiting.get(environmentId);
      if (timer) clearTimeout(timer);
      this.waiting.delete(environmentId);
      this.lastRead.delete(environmentId);
      this.hub.emit({ type: 'environment.removed', environmentId });
    }
    return done;
  }
}
