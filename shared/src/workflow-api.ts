import { z } from 'zod';
import { Id } from './ids';
import { PageQuery, pageOf } from './protocol';
import {
  ArchivedRun,
  Element,
  ElementId,
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
  const { versions: _versions, projectId: _projectId, ...rest } = workflow;
  return { ...rest, version: current.number, elements: current.elements.map((e) => e.name) };
}
export const detailOfWorkflow = (workflow: Workflow): WorkflowDetail => ({ ...summaryOfWorkflow(workflow), current: latestVersion(workflow) });

/** An element as it is sent in: the ID may be left out, and is then made from the name. */
export const ElementInput = Element.partial({ id: true }).describe('One element. Leave `id` out for a new one; keep it for one that exists, so that runs can tell which is which.');
export type ElementInput = z.infer<typeof ElementInput>;

const contentFields = {
  name: WorkflowContent.shape.name.describe('What it is called.'),
  description: WorkflowContent.shape.description.describe('What it is for, in a sentence or two.'),
  standing: WorkflowContent.shape.standing.describe('Text added to every element: rules that hold from start to finish.'),
  inputs: z.array(WorkflowInput).max(20).describe('What a run is given when it starts. `{{key}}` in any text becomes the value. Without this, one input: `task`.'),
  elements: z.array(ElementInput).min(1).max(200).describe('The elements, in the order they are gone through.'),
  labels: WorkflowLabels.describe('Pairs of key and value for tools of your own to give meaning to.'),
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
  kickoff: z.boolean().default(true).describe('Type the line that tells the agent about the run into the session\'s terminal. Only ever done for the owner (the browser or the command line), and only when an agent is running there; an API token is given the line in the answer and nothing is typed.'),
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
  z.object({ type: z.literal('done'), elementId: ElementId.optional().describe('The element being finished. Without it: the current one.'), note: z.string().max(10_000).optional().describe('What was done, for whoever comes next.') }),
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
  return { run, workflowName: version?.name ?? workflow?.name ?? '(removed workflow)', elements: (version?.elements ?? []).map((e) => ({ id: e.id, name: e.name })) };
};
