import { mkdir } from 'node:fs/promises';
import { paths } from '@aubergine/shared';
import { Canvas } from './canvas';
import { loadConfig } from './config';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { buildServer } from './server';
import { Sessions } from './sessions';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });

  const token = await loadOrCreateToken(config.dataDir);
  const store = new JsonStore(config.dataDir, (message) => console.warn(message));
  const canvas = new Canvas(await store.load(), store, (error) =>
    console.error('Could not save state:', error),
  );
  const runtime = new TmuxRuntime({ socket: config.tmuxSocket, tmuxBin: config.tmuxBin });
  const sessions = new Sessions(canvas, runtime);

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

  const app = await buildServer({
    canvas,
    sessions,
    runtime,
    token,
    devOrigin: config.devOrigin,
    webDist: config.webDist,
  });
  // Loopback only: this server hands out shells.
  await app.listen({ host: '127.0.0.1', port: config.port });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  const base = config.devOrigin ?? `http://127.0.0.1:${port}`;
  console.log(`Aubergine is running at ${base}`);
  console.log(`Data folder: ${config.dataDir}`);
  console.log(`First visit in a browser? Open this link once:\n  ${base}${paths.auth}?token=${token}`);

  // Folder and command of each session, and shells that ended unwatched.
  const poll = setInterval(() => {
    void sessions.refresh().catch((error) => console.error('Could not refresh sessions:', error));
  }, 2000);

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    clearInterval(poll);
    // Shells keep running inside tmux; only the viewers go away.
    void Promise.allSettled([canvas.flush(), app.close()]).then(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
