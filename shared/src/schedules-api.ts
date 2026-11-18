import { z } from 'zod';
import { EnvironmentKindName } from './environment';
import { Id } from './ids';
import { PageQuery, pageOf } from './protocol';
import { Schedule } from './schedules';
import { PlainWords, TASK_DETAILS_MAX } from './tasks';

/** What goes over the wire about schedules. */

const Timestamp = z.iso.datetime();

const fields = {
  name: Schedule.shape.name,
  time: Schedule.shape.time,
  days: Schedule.shape.days,
  what: Schedule.shape.what,
  where: Schedule.shape.where,
  folder: z.string().startsWith('/').max(4096).nullable().describe('For a new terminal: the folder it starts in. Null: the folder new terminals start in.'),
  environment: EnvironmentKindName.nullable().describe('For a new terminal: where it works. Null: a working copy of its own where the folder can have one.'),
  task: PlainWords(TASK_DETAILS_MAX).describe('What the agent is told to do, as the task of what it runs. Plain text.'),
  on: z.boolean().describe('False: it keeps its place in the list and does not run.'),
};

/** Body of making a schedule. */
export const AddScheduleRequest = z.object({
  projectId: Id.optional().describe('The project the schedule is of. Left out: the first project.'),
  name: fields.name,
  time: fields.time,
  days: fields.days,
  what: fields.what,
  where: fields.where,
  folder: fields.folder.optional(),
  environment: fields.environment.optional(),
  task: fields.task.optional(),
  on: fields.on.optional(),
});
export type AddScheduleRequest = z.infer<typeof AddScheduleRequest>;

/** Body of changing a schedule. What is left out stays as it was. */
export const ChangeScheduleRequest = AddScheduleRequest.omit({ projectId: true }).partial();
export type ChangeScheduleRequest = z.infer<typeof ChangeScheduleRequest>;

/** A schedule as it is listed: with what it is in words, and when it is next. */
export const ScheduleRow = Schedule.extend({
  says: z.string().describe('The schedule in a sentence: when, what and where.'),
  next: Timestamp.nullable().describe('Its next time. Null while it is switched off.'),
  nextSays: z.string().describe('Its next time in words, on this computer\'s clock.'),
  lastSays: z.string().describe('How its latest time ended, in a sentence.'),
});
export type ScheduleRow = z.infer<typeof ScheduleRow>;
export const ScheduleList = pageOf(ScheduleRow);
export type ScheduleList = z.infer<typeof ScheduleList>;
export const SchedulesQuery = PageQuery;

/** What running one now did. */
export const RanSchedule = z.object({
  schedule: ScheduleRow,
  taskId: Id.nullable().describe('The task it became. Null when it did not run.'),
  says: z.string().describe('In a sentence: what happened.'),
});
export type RanSchedule = z.infer<typeof RanSchedule>;
