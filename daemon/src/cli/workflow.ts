import { AubergineError, createClient, type Client } from '@aubergine/client';
import { NEEDS_REVIEW, SESSION_ENV, showControl, WorkflowFile, exportWorkflow, importWorkflow, needWords, type Session, type Workflow, type WorkflowDetail, type WorkflowSummary } from '@aubergine/shared';
import { UsageError, resolveSession, takeOption } from './commands';

/** `aubergine workflow …`, as parsed. */
export type WorkflowCommand =
  | { action: 'list' }
  | { action: 'templates' }
  | { action: 'show'; query: string }
  | { action: 'new'; workflowName: string; template: string | null }
  | { action: 'edit'; query: string; file: string | null }
  | { action: 'remove'; query: string; yes: boolean }
  | { action: 'copy'; query: string; newName: string | null }
  | { action: 'export'; query: string; file: string | null; toRepository: boolean; overwrite: boolean }
  | { action: 'import'; file: string; newName: string | null }
  | { action: 'run'; query: string; session: string | null; inputs: Record<string, string>; replace: boolean }
  // From inside a session, about the run that session is on:
  | { action: 'status' }
  | { action: 'done'; note: string | null; element: string | null; output: string | null }
  /** What this session was asked to write. */
  | { action: 'brief' }
  /** Hands in a draft from a file (`-` or nothing: standard input). */
  | { action: 'propose'; kind: 'workflow' | 'element'; file: string }
  | { action: 'element-list' }
  | { action: 'element-show'; query: string }
  | { action: 'element-remove'; query: string; yes: boolean }
  | { action: 'element-run'; query: string; session: string | null; inputs: Record<string, string>; replace: boolean }
  | { action: 'blocked'; reason: string }
  | { action: 'goto'; element: string }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'stop' };

const flagsOf = (words: readonly string[], known: readonly string[], what: string): string[] => {
  const unknown = words.find((word) => word.startsWith('--') && !known.includes(word));
  if (unknown) throw new UsageError(`workflow ${what} does not know ${unknown}`);
  return words.filter((word) => !word.startsWith('--'));
};

export function parseWorkflowCommand(words: readonly string[]): WorkflowCommand {
  const [action, ...rest] = words;
  const name = (what: string, parts: readonly string[]): string => {
    if (parts.join(' ').trim() === '') throw new UsageError(`workflow ${what} needs the name of a workflow`);
    return parts.join(' ');
  };
  const none = (what: string): void => {
    if (rest.length > 0) throw new UsageError(`workflow ${what} takes no arguments`);
  };
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      none('list');
      return { action: 'list' };
    case 'templates':
      none('templates');
      return { action: 'templates' };
    case 'show':
      return { action: 'show', query: name('show', flagsOf(rest, [], 'show')) };
    case 'new': {
      const { value: template, rest: after } = takeOption(rest, '--template');
      return { action: 'new', workflowName: name('new', flagsOf(after, [], 'new')), template };
    }
    case 'edit': {
      const { value: file, rest: after } = takeOption(rest, '--file');
      return { action: 'edit', query: name('edit', flagsOf(after, [], 'edit')), file };
    }
    case 'remove':
    case 'rm':
      return { action: 'remove', query: name('remove', flagsOf(rest, ['--yes'], 'remove')), yes: rest.includes('--yes') };
    case 'copy': {
      const parts = flagsOf(rest, [], 'copy');
      if (parts.length === 0) throw new UsageError('workflow copy needs the name of a workflow');
      return { action: 'copy', query: parts[0] as string, newName: parts.length > 1 ? parts.slice(1).join(' ') : null };
    }
    case 'export': {
      const parts = flagsOf(rest, ['--to-repository', '--overwrite'], 'export');
      const toRepository = rest.includes('--to-repository');
      // Into the repository the file is named after the workflow, so every word is the name.
      if (parts.length === 0 || (!toRepository && parts.length > 2)) throw new UsageError('workflow export needs the name of a workflow, and may take a file');
      if (rest.includes('--overwrite') && !toRepository) throw new UsageError('--overwrite only applies with --to-repository');
      return { action: 'export', query: toRepository ? parts.join(' ') : (parts[0] as string), file: toRepository ? null : (parts[1] ?? null), toRepository, overwrite: rest.includes('--overwrite') };
    }
    case 'import': {
      const { value: newName, rest: after } = takeOption(rest, '--name');
      const parts = after.filter((word) => word === '-' || !word.startsWith('--'));
      if (parts.length !== 1 || parts.length !== after.length) throw new UsageError('workflow import needs one file');
      return { action: 'import', file: parts[0] as string, newName };
    }
    case 'run': {
      const { value: session, rest: afterSession } = takeOption(rest, '--session');
      const inputs: Record<string, string> = {};
      const parts: string[] = [];
      for (let index = 0; index < afterSession.length; index += 1) {
        const word = afterSession[index] as string;
        const given = word === '--input' ? afterSession[(index += 1)] : word.startsWith('--input=') ? word.slice('--input='.length) : null;
        if (given === null) {
          parts.push(word);
          continue;
        }
        const at = given?.indexOf('=') ?? -1;
        if (given === undefined || at < 1) throw new UsageError('--input needs key=value');
        inputs[given.slice(0, at)] = given.slice(at + 1);
      }
      return { action: 'run', query: name('run', flagsOf(parts, ['--replace'], 'run')), session, inputs, replace: parts.includes('--replace') };
    }
    case 'status':
      none('status');
      return { action: 'status' };
    case 'brief':
      none('brief');
      return { action: 'brief' };
    case 'propose':
      return { action: 'propose', kind: 'workflow', file: proposeFile(rest, 'workflow') };
    case 'done': {
      const { value: note, rest: afterNote } = takeOption(rest, '--note');
      const { value: output, rest: afterOutput } = takeOutputOption(afterNote);
      const { value: element, rest: after } = takeOption(afterOutput, '--element');
      // The note may also simply follow the word.
      const words = flagsOf(after, [], 'done').join(' ').trim();
      if (note !== null && words !== '') throw new UsageError('workflow done: give the note once, after --note');
      return { action: 'done', note: note ?? (words === '' ? null : words), element, output };
    }
    case 'blocked': {
      const reason = rest.join(' ').trim();
      if (reason === '') throw new UsageError('workflow blocked needs a reason: what do you need?');
      return { action: 'blocked', reason };
    }
    case 'goto': {
      const element = flagsOf(rest, [], 'goto').join(' ').trim();
      if (element === '') throw new UsageError('workflow goto needs an element: its name, ID or number');
      return { action: 'goto', element };
    }
    case 'pause':
    case 'resume':
    case 'stop':
      none(action);
      return { action };
    default:
      throw new UsageError(`workflow does not know "${action}"`);
  }
}

/** `--output <file>`, where the file may be `-` for standard input. */
function takeOutputOption(words: readonly string[]): { value: string | null; rest: string[] } {
  const at = words.findIndex((word) => word === '--output' || word.startsWith('--output='));
  if (at < 0) return { value: null, rest: [...words] };
  const word = words[at] as string;
  const inline = word.startsWith('--output=');
  const value = inline ? word.slice('--output='.length) : words[at + 1];
  if (value === undefined || value === '' || (value.startsWith('--') && value !== '-')) throw new UsageError('--output needs a file, or - for standard input');
  return { value, rest: [...words.slice(0, at), ...words.slice(at + (inline ? 1 : 2))] };
}

/** The file of `propose --file <file>`; standard input when none is named. */
function proposeFile(words: readonly string[], what: string): string {
  const at = words.findIndex((word) => word === '--file' || word.startsWith('--file='));
  if (at < 0) {
    if (words.length > 0) throw new UsageError(`${what} propose does not know ${words[0]}. Use --file <file>, or give the file on standard input.`);
    return '-';
  }
  const word = words[at] as string;
  const inline = word.startsWith('--file=');
  const value = inline ? word.slice('--file='.length) : words[at + 1];
  const rest = [...words.slice(0, at), ...words.slice(at + (inline ? 1 : 2))];
  if (value === undefined || value === '') throw new UsageError('--file needs a file, or - for standard input');
  if (rest.length > 0) throw new UsageError(`${what} propose does not know ${rest[0]}`);
  return value;
}

/** `aubergine element …`: the shelf, and running one element by itself. */
export function parseElementCommand(words: readonly string[]): WorkflowCommand {
  const [action, ...rest] = words;
  const name = (what: string, parts: readonly string[]): string => {
    if (parts.join(' ').trim() === '') throw new UsageError(`element ${what} needs the name of an element`);
    return parts.join(' ');
  };
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('element list takes no arguments');
      return { action: 'element-list' };
    case 'show':
      return { action: 'element-show', query: name('show', flagsOf(rest, [], 'show')) };
    case 'remove':
    case 'rm':
      return { action: 'element-remove', query: name('remove', flagsOf(rest, ['--yes'], 'remove')), yes: rest.includes('--yes') };
    case 'propose':
      return { action: 'propose', kind: 'element', file: proposeFile(rest, 'element') };
    case 'run': {
      const run = parseWorkflowCommand(['run', ...rest]);
      if (run.action !== 'run') throw new UsageError('element run needs the name of an element');
      return { action: 'element-run', query: run.query, session: run.session, inputs: run.inputs, replace: run.replace };
    }
    default:
      throw new UsageError(`element does not know "${action}"`);
  }
}

export { showControl };

/** Finds the one workflow a name refers to: an exact name, else a unique start of one, else the start of an ID. */
export function resolveWorkflow<T extends { id: string; name: string }>(workflows: readonly T[], query: string): T {
  const wanted = query.trim().toLowerCase();
  const pick = (matches: T[], what: string): T | null => {
    if (matches.length === 1) return matches[0] ?? null;
    if (matches.length > 1) throw new UsageError(`${matches.length} workflows ${what} "${query}": ${matches.map((w) => `${w.name} (${w.id.slice(0, 13)})`).join(', ')}. Use the ID.`);
    return null;
  };
  const found =
    pick(workflows.filter((w) => w.id === wanted), 'have the ID') ??
    pick(workflows.filter((w) => w.name.toLowerCase() === wanted), 'are named') ??
    pick(workflows.filter((w) => w.name.toLowerCase().startsWith(wanted)), 'start with') ??
    pick(workflows.filter((w) => wanted.length >= 4 && w.id.startsWith(wanted)), 'have an ID starting with');
  if (!found) throw new UsageError(`No workflow matches "${query}". Try: aubergine workflow list`);
  return found;
}

/** Finds an element of a run by ID, by name, or by its number counting from one. */
export function resolveElement(elements: readonly { id: string; name: string }[], query: string): string {
  const wanted = query.trim().toLowerCase();
  const byNumber = /^\d+$/.test(wanted) ? elements[Number(wanted) - 1] : undefined;
  const found = elements.find((e) => e.id === wanted) ?? elements.find((e) => e.name.toLowerCase() === wanted) ?? byNumber;
  if (found) return found.id;
  const starts = elements.filter((e) => e.name.toLowerCase().startsWith(wanted));
  if (starts.length === 1 && starts[0]) return starts[0].id;
  throw new UsageError(`No element matches "${query}". The elements are: ${elements.map((e, index) => `${index + 1}. ${e.name}`).join(', ')}`);
}

export function formatWorkflows(workflows: readonly WorkflowSummary[], liveRuns: ReadonlyMap<string, number>): string {
  if (workflows.length === 0) return 'No workflows yet. Make one with: aubergine workflow new "<name>" --template plan-build-check';
  const rows = workflows.map((w) => [w.name, String(w.elements.length), `v${w.version}`, String(liveRuns.get(w.id) ?? 0), w.elements.join(' → ')]);
  const header = ['NAME', 'ELEMENTS', 'VERSION', 'RUNS', ''];
  const widths = header.map((h, column) => Math.max(h.length, ...rows.map((row) => (row[column] as string).length)));
  return [header, ...rows].map((row) => row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] as number))).join('  ').trimEnd()).join('\n');
}

/** What a repository offers a session, for `workflow list`: each file, and whether it can be run yet. */
export function formatRepositoryOffer(offer: { folder: string | null; workflows: readonly { file: string; name: string | null; state: string; reason: string | null; elements: readonly string[] }[]; truncated: boolean }): string {
  const word: Record<string, string> = { accepted: 'can be run', review: 'a person has to review it first', changed: 'changed since it was accepted: a person has to review it again', unreadable: 'could not be read' };
  const lines = ['', `From the repository ${offer.folder ?? ''} (.aubergine/workflows):`];
  for (const w of offer.workflows) lines.push(`  ${w.name ?? w.file}  (${w.file})  ${word[w.state] ?? w.state}${w.state === 'unreadable' && w.reason ? `: ${w.reason}` : w.elements.length > 0 ? `  ${w.elements.join(' → ')}` : ''}`);
  if (offer.truncated) lines.push('  There are more files than are looked at; only the first fifty are listed.');
  return lines.join('\n');
}

export function formatWorkflow(workflow: WorkflowDetail): string {
  const { current } = workflow;
  const indent = (text: string): string =>
    text
      .split('\n')
      .map((line) => (line ? `   ${line}` : ''))
      .join('\n');
  const lines = [`${workflow.name} (version ${workflow.version})`];
  if (current.description) lines.push(current.description);
  lines.push('', `Inputs: ${current.inputs.length === 0 ? 'none' : current.inputs.map((i) => `${i.key} (${i.label}${i.required ? ', needed' : ''})`).join(', ')}`);
  if (current.standing.trim()) lines.push('', 'For every element:', indent(current.standing.trim()));
  current.elements.forEach((element, index) => {
    lines.push('', `${index + 1}. ${element.name}  [${element.id}]`);
    if (element.instructions.trim()) lines.push(indent(element.instructions.trim()));
    if (element.doneWhen) lines.push(`   Done when: ${element.doneWhen}`);
    if (element.needs.length > 0) lines.push(`   Needs: ${element.needs.map(needWords).join('; ')}`);
    if (element.produces !== 'note') lines.push(`   Produces: ${element.produces}`);
  });
  return lines.join('\n');
}

/** What the commands need from the world around them. Passed in, so that tests can stand in for each. */
export interface WorkflowCommandDeps {
  /** Calls as the owner of this machine. */
  owner<T>(work: (client: Client) => Promise<T>): Promise<T>;
  env: NodeJS.ProcessEnv;
  /** Every session, for naming one with `--session`. */
  sessions(): Promise<Session[]>;
  print(text: string): void;
  readText(file: string): Promise<string>;
  writeText(file: string, text: string): Promise<void>;
  /** Opens the text in the user's editor and gives back what they saved; null when they changed nothing. */
  edit(text: string): Promise<string | null>;
  ask(question: string): Promise<string>;
}

const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
};

/** A workflow as the export file needs it: with its one version. */
const asWorkflow = (detail: WorkflowDetail): Workflow => ({ ...detail, projectId: detail.id, listed: true, versions: [detail.current] });

function parseFile(text: string): ReturnType<typeof importWorkflow> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`That is not JSON: ${(error as Error).message}`);
  }
  try {
    return importWorkflow(json);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

function jsonOf(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${what} is not JSON: ${(error as Error).message}`);
  }
}

/** What a file handed in with `propose` holds: an element, or a workflow, plain or in the form `workflow export` writes. */
export function proposalFrom(kind: 'workflow' | 'element', text: string): { workflow?: never; element: never } | { workflow: never; element?: never } {
  const json = jsonOf(text, 'The file');
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new UsageError(`The file must hold one ${kind}, as a JSON object.`);
  if (kind === 'element') return { element: json as never };
  // A file as `workflow export` writes it carries the workflow inside.
  const exported = WorkflowFile.safeParse(json);
  const { labels: _labels, origin: _origin, ...workflow } = (exported.success ? exported.data.workflow : json) as Record<string, unknown>;
  return { workflow: workflow as never };
}

/** The client a program inside a session uses: that session's own token, about that session only. */
function sessionClient(env: NodeJS.ProcessEnv): { client: Client; sessionId: string } {
  const url = env[SESSION_ENV.url];
  const sessionId = env[SESSION_ENV.sessionId];
  const token = env[SESSION_ENV.token];
  if (!url || !sessionId || !token) throw new UsageError('This command only works inside an Aubergine session (its environment is not set here).');
  return { client: createClient({ baseUrl: url, token }), sessionId };
}

/** Runs one `aubergine workflow …` command. Returns the exit code. */
export async function runWorkflowCommand(command: WorkflowCommand, deps: WorkflowCommandDeps): Promise<number> {
  const { owner, print } = deps;
  const find = async (query: string): Promise<WorkflowDetail> => {
    const summary = resolveWorkflow(await owner((client) => collect(client.each.listWorkflows())), query);
    return owner((client) => client.getWorkflow({ workflowId: summary.id }));
  };

  switch (command.action) {
    case 'list': {
      const [workflows, runs] = await owner(async (client) => [await collect(client.each.listWorkflows()), await collect(client.each.listRuns())] as const);
      const live = new Map<string, number>();
      for (const { run } of runs) live.set(run.workflowId, (live.get(run.workflowId) ?? 0) + 1);
      print(formatWorkflows(workflows, live));
      // Inside a session: what the repository it is in offers, and whether each can be run yet.
      const inside = deps.env[SESSION_ENV.sessionId];
      if (inside) {
        const offer = await owner((client) => client.getSessionRepositoryWorkflows({ sessionId: inside })).catch(() => null);
        if (offer && offer.workflows.length > 0) print(showControl(formatRepositoryOffer(offer)));
      }
      return 0;
    }

    case 'templates': {
      const templates = await owner((client) => collect(client.each.listWorkflowTemplates()));
      const width = Math.max(...templates.map((t) => t.name.length));
      print(templates.map((t) => `${t.name.padEnd(width)}  ${t.title}: ${t.content.elements.map((e) => e.name).join(' → ')}`).join('\n'));
      return 0;
    }

    case 'show':
      print(showControl(formatWorkflow(await find(command.query))));
      return 0;

    case 'new': {
      const made = await owner((client) =>
        command.template !== null
          ? client.useWorkflowTemplate({ template: command.template, body: { name: command.workflowName } })
          : client.createWorkflow({
              body: {
                name: command.workflowName,
                elements: [{ name: 'First element', instructions: 'The task: {{task}}\n\nSay here what to do.', doneWhen: 'Say here how to tell it is done.' }],
              },
            }),
      );
      print(`Made the workflow "${made.name}" with ${made.elements.length === 1 ? 'one element' : `${made.elements.length} elements`}: ${made.elements.join(' → ')}.`);
      print(`Change it with: aubergine workflow edit "${made.name}"   Run it with: aubergine workflow run "${made.name}" --input task="…"`);
      return 0;
    }

    case 'edit': {
      const workflow = await find(command.query);
      const before = `${JSON.stringify(exportWorkflow(asWorkflow(workflow)), null, 2)}\n`;
      const after = command.file !== null ? await deps.readText(command.file) : await deps.edit(before);
      if (after === null || after === before) {
        print('Nothing changed.');
        return 0;
      }
      const { content, labels } = parseFile(after);
      const { extra: _extra, ...fields } = content;
      const saved = await owner((client) => client.updateWorkflow({ workflowId: workflow.id, body: { ...fields, labels } }));
      print(saved.version === workflow.version ? 'Nothing changed.' : `Saved "${saved.name}" as version ${saved.version}. Runs already going keep to the version they started on.`);
      return 0;
    }

    case 'remove': {
      const workflow = await find(command.query);
      if (!command.yes) {
        const answer = await deps.ask(`Remove the workflow "${workflow.name}"? Runs of it that are over stay in the archive. [y/N] `);
        if (!/^y(es)?$/i.test(answer.trim())) {
          print('Kept.');
          return 0;
        }
      }
      await owner((client) => client.removeWorkflow({ workflowId: workflow.id }));
      print(`Removed "${workflow.name}".`);
      return 0;
    }

    case 'copy': {
      const workflow = await find(command.query);
      const copy = await owner((client) => client.copyWorkflow({ workflowId: workflow.id, body: command.newName !== null ? { name: command.newName } : {} }));
      print(`Made "${copy.name}", a copy of "${workflow.name}".`);
      return 0;
    }

    case 'export': {
      const workflow = await find(command.query);
      if (command.toRepository) {
        const inside = deps.env[SESSION_ENV.sessionId];
        if (!inside) throw new UsageError('workflow export --to-repository works inside a session: the file goes into the repository that session is in.');
        const saved = await owner((client) => client.saveToRepository({ body: { sessionId: inside, workflowId: workflow.id, overwrite: command.overwrite } }));
        print(`${saved.overwritten ? 'Replaced' : 'Wrote'} ${saved.path}`);
        print('It is not committed: that is yours to do. Others who pull it will be asked to review it before it can run for them.');
        return 0;
      }
      const text = `${JSON.stringify(exportWorkflow(asWorkflow(workflow)), null, 2)}\n`;
      if (command.file === null) {
        print(text.trimEnd());
        return 0;
      }
      await deps.writeText(command.file, text);
      print(`Wrote "${workflow.name}" to ${command.file}.`);
      return 0;
    }

    case 'import': {
      const { content, labels, origin } = parseFile(await deps.readText(command.file));
      const made = await owner((client) => client.createWorkflow({ body: { ...content, ...(command.newName !== null ? { name: command.newName } : {}), labels, origin } }));
      print(`Made the workflow "${made.name}" from ${command.file === '-' ? 'standard input' : command.file}: ${made.elements.join(' → ')}.`);
      return 0;
    }

    case 'run': {
      const inside = deps.env[SESSION_ENV.sessionId];
      let session: { id: string; name: string };
      if (command.session !== null) {
        session = resolveSession(await deps.sessions(), command.session);
      } else if (inside) {
        session = (await deps.sessions()).find((s) => s.id === inside) ?? { id: inside, name: 'this session' };
      } else {
        throw new UsageError('workflow run needs a session: --session <name or ID>, or type it inside the session.');
      }
      // One of your own workflows, or else one the repository of that session offers, by its name or its file.
      const own = await owner((client) => collect(client.each.listWorkflows()));
      const offered = (await owner((client) => client.getSessionRepositoryWorkflows({ sessionId: session.id }))).workflows.filter((w) => w.name !== null);
      const wanted = command.query.trim().toLowerCase();
      const ownMatch = own.some((w) => w.id === wanted || w.name.toLowerCase() === wanted || w.name.toLowerCase().startsWith(wanted));
      const fromRepository = ownMatch ? undefined : offered.find((w) => w.file.toLowerCase() === wanted || w.file.toLowerCase() === `${wanted}.json` || (w.name ?? '').toLowerCase() === wanted) ?? offered.find((w) => (w.name ?? '').toLowerCase().startsWith(wanted));
      if (fromRepository) {
        if (fromRepository.state !== 'accepted') {
          // Said plainly: an agent reads this and should stop and say so, not look for a way round.
          print(showControl(`"${fromRepository.name}" (${fromRepository.file}) cannot be run yet. ${NEEDS_REVIEW}`));
          return 1;
        }
        const started = await owner((client) => client.runRepositoryWorkflow({ sessionId: session.id, body: { file: fromRepository.file, inputs: command.inputs, replace: command.replace } }));
        print(showControl(`Started "${started.workflowName}" from the repository on "${session.name}": ${started.position}.`));
        print(started.kickoffTyped ? 'The agent in it has been told.' : `Nothing was typed into the terminal (no agent is running there). To set an agent off, give it this line:\n  ${started.kickoff}`);
        return 0;
      }
      const workflow = await find(command.query);
      const started = await owner((client) => client.startSessionRun({ sessionId: session.id, body: { workflowId: workflow.id, inputs: command.inputs, replace: command.replace } }));
      print(`Started "${started.workflowName}" on "${session.name}": ${started.position}.`);
      print(started.kickoffTyped ? 'The agent in it has been told.' : `Nothing was typed into the terminal (no agent is running there). To set an agent off, give it this line:\n  ${started.kickoff}`);
      return 0;
    }

    case 'element-list': {
      const shelf = await owner((client) => collect(client.each.listElements()));
      if (shelf.length === 0) {
        print('No elements on the shelf yet. Put one there from a workflow in the browser, or ask an agent for one.');
        return 0;
      }
      const width = Math.max(...shelf.map((item) => item.element.name.length));
      print(showControl(shelf.map((item) => `${item.element.name.padEnd(width)}  version ${item.version}${item.state === 'retired' ? ', retired' : ''}; ${item.element.produces === 'note' ? '' : `produces a ${item.element.produces}; `}${item.element.needs.length > 0 ? `needs ${item.element.needs.map(needWords).join('; ')}` : 'needs nothing'}`.trimEnd()).join('\n')));
      return 0;
    }

    case 'element-show':
    case 'element-remove':
    case 'element-run': {
      const shelf = await owner((client) => collect(client.each.listElements()));
      const item = resolveWorkflow(shelf.map((entry) => ({ ...entry, name: entry.element.name })), command.query);
      if (command.action === 'element-show') {
        const { element } = item;
        print(showControl([`${element.name}  (version ${item.version}${item.state === 'retired' ? ', retired' : ''})`, '', element.instructions.trim(), ...(element.doneWhen ? ['', `Done when: ${element.doneWhen}`] : []), ...(element.needs.length > 0 ? [`Needs: ${element.needs.map(needWords).join('; ')}`] : []), `Produces: ${element.produces}`].join('\n')));
        return 0;
      }
      if (command.action === 'element-remove') {
        // Said first: where it is used. The copies stay, and say from then on that their source was removed.
        const { uses } = await owner((client) => client.getElementUsage({ elementId: item.id }));
        if (uses.length > 0) print(showControl(`"${item.element.name}" is used in ${uses.length === 1 ? 'a workflow' : `${uses.length} workflows`}: ${uses.map((use) => use.workflowName).join(', ')}. The copies there stay as they are and will say that their source was removed.`));
        if (!command.yes && !/^y(es)?$/i.test((await deps.ask(`Take "${item.element.name}" off the shelf? Copies of it in workflows stay. [y/N] `)).trim())) {
          print('Kept.');
          return 0;
        }
        await owner((client) => client.removeElement({ elementId: item.id }));
        print(`Took "${item.element.name}" off the shelf.`);
        return 0;
      }
      const inside = deps.env[SESSION_ENV.sessionId];
      let session: { id: string; name: string };
      if (command.session !== null) session = resolveSession(await deps.sessions(), command.session);
      else if (inside) session = (await deps.sessions()).find((s) => s.id === inside) ?? { id: inside, name: 'this session' };
      else throw new UsageError('element run needs a session: --session <name or ID>, or type it inside the session.');
      const started = await owner((client) => client.runElement({ elementId: item.id, body: { sessionId: session.id, inputs: command.inputs, replace: command.replace } }));
      print(`Started "${started.workflowName}" by itself on "${session.name}".`);
      print(started.kickoffTyped ? 'The agent in it has been told.' : `Nothing was typed into the terminal (no agent is running there). To set an agent off, give it this line:\n  ${started.kickoff}`);
      return 0;
    }

    case 'brief':
    case 'propose':
    case 'status':
    case 'done':
    case 'blocked':
    case 'goto':
    case 'pause':
    case 'resume':
    case 'stop':
      return runInSession(command, deps);
  }
}

async function runInSession(command: Extract<WorkflowCommand, { action: 'brief' | 'propose' | 'status' | 'done' | 'blocked' | 'goto' | 'pause' | 'resume' | 'stop' }>, deps: WorkflowCommandDeps): Promise<number> {
  const { print } = deps;
  const { client, sessionId } = sessionClient(deps.env);
  try {
    switch (command.action) {
      case 'brief':
        // The owner's words, and after a draft was sent back their comment: printed here, never typed into the terminal.
        print(showControl((await client.getSessionBrief({ sessionId })).text));
        return 0;
      case 'propose': {
        const draft = await client.proposeSessionDraft({ sessionId, body: proposalFrom(command.kind, await deps.readText(command.file)) });
        print(`Handed in ${command.kind === 'element' ? 'the element' : 'the workflow'} as a draft${draft.revision > 1 ? ` (version ${draft.revision})` : ''}. A person reads it before it can be used; it may come back with a comment, which \`aubergine workflow brief\` will then show.`);
        return 0;
      }
      case 'status':
        print(showControl((await client.getSessionRun({ sessionId })).text));
        return 0;
      case 'done': {
        // The element is named in the report, so that a report sent twice finishes one element and not two.
        const now = await client.getSessionRun({ sessionId });
        const elementId = command.element !== null ? resolveElement(now.elements, command.element) : now.run.currentElementId;
        if (elementId === null) {
          print(now.text);
          return 1;
        }
        const output = command.output !== null ? jsonOf(await deps.readText(command.output), 'The output') : undefined;
        const next = await client.reportSessionRun({ sessionId, body: { type: 'done', elementId, ...(command.note !== null ? { note: command.note } : {}), ...(output !== undefined ? { output } : {}) } });
        print(`Recorded: "${now.elements.find((e) => e.id === elementId)?.name ?? elementId}" is done.\n`);
        print(showControl(next.text));
        return 0;
      }
      case 'blocked': {
        const run = await client.reportSessionRun({ sessionId, body: { type: 'blocked', reason: command.reason } });
        print(`Recorded: blocked on ${run.position}. The owner has been told. When it is resolved, carry on and report done as usual.`);
        return 0;
      }
      case 'goto': {
        const now = await client.getSessionRun({ sessionId });
        print((await client.reportSessionRun({ sessionId, body: { type: 'goto', elementId: resolveElement(now.elements, command.element) } })).text);
        return 0;
      }
      case 'pause':
      case 'resume':
      case 'stop': {
        const run = await client.reportSessionRun({ sessionId, body: { type: command.action } });
        print(command.action === 'stop' ? 'The run is stopped.' : command.action === 'pause' ? `The run is paused at ${run.position}.` : `The run goes on: ${run.position}.`);
        return 0;
      }
    }
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    // Said plainly, for whoever typed it: an agent reads this and acts on it.
    print(error.code === 'network' ? `The Aubergine server is not answering on ${deps.env[SESSION_ENV.url]}.` : error.message);
    return 1;
  }
}
