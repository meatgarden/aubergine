import { z } from 'zod';
import { Id } from './ids';
import { Need, RunInputs, WorkflowContent } from './workflows';

/**
 * Workflows kept in a project's repository: files in `.aubergine/workflows/`
 * at the top of a Git repository, in the format `workflow export` writes.
 *
 * Anyone who can push to a repository can change those files, and what is in
 * them is text an agent will obey. So a repository workflow is read by the
 * owner before it can be run, and again whenever its content changes; what
 * was accepted is remembered by where the repository is, the file's name and
 * a hash of the file's bytes.
 */

export const REPOSITORY_FOLDER = '.aubergine/workflows';
/** How many files of a repository are looked at. */
export const REPOSITORY_MAX_FILES = 50;
/** How large one file may be, in bytes. */
export const REPOSITORY_MAX_BYTES = 512 * 1024;
/** How many acceptances are remembered; the oldest go first. */
export const REPOSITORY_ACCEPTED_MAX = 500;

/** A file name the server is willing to write: lower-case letters, digits and dashes, then `.json`. */
export const RepositoryFileName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}\.json$/);

/**
 * The file a workflow is saved to in a repository, from its name: lower-case
 * letters, digits and dashes only, whatever the name holds. A name with
 * nothing usable in it becomes `workflow.json`.
 */
export function repositoryFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    // An accent taken apart from its letter is dropped: é becomes e.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${base || 'workflow'}.json`;
}

/** The name of a file as it is found in a repository: any one path segment, shown as it is. */
const FoundFileName = z.string().min(1).max(255);

export const RepositoryWorkflowState = z.enum([
  /** This exact content was read and accepted by the owner. It can be run. */
  'accepted',
  /** Never accepted. A person has to review it first. */
  'review',
  /** Accepted once, and changed since. A person has to review the change first. */
  'changed',
  /** Not a workflow file this version can read. */
  'unreadable',
]);
export type RepositoryWorkflowState = z.infer<typeof RepositoryWorkflowState>;

/** One file of a repository's workflow folder, as it stands now. */
export const RepositoryWorkflow = z.object({
  file: FoundFileName,
  /** The workflow's name; null when the file could not be read. */
  name: z.string().nullable(),
  /** The names of its elements, in order. */
  elements: z.array(z.string()),
  /** A hash of the file's bytes: what an acceptance is of. */
  hash: z.string().nullable(),
  state: RepositoryWorkflowState,
  /** For a file that could not be read, or was skipped: why. */
  reason: z.string().nullable().default(null),
});
export type RepositoryWorkflow = z.infer<typeof RepositoryWorkflow>;

/** The workflows a repository offers. */
export const RepositoryOffer = z.object({
  /** The top folder of the repository; null when the session's folder is in none, or it has no workflow folder. */
  root: z.string().nullable(),
  /** The name of that folder, for a heading. */
  folder: z.string().nullable(),
  workflows: z.array(RepositoryWorkflow),
  /** True when the folder holds more files than are looked at. */
  truncated: z.boolean().default(false),
});
export type RepositoryOffer = z.infer<typeof RepositoryOffer>;

/** What the owner accepted: this content, of this file, in this repository. Kept so that a later change can be shown against it. */
export const AcceptedRepositoryWorkflow = z.object({
  root: z.string().max(4096),
  file: FoundFileName,
  hash: z.string().max(128),
  content: WorkflowContent,
  acceptedAt: z.iso.datetime(),
});
export type AcceptedRepositoryWorkflow = z.infer<typeof AcceptedRepositoryWorkflow>;

/* ---------- Bodies and answers ---------- */

/** A repository's workflows as the owner's screens list them: with the sessions whose folder is in it. */
export const RepositoryListing = z.object({
  items: z.array(RepositoryOffer.extend({ root: z.string(), folder: z.string(), sessionIds: z.array(Id) })),
  nextCursor: z.string().nullable(),
});
export type RepositoryListing = z.infer<typeof RepositoryListing>;

/** Names one file of a repository. The repository must be that of a session there is: no other folder is ever read. */
export const RepositoryFileRef = z.object({
  root: z.string().min(1).max(4096).describe('The top folder of the repository, as the list gives it. It must be the repository of a session.'),
  file: FoundFileName.describe('The name of the file, as the list gives it.'),
});

/** One repository workflow as the owner reads it before accepting. */
export const RepositoryWorkflowDetail = z.object({
  workflow: RepositoryWorkflow,
  root: z.string(),
  /** The whole text it would tell an agent, element by element. */
  text: z.string(),
  /** The same for the content accepted before, when it has changed since; null otherwise. */
  previousText: z.string().nullable(),
  needs: z.array(Need),
  content: WorkflowContent.nullable(),
});
export type RepositoryWorkflowDetail = z.infer<typeof RepositoryWorkflowDetail>;

export const AcceptRepositoryWorkflowRequest = RepositoryFileRef.extend({
  hash: z.string().min(1).max(128).describe('The hash of the content that was read. If the file has changed since, nothing is accepted.'),
});
export type AcceptRepositoryWorkflowRequest = z.infer<typeof AcceptRepositoryWorkflowRequest>;

export const SaveToRepositoryRequest = z.object({
  sessionId: Id.describe('A session whose folder is inside the repository to write to.'),
  workflowId: Id.describe('The workflow to write.'),
  overwrite: z.boolean().default(false).describe('Replace the file if there is one of that name. Without this, that is refused.'),
});
export type SaveToRepositoryRequest = z.infer<typeof SaveToRepositoryRequest>;
export const SavedToRepository = z.object({ root: z.string(), file: z.string(), path: z.string(), overwritten: z.boolean() });
export type SavedToRepository = z.infer<typeof SavedToRepository>;

/** Body of starting a run of a repository workflow on a session whose folder is in that repository. */
export const RunRepositoryWorkflowRequest = z.object({
  file: FoundFileName.describe('The file, as the list gives it.'),
  inputs: RunInputs.describe('The inputs the workflow asks for, by key.'),
  replace: z.boolean().default(false).describe('Stop the run the session is on, if any, and start this.'),
  kickoff: z.boolean().default(true).describe('Type the fixed kickoff line, for the owner, where an agent is running.'),
});
export type RunRepositoryWorkflowRequest = z.infer<typeof RunRepositoryWorkflowRequest>;

/** What an agent is told about a repository workflow that cannot be run yet. */
export const NEEDS_REVIEW = 'A person has to review it first: it comes from a file in the repository, and has not been accepted as it is now. Ask the owner to open Review in Aubergine.';
