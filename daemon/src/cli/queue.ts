import { AubergineError, createClient, type Client } from '@aubergine/client';
import { RULE_EVENT_WORDS, RuleEvent, SESSION_ENV, TASK_STATE_WORDS, addedByWords, forYouText, showControl, sourceWords, taskLine } from '@aubergine/shared';
import { UsageError, takeOption } from './commands';

/**
 * `aubergine task`, `todo`, `ask` and `rule`: the queue of tasks for agents,
 * what waits on the owner, and the rules. Clients of the public API, like
 * every command. Inside a terminal on a canvas they speak with that
 * terminal's own credential: what is added there is a proposal or a request,
 * and what only the owner decides is not done there at all.
 */

export type QueueCommand =
  | { action: 'task-add'; title: string; details: string | null; folder: string | null; workflow: string | null; to: string | null; labels: string[] }
  | { action: 'task-list' }
  | { action: 'task-show'; query: string }
  | { action: 'task-start'; query: string | null }
  | { action: 'task-decide'; what: 'accept' | 'decline' | 'withdraw' | 'again' | 'clear'; query: string }
  | { action: 'task-move'; query: string; where: 'first' | 'last' | 'before'; before: string | null }
  | { action: 'todo-list' }
  | { action: 'todo-add'; text: string }
  | { action: 'todo-done'; query: string }
  | { action: 'ask'; text: string }
  | { action: 'rule-list' }
  | { action: 'rule-add'; event: string; notify: boolean; run: string | null; on: string | null; onNew: string | null }
  | { action: 'rule-remove'; query: string };

const words = (rest: readonly string[], what: string, known: readonly string[] = []): string => {
  const unknown = rest.find((word) => word.startsWith('--') && !known.includes(word));
  if (unknown) throw new UsageError(`${what} does not know ${unknown}`);
  return rest.filter((word) => !word.startsWith('--')).join(' ').trim();
};

export function parseTaskCommand(args: readonly string[]): QueueCommand {
  const [action, ...rest] = args;
  switch (action) {
    case undefined:
    case 'list':
    case 'ls':
      if (rest.length > 0) throw new UsageError('task list takes no arguments');
      return { action: 'task-list' };
    case 'add': {
      const details = takeOption(rest, '--details');
      const folder = takeOption(details.rest, '--folder');
      const workflow = takeOption(folder.rest, '--workflow');
      const to = takeOption(workflow.rest, '--to');
      const labels: string[] = [];
      let left = to.rest;
      for (;;) {
        const label = takeOption(left, '--label');
        if (label.value === null) break;
        labels.push(label.value);
        left = label.rest;
      }
      const title = words(left, 'task add');
      if (title === '') throw new UsageError('task add needs a title: aubergine task add "Fix the retry" --details "It gives up too early."');
      return { action: 'task-add', title, details: details.value, folder: folder.value, workflow: workflow.value, to: to.value, labels };
    }
    case 'show': {
      const query = words(rest, 'task show');
      if (query === '') throw new UsageError('task show needs a task: its title or the start of its ID');
      return { action: 'task-show', query };
    }
    case 'start': {
      const query = words(rest, 'task start');
      return { action: 'task-start', query: query === '' ? null : query };
    }
    case 'accept':
    case 'decline':
    case 'withdraw':
    case 'again':
    case 'clear': {
      const query = words(rest, `task ${action}`);
      if (query === '') throw new UsageError(`task ${action} needs a task: its title or the start of its ID`);
      return { action: 'task-decide', what: action, query };
    }
    case 'move': {
      const before = takeOption(rest, '--before');
      const query = words(before.rest, 'task move', ['--first', '--last']);
      const where = before.value !== null ? 'before' : before.rest.includes('--first') ? 'first' : before.rest.includes('--last') ? 'last' : null;
      if (query === '' || where === null) throw new UsageError('task move needs a task and where to: --first, --last, or --before <another task>');
      return { action: 'task-move', query, where, before: before.value };
    }
    default:
      throw new UsageError(`task does not know "${action}"`);
  }
}

export function parseTodoCommand(args: readonly string[]): QueueCommand {
  const [action, ...rest] = args;
  if (action === undefined || action === 'list') return { action: 'todo-list' };
  const text = words(rest, `todo ${action}`);
  if (action === 'add') {
    if (text === '') throw new UsageError('todo add needs what to write: aubergine todo add "Renew the certificate"');
    return { action: 'todo-add', text };
  }
  if (action === 'done') {
    if (text === '') throw new UsageError('todo done needs which: the start of its ID, as aubergine todo shows it');
    return { action: 'todo-done', query: text };
  }
  throw new UsageError(`todo does not know "${action}"`);
}

export function parseAskCommand(args: readonly string[]): QueueCommand {
  const text = words(args, 'ask');
  if (text === '') throw new UsageError('ask needs what you ask of your owner: aubergine ask "Please rotate the staging key."');
  return { action: 'ask', text };
}

export function parseRuleCommand(args: readonly string[]): QueueCommand {
  const [action, ...rest] = args;
  if (action === undefined || action === 'list') return { action: 'rule-list' };
  if (action === 'remove' || action === 'rm') {
    const query = words(rest, 'rule remove');
    if (query === '') throw new UsageError('rule remove needs a rule: its number in the list, or the start of its ID');
    return { action: 'rule-remove', query };
  }
  if (action === 'add') {
    const when = takeOption(rest, '--when');
    const run = takeOption(when.rest, '--run');
    const on = takeOption(run.rest, '--on');
    const onNew = takeOption(on.rest, '--new');
    const unknown = onNew.rest.find((word) => word !== '--notify');
    if (unknown) throw new UsageError(`rule add does not know ${unknown}`);
    const notify = onNew.rest.includes('--notify');
    if (when.value === null) throw new UsageError(`rule add needs --when: one of ${RuleEvent.options.join(', ')}`);
    if (notify === (run.value !== null)) throw new UsageError('rule add needs what to do: --notify, or --run <shelf element> with --on <terminal> or --new <canvas>');
    if (run.value !== null && (on.value === null) === (onNew.value === null)) throw new UsageError('rule add --run needs where: --on <terminal>, or --new <canvas>');
    return { action: 'rule-add', event: when.value, notify, run: run.value, on: on.value, onNew: onNew.value };
  }
  throw new UsageError(`rule does not know "${action}"`);
}

export interface QueueCommandDeps {
  owner: <T>(work: (client: Client) => Promise<T>) => Promise<T>;
  env: NodeJS.ProcessEnv;
  print: (text: string) => void;
}

/** What only the owner decides, said to whoever typed it inside a canvas terminal. A sentence in an agent's way; it is not a lock. */
const OWNERS = 'This is decided by a person, in the browser or from a terminal that is not on a canvas. This command does nothing inside a canvas terminal. If you are an agent: you can propose a task (aubergine task add) or ask your owner (aubergine ask), and neither is done until your owner acts.';

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

function pickBy<T extends { id: string }>(all: readonly T[], query: string, nameOf: (item: T) => string, what: string): T {
  const wanted = query.trim().toLowerCase();
  const found = all.filter((item) => item.id === wanted || (wanted.length >= 6 && item.id.startsWith(wanted)) || (wanted.length >= 6 && item.id.endsWith(wanted)) || nameOf(item).toLowerCase() === wanted);
  if (found.length === 1) return found[0] as T;
  throw new UsageError(found.length === 0 ? `No ${what} matches "${query}".` : `${found.length} ${what}s match "${query}". Use the ID.`);
}

export async function runQueueCommand(command: QueueCommand, deps: QueueCommandDeps): Promise<number> {
  const { owner, print } = deps;
  const url = deps.env[SESSION_ENV.url];
  const sessionId = deps.env[SESSION_ENV.sessionId];
  const token = deps.env[SESSION_ENV.token];
  const inside = url && sessionId && token ? { client: createClient({ baseUrl: url, token }), sessionId } : null;
  const ownersOnly = (): boolean => {
    if (!inside) return false;
    print(OWNERS);
    return true;
  };
  try {
    switch (command.action) {
      case 'ask': {
        if (!inside) throw new UsageError('ask only works inside an Aubergine session. To write on your own list: aubergine todo add "<text>"');
        await inside.client.addSessionAsk({ sessionId: inside.sessionId, body: { text: command.text } });
        print("Asked. It is on your owner's list, and it is not done until they act. Carry on with what you can do without it, or stop and say that you wait.");
        return 0;
      }
      case 'task-add': {
        if (inside) {
          // In a canvas terminal: a proposal, with that terminal's own credential. Where it runs and who takes it are the owner's to say.
          if (command.folder !== null || command.workflow !== null || command.to !== null) print('Where a task runs, by which workflow and who takes it are for your owner to say; only the title, the details and labels are proposed.');
          await inside.client.proposeSessionTask({ sessionId: inside.sessionId, body: { title: command.title, ...(command.details !== null ? { details: command.details } : {}), ...(command.labels.length > 0 ? { labels: command.labels } : {}) } });
          print(showControl(`Proposed “${command.title}”. It waits for your owner's yes and starts nothing until then. Do not start on it yourself unless your owner asks.`));
          return 0;
        }
        const made = await owner(async (client) => {
          let workflowId: string | undefined;
          if (command.workflow !== null) workflowId = pickBy(await collect(client.each.listWorkflows()), command.workflow, (w) => w.name, 'workflow').id;
          let taker: { kind: 'any' } | { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string } | undefined;
          if (command.to !== null && command.to !== 'any') {
            if (command.to.startsWith('new:')) taker = { kind: 'new', canvasId: pickBy(await collect(client.each.listCanvases()), command.to.slice(4), (c) => c.name, 'canvas').id };
            else taker = { kind: 'session', sessionId: pickBy(await collect(client.each.listSessions()), command.to, (s) => s.name, 'terminal').id };
          }
          return client.addTask({ body: { title: command.title, ...(command.details !== null ? { details: command.details } : {}), ...(command.folder !== null ? { folder: command.folder } : {}), ...(workflowId ? { workflowId } : {}), ...(taker ? { taker } : {}), ...(command.labels.length > 0 ? { labels: command.labels } : {}) } });
        });
        print(showControl(`Added “${made.title}” to the queue. Nothing starts by itself unless you switched that on: aubergine task start`));
        return 0;
      }
      case 'task-list': {
        if (inside) {
          const own = await inside.client.getSessionQueue({ sessionId: inside.sessionId });
          print(showControl([own.says, '', ...own.tasks.map((task) => `${TASK_STATE_WORDS[task.state].padEnd(18)} ${task.title}${task.mine ? '  (proposed by you)' : ''}`)].join('\n').trimEnd()));
          return 0;
        }
        const [queue, tasks] = await owner(async (client) => [await client.getQueue(), await collect(client.each.listTasks())] as const);
        print(`${queue.summary}. At most ${queue.limit} at once${queue.hold ? '; new starts are held' : ''}${queue.automatic ? '; tasks start by themselves' : '; nothing starts by itself'}.`);
        if (tasks.length > 0) print(showControl(['', ...tasks.map(taskLine)].join('\n')));
        return 0;
      }
      case 'task-show': {
        if (ownersOnly()) return 1;
        const task = pickBy(await owner((client) => collect(client.each.listTasks())), command.query, (t) => t.title, 'task');
        print(showControl([task.title, `  ${TASK_STATE_WORDS[task.state]}${task.reason ? `: ${task.reason}` : ''}`, `  added by ${addedByWords(task.addedBy)}, ${sourceWords(task.source)}`, ...(task.folder ? [`  in ${task.folder}`] : []), ...(task.labels.length > 0 ? [`  labels: ${task.labels.join(', ')}`] : []), ...(task.details ? ['', ...task.details.split('\n').map((line) => `  ${line}`)] : []), '', `  [${task.id}]`].join('\n')));
        return 0;
      }
      case 'task-start': {
        if (ownersOnly()) return 1;
        const started = await owner(async (client) => {
          const taskId = command.query !== null ? pickBy(await collect(client.each.listTasks()), command.query, (t) => t.title, 'task').id : undefined;
          return client.startTasks({ body: taskId ? { taskId } : {} });
        });
        print(showControl(started.says));
        return started.started.some((entry) => entry.ok) ? 0 : 1;
      }
      case 'task-decide': {
        // Withdrawing what one proposed is not a decision of the owner's; everything else here is.
        if (command.what !== 'withdraw' && ownersOnly()) return 1;
        if (inside) throw new UsageError('Inside a canvas terminal a proposal is withdrawn by asking your owner to decline it.');
        const task = await owner(async (client) => {
          const found = pickBy(await collect(client.each.listTasks()), command.query, (t) => t.title, 'task');
          const by = { taskId: found.id };
          if (command.what === 'accept') return client.acceptTask(by);
          if (command.what === 'decline') return client.declineTask(by);
          if (command.what === 'withdraw') return client.withdrawTask(by);
          if (command.what === 'again') return client.retryTask(by);
          return client.clearTask(by);
        });
        const said = { accept: 'It waits to be started', decline: 'Declined. A record of it is kept', withdraw: 'Withdrawn', again: 'It waits to be started again', clear: 'Put away' }[command.what];
        print(showControl(`“${task.title}”: ${said}.`));
        return 0;
      }
      case 'task-move': {
        if (ownersOnly()) return 1;
        await owner(async (client) => {
          const waiting = (await collect(client.each.listTasks())).filter((t) => t.state === 'queued');
          const task = pickBy(waiting, command.query, (t) => t.title, 'waiting task');
          const others = waiting.filter((t) => t.id !== task.id).map((t) => t.id);
          const at = command.where === 'first' ? 0 : command.where === 'last' ? others.length : others.indexOf(pickBy(waiting, command.before ?? '', (t) => t.title, 'waiting task').id);
          others.splice(Math.max(0, at), 0, task.id);
          await client.reorderTasks({ body: { taskIds: others } });
        });
        print('Moved.');
        return 0;
      }
      case 'todo-list': {
        if (inside) {
          const own = await inside.client.getSessionQueue({ sessionId: inside.sessionId });
          print(showControl(own.asks.length === 0 ? 'Nothing you asked of your owner is open.' : ['What you asked of your owner, and is not done yet:', ...own.asks.map((ask) => `  ${ask.text.split('\n')[0]}`)].join('\n')));
          return 0;
        }
        const list = await owner((client) => client.getForYou());
        print(showControl(forYouText(list)));
        return 0;
      }
      case 'todo-add': {
        if (inside) throw new UsageError('Inside a canvas terminal, ask your owner with: aubergine ask "<text>"');
        await owner((client) => client.addAsk({ body: { text: command.text } }));
        print('Written on your list.');
        return 0;
      }
      case 'todo-done': {
        if (ownersOnly()) return 1;
        const done = await owner(async (client) => {
          const list = await client.getForYou();
          const written = list.items.flatMap((item) => (item.written && item.askId ? [{ id: item.askId, sentence: item.sentence }] : []));
          const found = pickBy(written, command.query, (item) => item.sentence, 'thing written on your list');
          return client.finishAsk({ askId: found.id });
        });
        print(showControl(`Done: ${done.text.split('\n')[0]}`));
        return 0;
      }
      case 'rule-list': {
        if (ownersOnly()) return 1;
        const { rules, actions } = await owner((client) => client.listRules());
        print(rules.length === 0 ? 'No rules.' : showControl(rules.map((rule, index) => `${index + 1}. ${rule.says}  [${rule.id}]`).join('\n')));
        print(showControl(`\nA rule is: when ${Object.values(RULE_EVENT_WORDS).join(' | ')}, then ${actions.map((action) => action.title.toLowerCase()).join(' | ')}.`));
        return 0;
      }
      case 'rule-add': {
        if (ownersOnly()) return 1;
        const event = RuleEvent.safeParse(command.event);
        if (!event.success) throw new UsageError(`--when takes one of: ${RuleEvent.options.join(', ')}`);
        const list = await owner(async (client) => {
          if (command.notify) return client.addRule({ body: { event: event.data, action: { kind: 'notify' } } });
          const element = pickBy(await collect(client.each.listElements()), command.run ?? '', (e) => e.element.name, 'shelf element');
          const on = command.on !== null ? { kind: 'session', sessionId: pickBy(await collect(client.each.listSessions()), command.on, (s) => s.name, 'terminal').id } : { kind: 'new', canvasId: pickBy(await collect(client.each.listCanvases()), command.onNew ?? '', (c) => c.name, 'canvas').id };
          return client.addRule({ body: { event: event.data, action: { kind: 'run-element', elementId: element.id, on } } });
        });
        print(showControl(`Written: ${list.rules.at(-1)?.says ?? ''}`));
        if (command.notify) print('A notification is shown by the open Aubergine page, once you allowed it there: Queue, then "Allow notifications".');
        return 0;
      }
      case 'rule-remove': {
        if (ownersOnly()) return 1;
        await owner(async (client) => {
          const { rules } = await client.listRules();
          const byNumber = /^\d+$/.test(command.query) ? rules[Number(command.query) - 1] : undefined;
          const rule = byNumber ?? pickBy(rules, command.query, (r) => r.says, 'rule');
          await client.removeRule({ ruleId: rule.id });
        });
        print('Removed.');
        return 0;
      }
    }
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    print(showControl(error.code === 'network' ? 'The Aubergine server is not answering.' : error.message));
    return 1;
  }
}
