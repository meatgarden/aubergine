import type { ChangeEvent } from '@aubergine/shared';

/**
 * Who is told of each change event once the page has applied it (`apply` in the store): a plugin's
 * `aubergine.state.onEvent`. A listener that throws is said through `onError` and the others are still told.
 */

type Listener = (event: ChangeEvent) => void;
const listeners = new Set<{ listener: Listener; onError: (error: unknown) => void }>();

export function onChange(listener: Listener, onError: (error: unknown) => void = () => {}): () => void {
  const entry = { listener, onError };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

export function tellChange(event: ChangeEvent): void {
  for (const { listener, onError } of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      onError(error);
    }
  }
}
