import { Id, firstProject, reachesProject, type AppState, type ProjectReach } from '@aubergine/shared';

/**
 * What a credential that is limited to some projects is kept from.
 *
 * Every ID in the server is of one kind of thing, and every thing is of one
 * project or shared. `projectOfId` says which. The routes use it three
 * times: on what a request names (before anything is looked up), on what a
 * request's body names, and on every answer on its way out, where anything
 * that belongs to a project outside the credential's reach is left out.
 * The last is a net under the handlers, not instead of them: a handler
 * asks for its own project's things; the net is there for the one that
 * forgets.
 */

/** The project a thing belongs to, by its ID: a project's ID, null for a thing shared with every project, undefined when nothing here has that ID. */
export function projectOfId(state: AppState, id: string): string | null | undefined {
  if (state.projects.some((project) => project.id === id)) return id;
  const owned =
    state.canvases.find((thing) => thing.id === id) ??
    state.sessions.find((thing) => thing.id === id) ??
    state.queue.tasks.find((thing) => thing.id === id) ??
    state.queue.asks.find((thing) => thing.id === id) ??
    state.queue.rules.find((thing) => thing.id === id) ??
    state.schedules.items.find((thing) => thing.id === id) ??
    state.environments.find((thing) => thing.id === id);
  if (owned) return owned.projectId;
  const run = state.runs.find((thing) => thing.id === id);
  if (run) return (run.sessionId !== null ? state.sessions.find((s) => s.id === run.sessionId)?.projectId : undefined) ?? run.projectId ?? firstProject(state).id;
  const shared = state.workflows.find((thing) => thing.id === id) ?? state.shelf.find((thing) => thing.id === id) ?? state.library.sources.find((thing) => thing.id === id) ?? state.library.installed.find((thing) => thing.id === id) ?? state.tokens.find((thing) => thing.id === id);
  if (shared) return shared.projectId;
  const draft = state.drafts.find((thing) => thing.id === id);
  if (draft) return (draft.sessionId ? state.sessions.find((s) => s.id === draft.sessionId)?.projectId : undefined) ?? null;
  // A frame or a node: of its canvas.
  for (const canvas of state.canvases) if (canvas.layout.nodes.some((node) => node.id === id) || canvas.layout.frames.some((frame) => frame.id === id)) return canvas.projectId;
  return undefined;
}

const isId = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && Id.safeParse(value).success;

/** Remembers which project an ID was of, for things that are gone by the time they are spoken of (a change that says only "this was removed"). */
export class ProjectMemory {
  private readonly seen = new Map<string, string | null>();
  constructor(private readonly state: () => AppState) {}
  of(id: string): string | null | undefined {
    const now = projectOfId(this.state(), id);
    if (now !== undefined) {
      this.seen.set(id, now);
      if (this.seen.size > 50_000) this.seen.delete(this.seen.keys().next().value as string);
      return now;
    }
    return this.seen.get(id);
  }
  /** Looks at everything a value names, so that it is remembered. */
  note(value: unknown): void {
    walk(value, (id) => void this.of(id));
  }
}

function walk(value: unknown, each: (id: string) => void, depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (isId(value)) each(value);
  else if (Array.isArray(value)) for (const item of value) walk(item, each, depth + 1);
  else if (typeof value === 'object') for (const item of Object.values(value)) walk(item, each, depth + 1);
}

/** Whether a request's body or query names anything of a project the reach does not cover. Looked at as it was sent, before it is read as anything. */
export function namesOutOfReach(value: unknown, reach: ProjectReach, of: (id: string) => string | null | undefined): boolean {
  let out = false;
  walk(value, (id) => {
    if (!reachesProject(reach, of(id))) out = true;
  });
  return out;
}

const OUT = Symbol('out of reach');

/**
 * An answer with everything left out that belongs to a project outside the reach. A thing is outside when it says so
 * itself (`projectId`) or names something that is (an ID among its own fields). A thing in a list is dropped from
 * the list; an ID in a list of IDs is dropped; a thing that holds such a thing outside a list is itself outside.
 * Returns `null` when the answer as a whole is outside: the caller answers as for a thing that is not there.
 */
export function withinReach<T>(answer: T, reach: ProjectReach, of: (id: string) => string | null | undefined): T | null {
  const outside = (id: string): boolean => !reachesProject(reach, of(id));
  const clean = (value: unknown, depth: number): unknown => {
    if (depth > 12 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const kept: unknown[] = [];
      for (const item of value) {
        if (isId(item)) {
          if (!outside(item)) kept.push(item);
          continue;
        }
        const cleaned = clean(item, depth + 1);
        if (cleaned !== OUT) kept.push(cleaned);
      }
      return kept;
    }
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // A record keyed by IDs (how each project's tasks are started): an entry of a project outside is dropped.
      if (isId(key) && outside(key)) continue;
      if (isId(item)) {
        if (outside(item)) return OUT;
        next[key] = item;
        continue;
      }
      const cleaned = clean(item, depth + 1);
      if (cleaned === OUT) return OUT;
      next[key] = cleaned;
    }
    return next;
  };
  const cleaned = clean(answer, 0);
  return cleaned === OUT ? null : (cleaned as T);
}
