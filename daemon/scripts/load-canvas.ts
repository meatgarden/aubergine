/**
 * Fills a throwaway canvas with many sessions so that scale can be judged by
 * hand: 30 active sessions (10 of them printing constantly, 20 printing now
 * and then) plus 60 idle ones. It runs its own daemon on its own port, data
 * folder and tmux socket, and removes all of it again on Ctrl-C.
 *
 *   pnpm load-canvas
 *
 * Not part of `pnpm check`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { CreateSessionResponse, paths } from '@aubergine/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.LOAD_PORT ?? 4720);
const socket = 'aubergine-load';
const dataDir = path.join(root, '.load-data');
const origin = `http://127.0.0.1:${port}`;

const BUSY = 10;
const OCCASIONAL = 20;
const IDLE = 60;
const COLUMNS = 10;
const WIDTH = 720;
const HEIGHT = 440;
const GAP = 40;

function tmux(...args: string[]): void {
  execFileSync('tmux', ['-L', socket, ...args], { stdio: 'ignore' });
}

function cleanUp(): void {
  try {
    tmux('kill-server');
  } catch {
    // Nothing running.
  }
  rmSync(dataDir, { recursive: true, force: true });
}

cleanUp();

const daemon = spawn('pnpm', ['--filter', '@aubergine/daemon', 'start'], {
  cwd: root,
  stdio: 'ignore',
  env: {
    ...process.env,
    AUBERGINE_PORT: String(port),
    AUBERGINE_DATA_DIR: dataDir,
    AUBERGINE_TMUX_SOCKET: socket,
  },
});

let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  daemon.kill('SIGTERM');
  setTimeout(() => {
    cleanUp();
    process.exit(0);
  }, 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const tokenFile = path.join(dataDir, 'token');
for (let i = 0; i < 100 && !existsSync(tokenFile); i++) await sleep(100);
const token = readFileSync(tokenFile, 'utf8').trim();
const headers = {
  'content-type': 'application/json',
  origin,
  cookie: `aubergine_token_${port}=${token}`,
};
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(origin + paths.state, { headers })).ok) break;
  } catch {
    // Not listening yet.
  }
  await sleep(100);
}

const kinds = [
  ...Array.from({ length: BUSY }, () => 'busy' as const),
  ...Array.from({ length: OCCASIONAL }, () => 'occasional' as const),
  ...Array.from({ length: IDLE }, () => 'idle' as const),
];

for (const [index, kind] of kinds.entries()) {
  const rect = {
    x: (index % COLUMNS) * (WIDTH + GAP),
    y: Math.floor(index / COLUMNS) * (HEIGHT + GAP),
    width: WIDTH,
    height: HEIGHT,
  };
  const response = await fetch(origin + paths.sessions, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `${kind} ${index + 1}`, rect }),
  });
  if (!response.ok) throw new Error(`Could not create session ${index + 1}: HTTP ${response.status}`);
  const { session } = CreateSessionResponse.parse(await response.json());
  const command =
    kind === 'busy'
      ? 'while true; do date; ls -la /usr/bin | head -20; sleep 0.2; done'
      : kind === 'occasional'
        ? 'while true; do date; sleep 10; done'
        : null;
  if (command) tmux('send-keys', '-t', `=${session.id}:`, command, 'Enter');
  process.stdout.write(`\rcreated ${index + 1}/${kinds.length}`);
}

console.log(`\n\n${BUSY} busy, ${OCCASIONAL} occasional and ${IDLE} idle sessions are running.`);
console.log(`Open ${origin}${paths.auth}?token=${token}`);
console.log('Press Ctrl-C to end them and remove the test data.');
