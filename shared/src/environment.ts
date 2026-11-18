import { z } from 'zod';
import { Id } from './ids';

/**
 * Where a session works. Today a session works either in the folder it was
 * started in, or in a working copy of its own: a second checkout of the same
 * repository, on a branch of its own, so that two agents on one repository
 * do not touch each other's files.
 *
 * A working copy keeps work apart. It is not a boundary: the agent runs as
 * the owner and can reach every file the owner can. Nothing here may be
 * described as more than "kept apart".
 *
 * Kinds are registered in the daemon. Nothing in a screen or a route
 * compares a kind to a name: a kind gives its own title and its own words
 * for how far it keeps an agent apart, and those are what is shown.
 */

const Timestamp = z.iso.datetime();

export const EnvironmentKindName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'A kind is lower-case letters, digits and dashes');

/** How much an environment differs from what it started from. Counts only: no names, no content. */
export const EnvironmentCounts = z.object({
  changed: z.number().int().min(0).describe('Files that were there at the start and are different now.'),
  added: z.number().int().min(0).describe('Files that are new, committed or not.'),
  removed: z.number().int().min(0).describe('Files that were there at the start and are gone.'),
  commits: z.number().int().min(0).describe('Commits made since the start.'),
  uncommitted: z.number().int().min(0).describe('Of those files, how many hold work that is in no commit.'),
  at: Timestamp.describe('When this was last read.'),
});
export type EnvironmentCounts = z.infer<typeof EnvironmentCounts>;

/** A place prepared for a session, as the state keeps it. */
export const SessionEnvironment = z.object({
  id: Id,
  projectId: Id.describe('The project it was made in: its session\'s. Kept when the session is gone.'),
  kind: EnvironmentKindName,
  title: z.string().max(80).describe("What the kind is called, as it was when this was made: `Its own working copy`."),
  words: z.string().max(400).describe("The kind's own words for how far it keeps an agent apart. Never more than 'kept apart'."),
  sessionId: Id.nullable().describe('The session that works in it. Null when that session is gone.'),
  sessionName: z.string().max(120).describe('The name of the session it was made for, as it was then.'),
  projectFolder: z.string().max(4096).describe("The owner's own folder it was made from: for a working copy, the top of their checkout."),
  folder: z.string().max(4096).describe('The folder that was prepared.'),
  startFolder: z.string().max(4096).describe('The folder inside it that the session started in.'),
  branch: z.string().max(200).nullable().describe('For a working copy: the branch made for it.'),
  startCommit: z
    .string()
    .regex(/^[0-9a-f]{40,64}$/)
    .nullable()
    .describe('For a working copy: the commit it started from. "What changed" is told against this.'),
  createdAt: Timestamp,
  changes: EnvironmentCounts.nullable().default(null).describe('What changed, as last read; null before the first reading.'),
  broken: z.string().max(400).nullable().default(null).describe('Why it cannot be used any more, in a sentence: its folder was deleted, or its repository moved. Null while it is whole.'),
});
export type SessionEnvironment = z.infer<typeof SessionEnvironment>;

/* ---------- Names made for a working copy ---------- */

/**
 * A session's name, made into something that can be a folder's name and part
 * of a branch's: lower-case letters, digits and dashes, nothing else. A
 * session's name may hold anything; none of it reaches Git or the file
 * system except through this.
 */
export function plainSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    // An accented letter is its letter: the marks that were split off are dropped.
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug === '' ? 'terminal' : slug;
}

/** The six characters that make two names of one session's name differ: from the random end of an ID. */
export const shortPart = (id: string): string => id.replace(/[^0-9a-f]/g, '').slice(-6).padStart(6, '0');

export const COPY_BRANCH_PREFIX = 'aubergine/';
/** What a branch or a folder made here looks like. Checked again where each is used. */
export const COPY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{6}$/;
export const COPY_BRANCH = /^aubergine\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{6}$/;

/** The folder name and the branch for a working copy of a session of that name. */
export function copyNames(sessionName: string, id: string): { folder: string; branch: string } {
  const folder = `${plainSlug(sessionName)}-${shortPart(id)}`;
  return { folder, branch: `${COPY_BRANCH_PREFIX}${folder}` };
}

/* ---------- What goes over the wire ---------- */

/** One kind, as it is offered for a folder. */
export const EnvironmentOffer = z.object({
  kind: EnvironmentKindName,
  title: z.string(),
  words: z.string().describe("The kind's own words for how far it keeps an agent apart."),
  available: z.boolean(),
  reason: z.string().nullable().describe('When it is not available for this folder: why, in a sentence.'),
  notes: z.array(z.string()).describe('What to know before choosing it, in sentences: what is not carried over, what will not be there.'),
});
export type EnvironmentOffer = z.infer<typeof EnvironmentOffer>;
export const EnvironmentOffers = z.object({ folder: z.string(), offers: z.array(EnvironmentOffer) });
export type EnvironmentOffers = z.infer<typeof EnvironmentOffers>;
export const OffersQuery = z.object({ folder: z.string().startsWith('/').max(4096).optional().describe('The folder a session would start in. Without one: the folder new sessions start in.') });
export type OffersQuery = z.infer<typeof OffersQuery>;

export const FILES_MAX = 500;
export const DIFFERENCE_MAX_BYTES = 200_000;

/** One file that differs from the start. A name and a word: no content. */
export const EnvironmentFile = z.object({
  path: z.string().describe('From the top of the working copy.'),
  state: z.enum(['changed', 'added', 'removed']),
  committed: z.boolean().describe('False when the file holds work that is in no commit.'),
});
export type EnvironmentFile = z.infer<typeof EnvironmentFile>;

/** Where a session works, and what changed there. File names and counts; the text of a difference is asked for by file. */
export const EnvironmentDetail = z.object({
  kind: EnvironmentKindName,
  title: z.string(),
  words: z.string(),
  environment: SessionEnvironment.nullable().describe('Null for a session that works in the folder it was started in: nothing was prepared for it.'),
  files: z.array(EnvironmentFile).describe(`The files that differ from the start, at most ${FILES_MAX}.`),
  filesCut: z.boolean().describe('True when there are more files than are listed.'),
  onBranch: z.string().nullable().describe('The branch the working copy is on now. Other than its own when someone changed it there.'),
  note: z.string().nullable().describe('Anything else worth saying, in a sentence.'),
});
export type EnvironmentDetail = z.infer<typeof EnvironmentDetail>;

export const DifferenceQuery = z.object({ file: z.string().min(1).max(4096).describe('One of the files the environment lists as different.') });
export type DifferenceQuery = z.infer<typeof DifferenceQuery>;

/** The difference of one file against the start, as text. This is content: what is in the owner's files. */
export const Difference = z.object({
  file: z.string(),
  state: z.enum(['changed', 'added', 'removed']),
  text: z.string().describe('The difference in the usual form of lines with `+` and `-`. Empty when it is not drawn.'),
  cut: z.boolean().describe('True when the text was longer than is given.'),
  notDrawn: z.string().nullable().describe('Why there is no text: the file is not text, or is too large.'),
});
export type Difference = z.infer<typeof Difference>;

/** An environment in the list of all of them, with what it takes on disk. */
export const ListedEnvironment = SessionEnvironment.extend({
  bytes: z.number().int().min(0).nullable().describe('What its folder takes on disk. Null when it could not be measured.'),
  bytesAtLeast: z.boolean().describe('True when measuring stopped early: it takes at least that much.'),
});
export type ListedEnvironment = z.infer<typeof ListedEnvironment>;

/** One thing the owner can do with an environment when its session ends. The kind says which there are. */
export const Ending = z.object({
  choice: z.string().regex(/^[a-z][a-z-]{0,39}$/),
  label: z.string(),
  says: z.string().describe('What it does, in a sentence.'),
  available: z.boolean(),
  reason: z.string().nullable().describe('When it is not available: why.'),
  asksAgain: z.string().nullable().describe('When choosing it would lose work that exists nowhere else: the question to ask once more, naming what would be lost. Null when nothing would be.'),
});
export type Ending = z.infer<typeof Ending>;
export const Endings = z.object({ environmentId: Id, endings: z.array(Ending) });
export type Endings = z.infer<typeof Endings>;

export const EndEnvironmentRequest = z.object({
  choice: z.string().regex(/^[a-z][a-z-]{0,39}$/).describe('One of the choices the environment offers.'),
  confirm: z.boolean().default(false).describe('True after the second question was answered with yes. Without it, a choice that would lose work that exists nowhere else is refused with that question.'),
});
export type EndEnvironmentRequest = z.infer<typeof EndEnvironmentRequest>;
export const EndedEnvironment = z.object({ removed: z.boolean().describe('True when nothing is kept of it in Aubergine.'), says: z.string() });
export type EndedEnvironment = z.infer<typeof EndedEnvironment>;

/** `3 changed, 1 added, 2 removed`, or `nothing changed`. */
export function countsWords(counts: Pick<EnvironmentCounts, 'changed' | 'added' | 'removed'>): string {
  const parts = [counts.changed > 0 ? `${counts.changed} changed` : '', counts.added > 0 ? `${counts.added} added` : '', counts.removed > 0 ? `${counts.removed} removed` : ''].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(', ') : 'nothing changed';
}

/** A size in a few characters: `812 kB`, `1.4 GB`. */
export function bytesWords(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * What a session is told about where it works, in plain lines. One function: the command a session types and
 * the tool an agent calls both print this. For a working copy it says where it is, which branch is its own, to
 * commit there, and what to leave alone. That is advice to an agent; nothing here prevents anything.
 */
export function whereWords(detail: EnvironmentDetail): string {
  const environment = detail.environment;
  if (environment === null) return ['This session works in the folder it was started in, on the files that are there.', 'Other sessions in the same folder work on the same files. Nothing keeps their changes and yours apart.'].join('\n');
  const lines = [`This session works ${detail.title.charAt(0).toLowerCase()}${detail.title.slice(1)}.`, `Folder: ${environment.folder}`];
  if (environment.branch) lines.push(`Branch: ${environment.branch}  (made for this session; it started from commit ${(environment.startCommit ?? '').slice(0, 12)})`);
  if (environment.broken) return [...lines, '', `It cannot be used as it is: ${environment.broken}`, 'Stop, and tell your owner.'].join('\n');
  lines.push(
    '',
    'What that means for you:',
    '- Do your work in this folder. Commit it here, on this branch: your owner reads what you changed from it, and work that is not committed is easy to lose.',
    '- Do not change to another branch here, and do not make this branch follow another.',
    `- Do not work in ${environment.projectFolder}: that is your owner's own checkout, and other sessions may have copies of their own.`,
    '- Do not merge, rebase or push unless your owner asks. They decide what becomes of this branch.',
    '- Files Git ignores or does not track were not brought along: installed dependencies, local settings. If the project needs an install step, it needs it here too.',
    '',
    `Since it started: ${countsWords(environment.changes ?? { changed: 0, added: 0, removed: 0 })}${environment.changes && environment.changes.commits > 0 ? `, in ${environment.changes.commits} commit${environment.changes.commits === 1 ? '' : 's'}` : ''}${environment.changes && environment.changes.uncommitted > 0 ? `; ${environment.changes.uncommitted} not committed yet` : ''}.`,
  );
  if (detail.note) lines.push(detail.note);
  return lines.join('\n');
}
