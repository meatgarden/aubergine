import { useEffect, useState } from 'react';
import type { Element, InstallRequestDetail, WorkflowContent } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { registerReviewSource, type ReviewItem } from './registry';

/**
 * Installs from the library, as things to review: the third source of the
 * review screen. An install waits here until the owner has read exactly what
 * would be installed. What is accepted is named by the digest of what was
 * shown: if the file is not that any more, nothing is installed.
 */

type Waiting = Pick<InstallRequestDetail, 'request' | 'item' | 'what' | 'from' | 'requestedBy'>;

/** The digest of each waiting install's file as it was when it was last shown: what an acceptance is of. */
const shown = new Map<string, string>();

/** A waiting install as the review screen lists it. Pure. */
export function itemOfRequest(waiting: Waiting): ReviewItem {
  return {
    id: waiting.request.id,
    title: waiting.item?.name ?? 'Something that is no longer listed',
    what: waiting.what,
    from: waiting.from,
    asked: waiting.requestedBy === 'you' ? '' : `Asked for by ${waiting.requestedBy}. It was written by whoever published it, not by them and not by you.`,
    state: 'waiting',
    comment: null,
    revision: 1,
  };
}

/** What a waiting install's reviewer is shown. Pure. */
export function detailOfRequest(detail: InstallRequestDetail) {
  return {
    text: detail.text ?? 'It could not be read. It cannot be installed; discard it.',
    previousText: detail.previousText,
    needs: detail.needs.map((advice) => advice.need),
    proposal: { workflow: detail.proposal.workflow as WorkflowContent | null, element: detail.proposal.element as Element | null },
    notices: [
      'Someone else wrote this, and an agent will follow it. Read all of it before you accept.',
      ...detail.warnings,
      ...detail.needs.map((advice) => `It needs ${advice.need.kind === 'mcp' ? 'an MCP server' : advice.need.kind === 'command' ? 'the command' : advice.need.kind === 'access' ? 'access to' : ''} “${advice.need.name}”: ${advice.words}`.replace('  ', ' ')),
    ],
    also: detail.installedText !== null ? [{ title: 'As it was when you installed it', text: detail.installedText }] : [],
  };
}

registerReviewSource({
  id: 'library',
  title: 'From the library',
  useItems: () => {
    // The requests are in the page's state; what each is called and where it comes from is asked of the server when they change.
    const requests = useApp((s) => s.app?.library.requests);
    const key = (requests ?? []).map((request) => request.id).join(' ');
    const [waiting, setWaiting] = useState<Waiting[]>([]);
    useEffect(() => {
      let cancelled = false;
      if (key === '') {
        setWaiting([]);
        return;
      }
      void api.libraryRequests().then(
        (found) => !cancelled && setWaiting(found.requests as Waiting[]),
        () => undefined,
      );
      return () => {
        cancelled = true;
      };
    }, [key]);
    return waiting.filter((entry) => (requests ?? []).some((request) => request.id === entry.request.id)).map(itemOfRequest);
  },
  load: async (id) => {
    const detail = (await api.libraryRequest(id)) as InstallRequestDetail;
    if (detail.digest) shown.set(id, detail.digest);
    return detailOfRequest(detail) as never;
  },
  accept: async (id, edited) => {
    await api.acceptLibraryRequest(id, shown.get(id) ?? '', edited as never);
    shown.delete(id);
    useApp.getState().apply({ type: 'library.request.removed', requestId: id });
  },
  discard: async (id) => {
    await api.discardLibraryRequest(id);
    shown.delete(id);
    useApp.getState().apply({ type: 'library.request.removed', requestId: id });
  },
});
