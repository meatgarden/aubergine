import { useEffect } from 'react';
import { pluginFileHref, pluginRuns, pluginStanding, type PluginFound, type PluginsAnswer } from '@aubergine/shared';
import { shownPlain } from '../custom-css';
import { useApp } from '../store';
import { makePluginApi } from './api';
import { failed, reportOf, setReport } from './reports';

/**
 * Loading the owner's plugins into the page. Only once the page is signed in and drawn (never on the sign-in screen,
 * never before the first paint, never in its way), only what the own server says is switched on and can be loaded
 * now, in the order of their IDs, each by a native `import()` of its main module at its address under its digest: no
 * bundler, no `eval`, no build step. Its stylesheet is linked before the owner's own `custom.css`, which keeps the last
 * word. A page opened with `?plain` loads none. A plugin that fails to load, has no `activate`, or whose `activate`
 * throws or rejects is reported (Settings → Plugins) and what it added is taken away; the others carry on.
 *
 * Switched off, a plugin's `deactivate` is called and everything it added through the API is taken away at once; what
 * it did past the API is not known to the page, and goes only with a reload.
 */

/** How a module is imported: the browser's own `import()`, or a stand-in in a test. */
export type Importer = (href: string) => Promise<unknown>;
const browserImport: Importer = (href) => import(/* @vite-ignore */ href);

/** How long a plugin's `activate` is waited for before the next is loaded. It is still let finish. */
export const ACTIVATE_WAIT_MS = 5000;

interface Loaded {
  digest: string;
  deactivate: (() => unknown) | null;
  removeAll: () => void;
  style: HTMLLinkElement | null;
}
const loaded = new Map<string, Loaded>();

/** The plugins that are to run now: switched on at the digest they have, or following changes, in the order of their IDs. Pure. */
export function toRun(answer: PluginsAnswer): PluginFound[] {
  return answer.plugins.filter((found) => pluginRuns(pluginStanding(found, answer.on[found.id]))).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Links a plugin's stylesheet: after the app's own, before the owner's `custom.css` (which has the last word). */
function linkStyle(id: string, href: string, head: HTMLElement = document.head): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('data-plugin-style', id);
  link.setAttribute('href', href);
  const own = head.querySelector('link[data-custom-css]');
  if (own) head.insertBefore(link, own);
  else head.appendChild(link);
  return link;
}

/** The function a module activates with: `activate` named, or the default export's, or the default export itself. */
function activateOf(module: unknown): { activate: ((api: unknown) => unknown) | null; deactivate: (() => unknown) | null } {
  const m = (module ?? {}) as { activate?: unknown; deactivate?: unknown; default?: unknown };
  const d = (m.default ?? {}) as { activate?: unknown; deactivate?: unknown };
  const activate = typeof m.activate === 'function' ? m.activate : typeof d.activate === 'function' ? d.activate : typeof m.default === 'function' ? m.default : null;
  const deactivate = typeof m.deactivate === 'function' ? m.deactivate : typeof d.deactivate === 'function' ? d.deactivate : null;
  return { activate: activate as ((api: unknown) => unknown) | null, deactivate: deactivate as (() => unknown) | null };
}

async function load(found: PluginFound, importer: Importer): Promise<void> {
  const manifest = found.manifest;
  const digest = found.digest;
  if (!manifest || !digest) return;
  setReport(found.id, { state: 'loading', digest });
  const fail = (error: unknown): void => failed(found.id, digest, error);
  const made = makePluginApi({ id: found.id, name: manifest.name, version: manifest.version }, fail);
  const style = manifest.style ? linkStyle(found.id, pluginFileHref(found.id, digest, manifest.style)) : null;
  const entry: Loaded = { digest, deactivate: null, removeAll: made.removeAll, style };
  loaded.set(found.id, entry);
  const undo = (): void => {
    made.removeAll();
    style?.remove();
    if (loaded.get(found.id) === entry) loaded.delete(found.id);
  };
  let module: unknown;
  try {
    module = await importer(pluginFileHref(found.id, digest, manifest.main));
  } catch (error) {
    undo();
    return fail(error instanceof Error ? new Error(`It could not be loaded: ${error.message}`) : error);
  }
  // Switched off while it was on its way.
  if (loaded.get(found.id) !== entry) return;
  const { activate, deactivate } = activateOf(module);
  if (!activate) {
    undo();
    return fail(new Error('Its module has no activate function: export function activate(aubergine) { … }.'));
  }
  entry.deactivate = deactivate;
  try {
    const activating = Promise.resolve(activate(made.aubergine));
    let late = false;
    const timer = new Promise<void>((resolve) =>
      setTimeout(() => {
        late = true;
        resolve();
      }, ACTIVATE_WAIT_MS),
    );
    await Promise.race([activating, timer]);
    if (late) {
      // The next one is not kept waiting; this one is let finish, and said as it ends.
      activating.then(
        () => loaded.get(found.id) === entry && setReport(found.id, { state: 'running', digest }),
        (error: unknown) => {
          undo();
          fail(error);
        },
      );
      return;
    }
    await activating;
  } catch (error) {
    undo();
    return fail(error);
  }
  if (loaded.get(found.id) === entry) setReport(found.id, { state: 'running', digest });
}

/** Takes a plugin out of the page: its `deactivate`, then everything it added through the API, then its stylesheet. */
function unload(id: string): void {
  const entry = loaded.get(id);
  if (!entry) return;
  loaded.delete(id);
  try {
    entry.deactivate?.();
  } catch (error) {
    failed(id, entry.digest, error);
  }
  entry.removeAll();
  entry.style?.remove();
  const report = reportOf(id);
  if (report?.state !== 'failed') setReport(id, { state: 'unloaded', digest: entry.digest });
}

let chain: Promise<void> = Promise.resolve();

/**
 * Brings the page to what the answer says should run: what no longer should is taken out (and what runs at another
 * digest than it has now is taken out and loaded again), and what should and is not running is loaded, one after the
 * other in the order of their IDs. Calls are done in the order made.
 */
export function syncPlugins(answer: PluginsAnswer, options: { importer?: Importer; plain?: boolean } = {}): Promise<void> {
  const importer = options.importer ?? browserImport;
  const plain = options.plain ?? shownPlain();
  chain = chain.then(async () => {
    const wanted = plain ? [] : toRun(answer);
    const byId = new Map(wanted.map((found) => [found.id, found]));
    for (const [id, entry] of [...loaded]) if (byId.get(id)?.digest !== entry.digest) unload(id);
    // What failed and is no longer to run is forgotten: switched on again, it is tried again.
    for (const id of answer.plugins.map((found) => found.id)) if (!byId.has(id) && reportOf(id)?.state === 'failed') setReport(id, null);
    for (const found of wanted) {
      if (loaded.has(found.id)) continue;
      // A plugin that failed at this digest is not tried again until it changes, or the page is loaded again.
      const report = reportOf(found.id);
      if (report?.state === 'failed' && report.digest === found.digest) continue;
      await load(found, importer);
    }
  });
  return chain;
}

/** Takes every plugin out of the page: a page that is no longer signed in runs none. */
export function unloadAll(): void {
  for (const id of [...loaded.keys()]) unload(id);
}

/** Which plugins are in the page now, by ID, with the digest they were loaded at. */
export const loadedNow = (): ReadonlyMap<string, string> => new Map([...loaded].map(([id, entry]) => [id, entry.digest]));

/** Keeps the page's plugins as the own server says. Used once, at the root of the app. */
export function usePlugins(): void {
  const phase = useApp((s) => s.phase);
  const answer = useApp((s) => s.plugins);
  useEffect(() => {
    if (phase !== 'ready') {
      if (phase === 'unauthorized') unloadAll();
      return;
    }
    // After the page is drawn: never in the way of its first paint.
    const timer = window.setTimeout(() => void syncPlugins(answer), 0);
    return () => window.clearTimeout(timer);
  }, [phase, answer]);
}
