import type { ComponentType } from 'react';
import type { Element, Need, WorkflowContent } from '@aubergine/shared';

/**
 * The review screen shows "things to review" and knows nothing about where
 * they come from. A source of such things registers itself here; drafts by
 * agents and programs are the first. The screen draws whatever is registered.
 */

/** One thing waiting to be read. */
export interface ReviewItem {
  id: string;
  /** What it is called. */
  title: string;
  /** `A step`, `A workflow`, `A new version of "Fix a bug"`. */
  what: string;
  /** Who it is from, in words. */
  from: string;
  /** What was asked for, when someone asked. */
  asked: string;
  /** `waiting`: to be read now. `requested`: asked for, nothing handed in yet. `returned`: sent back, not revised yet. */
  state: 'waiting' | 'requested' | 'returned';
  comment: string | null;
  revision: number;
}

/** What the reviewer reads of one thing. */
export interface ReviewDetail {
  /** Exactly what an agent would be told, all of it. */
  text: string;
  /** The same for the version before; null when there is none. */
  previousText: string | null;
  needs: Need[];
  /** What it holds, for editing before accepting. */
  proposal: { workflow: WorkflowContent | null; element: Element | null };
  /** Things to be said above the text, each a sentence: what to be careful about. Absent where there is nothing to say. */
  notices?: string[];
  /** Further texts to read beside it, each with what it is. */
  also?: { title: string; text: string }[];
  /** What the text is, over it, where it is not what an agent would be told (a file to be written as it is). */
  textTitle?: string;
}

export interface ReviewSource {
  id: string;
  /** The heading its items are listed under. */
  title: string;
  /** A hook giving the items there are now. */
  useItems: () => ReviewItem[];
  load: (id: string) => Promise<ReviewDetail>;
  /** Accepts it, as it stands or as edited. */
  accept: (id: string, edited?: { workflow?: WorkflowContent; element?: Element }) => Promise<void>;
  /** Sends it back with a comment; absent where that makes no sense. */
  sendBack?: (id: string, comment: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  /** What the owner chooses before accepting, where a source has such choices: drawn below what is read. The source keeps what was chosen. */
  Choices?: ComponentType<{ id: string }>;
  /** True where what is read cannot be edited before it is accepted. */
  readOnly?: boolean;
}

const sources = new Map<string, ReviewSource>();
export function registerReviewSource(source: ReviewSource): void {
  sources.set(source.id, source);
}
export function unregisterReviewSource(id: string): void {
  sources.delete(id);
}
export const reviewSources = (): ReviewSource[] => [...sources.values()];
