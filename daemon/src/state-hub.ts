import { applyEvent, newId, type AppState, type ChangeEvent } from '@aubergine/shared';
import type { Store } from './store/store';

/** `revision`: the number of this change, counted from when this server started. */
export type EventListener = (event: ChangeEvent, revision: number) => void;

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

  constructor(
    initial: AppState,
    private readonly store: Store,
    private readonly onSaveError: (error: unknown) => void = () => {},
  ) {
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  /** The number of the last change that is in `state`. Read in the same turn as `state`, the two belong together. */
  get revision(): number {
    return this.changes;
  }

  emit(event: ChangeEvent): void {
    this.current = applyEvent(this.current, event);
    this.changes += 1;
    this.lastSave = this.store.save(this.current).catch(this.onSaveError);
    // Told in the order the changes were made. A listener that makes a change of its own while it is being told of one
    // would otherwise have that later change reach the listeners after it before the earlier one did, and whoever
    // follows by number would take the earlier one for something it already has.
    this.untold.push({ event, revision: this.changes });
    if (this.telling) return;
    this.telling = true;
    try {
      for (let next = this.untold.shift(); next !== undefined; next = this.untold.shift()) {
        for (const listener of [...this.listeners]) listener(next.event, next.revision);
      }
    } finally {
      this.telling = false;
      this.untold.length = 0;
    }
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
