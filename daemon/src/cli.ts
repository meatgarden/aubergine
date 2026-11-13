import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CreateSessionResponse,
  ErrorResponse,
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
import { canvasAddress, openBrowser } from './cli/open-browser';
import { commandsFor, formatAgents, formatOutside, normaliseTty, toShells } from './cli/outside';
import {
  USAGE,
  UsageError,
  formatSessions,
  insideAubergine,
  nameForFolder,
  parseCommand,
  resolveSession,
} from './cli/commands';
import { loadConfig, type Config } from './config';
import { zshHookSnippet } from './migrate/shell-hook';
import { importLayout, planImport } from './migrate/shells';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { cookieName } from './server';
import { daemonServiceSpec, installService, uninstallService } from './service/launchd';

/** Talks to the running daemon the same way the web app does: through the wire protocol. */
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
    if (viewers === 0) await openBrowser(canvasAddress(config.port, sessionId, SHOW_PARAM));
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
  const command = parseCommand(process.argv.slice(2));
  if (command.name === 'hook') return runHook(command.event);
  if (command.name === 'shell-hook-print') {
    console.log(zshHookSnippet());
    return 0;
  }
  if (command.name === 'hooks-print') {
    console.log(JSON.stringify(claudeHooksSettings(), null, 2));
    return 0;
  }
  const config = loadConfig();

  switch (command.name) {
    case 'help':
      console.log(USAGE);
      return 0;

    case 'list': {
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      console.log(formatSessions(state.sessions));
      return 0;
    }

    case 'new': {
      const body = command.sessionName ? { name: command.sessionName } : {};
      const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body));
      console.log(`Started "${session.name}". Attach with: aubergine attach "${session.name}"`);
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
        name: command.sessionName ?? nameForFolder(folder),
        uniqueName: true,
        cwd: folder,
        // With --claude, what follows "--" is for the agent; without it, it is a command to run.
        ...(command.claude
          ? { agent: 'claude-code', ...(command.command.length > 0 ? { agentArgs: command.command } : { agentContinue: true }) }
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
      const session = resolveSession(state.sessions, command.query);
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
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
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
        const parked = new Set(state.sessions.filter((s) => s.state === 'parked').map((s) => s.id));
        const onCanvas = [...state.layout.nodes.filter((n) => !parked.has(n.sessionId)), ...state.layout.frames];
        const layout = importLayout(plan.create.length, onCanvas);
        await call(config, 'POST', paths.frames, { label: 'Imported', rect: layout.frame });
        rects = layout.nodes;
      }
      console.log(`Your tabs are untouched. Creating ${plan.create.length} session(s):`);
      for (const [index, item] of plan.create.entries()) {
        try {
          const body = { tty: item.shell.tty, pid: item.shell.pid, ...(rects[index] ? { rect: rects[index] } : {}) };
          const result = OutsideResult.parse(await call(config, 'POST', paths.outsideAdd, body));
          console.log(`\n  ${item.shell.tty}  →  "${result.session?.name}" in ${item.cwd}\n      ${result.message}`);
        } catch (error) {
          console.log(`\n  ${item.shell.tty}: ${serverMessage(error)}`);
        }
      }
      return 0;
    }

    case 'note': {
      const entry = await agentClient().appendNote(command.text);
      console.log(entry ? 'Noted.' : 'Not kept.');
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
      console.error(`${error.message}\n`);
      console.error(USAGE);
      process.exit(2);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
