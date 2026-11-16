import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SESSION_ENV, paths } from '@aubergine/shared';
import { claudeLaunchLine, writeClaudeSettings } from './agents/claude-code';
import { FileActivityLog } from './activity';
import { sessionToken } from './auth';
import { installRoot, versionInfo } from './cli/install';
import { StateHub } from './state-hub';
import { loadConfig } from './config';
import { TmuxRuntime, shellEnvironment } from './runtime/tmux-runtime';
import { buildServer } from './server';
import { readClaudeSession } from './migrate/claude-sessions';
import { systemProcesses } from './migrate/move';
import { Outside } from './migrate/outside';
import { scanShells } from './migrate/shells';
import { Sessions } from './sessions';
import { Viewers } from './viewers';
import { ZshIntegration } from './shell/integration';
import { SettingsFile, expandHome } from './settings';
import { pathWithCommand, writeCommandLauncher } from './command-path';
import { FileRunArchive } from './run-archive';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });

  const token = await loadOrCreateToken(config.dataDir);
  const store = new JsonStore(config.dataDir, (message) => console.warn(message));
  const hub = new StateHub(await store.load(), store, (error) =>
    console.error('Could not save state:', error),
  );
  const settings = new SettingsFile(config.dataDir, (message) => console.warn(message));
  await settings.reload();
  const runtime = new TmuxRuntime({ socket: config.tmuxSocket, tmuxBin: config.tmuxBin });
  let listeningPort = config.port;
  const integration = new ZshIntegration(path.join(config.dataDir, 'shell'));
  const viewers = new Viewers();
  // The `aubergine` command for programs inside sessions, at the end of their PATH.
  const commandFolder = await writeCommandLauncher(config.dataDir);
  const sessionPath = pathWithCommand(shellEnvironment(process.env).PATH ?? '', commandFolder);
  const sessions = new Sessions(hub, runtime, {
    integration,
    currentCanvas: () => viewers.lastViewedCanvasId,
    sessionEnv: (sessionId) => ({
      [SESSION_ENV.url]: `http://127.0.0.1:${listeningPort}`,
      [SESSION_ENV.sessionId]: sessionId,
      [SESSION_ENV.token]: sessionToken(token, sessionId),
      [SESSION_ENV.bin]: commandFolder,
      PATH: sessionPath,
    }),
    logPrompts: () => settings.value.agents.logPrompts,
    agentLaunchLine: async (_agent, args) =>
      claudeLaunchLine(await writeClaudeSettings(config.dataDir), {
        command: (await settings.reload()).agents.claudeCommand,
        args,
      }),
    defaultFolder: () => (settings.value.defaultFolder ? expandHome(settings.value.defaultFolder) : null),
    shell: () => settings.value.shell,
  });

  const outside = new Outside({
    scan: () => scanShells(config),
    readAgentRecord: (pid) => readClaudeSession(pid),
    processes: systemProcesses,
    createSession: (input) => sessions.create(input),
  });

  const app = await buildServer({
    outside,
    viewers,
    hub,
    sessions,
    runtime,
    settings: () => settings.reload(),
    token,
    devOrigin: config.devOrigin,
    webDist: config.webDist,
    // What API tokens did, as a file of its own in the data folder: it is not part of the state.
    activity: new FileActivityLog(config.dataDir, settings.value.api.activityLogMaxBytes, (error) => console.warn(`Could not write the activity log: ${String(error)}`)),
    runArchive: new FileRunArchive(config.dataDir, (error) => console.warn(`Could not write the archive of runs: ${String(error)}`)),
    version: versionInfo(installRoot(), config).version,
  });
  // Loopback only: this server hands out shells.
  await app.listen({ host: '127.0.0.1', port: config.port });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  listeningPort = port;

  // After listening, so that shells started now are given the right address.
  const status = await sessions.status();
  if (status.status === 'ok') {
    await sessions.reconcile();
  } else {
    console.warn(
      status.status === 'missing'
        ? 'tmux was not found. Install tmux 3.2 or newer; the canvas shows an error page until then.'
        : `tmux ${status.version} is too old; ${status.minVersion} or newer is needed.`,
    );
  }

  const base = config.devOrigin ?? `http://127.0.0.1:${port}`;
  console.log(`Aubergine is running at ${base}`);
  console.log(`Data folder: ${config.dataDir}`);
  console.log(`First visit in a browser? Open this link once:\n  ${base}${paths.auth}?token=${token}`);

  // Folder and command of each session, and shells that ended unwatched.
  const poll = setInterval(() => {
    void sessions.refresh().catch((error) => console.error('Could not refresh sessions:', error));
  }, 2000);

  // A shell reported a command starting or ending: pick it up right away.
  const stopWatching = integration.watch(() => {
    void sessions.refresh().catch(() => {});
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    clearInterval(poll);
    stopWatching();
    // Shells keep running inside tmux; only the viewers go away.
    void Promise.allSettled([hub.flush(), app.close()]).then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
