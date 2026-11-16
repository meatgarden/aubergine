import { useEffect, useSyncExternalStore } from 'react';
import type { RepositoryListing, WorkflowContent } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { registerReviewSource, type ReviewItem } from './registry';

/**
 * Workflow files kept in repositories, as things to review: the second
 * source of the review screen. What a repository offers is read from disk by
 * the server when asked, so it is fetched here, not part of the page's state.
 */

type Listing = RepositoryListing['items'];
let listing: Listing = [];
const listeners = new Set<() => void>();
/** The hash of each file as it was when it was last read for review: what an acceptance is of. */
const read = new Map<string, string>();

const DECLINED = 'aubergine.repository.declined';
function declined(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DECLINED) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Reads again what the repositories offer. Called when a screen that shows them opens, and after a decision. */
export async function refreshRepositories(): Promise<void> {
  try {
    listing = (await api.listRepositoryWorkflows()).items as Listing;
    for (const listener of listeners) listener();
  } catch {
    // Without an answer the last one stands.
  }
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const idOf = (root: string, file: string): string => `${root}\n${file}`;
const partsOf = (id: string): { root: string; file: string } => {
  const at = id.indexOf('\n');
  return { root: id.slice(0, at), file: id.slice(at + 1) };
};

/** The files that wait for the owner: never accepted, or changed since. Pure. */
export function itemsOfListing(items: Listing, hidden: ReadonlySet<string> = new Set()): ReviewItem[] {
  return items.flatMap((repository) =>
    repository.workflows
      .filter((w) => (w.state === 'review' || w.state === 'changed') && !hidden.has(`${repository.root}\n${w.file}\n${w.hash}`))
      .map((w) => ({
        id: idOf(repository.root, w.file),
        title: w.name ?? w.file,
        what: w.state === 'changed' ? 'A workflow file that changed since you accepted it' : 'A workflow file',
        from: `the repository “${repository.folder}” (${w.file} in ${repository.root}/.aubergine/workflows)`,
        asked: '',
        state: 'waiting' as const,
        comment: null,
        revision: w.state === 'changed' ? 2 : 1,
      })),
  );
}

/** What the repositories offer, read when first asked for and again whenever the terminals' folders change. */
export function useRepositoryListing(): Listing {
  // The folders the terminals are in decide which repositories there are.
  const folders = useApp((s) => (s.app?.sessions ?? []).map((x) => x.cwd ?? '').join('\n'));
  useEffect(() => {
    void refreshRepositories();
  }, [folders]);
  return useSyncExternalStore(subscribe, () => listing);
}

registerReviewSource({
  id: 'repository',
  title: 'Kept in a repository',
  useItems: () => {
    const items = useRepositoryListing();
    return itemsOfListing(items, declined());
  },
  load: async (id) => {
    const { root, file } = partsOf(id);
    const detail = await api.getRepositoryWorkflow(root, file);
    if (detail.workflow.hash) read.set(id, detail.workflow.hash);
    return { text: detail.text, previousText: detail.previousText, needs: detail.needs, proposal: { workflow: detail.content as WorkflowContent | null, element: null } } as never;
  },
  accept: async (id, edited) => {
    const { root, file } = partsOf(id);
    if (edited?.workflow) {
      // The file is what it is: an edited version cannot be "accepted" into it. It becomes a workflow of the owner's own.
      const { extra: _extra, ...fields } = edited.workflow;
      await api.createWorkflow({ ...fields, origin: { kind: 'repository', file } });
      return;
    }
    await api.acceptRepositoryWorkflow(root, file, read.get(id) ?? '');
    await refreshRepositories();
  },
  // Nothing is deleted from the repository: this content is just not offered for review again in this browser.
  discard: async (id) => {
    const hash = read.get(id);
    if (hash) {
      try {
        localStorage.setItem(DECLINED, JSON.stringify([...declined(), `${id}\n${hash}`].slice(-200)));
      } catch {
        // Not being able to remember this is harmless: it is offered again.
      }
    }
    // A new list, so that whoever shows it looks again.
    listing = [...listing];
    for (const listener of listeners) listener();
  },
});
