import { AubergineError, type Client } from '@aubergine/client';
import { NamedColor, SESSION_ENV, showControl } from '@aubergine/shared';
import { UsageError, takeOption } from './commands';

/**
 * `aubergine project`, and `--project <name>` on the commands that list or
 * make things. A client of the public API, like every command.
 *
 * Making, changing, archiving, reopening and removing a project, and moving
 * a canvas to another, are the owner's alone. Inside a terminal on a canvas
 * the project is that terminal's: no option changes it there.
 */

export const PROJECT_NEW_EXAMPLE = 'aubergine project new "Garden site" --folder ~/work/garden';
/** The commands that take `--project <name>`. */
export const TAKES_PROJECT: readonly string[] = ['list', 'ls', 'new', 'canvas', 'canvases', 'task', 'tasks', 'todo', 'rule', 'rules', 'schedule', 'schedules', 'board'];
export const INSIDE_ITS_OWN = 'Inside a terminal on a canvas the project is that terminal\'s own, and no option changes it. Leave --project out here.';

/** `--project <name>` taken out of what was typed, for the commands that take it. The rest is the command as it was. */
export function takeProject(argv: readonly string[]): { project: string | null; rest: string[] } {
  const [name] = argv;
  if (name === undefined || !TAKES_PROJECT.includes(name) || name === 'project') return { project: null, rest: [...argv] };
  const taken = takeOption(argv.slice(1), '--project');
  if (argv.includes('--project') && (taken.value === null || taken.value.trim() === '')) throw new UsageError('--project needs the name of a project: aubergine project list');
  return { project: taken.value, rest: [name, ...taken.rest] };
}

export type ProjectCommand =
  | { action: 'list' }
  | { action: 'new'; name: string; color: string | null; folder: string | null }
  | { action: 'rename'; query: string; name: string }
  | { action: 'use'; query: string }
  | { action: 'archive'; query: string; sessions: 'park' | 'end' | null }
  | { action: 'reopen'; query: string }
  | { action: 'remove'; query: string }
  | { action: 'move-canvas'; canvas: string; to: string };

export function parseProjectCommand(args: readonly string[]): ProjectCommand {
  const [action, ...rest] = args;
  const words = (from: readonly string[], what: string, known: readonly string[] = []): string => {
    const unknown = from.find((word) => word.startsWith('--') && !known.includes(word));
    if (unknown) throw new UsageError(`project ${what} does not know ${unknown}`);
    return from.filter((word) => !word.startsWith('--')).join(' ').trim();
  };
  const one = (what: string): string => {
    const query = words(rest, what);
    if (query === '') throw new UsageError(`project ${what} needs a project: its name, its number in the list, or the start of its ID`);
    return query;
  };
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('project list takes no arguments');
      return { action: 'list' };
    case 'new':
    case 'add': {
      const color = takeOption(rest, '--color');
      const folder = takeOption(color.rest, '--folder');
      const name = words(folder.rest, 'new');
      if (name === '') throw new UsageError(`project new needs a name. For example:\n  ${PROJECT_NEW_EXAMPLE}`);
      if (color.value !== null && !NamedColor.safeParse(color.value).success && !/^#[0-9a-fA-F]{6}$/.test(color.value)) throw new UsageError(`--color takes a named color (${NamedColor.options.join(', ')}) or #rrggbb`);
      return { action: 'new', name, color: color.value, folder: folder.value };
    }
    case 'rename': {
      const to = takeOption(rest, '--to');
      const query = words(to.rest, 'rename');
      if (query === '' || to.value === null || to.value.trim() === '') throw new UsageError('project rename needs a project and its new name: aubergine project rename "Garden site" --to "Garden"');
      return { action: 'rename', query, name: to.value.trim() };
    }
    case 'use':
      return { action: 'use', query: one('use') };
    case 'archive': {
      const park = rest.includes('--park');
      const end = rest.includes('--end');
      if (park && end) throw new UsageError('project archive takes --park or --end, not both');
      const query = words(rest, 'archive', ['--park', '--end']);
      if (query === '') throw new UsageError('project archive needs a project');
      return { action: 'archive', query, sessions: park ? 'park' : end ? 'end' : null };
    }
    case 'reopen':
      return { action: 'reopen', query: one('reopen') };
    case 'remove':
    case 'rm':
      return { action: 'remove', query: one('remove') };
    case 'move-canvas': {
      const to = takeOption(rest, '--to');
      const canvas = words(to.rest, 'move-canvas');
      if (canvas === '' || to.value === null) throw new UsageError('project move-canvas needs a canvas and where it goes: aubergine project move-canvas "Main" --to "Garden"');
      return { action: 'move-canvas', canvas, to: to.value };
    }
    default:
      throw new UsageError(`project does not know "${action}". It knows: list, new, rename, use, archive, reopen, remove, move-canvas. For example:\n  ${PROJECT_NEW_EXAMPLE}`);
  }
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

type Row = Awaited<ReturnType<Client['getProject']>>;

/** One project by its name, its number in the list, or the start of its ID. */
export function pickProject(all: readonly Row[], query: string): Row {
  const wanted = query.trim().toLowerCase();
  const byNumber = /^\d+$/.test(wanted) ? all[Number(wanted) - 1] : undefined;
  if (byNumber) return byNumber;
  const found = all.filter((project) => project.id === wanted || (wanted.length >= 6 && project.id.startsWith(wanted)) || project.name.toLowerCase() === wanted);
  if (found.length === 1) return found[0] as Row;
  throw new UsageError(found.length === 0 ? `No project matches "${query}". See: aubergine project list` : `${found.length} projects match "${query}". Use the ID.`);
}

export interface ProjectCommandDeps {
  owner: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  env: NodeJS.ProcessEnv;
  print: (text: string) => void;
  /** Remembers which project later commands mean when they name none; null forgets. */
  remember: (projectId: string | null) => Promise<void>;
  /** The project later commands mean now, when one was chosen with `use`. */
  remembered: () => Promise<string | null>;
  expandFolder: (folder: string) => string;
}

const OWNERS = 'Projects are made, changed, archived and removed by a person, in the browser or from a terminal that is not on a canvas. This command does nothing inside a canvas terminal. If you are an agent: your terminal is in one project, and that is the one you see.';

export async function runProjectCommand(command: ProjectCommand, deps: ProjectCommandDeps): Promise<number> {
  const { owner, print } = deps;
  const inside = Boolean(deps.env[SESSION_ENV.url] && deps.env[SESSION_ENV.sessionId] && deps.env[SESSION_ENV.token]);
  try {
    if (command.action === 'list') {
      const [rows, chosen] = [await owner((client) => collect(client.each.listProjects())), await deps.remembered()];
      // Names were written by a person: control characters are shown, not sent to the terminal.
      print(showControl(rows.map((row, index) => `${index + 1}. ${row.name}${row.state === 'archived' ? '  (archived)' : ''}${row.id === chosen ? '  (the one commands mean)' : ''}  ${row.canvases} ${row.canvases === 1 ? 'canvas' : 'canvases'}, ${row.sessions} running, ${row.waiting} waiting for you${row.defaultFolder ? `  in ${row.defaultFolder}` : ''}  [${row.id}]`).join('\n')));
      print('\nA command that lists or makes things means the first project unless you say another: --project <name>, or once for all: aubergine project use <name>.');
      return 0;
    }
    if (inside) {
      print(OWNERS);
      return 1;
    }
    switch (command.action) {
      case 'new': {
        const folder = command.folder !== null ? deps.expandFolder(command.folder) : null;
        const made = await owner((client) => client.addProject({ body: { name: command.name, ...(command.color ? { color: command.color as never } : {}), ...(folder ? { defaultFolder: folder } : {}) } }));
        print(showControl(`Made the project “${made.name}”, with one empty canvas${made.defaultFolder ? `. New terminals in it start in ${made.defaultFolder}` : ''}.`));
        print(`To work in it from here: aubergine project use "${made.name.replace(/"/g, '')}"`);
        return 0;
      }
      case 'rename': {
        const changed = await owner(async (client) => client.changeProject({ projectId: pickProject(await collect(client.each.listProjects()), command.query).id, body: { name: command.name } }));
        print(showControl(`It is called “${changed.name}” now.`));
        return 0;
      }
      case 'use': {
        const project = await owner(async (client) => pickProject(await collect(client.each.listProjects()), command.query));
        if (project.state === 'archived') throw new UsageError(`“${project.name}” is archived. Reopen it first: aubergine project reopen "${project.name}"`);
        await deps.remember(project.id);
        print(showControl(`Commands that name no project mean “${project.name}” from now on. This is remembered for the command line only; the browser shows the project you open there.`));
        return 0;
      }
      case 'archive': {
        const archived = await owner(async (client) => client.archiveProject({ projectId: pickProject(await collect(client.each.listProjects()), command.query).id, body: command.sessions ? { sessions: command.sessions } : {} }));
        if ((await deps.remembered()) === archived.id) await deps.remember(null);
        print(showControl(`“${archived.name}” is archived: it is out of the switcher and starts nothing. To bring it back: aubergine project reopen "${archived.name.replace(/"/g, '')}"`));
        return 0;
      }
      case 'reopen': {
        const opened = await owner(async (client) => client.reopenProject({ projectId: pickProject(await collect(client.each.listProjects()), command.query).id }));
        print(showControl(`“${opened.name}” is open again.`));
        return 0;
      }
      case 'remove': {
        const removed = await owner(async (client) => {
          const project = pickProject(await collect(client.each.listProjects()), command.query);
          await client.removeProject({ projectId: project.id });
          return project;
        });
        if ((await deps.remembered()) === removed.id) await deps.remember(null);
        print(showControl(`Removed “${removed.name}” for good.`));
        return 0;
      }
      case 'move-canvas': {
        const moved = await owner(async (client) => {
          const projects = await collect(client.each.listProjects());
          const to = pickProject(projects, command.to);
          const canvases = await collect(client.each.listCanvases({ query: { projectId: 'all' } }));
          const wanted = command.canvas.trim().toLowerCase();
          const found = canvases.filter((canvas) => canvas.id === wanted || canvas.name.toLowerCase() === wanted);
          if (found.length !== 1) throw new UsageError(found.length === 0 ? `No canvas matches "${command.canvas}".` : `${found.length} canvases are named "${command.canvas}". Use the ID: aubergine canvas list --project <name>`);
          await client.moveCanvasToProject({ canvasId: (found[0] as { id: string }).id, body: { projectId: to.id } });
          return { canvas: (found[0] as { name: string }).name, to: to.name };
        });
        print(showControl(`“${moved.canvas}” is in “${moved.to}” now, with its terminals, their runs and what they work in.`));
        return 0;
      }
    }
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    print(showControl(error.code === 'network' ? 'The Aubergine server is not answering.' : error.message));
    return 1;
  }
}
