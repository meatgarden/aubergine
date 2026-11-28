import { applyEvent, newId, type AppState, type ChangeEvent } from '@aubergine/shared';
import type { Store } from './store/store';

/** `revision`: the number of this change, counted from when this server started. */
export type EventListener = (event: ChangeEvent, revision: number) => void;

/** One change as it was told: the event and its number. */
export interface ToldChange {
  readonly event: ChangeEvent;
  readonly revision: number;
}

/**
 * How many of its most recent changes the hub remembers, for a follower that was away for a moment and asks what it
 * missed. Memory only: not state, not a log, never written anywhere, and gone with the server.
 */
export const RECENT_CHANGES = 2000;

/**
 * Holds the canvas state. `emit` is the only way to change it: the event is
 * applied, the new state is saved, and every listener is told.
 */
export class StateHub {
  private current: AppState;
  private readonly listeners = new Set<EventListener>();
  private lastSave: Promise<void> = Promise.resolve();
  /**
   * How many changes there have been since this server started. Given with the whole state and with each change, so
   * that whoever follows both can tell which is newer. Not kept: it starts again with the server, under a new epoch.
   */
  private changes = 0;
  /** Names this run of the server. A follower that sees another epoch knows the numbers started again. */
  readonly epoch: string = newId();
  /** Changes that were made and not yet told to the listeners, in order. */
  private readonly untold: { event: ChangeEvent; revision: number }[] = [];
  private telling = false;
  /** The changes of a step that is being made and is not whole yet; null outside one. */
  private step: { event: ChangeEvent; revision: number }[] | null = null;

  /**
   * The last `RECENT_CHANGES` changes that were told, as a ring: the change numbered `n` is at `n % size`. It never
   * grows, whoever reads it and however slowly.
   */
  private readonly recent: (ToldChange | undefined)[];
  /** The number of the last change the listeners were told of. */
  private told = 0;

  constructor(
    initial: AppState,
    private readonly store: Store,
    private readonly onSaveError: (error: unknown) => void = () => {},
    /** How many recent changes are remembered. Another number than the usual one is for tests. */
    remembered: number = RECENT_CHANGES,
  ) {
    this.current = initial;
    this.recent = new Array<ToldChange | undefined>(Math.max(1, remembered));
  }

  get state(): AppState {
    return this.current;
  }

  /** The number of the last change that is in `state`. Read in the same turn as `state`, the two belong together. */
  get revision(): number {
    return this.changes;
  }

  /**
   * Several changes as one step that either wholly happens or leaves nothing. While `work` runs, each change it
   * makes is applied, so that what it does next sees what it did before, and nobody is told and nothing is saved.
   * When it returns, the whole is saved once and the listeners are told of each change in order. When it throws, the
   * state is as it was before, and nobody ever hears of any of it. `work` must not wait for anything.
   */
  atomically<T>(work: () => T): T {
    if (this.step !== null) return work();
    const before = { state: this.current, changes: this.changes };
    this.step = [];
    let made: { event: ChangeEvent; revision: number }[];
    let result: T;
    try {
      result = work();
      if (result instanceof Promise) throw new Error('A step that either wholly happens or not cannot wait for anything');
      made = this.step;
    } catch (error) {
      this.current = before.state;
      this.changes = before.changes;
      this.step = null;
      throw error;
    }
    this.step = null;
    if (made.length === 0) return result;
    this.lastSave = this.store.save(this.current).catch(this.onSaveError);
    this.tell(made);
    return result;
  }

  emit(event: ChangeEvent): void {
    this.current = applyEvent(this.current, event);
    this.changes += 1;
    if (this.step !== null) {
      // Part of a step that is not whole yet: applied, and told when the step is.
      this.step.push({ event, revision: this.changes });
      return;
    }
    this.lastSave = this.store.save(this.current).catch(this.onSaveError);
    // Told in the order the changes were made. A listener that makes a change of its own while it is being told of one
    // would otherwise have that later change reach the listeners after it before the earlier one did, and whoever
    // follows by number would take the earlier one for something it already has.
    this.tell([{ event, revision: this.changes }]);
  }

  private tell(made: readonly { event: ChangeEvent; revision: number }[]): void {
    this.untold.push(...made);
    if (this.telling) return;
    this.telling = true;
    try {
      for (let next = this.untold.shift(); next !== undefined; next = this.untold.shift()) {
        // Remembered before anyone is told: whoever starts listening in the same turn as it asks `since` gets every
        // change from one or the other, and none from both.
        this.recent[next.revision % this.recent.length] = next;
        this.told = next.revision;
        for (const listener of [...this.listeners]) listener(next.event, next.revision);
      }
    } finally {
      this.telling = false;
      this.untold.length = 0;
    }
  }

  /** The number of the last change the listeners were told of. Outside a listener it is `revision`. */
  get toldRevision(): number {
    return this.told;
  }

  /**
   * The changes told after the one numbered `revision`, oldest first, as a list of the caller's own: what it does
   * with it, and how long it takes, holds up no change. `null` when that is further back than is remembered, or is
   * a number no change here has had. Whoever calls `subscribe` in the same turn misses nothing and gets nothing twice.
   */
  since(revision: number): ToldChange[] | null {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > this.told) return null;
    if (this.told - revision > this.recent.length) return null;
    const out: ToldChange[] = [];
    for (let n = revision + 1; n <= this.told; n += 1) {
      const kept = this.recent[n % this.recent.length];
      // Cannot happen while changes are told in order; said rather than sent with a hole in it.
      if (kept === undefined || kept.revision !== n) return null;
      out.push(kept);
    }
    return out;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves when everything emitted so far has been saved. */
  flush(): Promise<void> {
    return this.lastSave;
  }
}
