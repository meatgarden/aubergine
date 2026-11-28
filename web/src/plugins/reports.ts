import { showControl } from '@aubergine/shared';

/**
 * What became of each plugin in this page: loading, running, or failed with what it said. Memory only: nothing about
 * a plugin is remembered by the browser or sent anywhere. Settings → Plugins reads it (`subscribeToReports`).
 */

export type PluginReport =
  | { state: 'loading'; digest: string }
  | { state: 'running'; digest: string }
  | { state: 'failed'; digest: string; message: string }
  /** It was switched off while this page ran it: what it did past the API may still be on the page until a reload. */
  | { state: 'unloaded'; digest: string };

const reports = new Map<string, PluginReport>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, PluginReport> = new Map();

function changed(): void {
  snapshot = new Map(reports);
  for (const listener of listeners) listener();
}

export function setReport(id: string, report: PluginReport | null): void {
  if (report === null) reports.delete(id);
  else reports.set(id, report);
  changed();
}

/** A plugin failed: what it said, as text with its control characters shown, at most a few hundred characters. */
export function failed(id: string, digest: string, error: unknown): void {
  const said = error instanceof Error ? error.message || error.name : typeof error === 'string' ? error : (() => {
    try {
      return JSON.stringify(error) ?? String(error);
    } catch {
      return String(error);
    }
  })();
  const message = showControl(said || 'It failed and said nothing.').slice(0, 400);
  // The first failure is the one said: what follows from it is usually the same thing again.
  const before = reports.get(id);
  if (before?.state === 'failed' && before.digest === digest) return;
  setReport(id, { state: 'failed', digest, message });
}

export const reportsNow = (): ReadonlyMap<string, PluginReport> => snapshot;
export const reportOf = (id: string): PluginReport | undefined => reports.get(id);

export function subscribeToReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
