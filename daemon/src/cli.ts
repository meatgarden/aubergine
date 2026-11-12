import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CreateSessionResponse, StateResponse, paths } from '@aubergine/shared';
import { USAGE, UsageError, formatSessions, parseCommand, resolveSession } from './cli/commands';
import { loadConfig, type Config } from './config';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { cookieName } from './server';
import { daemonServiceSpec, installService, uninstallService } from './service/launchd';

/** Talks to the running daemon the same way the web app does: through the wire protocol. */
async function call(config: Config, method: string, urlPath: string, body?: unknown): Promise<unknown> {
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
    });
  } catch {
    throw new UsageError(`The Aubergine server is not answering on ${origin}. Is it running?`);
  }
  if (!response.ok) throw new Error(`The server answered HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function main(): Promise<number> {
  const command = parseCommand(process.argv.slice(2));
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

    case 'attach': {
      const { state } = StateResponse.parse(await call(config, 'GET', paths.state));
      const session = resolveSession(state.sessions, command.query);
      const runtime = new TmuxRuntime({ socket: config.tmuxSocket, tmuxBin: config.tmuxBin });
      const { bin, args, env } = runtime.attachCommand(session.id);
      // The same session the canvas shows: both views stay in step.
      return spawnSync(bin, args, { stdio: 'inherit', env }).status ?? 1;
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
    if (error instanceof UsageError) {
      console.error(`${error.message}\n`);
      console.error(USAGE);
      process.exit(2);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
