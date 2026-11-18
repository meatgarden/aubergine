import { AubergineError, type Client } from '@aubergine/client';
import { SESSION_ENV, TimeOfDay, daysFromWords, showControl, type Weekday } from '@aubergine/shared';
import { UsageError, takeOption } from './commands';

/**
 * `aubergine schedule`: at these times, run this there. A client of the
 * public API, like every command. Making, changing, switching, removing and
 * running a schedule are the owner's alone: inside a terminal on a canvas
 * this command does nothing.
 */

export const SCHEDULE_ADD_FORM = 'aubergine schedule add "<name>" --at <08:30> --days <weekdays | every day | mon,wed,fri> (--element <shelf element> | --workflow <workflow>) (--on <terminal> | --new <canvas>) [--task "<what to do>"] [--folder <path>] [--off]';
export const SCHEDULE_ADD_EXAMPLE = 'aubergine schedule add "My morning list" --at 08:30 --days weekdays --element "Morning list" --new Main';

interface Fields {
  name: string | null;
  at: string | null;
  days: Weekday[] | null;
  element: string | null;
  workflow: string | null;
  on: string | null;
  onNew: string | null;
  task: string | null;
  folder: string | null;
}

export type ScheduleCommand =
  | { action: 'list' }
  | { action: 'add'; fields: Fields & { name: string; at: string; days: Weekday[] }; off: boolean }
  | { action: 'change'; query: string; fields: Fields }
  | { action: 'switch'; query: string; on: boolean }
  | { action: 'run'; query: string }
  | { action: 'remove'; query: string };

/** The options a schedule is written with; what is left is the words that are not options. */
function fieldsOf(args: readonly string[], what: string, form: string): { fields: Fields; rest: string[] } {
  const name = takeOption(args, '--name');
  const at = takeOption(name.rest, '--at');
  const days = takeOption(at.rest, '--days');
  const element = takeOption(days.rest, '--element');
  const workflow = takeOption(element.rest, '--workflow');
  const on = takeOption(workflow.rest, '--on');
  const onNew = takeOption(on.rest, '--new');
  const task = takeOption(onNew.rest, '--task');
  const folder = takeOption(task.rest, '--folder');
  const unknown = folder.rest.find((word) => word.startsWith('--') && word !== '--off');
  if (unknown) throw new UsageError(`${what} does not know ${unknown}. The form is:\n  ${form}`);
  if (at.value !== null && !TimeOfDay.safeParse(at.value).success) throw new UsageError(`--at takes a time of day like 08:30, on this computer's clock; not "${at.value}". Nothing more elaborate: a time, and days.`);
  const parsedDays = days.value === null ? null : daysFromWords(days.value);
  if (days.value !== null && parsedDays === null) throw new UsageError(`--days takes weekdays, weekends, "every day", or days by name (mon,wed,fri); not "${days.value}".`);
  if (element.value !== null && workflow.value !== null) throw new UsageError('A schedule runs one thing: --element or --workflow, not both.');
  if (on.value !== null && onNew.value !== null) throw new UsageError('A schedule runs in one place: --on <terminal> or --new <canvas>, not both.');
  return { fields: { name: name.value, at: at.value, days: parsedDays, element: element.value, workflow: workflow.value, on: on.value, onNew: onNew.value, task: task.value, folder: folder.value }, rest: folder.rest };
}

export function parseScheduleCommand(args: readonly string[]): ScheduleCommand {
  const [action, ...rest] = args;
  const one = (what: string): string => {
    const unknown = rest.find((word) => word.startsWith('--'));
    if (unknown) throw new UsageError(`schedule ${what} does not know ${unknown}`);
    const query = rest.join(' ').trim();
    if (query === '') throw new UsageError(`schedule ${what} needs a schedule: its name, its number in the list, or the start of its ID`);
    return query;
  };
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('schedule list takes no arguments');
      return { action: 'list' };
    case 'add': {
      const { fields, rest: left } = fieldsOf(rest, 'schedule add', SCHEDULE_ADD_FORM);
      const name = (fields.name ?? left.filter((word) => word !== '--off').join(' ')).trim();
      const missing = name === '' ? 'a name' : fields.at === null ? '--at' : fields.days === null ? '--days' : fields.element === null && fields.workflow === null ? 'what to run (--element or --workflow)' : fields.on === null && fields.onNew === null ? 'where to run it (--on <terminal> or --new <canvas>)' : null;
      if (missing !== null || fields.at === null || fields.days === null) throw new UsageError(`schedule add needs ${missing ?? 'more'}. The form is:\n  ${SCHEDULE_ADD_FORM}\nFor example:\n  ${SCHEDULE_ADD_EXAMPLE}`);
      return { action: 'add', fields: { ...fields, name, at: fields.at, days: fields.days }, off: left.includes('--off') };
    }
    case 'change': {
      const form = 'aubergine schedule change <schedule> [--name "<name>"] [--at <08:30>] [--days <days>] [--element <shelf element> | --workflow <workflow>] [--on <terminal> | --new <canvas>] [--task "<what to do>"] [--folder <path>]';
      const { fields, rest: left } = fieldsOf(rest, 'schedule change', form);
      const query = left.join(' ').trim();
      if (query === '' || left.includes('--off')) throw new UsageError(`schedule change needs a schedule and what to change. To switch one: aubergine schedule on | off <schedule>. The form is:\n  ${form}`);
      if (Object.values(fields).every((value) => value === null)) throw new UsageError(`schedule change needs something to change. The form is:\n  ${form}`);
      return { action: 'change', query, fields };
    }
    case 'on':
    case 'off':
      return { action: 'switch', query: one(action), on: action === 'on' };
    case 'run':
      return { action: 'run', query: one('run') };
    case 'remove':
    case 'rm':
      return { action: 'remove', query: one('remove') };
    default:
      throw new UsageError(`schedule does not know "${action}". It knows: list, add, change, on, off, run, remove. For example:\n  ${SCHEDULE_ADD_EXAMPLE}`);
  }
}

export interface ScheduleCommandDeps {
  owner: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  env: NodeJS.ProcessEnv;
  print: (text: string) => void;
}

const OWNERS = 'A schedule is made, changed, switched and run by a person, in the browser or from a terminal that is not on a canvas. This command does nothing inside a canvas terminal. If you are an agent: you can ask your owner (aubergine ask), and it is not done until your owner acts.';

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

function pick<T extends { id: string }>(all: readonly T[], query: string, nameOf: (item: T) => string, what: string): T {
  const wanted = query.trim().toLowerCase();
  const found = all.filter((item) => item.id === wanted || (wanted.length >= 6 && (item.id.startsWith(wanted) || item.id.endsWith(wanted))) || nameOf(item).toLowerCase() === wanted);
  if (found.length === 1) return found[0] as T;
  throw new UsageError(found.length === 0 ? `No ${what} matches "${query}".` : `${found.length} ${what}s match "${query}". Use the ID.`);
}

async function scheduleOf(client: Client, query: string) {
  const all = await collect(client.each.listSchedules());
  const byNumber = /^\d+$/.test(query.trim()) ? all[Number(query) - 1] : undefined;
  return byNumber ?? pick(all, query, (s) => s.name, 'schedule');
}

/** What the options name, looked up: the element or workflow, and the terminal or canvas. */
async function named(client: Client, fields: Fields) {
  const what =
    fields.element !== null
      ? { kind: 'element' as const, elementId: pick(await collect(client.each.listElements()), fields.element, (e) => e.element.name, 'saved step').id }
      : fields.workflow !== null
        ? { kind: 'workflow' as const, workflowId: pick(await collect(client.each.listWorkflows()), fields.workflow, (w) => w.name, 'workflow').id }
        : undefined;
  const where =
    fields.on !== null
      ? { kind: 'session' as const, sessionId: pick(await collect(client.each.listSessions()), fields.on, (s) => s.name, 'terminal').id }
      : fields.onNew !== null
        ? { kind: 'new' as const, canvasId: pick(await collect(client.each.listCanvases()), fields.onNew, (c) => c.name, 'canvas').id }
        : undefined;
  return { ...(what ? { what } : {}), ...(where ? { where } : {}), ...(fields.task !== null ? { task: fields.task } : {}), ...(fields.folder !== null ? { folder: fields.folder } : {}) };
}

export async function runScheduleCommand(command: ScheduleCommand, deps: ScheduleCommandDeps): Promise<number> {
  const { owner, print } = deps;
  if (deps.env[SESSION_ENV.url] && deps.env[SESSION_ENV.sessionId] && deps.env[SESSION_ENV.token]) {
    print(OWNERS);
    return 1;
  }
  try {
    switch (command.action) {
      case 'list': {
        const rows = await owner((client) => collect(client.each.listSchedules()));
        if (rows.length === 0) print(`No schedules. To make one:\n  ${SCHEDULE_ADD_EXAMPLE}`);
        // Names were written by a person and may have come from anywhere: control characters are shown.
        else print(showControl(rows.map((row, index) => [`${index + 1}. ${row.name}${row.on ? '' : '  (off)'}  [${row.id}]`, `     ${row.says}`, `     ${row.nextSays} ${row.lastSays}`, ...(row.problem ? [`     It cannot run as it is written: ${row.problem}`] : [])].join('\n')).join('\n')));
        print('\nTimes are on this computer\'s clock. A time that passes while the computer is asleep runs late when it wakes, within the hours set as schedules.lateWithinHours.');
        return 0;
      }
      case 'add': {
        const made = await owner(async (client) => {
          const body = await named(client, command.fields);
          if (!body.what || !body.where) throw new UsageError(`The form is:\n  ${SCHEDULE_ADD_FORM}`);
          return client.addSchedule({ body: { name: command.fields.name, time: command.fields.at, days: command.fields.days, what: body.what, where: body.where, ...(body.task !== undefined ? { task: body.task } : {}), ...(body.folder !== undefined ? { folder: body.folder } : {}), ...(command.off ? { on: false } : {}) } });
        });
        print(showControl(`Made “${made.name}”: ${made.says} ${made.nextSays}`));
        print(`To try it now: aubergine schedule run "${made.name.replace(/"/g, '')}"`);
        return 0;
      }
      case 'change': {
        const changed = await owner(async (client) => {
          const schedule = await scheduleOf(client, command.query);
          const body = await named(client, command.fields);
          return client.changeSchedule({ scheduleId: schedule.id, body: { ...body, ...(command.fields.name !== null ? { name: command.fields.name } : {}), ...(command.fields.at !== null ? { time: command.fields.at } : {}), ...(command.fields.days !== null ? { days: command.fields.days } : {}) } });
        });
        print(showControl(`Changed “${changed.name}”: ${changed.says} ${changed.nextSays}`));
        return 0;
      }
      case 'switch': {
        const changed = await owner(async (client) => client.changeSchedule({ scheduleId: (await scheduleOf(client, command.query)).id, body: { on: command.on } }));
        print(showControl(`“${changed.name}” is switched ${changed.on ? 'on' : 'off'}. ${changed.nextSays}`));
        return 0;
      }
      case 'run': {
        const ran = await owner(async (client) => client.runSchedule({ scheduleId: (await scheduleOf(client, command.query)).id }));
        print(showControl(ran.says));
        return ran.taskId === null ? 1 : 0;
      }
      case 'remove': {
        const removed = await owner(async (client) => {
          const schedule = await scheduleOf(client, command.query);
          await client.removeSchedule({ scheduleId: schedule.id });
          return schedule;
        });
        print(showControl(`Removed “${removed.name}”. A task it already added to the queue stays there.`));
        return 0;
      }
    }
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    print(showControl(error.code === 'network' ? 'The Aubergine server is not answering.' : error.message));
    return 1;
  }
}
