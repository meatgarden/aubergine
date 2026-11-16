import { awayDigest, type AppState, type AwayDigest, type ChangeEvent, type Moment } from '@aubergine/shared';
import type { StateHub } from './state-hub';

/**
 * What changed lately, for someone coming back to the page. It listens to
 * the change events everyone gets and keeps a bounded window of moments in
 * memory. It is not state and not a log: nothing is written, and after a
 * restart it remembers only from then on, and says so.
 */

const MAX_MOMENTS = 2000;

/** What is remembered about each terminal and run, to tell a change from a repeat. */
export interface AwayMemory {
  waiting: Map<string, boolean>;
  finishedAt: Map<string, string | null>;
  drafts: Set<string>;
  element: Map<string, string | null>;
}

export function memoryOf(state: Pick<AppState, 'sessions' | 'drafts' | 'runs'>): AwayMemory {
  return {
    waiting: new Map(state.sessions.map((s) => [s.id, s.attention.state === 'waiting'])),
    finishedAt: new Map(state.sessions.map((s) => [s.id, s.status.lastFinishedAt])),
    drafts: new Set(state.drafts.filter((d) => d.status === 'waiting').map((d) => d.id)),
    element: new Map(state.runs.map((r) => [r.id, r.currentElementId])),
  };
}

/**
 * The moment an event is, if it is one worth telling someone who was away.
 * What is needed to tell a change from a repeat is kept in `memory`, which
 * this updates.
 */
export function momentOf(event: ChangeEvent, memory: AwayMemory, at: string, workflowName: (workflowId: string) => string): Moment | null {
  switch (event.type) {
    case 'session.attention': {
      const was = memory.waiting.get(event.sessionId) ?? false;
      const now = event.attention.state === 'waiting';
      memory.waiting.set(event.sessionId, now);
      if (now && !was) return { at, kind: 'waiting', sessionId: event.sessionId, runId: null, detail: `started waiting for you${event.attention.message ? `: ${event.attention.message}` : '.'}` };
      if (event.attention.state === 'done') return { at, kind: 'agent-finished', sessionId: event.sessionId, runId: null, detail: `says it has finished${event.attention.message ? `: ${event.attention.message}` : '.'}` };
      if (was && !now) return { at, kind: 'no-longer-waiting', sessionId: event.sessionId, runId: null, detail: 'is no longer waiting.' };
      return null;
    }
    case 'session.status': {
      const before = memory.finishedAt.get(event.sessionId) ?? null;
      memory.finishedAt.set(event.sessionId, event.status.lastFinishedAt);
      // A command that has just ended, and not well. The command itself is not said: it is what the terminal showed.
      if (event.status.lastFinishedAt !== null && event.status.lastFinishedAt !== before && event.status.lastExit !== null && event.status.lastExit !== 0) {
        return { at, kind: 'command-failed', sessionId: event.sessionId, runId: null, detail: `had a command fail (exit ${event.status.lastExit}).` };
      }
      return null;
    }
    case 'run.moved': {
      const before = memory.element.get(event.run.id);
      memory.element.set(event.run.id, event.run.currentElementId);
      if (event.run.status === 'blocked') return { at, kind: 'run-moved', sessionId: event.run.sessionId, runId: event.run.id, detail: `is blocked on "${workflowName(event.run.workflowId)}"${event.run.blockedReason ? `: ${event.run.blockedReason}` : '.'}` };
      // Waiting for the owner's decision is said as that, not as having moved on.
      if (event.run.status === 'awaiting' && before !== event.run.currentElementId) return { at, kind: 'run-moved', sessionId: event.run.sessionId, runId: event.run.id, detail: `waits for your approval in "${workflowName(event.run.workflowId)}".` };
      if (before === event.run.currentElementId) return null;
      return { at, kind: 'run-moved', sessionId: event.run.sessionId, runId: event.run.id, detail: `moved on in "${workflowName(event.run.workflowId)}".` };
    }
    case 'run.finished':
      memory.element.delete(event.run.id);
      return { at, kind: 'run-finished', sessionId: event.run.sessionId, runId: event.run.id, detail: `${event.run.status === 'finished' ? 'finished' : 'stopped'} "${workflowName(event.run.workflowId)}".` };
    case 'draft.changed': {
      if (event.draft.status !== 'waiting' || memory.drafts.has(event.draft.id)) return null;
      memory.drafts.add(event.draft.id);
      return { at, kind: 'draft-arrived', sessionId: event.draft.sessionId, runId: null, detail: `${event.draft.sessionId ? 'handed in' : 'A program handed in'} ${event.draft.kind === 'element' ? 'an element' : 'a workflow'} for you to review.` };
    }
    case 'draft.removed':
      memory.drafts.delete(event.draftId);
      return null;
    default:
      return null;
  }
}

export class Away {
  private readonly moments: Moment[] = [];
  private readonly memory: AwayMemory;
  /** The oldest time the window still covers: the start, or later once moments were dropped. */
  private remembersFrom: string;
  private dropped = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly hub: StateHub,
    private readonly now: () => Date = () => new Date(),
    private readonly max: number = MAX_MOMENTS,
  ) {
    this.remembersFrom = this.now().toISOString();
    this.memory = memoryOf(hub.state);
    this.unsubscribe = hub.subscribe((event) => {
      const names = new Map(this.hub.state.workflows.map((w) => [w.id, w.versions.at(-1)?.name ?? w.name]));
      const moment = momentOf(event, this.memory, this.now().toISOString(), (id) => names.get(id) ?? 'a workflow');
      if (!moment) return;
      this.moments.push(moment);
      if (this.moments.length > this.max) {
        const gone = this.moments.shift();
        if (gone) this.remembersFrom = gone.at;
        this.dropped = true;
      }
    });
  }

  close(): void {
    this.unsubscribe();
  }

  /** What changed since a time, as far back as is remembered. */
  digest(since: string): AwayDigest {
    const why = this.dropped ? 'So much has happened that the earliest of it is no longer kept: this starts later than you left.' : 'The server was started after you left: this is what changed since it started.';
    const sessions = new Map(this.hub.state.sessions.map((s) => [s.id, s.name]));
    return awayDigest(this.moments, since, this.remembersFrom, why, (id) => sessions.get(id) ?? null);
  }
}
