import type { Difference, Ending, EnvironmentFile, SessionEnvironment } from '@aubergine/shared';

/**
 * The seam for where a session works. A kind, given the folder a session
 * would start in, prepares a place, says which folder the shell starts in,
 * reports what changed there, and cleans up.
 *
 * Kinds are registered, like kinds of source and kinds of element. Nothing
 * in the session code, a route or a screen compares a kind to a name; a
 * kind gives its own title and its own words for how far it keeps an agent
 * apart, and those are what is shown. A further kind is a registration and
 * nothing else.
 *
 * No kind here is a boundary. The words of a kind must say "kept apart" and
 * never more: whatever runs in a session runs as the owner.
 */

export interface Offer {
  available: boolean;
  /** When not: why, in a sentence. */
  reason: string | null;
  /** What to know before choosing it. */
  notes: string[];
}

/** What a kind made, as far as the state keeps it. */
export interface Prepared {
  /** The owner's own folder it was made from. */
  projectFolder: string;
  /** The folder that was prepared. */
  folder: string;
  /** The folder the shell starts in. */
  startFolder: string;
  branch: string | null;
  startCommit: string | null;
}

export interface WhatChanged {
  changed: number;
  added: number;
  removed: number;
  commits: number;
  uncommitted: number;
  files: EnvironmentFile[];
  filesCut: boolean;
  onBranch: string | null;
  note: string | null;
}

export interface EnvironmentKind {
  kind: string;
  /** What it is called where it is chosen: `In its own working copy`. */
  title: string;
  /** Its own words for how far it keeps an agent apart, shown on the terminal. Never more than "kept apart". */
  words: string;
  /** True for a kind that prepares nothing: the session works in the folder itself, and no record is kept. */
  nothingPrepared?: boolean;
  /** Whether it can be had for a folder. Reads only. */
  offer(folder: string): Promise<Offer>;
  /**
   * Prepares a place for a session that would start in `folder`. `keptIn` is the folder of the data folder this
   * kind may make things in; `id` is unique and `sessionName` is whatever the owner called the session, which may
   * hold anything. If it throws, nothing it made is left.
   */
  prepare(input: { id: string; folder: string; sessionName: string; keptIn: string }): Promise<Prepared>;
  /** What changed there since it was prepared. Names and counts. */
  changes(environment: SessionEnvironment): Promise<WhatChanged>;
  /** The difference of one of those files, as bounded text. */
  difference(environment: SessionEnvironment, file: EnvironmentFile): Promise<Difference>;
  /** Why it cannot be used any more; null while it is whole. */
  broken(environment: SessionEnvironment, keptIn: string): Promise<string | null>;
  /** What the owner can do with it when its session ends. */
  endings(environment: SessionEnvironment, keptIn: string): Promise<Ending[]>;
  /** Does one of those. The caller has made sure it is available and, where it asks again, that the owner said yes twice. */
  end(environment: SessionEnvironment, choice: string, keptIn: string): Promise<{ removed: boolean; says: string }>;
  /** Takes away everything it made, whatever state that is in: for a session that could not be started after all. */
  cleanUp(environment: SessionEnvironment, keptIn: string): Promise<void>;
  /** What its folder takes on disk. */
  size(environment: SessionEnvironment): Promise<{ bytes: number | null; atLeast: boolean }>;
}

const kinds = new Map<string, EnvironmentKind>();

export function registerEnvironmentKind(kind: EnvironmentKind): void {
  kinds.set(kind.kind, kind);
}
export function unregisterEnvironmentKind(kind: string): void {
  kinds.delete(kind);
}
export const environmentKind = (kind: string): EnvironmentKind | undefined => kinds.get(kind);
export const environmentKinds = (): EnvironmentKind[] => [...kinds.values()];
/** The kind a session has when nothing was prepared for it. */
export const plainKind = (): EnvironmentKind => environmentKinds().find((kind) => kind.nothingPrepared) as EnvironmentKind;
