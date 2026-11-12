import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CreateSessionResponse, StateResponse, paths } from '@aubergine/shared';
import {
  claudeHooksSettings,
  claudeLaunchLine,
  hookActions,
  shellJoin,
  writeClaudeSettings,
  type HookEvent,
} from './agents/claude-code';
import { agentClient } from './cli/agent';
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
      if (action.do === 'attention') await client.setAttention(action.state, action.message);
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
        ...(command.command.length > 0 ? { command: shellJoin(command.command) } : {}),
        ...(command.claude ? { agent: 'claude-code', agentContinue: true } : {}),
      };
      // From the shell snippet a new tab is waiting on this, so give up quickly.
      const timeout = command.fromShellHook ? 1500 : 15_000;
      const { session } = CreateSessionResponse.parse(await call(config, 'POST', paths.sessions, body, timeout));
      if (!command.attach) {
        console.log(`Started "${session.name}" in ${folder}. Attach with: aubergine attach "${session.name}"`);
        return 0;
      }
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

    case 'import': {
      const shells = await scanShells(config);
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      const plan = planImport(shells, state.sessions, { all: command.all });
      for (const { shell, reason } of plan.skipped) console.log(`Skipping ${shell.tty}: ${reason}.`);
      if (plan.create.length === 0) {
        console.log('Nothing to import.');
        return 0;
      }

      const claudeLine = claudeLaunchLine(
        command.dryRun ? '<settings file>' : await writeClaudeSettings(config.dataDir),
        { continue: true },
      );
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
