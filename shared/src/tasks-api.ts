import { z } from 'zod';
import { EnvironmentKindName } from './environment';
import { Id } from './ids';
import { PageQuery, pageOf } from './protocol';
import { Ask, ItemSource, PlainWords, QUEUE_LIMIT_MAX, Rule, RuleAction, RuleEvent, TASK_DETAILS_MAX, TASK_LABELS_MAX, Task, TaskLabel, TaskState, TaskTaker, WRITTEN_MAX } from './tasks';
import { PlainName } from './workflows';

/** What goes over the wire about the queue, the owner's list and the rules. */

const taskFields = {
  title: PlainName.describe('What it is, in one line.'),
  details: PlainWords(TASK_DETAILS_MAX).describe('What to do, for the agent that takes it. Plain text.'),
  folder: z.string().startsWith('/').max(4096).nullable().describe('The folder it is done in. Null: the folder new terminals start in.'),
  workflowId: Id.nullable().describe('The workflow it goes through. Null: it is told as one step, with the details as its task.'),
  environment: EnvironmentKindName.nullable().describe('Where a new terminal for it works. Null: a working copy of its own where the folder can have one.'),
  taker: TaskTaker.describe('Who may take it: `{"kind":"any"}`, one terminal, or a new agent terminal on a canvas.'),
  labels: z.array(TaskLabel).max(TASK_LABELS_MAX).describe('Short words of your own.'),
  source: ItemSource.describe('Where it came from. Left out: through the API for a program, by hand for the owner.'),
};

/** Body of adding a task. From the owner it is queued. From a program or a session it is a proposal that waits for the owner, unless the token has review switched off. */
export const AddTaskRequest = z.object({
  projectId: Id.optional().describe('The project it is added to. Left out: the first project the caller reaches. The workflow, the terminal or the canvas it names must be of that project.'),
  title: taskFields.title,
  details: taskFields.details.optional(),
  folder: taskFields.folder.optional(),
  workflowId: taskFields.workflowId.optional(),
  environment: taskFields.environment.optional(),
  taker: taskFields.taker.optional(),
  labels: taskFields.labels.optional(),
  source: taskFields.source.optional(),
});
export type AddTaskRequest = z.infer<typeof AddTaskRequest>;

/** Body of changing a task that has not started. What is left out stays as it was. */
export const ChangeTaskRequest = AddTaskRequest.omit({ source: true, projectId: true }).partial();
export type ChangeTaskRequest = z.infer<typeof ChangeTaskRequest>;

/** What a session may send when it proposes a task: what it is and what to do. Where it runs and who takes it are the owner's to say. */
export const ProposeTaskRequest = z.object({ title: taskFields.title, details: taskFields.details.optional(), labels: taskFields.labels.optional() });
export type ProposeTaskRequest = z.infer<typeof ProposeTaskRequest>;

export const TasksQuery = PageQuery.extend({
  state: z
    .enum([...TaskState.options, 'live', 'ended'])
    .default('live')
    .describe('`live` (the default): every task that is not over, and those that are over and not yet looked at. `ended`: tasks that are over and were put away, newest first, from the archive. Or one state.'),
});
export type TasksQuery = z.infer<typeof TasksQuery>;
export const TaskList = pageOf(Task);
export type TaskList = z.infer<typeof TaskList>;

export const ReorderTasksRequest = z.object({ taskIds: z.array(Id).min(1).max(500).describe('Tasks that wait, in the order they are to be started. One that is left out keeps its place after these.') });
export type ReorderTasksRequest = z.infer<typeof ReorderTasksRequest>;

/** What starting did. */
export const StartedTasks = z.object({
  started: z.array(z.object({ taskId: Id, sessionId: Id.nullable(), ok: z.boolean(), reason: z.string().nullable() })),
  says: z.string().describe('In a sentence: what was started, or why nothing was.'),
});
export type StartedTasks = z.infer<typeof StartedTasks>;

/** How tasks are started, and how the queue stands. */
export const QueueSettings = z.object({
  projectId: Id.describe('The project these are of.'),
  limit: z.number().int().min(1).max(QUEUE_LIMIT_MAX).describe('How many tasks may be at work at once.'),
  hold: z.boolean().describe('True: no new task is started. What is running is not touched.'),
  automatic: z.boolean().describe('True: a task starts by itself when a place is free. Off unless the owner switched it on.'),
  summary: z.string().describe('The counts in one line.'),
});
export type QueueSettings = z.infer<typeof QueueSettings>;
export const ChangeQueueRequest = z.object({ projectId: Id.optional().describe('The project whose tasks these are about. Left out: the first project.'), limit: QueueSettings.shape.limit.optional(), hold: z.boolean().optional(), automatic: z.boolean().optional() });
export type ChangeQueueRequest = z.infer<typeof ChangeQueueRequest>;

/** Body of writing something on the owner's list. */
export const AddAskRequest = z.object({ projectId: Id.optional().describe('The project whose list it is written on. Left out: the first project the caller reaches.'), text: PlainWords(WRITTEN_MAX).min(1).describe('What is asked, in plain text.'), source: ItemSource.optional() });
export type AddAskRequest = z.infer<typeof AddAskRequest>;

/** What a session sees of the two lists: every task by title and state, and what it itself proposed and asked. */
export const OwnQueue = z.object({
  tasks: z.array(z.object({ id: Id, title: z.string(), state: TaskState, mine: z.boolean() })),
  asks: z.array(Ask).describe('What this session asked of its owner and that still waits.'),
  says: z.string(),
});
export type OwnQueue = z.infer<typeof OwnQueue>;

export const AddRuleRequest = z.object({ projectId: Id.optional().describe('The project the rule is of. Left out: the first project.'), event: RuleEvent.describe('What sets it off.'), action: RuleAction.describe('What it does: `{"kind":"notify"}`, or `{"kind":"run-element","elementId":"…","on":{"kind":"session","sessionId":"…"}}`.') });
export type AddRuleRequest = z.infer<typeof AddRuleRequest>;
export const RuleList = z.object({ rules: z.array(Rule.extend({ says: z.string().describe('The rule in a sentence.') })), actions: z.array(z.object({ kind: z.string(), title: z.string(), says: z.string() })).describe('The kinds of action there are.') });
export type RuleList = z.infer<typeof RuleList>;
