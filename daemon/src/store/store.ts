import type { CanvasState } from '@aubergine/shared';

/** Persistence seam. One implementation for now: a JSON file. */
export interface Store {
  /** Returns the saved state, or a fresh initial state when nothing is saved yet. */
  load(): Promise<CanvasState>;
  /** Saves the whole state. Resolves once this state, or a newer one, is on disk. */
  save(state: CanvasState): Promise<void>;
}
