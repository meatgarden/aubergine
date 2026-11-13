import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CreateSessionResponse, SHOW_PARAM, ShowResponse, StateResponse, paths } from '@aubergine/shared';
import {
  claudeHooksSettings,
  claudeLaunchLine,
  hookActions,
  shellJoin,
  writeClaudeSettings,
  type HookEvent,
} from './agents/claude-code';
import { agentClient } from './cli/agent';
import { canvasAddress, openBrowser } from './cli/open-browser';
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
import { loadSettings } from './settings';
import { claudeSessionsDir, readClaudeSession, type ClaudeSession } from './migrate/claude-sessions';
import { describeItem, findCandidates, formatCandidates, planMove, stopAgent, systemProcesses } from './migrate/move';
import { zshHookSnippet } from './migrate/shell-hook';
import { formatScan, importLayout, nextStep, planImport, scanShells } from './migrate/shells';
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
  if (!response.ok) throw new Error(`The server answered HTTP ${response.status}: ${await response.text()}`);
  return response.json();
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
      console.log(formatScan(await scanShells(config)));
      return 0;
    }

    case 'move': {
      const sessionsDir = claudeSessionsDir();
      const shells = await scanShells(config);
      const records = new Map<number, ClaudeSession>();
      for (const shell of shells) {
        if (!shell.looksLikeClaude || shell.runningPid === null) continue;
        const record = await readClaudeSession(shell.runningPid, sessionsDir);
        if (record) records.set(record.pid, record);
      }
      const candidates = findCandidates(shells, records);

      if (!command.all && command.terminals.length === 0) {
        console.log(formatCandidates(candidates));
        if (candidates.length > 0) {
          console.log('\nMove some with: aubergine move <terminal>…   or all with: aubergine move --all   (add --dry-run to see the plan first)');
        }
        return 0;
      }

      const mode = command.stop ? 'stop' : 'fork';
      const plan = planMove(candidates, { select: command.all ? 'all' : command.terminals, mode, force: command.force });
      for (const tty of plan.unknown) console.log(`${tty}: no Claude Code tab was found on that terminal.`);
      for (const item of plan.items) console.log(describeItem(item));
      const todo = plan.items.filter((item) => item.action !== 'refuse');
      if (todo.length === 0) {
        console.log('\nNothing to move.');
        return plan.items.length > 0 || plan.unknown.length > 0 ? 1 : 0;
      }
      if (command.dryRun) {
        console.log('\nNothing was changed. Run without --dry-run to do this.');
        return 0;
      }

      if (mode === 'stop' && !command.yes) {
        if (!process.stdin.isTTY) throw new UsageError('move --stop asks before stopping anything; run it in a terminal, or add --yes.');
        const answer = await ask(`\nAsk ${todo.length} agent process(es) to exit and resume them on the canvas? [y/N] `);
        if (!/^y(es)?$/i.test(answer.trim())) {
          console.log('Nothing was changed.');
          return 0;
        }
      }

      let last: string | null = null;
      let failed = false;
      console.log('');
      for (const item of todo) {
        const { shell, pid } = item.candidate;
        if (item.action === 'resume') {
          // Look again right before acting: it may have started working since the plan was made.
          const fresh = await readClaudeSession(pid, sessionsDir);
          if (!fresh || fresh.conversationId !== item.candidate.session?.conversationId) {
            console.log(`${shell.tty}: left alone; its record changed or disappeared.`);
            failed = true;
            continue;
          }
          if (fresh.status !== 'idle' && !command.force) {
            console.log(`${shell.tty}: left alone; it is ${fresh.status ?? 'in an unknown state'} now, not idle.`);
            failed = true;
            continue;
          }
          const result = await stopAgent(fresh, systemProcesses);
          if (result === 'not-the-same-process') {
            console.log(`${shell.tty}: left alone; process ${pid} is no longer the same Claude Code process.`);
            failed = true;
            continue;
          }
          if (result === 'still-running') {
            console.log(`${shell.tty}: the original (process ${pid}) did not exit when asked. Nothing was started on the canvas for it; exit it yourself (/exit), then run: aubergine here --claude`);
            failed = true;
            continue;
          }
        }
        const body = {
          name: nameForFolder(item.cwd),
          uniqueName: true,
          cwd: item.cwd,
          agent: 'claude-code',
          agentArgs: item.agentArgs,
        };
        const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body));
        last = session.id;
        if (item.action === 'resume') {
          console.log(`${shell.tty}: the original has exited and its conversation carries on in "${session.name}" on the canvas.`);
          console.log(`      That tab is at its shell prompt now. To use it as a view of the session, run there: aubergine attach "${session.name}"`);
        } else {
          console.log(`${shell.tty}: "${session.name}" on the canvas now has ${item.action === 'fork' ? 'a copy of its conversation' : 'the most recent conversation in that folder'}.`);
          console.log(`      The original is still running in ${shell.tty}. Exit it there (/exit) when you are ready;`);
          console.log('      until then, two agents with the same history are working in the same folder.');
        }
      }
      if (last) {
        console.log('\nA tab that is already open cannot be turned into a view from here; that can only be done from inside the tab.');
        if (command.open) await showOnCanvas(config, last);
      }
      return failed ? 1 : 0;
    }

    case 'import': {
      const shells = await scanShells(config);
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      const plan = planImport(shells, state.sessions, { all: command.all });
      for (const { shell, reason } of plan.skipped) console.log(`Skipping ${shell.tty}: ${reason}.`);
      if (plan.create.length === 0) {
        console.log('Nothing to import.');
        return 0;
      }

      const claudeLine = claudeLaunchLine(command.dryRun ? '<settings file>' : await writeClaudeSettings(config.dataDir), {
        command: (await loadSettings(config.dataDir)).agents.claudeCommand,
        args: ['--continue'],
      });
      if (command.dryRun) {
        console.log(`Would create ${plan.create.length} session(s) in a frame named "Imported":`);
        for (const item of plan.create) {
          console.log(`\n  ${item.shell.tty}  →  "${item.name}" in ${item.cwd}`);
          console.log(`      ${nextStep({ shell: item.shell, sessionName: item.name }, claudeLine)}`);
        }
        console.log('\nNothing was changed. Your tabs are never touched; run without --dry-run to create the sessions.');
        return 0;
      }

      const parked = new Set(state.sessions.filter((s) => s.state === 'parked').map((s) => s.id));
      const onCanvas = [...state.layout.nodes.filter((n) => !parked.has(n.sessionId)), ...state.layout.frames];
      const layout = importLayout(plan.create.length, onCanvas);
      await call(config, 'POST', paths.frames, { label: 'Imported', rect: layout.frame });
      console.log(`Created ${plan.create.length} session(s) in a frame named "Imported". Your tabs are untouched.`);
      for (const [index, item] of plan.create.entries()) {
        const body = { name: item.name, uniqueName: true, cwd: item.cwd, rect: layout.nodes[index] };
        const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body));
        console.log(`\n  ${item.shell.tty}  →  "${session.name}" in ${item.cwd}`);
        console.log(`      ${nextStep({ shell: item.shell, sessionName: session.name }, claudeLine)}`);
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
