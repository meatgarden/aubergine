import { FileTaskArchive } from './task-archive';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { SESSION_ENV, paths } from '@aubergine/shared';
import { AgentTools } from './agents/agent-tools';
import { claudeLaunchLine, claudeSettingsFile, writeClaudeSettings } from './agents/claude-code';
import { ClaudeHistory } from './agents/claude-history';
import { ClaudeInventory } from './agents/claude-inventory';
import { Histories } from './agents/history';
import { Inventories } from './agents/inventory';
import { Tokens } from './tokens';
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
import { FileDesktopOpener } from './desktop/open';
import { FileDraftLog } from './draft-log';
import { FileMessageLog } from './message-log';
import { GitFetcher } from './library/git';
import { FileInputAudit } from './input-audit';
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
  // Tools for agents: the file each is pointed at, and the token made for one when the owner asked for more than its own work.
  const agentTools = new AgentTools(hub, new Tokens(hub), config.dataDir, (message) => console.warn(message));
  const sessions = new Sessions(hub, runtime, {
    integration,
    currentCanvas: () => viewers.lastViewedCanvasId,
    sessionEnv: (sessionId) => ({
      [SESSION_ENV.url]: `http://127.0.0.1:${listeningPort}`,
      [SESSION_ENV.sessionId]: sessionId,
      [SESSION_ENV.token]: sessionToken(token, sessionId),
      [SESSION_ENV.bin]: commandFolder,
      PATH: sessionPath,
      // So that `aubergine` typed in a session talks to the server that session belongs to, also when that is not the default one.
      AUBERGINE_PORT: String(listeningPort),
      AUBERGINE_DATA_DIR: config.dataDir,
    }),
    logPrompts: () => settings.value.agents.logPrompts,
    protectByDefault: () => ({ all: settings.value.terminal.protectNewSessions, agents: settings.value.terminal.protectAgentSessions }),
    agentLaunchLine: async (_agent, args, sessionId) =>
      claudeLaunchLine(await writeClaudeSettings(config.dataDir), {
        command: (await settings.reload()).agents.claudeCommand,
        args,
        // The tools the owner gave this session, if any: also when its agent is resumed.
        mcpConfig: await agentTools.fileFor(sessionId),
      }),
    prepareAgentTools: (session, choice) => agentTools.prepare(session, choice),
    defaultFolder: () => (settings.value.defaultFolder ? expandHome(settings.value.defaultFolder) : null),
    shell: () => settings.value.shell,
  });

  const outside = new Outside({
    scan: () => scanShells(config),
    readAgentRecord: (pid) => readClaudeSession(pid),
    conversation: (folder, id) => new ClaudeHistory().summary(folder, id),
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
    demoFolder: path.join(config.dataDir, 'demo'),
    histories: (all) => new Histories(new ClaudeHistory(), all),
    inventories: new Inventories([new ClaudeInventory()], {
      settingsFile: () =>
        stat(claudeSettingsFile(config.dataDir)).then(
          () => claudeSettingsFile(config.dataDir),
          () => null,
        ),
      toolsFile: (sessionId) => agentTools.fileFor(sessionId),
      toolsChoice: (sessionId) => agentTools.choiceFor(sessionId),
    }),
    // What API tokens did, as a file of its own in the data folder: it is not part of the state.
    activity: new FileActivityLog(config.dataDir, settings.value.api.activityLogMaxBytes, (error) => console.warn(`Could not write the activity log: ${String(error)}`)),
    // What tokens type, in full, only when the owner switched that on in the settings.
    inputAudit: new FileInputAudit(config.dataDir, () => settings.value.terminal.auditInput, (error) => console.warn(`Could not write the audit of typed text: ${String(error)}`)),
    libraryFetcher: new GitFetcher(() => ({ timeoutSeconds: settings.value.library.fetchTimeoutSeconds, maxMegabytes: settings.value.library.maxFetchMegabytes })),
    libraryCache: path.join(config.dataDir, 'library'),
    copiesDir: path.join(config.dataDir, 'copies'),
    defaultFolder: () => (settings.value.defaultFolder ? expandHome(settings.value.defaultFolder) : null),
    messageLog: new FileMessageLog(config.dataDir, () => settings.value.messages.logMaxBytes, (error) => console.warn(`Could not write the file of messages: ${String(error)}`)),
    draftLog: new FileDraftLog(config.dataDir, (error) => console.warn(`Could not write the record of drafts: ${String(error)}`)),
    taskArchive: new FileTaskArchive(config.dataDir),
    templatesDir: path.join(config.dataDir, 'templates'),
    // A window of the owner's terminal application for a session: a script in the data folder that runs this copy's `aubergine attach`.
    desktop: new FileDesktopOpener({
      dataDir: config.dataDir,
      facts: () => ({ command: path.join(commandFolder, 'aubergine'), port: listeningPort, dataDir: config.dataDir, socket: config.tmuxSocket, tmuxBin: process.env.AUBERGINE_TMUX_BIN || null }),
      settings: async () => (await settings.reload()).desktop,
    }),
    setDesktopOpenNew: (value) => settings.setDesktopOpenNew(value),
    setTheme: (value) => settings.setTheme(value),
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
    // Whatever a session that is gone left behind: its token is revoked and its file removed.
    await agentTools.sweep();
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
