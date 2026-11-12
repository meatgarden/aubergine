import { applyEvent, type CanvasState, type ChangeEvent } from '@aubergine/shared';
import type { Store } from './store/store';

export type EventListener = (event: ChangeEvent) => void;

/**
 * Holds the canvas state. `emit` is the only way to change it: the event is
 * applied, the new state is saved, and every listener is told.
 */
export class Canvas {
  private current: CanvasState;
  private readonly listeners = new Set<EventListener>();
  private lastSave: Promise<void> = Promise.resolve();

  constructor(
    initial: CanvasState,
    private readonly store: Store,
    private readonly onSaveError: (error: unknown) => void = () => {},
  ) {
    this.current = initial;
  }

  get state(): CanvasState {
    return this.current;
  }

  emit(event: ChangeEvent): void {
    this.current = applyEvent(this.current, event);
    this.lastSave = this.store.save(this.current).catch(this.onSaveError);
    for (const listener of [...this.listeners]) listener(event);
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
