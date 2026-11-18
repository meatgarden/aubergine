import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AubergineError, createClient, type Client, type CreateTokenBody, type ListCanvasesResult } from '@aubergine/client';
import {
  CreateSessionResponse,
  ErrorResponse,
  Id,
  SESSION_ENV,
  SESSION_HEADER,
  PROJECT_HEADER,
  firstProject,
  HistoryList,
  RECAP_MAX,
  RECAP_WANTED,
  renderInbox,
  sentWords,
  type Message,
  ago,
  recapLines,
  recapOf,
  recordOfRun,
  showControl,
  whereWords,
  RunStatus,
  boardText,
  type RecapRun,
  type Run,
  DemoStatus,
  ShownResponse,
  publicPaths,
  OutsideResponse,
  OutsideResult,
  SHOW_PARAM,
  ShowResponse,
  StateResponse,
  paths,
  type NodeRect,
  type OutsideTerminal,
} from '@aubergine/shared';
import {
  claudeHooksSettings,
  hookActions,
  shellJoin,
  type HookEvent,
} from './agents/claude-code';
import { agentClient } from './cli/agent';
import { guideText } from './cli/guide';
import { parseLibraryCommand, runLibraryCommand } from './cli/library';
import { parseCopiesCommand, runCopiesCommand } from './cli/copies';
import { parseAskCommand, parseRuleCommand, parseTaskCommand, parseTodoCommand, runQueueCommand } from './cli/queue';
import { expandHome } from './settings';
import { INSIDE_ITS_OWN, TAKES_PROJECT, parseProjectCommand, pickProject, runProjectCommand, takeProject } from './cli/project';
import { parseScheduleCommand, runScheduleCommand } from './cli/schedule';

/** What `--copy` asks for, by the name its kind is registered under. The server says whether the folder can have one. */
const WORKING_COPY = 'working-copy';
import { parseElementCommand, parseWorkflowCommand, resolveWorkflow, runWorkflowCommand } from './cli/workflow';
import { openBrowser, sessionAddress } from './cli/open-browser';
import { commandsFor, formatAgents, formatOutside, normaliseTty, toShells } from './cli/outside';
import {
  BEGIN,
  USAGE,
  formatHistory,
  UsageError,
  expiryFromOption,
  formatCanvases,
  formatTokens,
  formatSessions,
  insideAubergine,
  nameForFolder,
  parseCommand,
  resolveCanvas,
  resolveSession,
  resolveToken,
} from './cli/commands';
import { doctor, ensureBuilt, formatChecks, formatVersion, installRoot, linkFolders, removeCopy, serve, serverAddress, signInAddress, uninstallPlan, update, versionInfo, whoAnswers } from './cli/install';
import { loadConfig, type Config } from './config';
import { zshHookSnippet } from './migrate/shell-hook';
import { importLayout, planImport } from './migrate/shells';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { cookieName } from './server';
import { daemonServiceSpec, installService, launchAgentPath, uninstallService } from './service/launchd';

/** Talks to the running daemon the same way the web app does: through the wire protocol. */
/** The project this command is about, when it is about one: named with --project, chosen with `project use`, or the project of the terminal it is typed in. Sent with every call. */
let meantProject: string | null = null;
const REMEMBERED_PROJECT = 'cli-project';

/** Works out which project the command means, once, before it runs. Failing to find out is not an error: the server then means the first project. */
async function meanProject(config: Config, named: string | null, commandName: string): Promise<void> {
  const insideId = process.env[SESSION_ENV.sessionId];
  if (insideId && process.env[SESSION_ENV.token]) {
    // In a terminal on a canvas the project is that terminal's own.
    if (named !== null) throw new UsageError(INSIDE_ITS_OWN);
    if (!TAKES_PROJECT.includes(commandName)) return;
    meantProject = await ownerClient(config)
      .then((client) => client.getSession({ sessionId: insideId }))
      .then((session) => session.projectId, () => null);
    return;
  }
  if (named === null && !TAKES_PROJECT.includes(commandName)) return;
  const remembered = named === null ? await readFile(path.join(config.dataDir, REMEMBERED_PROJECT), 'utf8').then((text) => text.trim(), () => '') : '';
  if (named === null && remembered === '') return;
  const projects: Awaited<ReturnType<Client['getProject']>>[] = [];
  try {
    for await (const project of (await ownerClient(config)).each.listProjects()) projects.push(project);
  } catch (error) {
    if (named !== null) throw error instanceof AubergineError ? new UsageError(error.code === 'network' ? `The Aubergine server is not answering on http://127.0.0.1:${config.port}. Is it running?` : error.message) : error;
    return;
  }
  if (named !== null) meantProject = pickProject(projects, named).id;
  // One that was chosen earlier and is gone or archived since is forgotten quietly.
  else meantProject = projects.find((project) => project.id === remembered && project.state === 'open')?.id ?? null;
}

async function call(config: Config, method: string, urlPath: string, body?: unknown, timeoutMs = 15_000): Promise<unknown> {
  const origin = `http://127.0.0.1:${config.port}`;
  let token: string;
  try {
    token = (await readFile(path.join(config.dataDir, 'token'), 'utf8')).trim();
  } catch {
    throw new UsageError(`No access token in ${config.dataDir}. Start the Aubergine server first.`);
  }
  let response: Response;
  try {
    response = await fetch(origin + urlPath, {
      method,
      headers: {
        origin,
        cookie: `${cookieName(config.port)}=${token}`,
        ...(meantProject ? { [PROJECT_HEADER]: meantProject } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new UsageError(`The Aubergine server is not answering on ${origin}. Is it running?`);
  }
  if (!response.ok) {
    const text = await response.text();
    const parsed = ErrorResponse.safeParse(safeJson(text));
    if (parsed.success) throw new ServerRefusal(parsed.data.error.message);
    throw new Error(`The server answered HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

/**
 * The public API (/v1) as this command calls it: with the client generated
 * from its description, as the owner. The access token is read from the data
 * folder (a file only that user can read) and sent as the browser's cookie
 * with the server's own origin, so the command passes exactly the checks the
 * signed-in browser passes.
 */
async function ownerClient(config: Config): Promise<Client> {
  const origin = `http://127.0.0.1:${config.port}`;
  let token: string;
  try {
    token = (await readFile(path.join(config.dataDir, 'token'), 'utf8')).trim();
  } catch {
    throw new UsageError(`No access token in ${config.dataDir}. Start the Aubergine server first.`);
  }
  // A command typed inside a session says which: the server records that beside the few things only the owner may do.
  const inside = process.env[SESSION_ENV.sessionId];
  return createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(config.port)}=${token}`, ...(inside ? { [SESSION_HEADER]: inside } : {}), ...(meantProject ? { [PROJECT_HEADER]: meantProject } : {}) } });
}

/** Runs calls made with the client, saying what the server said in the words this command uses. */
async function v1<T>(config: Config, work: (client: Client) => Promise<T>): Promise<T> {
  try {
    return await work(await ownerClient(config));
  } catch (error) {
    if (!(error instanceof AubergineError)) throw error;
    if (error.code === 'network') throw new UsageError(`The Aubergine server is not answering on http://127.0.0.1:${config.port}. Is it running?`);
    throw new ServerRefusal(error.message);
  }
}

/** Every canvas, in tab order. The list comes in pages. */
type CanvasSummary = ListCanvasesResult['items'][number];

async function allCanvases(config: Config): Promise<CanvasSummary[]> {
  return v1(config, async (client) => {
    const canvases: CanvasSummary[] = [];
    for await (const canvas of client.each.listCanvases()) canvases.push(canvas);
    return canvases;
  });
}

/** `--reach all | canvas:<name> | tag:<tag>` as a request field. Nothing when it was not given: the server then says it is needed. */
async function reachFromOption(config: Config, reach: string | null): Promise<{ reach?: CreateTokenBody['reach'] }> {
  if (reach === null) return {};
  if (reach === 'all') return { reach: { kind: 'all' } };
  if (reach.startsWith('tag:') && reach.length > 4) return { reach: { kind: 'tag', tag: reach.slice(4) } };
  if (reach.startsWith('canvas:') && reach.length > 7) return { reach: { kind: 'canvases', canvasIds: reach.slice(7).split(',').length > 0 ? await Promise.all(reach.slice(7).split(',').map(async (name) => resolveCanvas(await allCanvases(config), name.trim()).id)) : [] } };
  throw new UsageError('--reach needs all, canvas:<name> (several with commas) or tag:<tag>');
}

/** `--canvas <name>` as a request field; nothing when no canvas was named, so the server chooses. */
async function canvasField(config: Config, name: string | null): Promise<{ canvasId?: string }> {
  if (name === null) return {};
  return { canvasId: resolveCanvas(await allCanvases(config), name).id };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Opens some text in the user's editor. Gives back what they saved, or null when the editor did not end well. */
async function editText(text: string): Promise<string | null> {
  if (!process.stdin.isTTY) throw new UsageError('There is no terminal to open an editor in. Use: aubergine workflow edit <name> --file <path>');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-edit-'));
  const file = path.join(dir, 'workflow.json');
  try {
    await writeFile(file, text, { mode: 0o600 });
    // The editor is the user's own setting, run in their shell so that one with arguments works.
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(`${editor} "$1"`, ['sh', file], { shell: true, stdio: 'inherit' });
    if (result.status !== 0) return null;
    return await readFile(file, 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The daemon said no, with a message meant for the user. */
class ServerRefusal extends Error {}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serverMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The terminal this command runs in, as `scan` names it. */
function currentTty(): string | null {
  const tty = spawnSync('ps', ['-o', 'tty=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout?.trim() ?? '';
  return tty && tty !== '??' && tty !== '?' ? tty.replace(/^\/dev\//, '') : null;
}

function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    prompt.question(question, (answer) => {
      prompt.close();
      resolve(answer);
    });
  });
}

/**
 * Brings a session up for the user: an open canvas pans to it and focuses
 * it; with no canvas open, the default browser is opened on it. Failing to
 * do so is never an error for the command that asked.
 */
async function showOnCanvas(config: Config, sessionId: string): Promise<void> {
  try {
    const { viewers } = ShowResponse.parse(await call(config, 'POST', paths.showSession(sessionId), {}, 3000));
    if (viewers === 0) await openBrowser(sessionAddress(config.port, sessionId, SHOW_PARAM));
  } catch {
    // The session exists either way.
  }
}

/** Turns this terminal into a view of the session. Returns when the view ends. */
function attachTo(config: Config, sessionId: string): number {
  const runtime = new TmuxRuntime({ socket: config.tmuxSocket, tmuxBin: config.tmuxBin });
  const { bin, args, env } = runtime.attachCommand(sessionId);
  // The same session the canvas shows: both views stay in step.
  return spawnSync(bin, args, { stdio: 'inherit', env: { ...env, TERM: process.env.TERM ?? 'xterm-256color' } }).status ?? 1;
}

/**
 * Runs for an agent's hook. It must never disturb the agent: it prints
 * nothing (some hooks feed their output back to the agent), gives up quickly,
 * and always succeeds, including outside an Aubergine session.
 */
async function runHook(event: HookEvent): Promise<number> {
  try {
    const client = agentClient(process.env, 3000);
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    let input: unknown = null;
    try {
      input = JSON.parse(raw);
    } catch {
      // No usable input: the event itself is still worth reporting.
    }
    for (const action of hookActions(event, input)) {
      if (action.do === 'agent') await client.reportAgent('claude-code', action.conversationId).catch(() => {});
      else if (action.do === 'attention') await client.setAttention(action.state, action.message);
      else await client.appendNote(action.text, action.kind);
    }
  } catch {
    // Not in a session, or the server is away. Nothing to report to.
  }
  return 0;
}

async function main(): Promise<number> {
  // `--project <name>` is taken out first: it says which project the command is about, for the commands that take it.
  const typed = takeProject(process.argv.slice(2));
  const command = parseCommand(typed.rest);
  if (command.name === 'hook') return runHook(command.event);
  // Before anything is read or printed: this command speaks a protocol on standard output, and never uses the owner's sign-in.
  if (command.name === 'mcp') return (await import('@aubergine/mcp')).runMcp(command.words, process.env);
  // Before the settings or anything of the owner's is read: the guide uses only what is in the environment.
  if (command.name === 'guide') {
    console.log(await guideText({ all: command.all, snippet: command.snippet }, process.env));
    return 0;
  }
  if (command.name === 'shell-hook-print') {
    console.log(zshHookSnippet());
    return 0;
  }
  if (command.name === 'hooks-print') {
    console.log(JSON.stringify(claudeHooksSettings(), null, 2));
    return 0;
  }
  const config = loadConfig();
  await meanProject(config, typed.project, typed.rest[0] ?? '');

  switch (command.name) {
    case 'help':
      console.log(USAGE);
      return 0;

    case 'begin': {
      // Typed with nothing after it. With the server up and nothing on the canvas yet, three lines on where to begin; otherwise the usage.
      const sessions = (await whoAnswers(config.port)) === 'aubergine' ? await v1(config, (client) => client.listSessions({ query: { limit: 1 } })).catch(() => null) : null;
      console.log(sessions !== null && sessions.items.length === 0 ? BEGIN : USAGE);
      return 0;
    }

    case 'demo': {
      if ((await whoAnswers(config.port)) !== 'aubergine') {
        console.error(`The Aubergine server is not answering at ${serverAddress(config)}. Start it first: aubergine start`);
        return 1;
      }
      if (command.remove) {
        const before = DemoStatus.parse(await call(config, 'GET', paths.demo));
        await call(config, 'DELETE', paths.demo);
        console.log(before.present ? 'Removed the demo: its canvas, its terminals, their runs and drafts, and its folder. Nothing else was touched.' : 'There is no demo to remove.');
        return 0;
      }
      let demo = DemoStatus.parse(await call(config, 'POST', paths.demo, {}, 60_000));
      // The stand-ins take a few seconds to do their opening parts.
      const until = Date.now() + 45_000;
      while (!demo.ready && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        demo = DemoStatus.parse(await call(config, 'GET', paths.demo));
      }
      console.log(
        [
          'The demo is on a canvas named "Demo": a shell, three stand-in agents (scripts, not real agents) and a parked terminal.',
          'A short tour in the browser shows you round. Nothing in the demo is real, and nothing outside it was touched.',
          'When you have seen enough: aubergine demo --remove',
        ].join('\n'),
      );
      if (command.open && demo.canvasId !== null) {
        const show = async (): Promise<number> => ShownResponse.parse(await call(config, 'POST', publicPaths.showCanvas(demo.canvasId as string), {}, 3000)).shown;
        try {
          if ((await show()) === 0 && (await openBrowser(await signInAddress(config)))) {
            // The browser is opening, signed in; once it is there, take it to the demo.
            for (let i = 0; i < 20 && (await show()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch {
          // The demo is there either way.
        }
      }
      return 0;
    }

    case 'list': {
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      // Of the project the command means; of the first project where it means none.
      const of = meantProject ?? firstProject(state).id;
      console.log(formatSessions(state.sessions.filter((session) => session.projectId === of)));
      return 0;
    }

    case 'new': {
      // In a working copy: of the repository the folder named is in, or the one this was typed in.
      const folder = command.folder !== null ? path.resolve(command.folder) : command.copy ? process.cwd() : null;
      const body = { ...(command.sessionName ? { name: command.sessionName } : {}), ...(await canvasField(config, command.canvas)), ...(folder !== null ? { cwd: folder } : {}), ...(command.copy ? { environment: WORKING_COPY, name: command.sessionName ?? nameForFolder(folder ?? process.cwd()), uniqueName: true } : {}) };
      const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body));
      console.log(`Started "${session.name}"${command.copy ? ` in a working copy of its own, in ${session.cwd ?? 'its own folder'}. It is kept apart from your checkout; that is not a lock. See: aubergine copies` : ''}. Attach with: aubergine attach "${session.name}"`);
      return 0;
    }

    case 'canvas-list': {
      const { defaultCanvasId } = StateResponse.parse(await call(config, 'GET', paths.state));
      console.log(formatCanvases(await allCanvases(config), defaultCanvasId));
      return 0;
    }

    case 'canvas-new': {
      const canvas = await v1(config, (client) => client.createCanvas({ body: { name: command.canvasName } }));
      console.log(`Added the canvas "${canvas.name}". Put a session on it with: aubergine here --canvas "${canvas.name}"`);
      return 0;
    }

    case 'here': {
      if (insideAubergine(process.env, config.tmuxSocket)) {
        throw new UsageError(
          'This terminal is already an Aubergine session. Run "aubergine here" in a terminal outside the canvas, or use "aubergine new" to add another session.',
        );
      }
      const folder = process.cwd();
      const body = {
        ...(await canvasField(config, command.canvas)),
        name: command.sessionName ?? nameForFolder(folder),
        uniqueName: true,
        cwd: folder,
        // With --claude, what follows "--" is for the agent; without it, it is a command to run.
        ...(command.copy ? { environment: WORKING_COPY } : {}),
        ...(command.claude
          ? // A new working copy is a new folder: there is no conversation there to carry on.
            { agent: 'claude-code', ...(command.command.length > 0 ? { agentArgs: command.command } : command.copy ? {} : { agentContinue: true }) }
          : command.command.length > 0
            ? { command: shellJoin(command.command) }
            : {}),
      };
      // From the shell snippet a new tab is waiting on this, so give up quickly.
      const timeout = command.fromShellHook ? 1500 : 15_000;
      const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body, timeout));
      if (!command.attach) {
        console.log(`Started "${session.name}" in ${folder}. Attach with: aubergine attach "${session.name}"`);
        return 0;
      }
      if (command.open) await showOnCanvas(config, session.id);
      return attachTo(config, session.id);
    }

    case 'attach': {
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      // An ID in full is that session, whatever other sessions are named: the script of a desktop window names its session so.
      const byId = Id.safeParse(command.query.trim()).success ? state.sessions.find((s) => s.id === command.query.trim() && s.state !== 'exited') : undefined;
      const session = byId ?? resolveSession(state.sessions, command.query);
      return attachTo(config, session.id);
    }

    case 'scan': {
      const { terminals } = OutsideResponse.parse(await call(config, 'GET', paths.outside));
      console.log(formatOutside(terminals, currentTty()));
      const commands = commandsFor(terminals, 'all');
      if (commands.length > 0) console.log(`\nOne at a time:\n  ${commands.join('\n  ')}`);
      return 0;
    }

    case 'move': {
      const { terminals } = OutsideResponse.parse(await call(config, 'GET', paths.outside));
      const agents = terminals.filter((t) => t.kind === 'agent');

      if (!command.all && command.terminals.length === 0) {
        console.log(formatAgents(terminals));
        const commands = commandsFor(terminals, 'agents');
        if (commands.length > 0) console.log(`\nOne at a time:\n  ${commands.join('\n  ')}\n\nAdd --dry-run to any of them to see the plan first.`);
        return 0;
      }

      const wanted = command.all ? agents.map((t) => t.tty) : command.terminals.map(normaliseTty);
      const mode = command.stop ? 'stop' : 'fork';
      const chosen: OutsideTerminal[] = [];
      let failed = false;
      // First, what would happen to each. Nothing is changed yet.
      for (const tty of wanted) {
        const terminal = agents.find((t) => t.tty === tty);
        if (!terminal || terminal.runningPid === null) {
          console.log(`${tty}: no Claude Code tab was found on that terminal.`);
          failed = true;
          continue;
        }
        try {
          const body = { tty, pid: terminal.runningPid, mode, force: command.force, dryRun: true };
          console.log(OutsideResult.parse(await call(config, 'POST', paths.outsideMove, body)).message);
          chosen.push(terminal);
        } catch (error) {
          console.log(`${tty}: ${serverMessage(error)}`);
          failed = true;
        }
      }
      if (chosen.length === 0) {
        console.log('\nNothing to move.');
        return failed ? 1 : 0;
      }
      if (command.dryRun) {
        console.log('\nNothing was changed. Run without --dry-run to do this.');
        return 0;
      }
      if (mode === 'stop' && !command.yes) {
        if (!process.stdin.isTTY) throw new UsageError('move --stop asks before stopping anything; run it in a terminal, or add --yes.');
        const answer = await ask(`\nAsk ${chosen.length} agent process(es) to exit and resume them on the canvas? [y/N] `);
        if (!/^y(es)?$/i.test(answer.trim())) {
          console.log('Nothing was changed.');
          return 0;
        }
      }

      let last: string | null = null;
      console.log('');
      for (const terminal of chosen) {
        try {
          // The server looks the terminal up again and checks everything itself before acting.
          const body = { tty: terminal.tty, pid: terminal.runningPid, mode, force: command.force };
          const result = OutsideResult.parse(await call(config, 'POST', paths.outsideMove, body, 30_000));
          console.log(`${terminal.tty} → "${result.session?.name}": ${result.message}`);
          last = result.session?.id ?? last;
        } catch (error) {
          console.log(`${terminal.tty}: ${serverMessage(error)}`);
          failed = true;
        }
      }
      if (last) {
        console.log('\nA tab that is already open cannot be turned into a view from here; that can only be done from inside the tab.');
        if (command.open) await showOnCanvas(config, last);
      }
      return failed ? 1 : 0;
    }

    case 'import': {
      const { terminals } = OutsideResponse.parse(await call(config, 'GET', paths.outside));
      const { state, defaultCanvasId } = StateResponse.parse(await call(config, 'GET', paths.state));
      const canvasId = command.canvas === null ? defaultCanvasId : resolveCanvas(state.canvases, command.canvas).id;
      const named = command.terminals.map(normaliseTty);
      const missing = named.filter((tty) => !terminals.some((t) => t.tty === tty));
      for (const tty of missing) console.log(`${tty}: no such terminal outside Aubergine. See: aubergine scan`);

      // Naming terminals is asking for exactly those, so nothing is skipped for sharing a folder.
      const pool = named.length > 0 ? terminals.filter((t) => named.includes(t.tty)) : terminals;
      const plan = planImport(toShells(pool, currentTty()), state.sessions, { all: command.all || named.length > 0 });
      for (const { shell, reason } of plan.skipped) console.log(`Skipping ${shell.tty}: ${reason}.`);
      if (plan.create.length === 0) {
        console.log('Nothing to import.');
        return missing.length > 0 ? 1 : 0;
      }
      if (command.dryRun) {
        console.log(`Would create ${plan.create.length} session(s)${named.length > 0 ? '' : ' in a frame named "Imported"'}:`);
        for (const item of plan.create) console.log(`  ${item.shell.tty}  →  "${item.name}" in ${item.cwd}`);
        console.log('\nNothing was changed. Your tabs are never touched; run without --dry-run to create the sessions.');
        return 0;
      }

      // All of them at once go into a frame; ones picked by name land in free space.
      let rects: (NodeRect | undefined)[] = plan.create.map(() => undefined);
      if (named.length === 0) {
        const canvas = state.canvases.find((c) => c.id === canvasId);
        const layout = importLayout(plan.create.length, [...(canvas?.layout.nodes ?? []), ...(canvas?.layout.frames ?? [])]);
        await call(config, 'POST', paths.frames, { label: 'Imported', rect: layout.frame, canvasId });
        rects = layout.nodes;
      }
      console.log(`Your tabs are untouched. Creating ${plan.create.length} session(s):`);
      for (const [index, item] of plan.create.entries()) {
        try {
          const body = { tty: item.shell.tty, pid: item.shell.pid, canvasId, ...(rects[index] ? { rect: rects[index] } : {}) };
          const result = OutsideResult.parse(await call(config, 'POST', paths.outsideAdd, body));
          console.log(`\n  ${item.shell.tty}  →  "${result.session?.name}" in ${item.cwd}\n      ${result.message}`);
        } catch (error) {
          console.log(`\n  ${item.shell.tty}: ${serverMessage(error)}`);
        }
      }
      return 0;
    }

    // Reading a terminal and typing into one from the command line, as the owner. The server records these
    // as the owner's, from outside the browser, with the session the command was typed in.
    case 'screen':
    case 'output':
    case 'send':
    case 'run':
    case 'protect': {
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      const session = resolveSession(state.sessions, command.query);
      const sessionId = session.id;
      if (command.name === 'screen') {
        console.log((await v1(config, (client) => client.getScreen({ sessionId }))).text);
        return 0;
      }
      if (command.name === 'output') {
        console.log((await v1(config, (client) => client.getOutput({ sessionId, query: { lines: command.lines ?? 200 } }))).text);
        return 0;
      }
      if (command.name === 'send') {
        const sent = await v1(config, (client) => client.sendInput({ sessionId, body: { text: command.text, enter: command.enter, paste: false } }));
        console.log(`Typed ${sent.typed} ${sent.typed === 1 ? 'character' : 'characters'} into "${session.name}"${command.enter ? ' and pressed Enter' : '. Enter was not pressed: add --enter for that'}.`);
        return 0;
      }
      if (command.name === 'protect') {
        await v1(config, (client) => client.protectSession({ sessionId, body: { peopleOnly: command.peopleOnly } }));
        console.log(command.peopleOnly ? `"${session.name}" is now people only: no API token may read it or type into it.` : `"${session.name}" is open to API tokens again, as far as their scopes and reach allow.`);
        return 0;
      }
      const result = await v1(config, (client) => client.runCommand({ sessionId, body: { command: command.command, timeoutSeconds: command.timeout ?? 30 } }));
      if (result.output) console.log(result.output);
      if (result.outputCut) console.error('(The output was longer than is shown.)');
      if (!result.finished) {
        console.error(`Still going after ${Math.round(result.durationMs / 1000)} s. It was left running; look at it with: aubergine screen "${session.name}"`);
        return 124;
      }
      return result.exitCode ?? 0;
    }

    case 'board': {
      const status = command.status === null ? undefined : RunStatus.safeParse(command.status);
      if (status && !status.success) throw new UsageError(`board --status takes one of: ${RunStatus.options.join(', ')}`);
      const collectAll = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
        const all: T[] = [];
        for await (const item of items) all.push(item);
        return all;
      };
      const board = await v1(config, async (client) => {
        const canvases = command.canvas !== null ? await collectAll(client.each.listCanvases()) : [];
        const workflows = command.workflow !== null ? await collectAll(client.each.listWorkflows()) : [];
        const canvas = command.canvas !== null ? canvases.find((c) => c.id === command.canvas || c.name.toLowerCase() === command.canvas?.toLowerCase()) : undefined;
        if (command.canvas !== null && !canvas) throw new UsageError(`No canvas is named "${command.canvas}".`);
        const workflow = command.workflow !== null ? resolveWorkflow(workflows, command.workflow) : undefined;
        return client.getBoard({ query: { ...(canvas ? { canvasId: canvas.id } : {}), ...(workflow ? { workflowId: workflow.id } : {}), ...(status?.success ? { status: status.data } : {}), ...(command.tag !== null ? { tag: command.tag } : {}) } });
      });
      // Names and reasons were written by agents and tokens: control characters are shown, not sent to the terminal.
      console.log(showControl(boardText(board, Date.now())));
      return 0;
    }

    case 'queue': {
      const parsed = command.which === 'task' ? parseTaskCommand(command.words) : command.which === 'todo' ? parseTodoCommand(command.words) : command.which === 'ask' ? parseAskCommand(command.words) : parseRuleCommand(command.words);
      return runQueueCommand(parsed, { owner: (work) => v1(config, work), env: process.env, print: (text) => console.log(text) });
    }

    case 'project':
      return runProjectCommand(parseProjectCommand(command.words), {
        owner: (work) => v1(config, work),
        env: process.env,
        print: (text) => console.log(text),
        remember: async (projectId) => (projectId === null ? rm(path.join(config.dataDir, REMEMBERED_PROJECT), { force: true }) : writeFile(path.join(config.dataDir, REMEMBERED_PROJECT), `${projectId}\n`, { mode: 0o600 })),
        remembered: () => readFile(path.join(config.dataDir, REMEMBERED_PROJECT), 'utf8').then((text) => text.trim() || null, () => null),
        expandFolder: (folder) => path.resolve(expandHome(folder)),
      });

    case 'schedule':
      return runScheduleCommand(parseScheduleCommand(command.words), { owner: (work) => v1(config, work), env: process.env, print: (text) => console.log(text) });

    case 'copies':
      return runCopiesCommand(parseCopiesCommand(command.words), { owner: (work) => v1(config, work), print: (text) => console.log(text), ask });

    case 'library':
      return runLibraryCommand(parseLibraryCommand(command.words), { owner: (work) => v1(config, work), print: (text) => console.log(text), ask, cwd: process.cwd() });

    case 'workflow':
    case 'element':
      return runWorkflowCommand(command.name === 'element' ? parseElementCommand(command.words) : parseWorkflowCommand(command.words), {
        owner: (work) => v1(config, work),
        env: process.env,
        sessions: async () => StateResponse.parse(await call(config, 'GET', paths.state)).state.sessions,
        print: (text) => console.log(text),
        readText: (file) => (file === '-' ? readStdin() : readFile(file, 'utf8')),
        writeText: (file, text) => writeFile(file, text),
        edit: editText,
        ask,
      });

    case 'history': {
      const folder = path.resolve(command.folder ?? process.cwd());
      const list = HistoryList.parse(await call(config, 'GET', `${paths.history}?folder=${encodeURIComponent(folder)}`));
      // Names and prompts are other people's text: control characters are shown, not passed on to this terminal.
      console.log(showControl(formatHistory(list, new Date())));
      return 0;
    }

    case 'history-open': {
      const folder = path.resolve(command.folder ?? process.cwd());
      const made = (await call(config, 'POST', paths.historyOpen, { folder, id: command.id, copy: command.copy, evenIfOpen: command.evenIfOpen })) as { session: { id: string; name: string } };
      console.log(showControl(`Opened ${command.copy ? 'a copy of the conversation' : 'the conversation'} on the canvas as "${made.session.name}".`));
      await showOnCanvas(config, made.session.id);
      return 0;
    }

    case 'recap': {
      if (command.write) {
        // For the agent in a session. What it hands in is kept as its words; nothing here reads it as anything else.
        const handed = command.file !== null ? await readFile(command.file === '-' ? '/dev/stdin' : command.file, 'utf8') : process.stdin.isTTY ? '' : await readStdin();
        if (handed.trim() === '') {
          console.log(RECAP_WANTED);
          return 0;
        }
        const env = process.env;
        const url = env[SESSION_ENV.url];
        const sessionId = env[SESSION_ENV.sessionId];
        const token = env[SESSION_ENV.token];
        if (!url || !sessionId || !token) throw new UsageError('recap --write only works inside an Aubergine session (its environment is not set here).');
        const text = handed.trim();
        if (text.length > RECAP_MAX) throw new UsageError(`That is ${text.length} characters; a recap is at most ${RECAP_MAX}. Three to six sentences are wanted.`);
        await createClient({ baseUrl: url, token }).writeRecap({ sessionId, body: { text } });
        console.log('Handed in. Your owner sees it on this terminal.');
        return 0;
      }
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      const session = resolveSession(state.sessions, command.query ?? '');
      const withNames = (run: Run | undefined): RecapRun | null => {
        if (!run) return null;
        const record = recordOfRun(run, state.workflows.find((w) => w.id === run.workflowId));
        return { run, workflowName: record.workflowName, elements: record.elements };
      };
      const ended = await v1(config, (client) => client.listRuns({ query: { status: 'ended', sessionId: session.id, limit: 1 } })).catch(() => null);
      const last = ended?.items[0];
      const recap = recapOf(session, { live: withNames(state.runs.find((r) => r.sessionId === session.id)), ended: last ? { run: last.run as Run, workflowName: last.workflowName, elements: last.elements } : null });
      console.log(recapLines(recap, new Date()).join('\n'));
      if (recap.written) {
        // The agent's own words: shown as such, with control characters shown.
        console.log(`\nWhat its agent wrote, ${ago(recap.written.at, new Date())} ago${recap.written.stale ? ' (the terminal has printed since: this may be out of date)' : ''}:`);
        console.log(showControl(recap.written.text).split('\n').map((line) => `  ${line}`).join('\n'));
      } else if (recap.agent) console.log('\nIts agent has not been asked for a recap. Ask from the terminal\'s node in the browser.');
      return 0;
    }

    case 'inbox':
    case 'reply':
    case 'tell': {
      const env = process.env;
      const url = env[SESSION_ENV.url];
      const sessionId = env[SESSION_ENV.sessionId];
      const token = env[SESSION_ENV.token];
      const inside = Boolean(url && sessionId && token);
      if (!inside && command.name !== 'tell') throw new UsageError(`${command.name} only works inside an Aubergine session (its environment is not set here).`);
      if (!inside && command.name === 'tell') {
        // Typed outside a session: the owner's own message.
        const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
        const session = resolveSession(state.sessions, command.query);
        await call(config, 'POST', paths.sessionMessages(session.id), { text: command.text });
        console.log(`Sent to "${showControl(session.name)}". It waits there to be read; nothing was typed into the terminal.`);
        return 0;
      }
      // Inside a session: with that session's own credential, as that session.
      const client = createClient({ baseUrl: url as string, token: token as string });
      try {
        if (command.name === 'inbox') console.log(renderInbox(await client.takeInbox({ sessionId: sessionId as string }), new Date(), randomUUID().replaceAll('-', '').slice(0, 12), showControl));
        else if (command.name === 'reply') console.log(sentWords((await client.replyToMessage({ sessionId: sessionId as string, messageId: command.id, body: { text: command.text } })) as Message));
        else console.log(sentWords((await client.sendFromSession({ sessionId: sessionId as string, body: { to: command.query, text: command.text } })) as Message));
        return 0;
      } catch (error) {
        if (!(error instanceof AubergineError)) throw error;
        // Said plainly, for whoever typed it: an agent reads this and acts on it.
        console.log(error.code === 'network' ? `The Aubergine server is not answering on ${url}.` : showControl(error.message));
        return 1;
      }
    }

    case 'where': {
      const url = process.env[SESSION_ENV.url];
      const sessionId = process.env[SESSION_ENV.sessionId];
      const token = process.env[SESSION_ENV.token];
      if (!url || !sessionId || !token) throw new UsageError('where only works inside an Aubergine session (its environment is not set here). For every working copy: aubergine copies');
      const detail = await createClient({ baseUrl: url, token }).getSessionEnvironment({ sessionId });
      // Folders and branches are printed with control characters shown.
      console.log(showControl(whereWords(detail)));
      return 0;
    }

    case 'attention': {
      await agentClient().setAttention(command.state, command.message ?? undefined);
      console.log(command.state === 'waiting' ? 'Your owner has been told that this terminal waits for them.' : command.state === 'none' ? 'Cleared.' : `This terminal now shows "${command.state}".`);
      return 0;
    }

    case 'note': {
      const entry = await agentClient().appendNote(command.text);
      console.log(entry ? 'Noted.' : 'Not kept.');
      return 0;
    }

    // Tokens are made, listed and revoked by the owner only: over HTTP that means the signed-in browser,
    // never a token. This command is the owner too: it runs as the same user on the same machine and reads
    // the access token from the data folder (a file only that user can read), as `call` does for every
    // owner-only command. It sends it as the browser would, so it passes exactly the checks the browser passes.
    case 'token-create': {
      // The scopes are as typed; whether each is one a token can have is for the server to say.
      const body = { name: command.tokenName, scopes: command.scopes as CreateTokenBody['scopes'], reviewWorkflowChanges: command.review, ...expiryFromOption(command.expires), ...(await reachFromOption(config, command.reach)) };
      const created = await v1(config, (client) => client.createToken({ body }));
      // The secret, alone, on standard output, so that it can be captured: TOKEN=$(aubergine token create …).
      // Everything said about it goes to standard error. It is not written anywhere else.
      console.error(
        `Made the token "${created.token.name}" (${created.token.scopes.join(', ')}${created.token.expiresAt ? `, expires ${created.token.expiresAt.slice(0, 10)}` : ''}).\n` +
          (created.token.scopes.includes('workflows:write') ? (created.token.reviewWorkflowChanges ? 'What it writes about workflows arrives as drafts for you to review.\n' : 'It may create and change workflows directly, without your review.\n') : '') +
          'Its secret is below. It is shown this once and cannot be shown again; keep it like a password.',
      );
      console.log(created.secret);
      return 0;
    }

    case 'token-list': {
      const tokens = await v1(config, async (client) => {
        const all = [];
        for await (const token of client.each.listTokens()) all.push(token);
        return all;
      });
      console.log(formatTokens(tokens));
      return 0;
    }

    case 'token-revoke': {
      const tokens = await v1(config, async (client) => {
        const all = [];
        for await (const token of client.each.listTokens()) all.push(token);
        return all;
      });
      const token = resolveToken(tokens, command.query);
      if (token.revokedAt) {
        console.log(`"${token.name}" was already revoked.`);
        return 0;
      }
      await v1(config, (client) => client.revokeToken({ tokenId: token.id }));
      console.log(`Revoked "${token.name}". It stops working at once.`);
      return 0;
    }

    case 'start': {
      const root = installRoot();
      const address = serverAddress(config);
      const answering = await whoAnswers(config.port);
      if (answering === 'aubergine') {
        console.log(`Aubergine is already running at ${address}`);
        if (command.open) await openBrowser(await signInAddress(config));
        else console.log('Open it signed in with: aubergine open');
        return 0;
      }
      if (answering === 'other') {
        console.error(`Something else is using port ${config.port}, so the server cannot start there.\nStop it, or choose another port: AUBERGINE_PORT=4601 aubergine start`);
        return 1;
      }
      if (!ensureBuilt(root, (line) => console.log(line))) {
        console.error(`The web app could not be built in ${root}. Run "aubergine doctor" to see what is missing.`);
        return 1;
      }
      return serve(root, config, command.open ? () => void signInAddress(config).then(openBrowser, () => {}) : undefined);
    }

    case 'open': {
      if ((await whoAnswers(config.port)) !== 'aubergine') {
        console.error(`The Aubergine server is not answering at ${serverAddress(config)}. Start it first: aubergine start`);
        return 1;
      }
      const address = await signInAddress(config);
      if (command.print) {
        // Asked for in so many words: this address signs a browser in, so treat it like a password.
        console.log(address);
        return 0;
      }
      const opened = await openBrowser(address);
      console.log(opened ? `Opened ${serverAddress(config)} in your browser, signed in.` : `Could not open a browser. Show the sign-in address with: aubergine open --print`);
      return opened ? 0 : 1;
    }

    case 'update': {
      const result = update(installRoot());
      (result.ok ? console.log : console.error)(result.lines.join('\n'));
      return result.ok ? 0 : 1;
    }

    case 'version':
      console.log(formatVersion(versionInfo(installRoot(), config)));
      return 0;

    case 'doctor': {
      const checks = await doctor(installRoot(), config);
      console.log(formatChecks(checks));
      const wrong = checks.filter((check) => check.ok === false).length;
      console.log(wrong === 0 ? '\nEverything needed is in place.' : `\n${wrong} thing${wrong === 1 ? '' : 's'} to fix (marked x).`);
      return wrong === 0 ? 0 : 1;
    }

    case 'uninstall': {
      const root = installRoot();
      const plan = uninstallPlan(root, linkFolders(), launchAgentPath());
      console.log('This will remove:');
      for (const link of plan.links) console.log(`  the command      ${link}`);
      if (plan.links.length === 0) console.log('  (no link to this copy was found on your PATH)');
      if (plan.service) console.log(`  start at login   ${plan.service}`);
      if (plan.folder) console.log(`  the code         ${plan.folder}`);
      else console.log(`  (not the code in ${root}: the installer did not put it there, so it is yours to keep or delete)`);
      console.log(`It will not touch your data in ${config.dataDir}, and your terminals keep running.`);
      if (!command.yes) {
        if (!process.stdin.isTTY) throw new UsageError('uninstall asks before removing anything; run it in a terminal, or add --yes.');
        const answer = await ask('Remove these? [y/N] ');
        if (!/^y(es)?$/i.test(answer.trim())) {
          console.log('Nothing was removed.');
          return 0;
        }
      }
      if (plan.service) await uninstallService();
      removeCopy(plan);
      console.log(
        [
          '',
          'Removed. What is left, and how to remove it by hand if you want to:',
          `  your terminals, still running:   tmux -L ${config.tmuxSocket} kill-server   (ends every one of them)`,
          `  your canvas and notes:           rm -rf "${config.dataDir}"`,
          'If the server is still running in another terminal, stop it there with Ctrl-C.',
        ].join('\n'),
      );
      return 0;
    }

    case 'service': {
      if (command.action === 'install') {
        const file = await installService(daemonServiceSpec(config));
        console.log(`Aubergine now starts at login.\nAgent file: ${file}`);
      } else {
        const file = await uninstallService();
        console.log(`Aubergine no longer starts at login.\nRemoved: ${file}`);
      }
      return 0;
    }
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Started by the shell snippet: a new tab is waiting. Say nothing and let the normal shell start.
    if (process.argv.includes('--from-shell-hook')) process.exit(1);
    if (error instanceof UsageError) {
      // One line saying what was wrong. The whole list of commands is one command away, not in the way.
      console.error(`${error.message}\nFor the commands and their options: aubergine help`);
      process.exit(2);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
