import { z } from 'zod';
import { DRAFT_COMMENT_MAX, DRAFT_DESCRIPTION_MAX, Draft, DraftRecord, DraftStatus, SHELF_NOTE_MAX, ShelfElement, ShelfVersion } from './drafts';
import { Id } from './ids';
import { PageQuery, pageOf } from './protocol';
import {
  ArchivedRun,
  Element,
  ELEMENT_TEXT_HARD_MAX,
  ElementId,
  NEEDS_MAX,
  Need,
  PlainName,
  Origin,
  RunInputs,
  RunReport,
  RunStatus,
  WorkflowContent,
  WorkflowInput,
  WorkflowLabels,
  WorkflowVersion,
  latestVersion,
  type Run,
  type Workflow,
} from './workflows';

/**
 * What goes over the wire about workflows and runs. The entities themselves
 * are in `workflows.ts`; these are the bodies and answers of the routes.
 */

/** A workflow in a list: what it is, without its text. */
export const WorkflowSummary = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  labels: WorkflowLabels,
  origin: Origin,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** The number of its latest version. */
  version: z.number().int(),
  /** The names of its elements, in order. */
  elements: z.array(z.string()),
});
export type WorkflowSummary = z.infer<typeof WorkflowSummary>;

/** A workflow with everything its latest version says. */
export const WorkflowDetail = WorkflowSummary.extend({ current: WorkflowVersion });
export type WorkflowDetail = z.infer<typeof WorkflowDetail>;

export function summaryOfWorkflow(workflow: Workflow): WorkflowSummary {
  const current = latestVersion(workflow);
  const { versions: _versions, projectId: _projectId, listed: _listed, ...rest } = workflow;
  return { ...rest, version: current.number, elements: current.elements.map((e) => e.name) };
}
export const detailOfWorkflow = (workflow: Workflow): WorkflowDetail => ({ ...summaryOfWorkflow(workflow), current: latestVersion(workflow) });

/** An element as it is sent in: the ID may be left out, and is then made from the name. */
export const ElementInput = Element.partial({ id: true }).describe('One element. Leave `id` out for a new one; keep it for one that exists, so that runs can tell which is which.');
export type ElementInput = z.infer<typeof ElementInput>;

const contentFields = {
  name: WorkflowContent.shape.name.describe('What it is called.'),
  // Without defaults: a field that is left out of a change must stay as it is, not be emptied.
  description: z.string().trim().max(2000).describe('What it is for, in a sentence or two.'),
  standing: z.string().max(ELEMENT_TEXT_HARD_MAX).describe('Text added to every element: rules that hold from start to finish.'),
  inputs: z.array(WorkflowInput).max(20).describe('What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`.'),
  elements: z.array(ElementInput).min(1).max(200).describe('The elements, in the order they are gone through.'),
  labels: z.record(z.string().max(63), z.string().max(256)).describe('Pairs of key and value for tools of your own to give meaning to.'),
  origin: Origin.describe('Where it came from. Left out, it was made here.'),
  extra: z.record(z.string(), z.unknown()).describe('Fields from a file that this version does not know, kept so they are written out again.'),
};

export const CreateWorkflowRequest = z.object({
  name: contentFields.name,
  description: contentFields.description.optional(),
  standing: contentFields.standing.optional(),
  inputs: contentFields.inputs.optional(),
  elements: contentFields.elements,
  labels: contentFields.labels.optional(),
  origin: contentFields.origin.optional(),
  extra: contentFields.extra.optional(),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequest>;

/** Body of changing a workflow. Whatever is sent replaces what was there; a change of content is saved as a new version. */
export const UpdateWorkflowRequest = z.object({
  name: contentFields.name.optional(),
  description: contentFields.description.optional(),
  standing: contentFields.standing.optional(),
  inputs: contentFields.inputs.optional(),
  elements: contentFields.elements.optional(),
  labels: contentFields.labels.optional(),
});
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequest>;

export const CopyWorkflowRequest = z.object({ name: contentFields.name.optional().describe('The name of the copy. Without one: the name with "copy" after it.') });
export type CopyWorkflowRequest = z.infer<typeof CopyWorkflowRequest>;

export const WorkflowList = pageOf(WorkflowSummary);
export type WorkflowList = z.infer<typeof WorkflowList>;
export const WorkflowVersionList = pageOf(WorkflowVersion);
export type WorkflowVersionList = z.infer<typeof WorkflowVersionList>;

/** A workflow that comes with the server, to start from. */
export const WorkflowTemplate = z.object({
  /** What it is asked for by: lower-case words with dashes. */
  name: z.string(),
  title: z.string(),
  description: z.string(),
  content: WorkflowContent,
});
export type WorkflowTemplate = z.infer<typeof WorkflowTemplate>;
export const WorkflowTemplateList = pageOf(WorkflowTemplate);
export type WorkflowTemplateList = z.infer<typeof WorkflowTemplateList>;

export const TemplateName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const UseTemplateRequest = z.object({ name: contentFields.name.optional().describe('The name of the new workflow. Without one, the template\'s own title.') });
export type UseTemplateRequest = z.infer<typeof UseTemplateRequest>;

/* ---------- Runs ---------- */

const runFields = {
  workflowId: Id.describe('The workflow to go through. The run keeps to the version that is latest now.'),
  inputs: RunInputs.describe('The inputs the workflow asks for, by key.'),
  replace: z.boolean().default(false).describe('When the session is already on a run: stop that one and start this. Without it, that is refused.'),
  kickoff: z.boolean().default(true).describe('Type the line that tells the agent about the run into the session\'s terminal. Done for the owner, and for an API token that may type into that very session (`terminal:input` with a reach that covers it), and only when an agent is running there. Any other caller is given the line in the answer and nothing is typed.'),
};

/** Body of starting a run. Without a session it waits, queued. */
export const StartRunRequest = z.object({ ...runFields, sessionId: Id.optional().describe('The session that will do it. Without one the run waits, queued.') });
export type StartRunRequest = z.infer<typeof StartRunRequest>;
export const StartSessionRunRequest = z.object(runFields);
export type StartSessionRunRequest = z.infer<typeof StartSessionRunRequest>;

/** A run with what is needed to show it without fetching its workflow. The same shape for a live run and one from the archive. */
export const RunRecord = ArchivedRun;
export type RunRecord = ArchivedRun;
export const RunList = pageOf(RunRecord);
export type RunList = z.infer<typeof RunList>;

/** One run in full: the record, and exactly what whoever is on it is told now. */
export const RunDetail = RunRecord.extend({
  /** Where it stands in a few words, for example `Build · 2 of 3`. */
  position: z.string(),
  /** What the agent is told about its current element: the text `aubergine workflow status` prints. */
  text: z.string(),
  /** The line that sets an agent off on this run. */
  kickoff: z.string(),
  /** Whether that line was typed into the session's terminal by this call. */
  kickoffTyped: z.boolean().default(false),
});
export type RunDetail = z.infer<typeof RunDetail>;

export const RunsQuery = PageQuery.extend({
  status: z
    .enum([...RunStatus.options, 'live', 'ended'])
    .default('live')
    .describe('`live` (the default): runs still going. `ended`: finished and stopped runs, newest first, from the archive. Or one status.'),
  sessionId: Id.optional().describe('Only runs of this session.'),
  workflowId: Id.optional().describe('Only runs of this workflow.'),
});
export type RunsQuery = z.infer<typeof RunsQuery>;

/** Body of reporting on a run. `done` names the element it finishes, so that sending it twice finishes one element, not two. */
export const ReportRunRequest = RunReport;
export type ReportRunRequest = z.infer<typeof ReportRunRequest>;

/** What a session may report about its own run: everything but giving a run a session. */
export const ReportOwnRunRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('done'), elementId: ElementId.optional().describe('The element being finished. Without it: the current one.'), note: z.string().max(10_000).optional().describe('What was done, for whoever comes next.'),
    output: z.unknown().optional().describe('What the element produced, when it declares an output other than a note: for a checklist, `{"items": [{"text": "…"}]}`.'),
  }),
  z.object({ type: z.literal('blocked'), reason: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal('goto'), elementId: ElementId }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('stop') }),
]);
export type ReportOwnRunRequest = z.infer<typeof ReportOwnRunRequest>;

/** What the browser needs to draw a run without asking: its record. */
export const recordOfRun = (run: Run, workflow: Workflow | undefined): RunRecord => {
  const version = workflow?.versions.find((v) => v.number === run.workflowVersion);
  return { run, workflowName: version?.name ?? workflow?.name ?? '(removed workflow)', elements: (version?.elements ?? []).map((e) => ({ id: e.id, name: e.name, produces: e.produces })) };
};

/* ---------- Drafts ---------- */

/** Body of proposing a draft, and of revising one: a workflow, or one element. */
export const ProposeDraftRequest = z
  .object({
    workflow: CreateWorkflowRequest.omit({ labels: true, origin: true, extra: true }).optional().describe('A whole workflow. Give this or `element`, not both.'),
    element: ElementInput.optional().describe('One element, for the shelf.'),
    revisesWorkflowId: Id.optional().describe('For a workflow: the workflow this is a new version of. Without it, accepting makes a new workflow.'),
    description: z.string().max(DRAFT_DESCRIPTION_MAX).optional().describe('What it is meant to do, when nobody asked for it.'),
  })
  .refine((body) => (body.workflow === undefined) !== (body.element === undefined), 'Give a workflow or an element, one of the two');
export type ProposeDraftRequest = z.infer<typeof ProposeDraftRequest>;

/** A draft with what a reviewer reads: everything it would tell an agent, what it needs, and what changed since the version before. */
export const DraftDetail = z.object({
  draft: Draft,
  /** The whole text an agent would be told, element by element, with stand-in inputs. Empty until something is handed in. */
  text: z.string(),
  /** The same for the version before the last revision; null when there was none. */
  previousText: z.string().nullable(),
  needs: z.array(Need),
});
export type DraftDetail = z.infer<typeof DraftDetail>;
export const DraftList = pageOf(Draft);
export type DraftList = z.infer<typeof DraftList>;

export const DraftRecordList = pageOf(DraftRecord);
export type DraftRecordList = z.infer<typeof DraftRecordList>;

/** Body of asking an agent for a draft. Only a fixed sentence is typed into the terminal; the description is read by the agent with a command. */
export const RequestDraftRequest = z.object({
  kind: z.enum(['workflow', 'element']),
  description: z.string().trim().min(1).max(DRAFT_DESCRIPTION_MAX).describe('What you want, in your own words.'),
  sessionId: Id.describe('The session whose agent is asked.'),
  tell: z.boolean().default(true).describe('Type the fixed request line into the terminal, when an agent is running there.'),
});
export type RequestDraftRequest = z.infer<typeof RequestDraftRequest>;
export const RequestedDraft = z.object({ draft: Draft, told: z.boolean(), line: z.string() });
export type RequestedDraft = z.infer<typeof RequestedDraft>;

/** Body of accepting a draft. The content may be sent as the owner edited it; without it, the draft is accepted as it stands. */
export const AcceptDraftRequest = z.object({
  workflow: CreateWorkflowRequest.omit({ labels: true, origin: true, extra: true }).optional().describe('The workflow as edited before accepting.'),
  element: ElementInput.optional().describe('The element as edited before accepting.'),
});
export type AcceptDraftRequest = z.infer<typeof AcceptDraftRequest>;
export const AcceptedDraft = z.object({ workflowId: Id.nullable(), elementId: Id.nullable() });
export type AcceptedDraft = z.infer<typeof AcceptedDraft>;

export const ReturnDraftRequest = z.object({ comment: z.string().trim().min(1).max(DRAFT_COMMENT_MAX).describe('What should change.') });
export type ReturnDraftRequest = z.infer<typeof ReturnDraftRequest>;

/** What a session asked for a draft is told: the request, the format, the limits, and how to hand it in. */
export const Brief = z.object({ text: z.string(), kind: z.enum(['workflow', 'element']), status: DraftStatus });
export type Brief = z.infer<typeof Brief>;

/* ---------- The shelf ---------- */

export const ShelfList = pageOf(ShelfElement);
export type ShelfList = z.infer<typeof ShelfList>;
export const CreateShelfElementRequest = ElementInput;
export type CreateShelfElementRequest = z.infer<typeof CreateShelfElementRequest>;
/** Body of changing a shelf element. Whatever is sent replaces what was there; what is left out stays. */
export const UpdateShelfElementRequest = z.object({
  kind: z.string().min(1).max(40).optional(),
  name: PlainName.optional(),
  instructions: z.string().max(ELEMENT_TEXT_HARD_MAX).optional(),
  doneWhen: z.string().trim().max(500).optional(),
  needs: z.array(Need).max(NEEDS_MAX).optional(),
  produces: z.string().min(1).max(40).optional(),
  note: z
    .string()
    .trim()
    .max(SHELF_NOTE_MAX)
    .regex(/^[^\p{Cc}\u202a-\u202e\u2066-\u2069]*$/u, 'A note on a version is one line of plain text')
    .optional()
    .describe('One line on what changed. Kept with the new version.'),
});
export type UpdateShelfElementRequest = z.infer<typeof UpdateShelfElementRequest>;

/** Body of running one element by itself, on a session. */
export const RunElementRequest = z.object({
  sessionId: Id.describe('The session that will do it.'),
  inputs: RunInputs.describe('What the element asks for: `task`, when its text uses it.'),
  replace: z.boolean().default(false).describe('Stop the run the session is on, if any, and start this.'),
  kickoff: z.boolean().default(true).describe('Type the fixed kickoff line, for the owner, where an agent is running.'),
});
export type RunElementRequest = z.infer<typeof RunElementRequest>;

/** Body of ticking an item of what an element produced. */
export const TickRequest = z.object({
  elementId: ElementId.describe('The element whose output it is.'),
  item: z.number().int().min(0).describe('Which item, counting from zero.'),
  ticked: z.boolean().describe('True to tick it, false to take the tick away.'),
});
export type TickRequest = z.infer<typeof TickRequest>;

/* ---------- The life of a shelf element ---------- */

export const ShelfVersionList = pageOf(ShelfVersion);
export type ShelfVersionList = z.infer<typeof ShelfVersionList>;

/** Where a shelf element is used: the workflows that hold a copy, and what can be told about each copy. */
export const ShelfUsage = z.object({
  uses: z.array(
    z.object({
      workflowId: Id,
      workflowName: z.string(),
      workflowVersion: z.number().int().min(1).describe("The number of the workflow's newest version."),
      copies: z.array(
        z.object({
          elementId: z.string(),
          name: z.string(),
          state: z.enum(['none', 'unchanged', 'changed', 'behind', 'both', 'unknown', 'gone']).describe('`unchanged`, `changed` (here, since it was copied), `behind` (a newer version is on the shelf), `both`, or `unknown` for a copy from before versions were kept.'),
          copiedVersion: z.number().int().min(1).nullable(),
        }),
      ),
      inVersions: z.array(z.number().int().min(1)).describe('Every kept version of the workflow that holds a copy.'),
    }),
  ),
});
export type ShelfUsage = z.infer<typeof ShelfUsage>;

export const RetireElementRequest = z.object({ replacedBy: Id.optional().describe('The shelf element to use in its place. The editor then says so wherever a copy of the retired one is.') });
export type RetireElementRequest = z.infer<typeof RetireElementRequest>;

/** What the owner decided about the newer version on the shelf, for one copy in a workflow. Nothing is merged. */
export const ShelfUpdateRequest = z.object({
  decision: z.enum(['take', 'keep']).describe("`take`: the shelf's newest version takes the place of the copy's content. `keep`: the copy stays as it is, and is from then on a copy of the newest version that was changed here."),
});
export type ShelfUpdateRequest = z.infer<typeof ShelfUpdateRequest>;
