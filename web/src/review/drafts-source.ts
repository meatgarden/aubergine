import type { AppState, Draft } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { registerReviewSource, type ReviewItem } from './registry';

/** A draft as the review screen lists it. Pure. */
export function itemOfDraft(draft: Draft, app: Pick<AppState, 'sessions' | 'workflows'>): ReviewItem {
  const revised = draft.revisesWorkflowId ? app.workflows.find((w) => w.id === draft.revisesWorkflowId) : undefined;
  const by = draft.proposedBy;
  const session = by.kind === 'session' ? app.sessions.find((s) => s.id === by.sessionId) : undefined;
  return {
    id: draft.id,
    title: draft.workflow?.name ?? draft.element?.name ?? (draft.kind === 'element' ? 'An element, not written yet' : 'A workflow, not written yet'),
    what: draft.kind === 'element' ? 'An element' : revised ? `A new version of “${revised.name}”` : 'A workflow',
    from: by.kind === 'session' ? `the agent in “${session?.name ?? 'a terminal that is gone'}”` : by.kind === 'token' ? `a program, with the token “${by.name}”` : 'you',
    asked: draft.description,
    state: draft.status,
    comment: draft.comment,
    revision: draft.revision,
  };
}

const NONE: Draft[] = [];

/** Drafts: what agents and programs proposed. The first source of things to review. */
registerReviewSource({
  id: 'drafts',
  title: 'Proposed by agents and programs',
  useItems: () => {
    const drafts = useApp((s) => s.app?.drafts ?? NONE);
    const app = useApp((s) => s.app);
    return app ? [...drafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((draft) => itemOfDraft(draft, app)) : [];
  },
  load: async (id) => {
    const detail = await api.getDraft(id);
    return { text: detail.text, previousText: detail.previousText, needs: detail.needs, proposal: { workflow: detail.draft.workflow, element: detail.draft.element } } as never;
  },
  accept: async (id, edited) => {
    await api.acceptDraft(id, edited as never);
    useApp.getState().apply({ type: 'draft.removed', draftId: id });
  },
  sendBack: async (id, comment) => {
    const draft = await api.returnDraft(id, comment);
    useApp.getState().apply({ type: 'draft.changed', draft: draft as never });
  },
  discard: async (id) => {
    await api.discardDraft(id);
    useApp.getState().apply({ type: 'draft.removed', draftId: id });
  },
});
