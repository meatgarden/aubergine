import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The smoke test runs against its own data folder, port and tmux socket, and
 * these are different for every run, so that two runs on one machine (say,
 * from two checkouts) never share a server. The run's ID is put in the
 * environment once, because this file is loaded again in each worker.
 */
const run = (process.env.AUBERGINE_E2E_RUN ??= `${process.pid}-${randomBytes(3).toString('hex')}`);

export const e2e = {
  // A port in a range of its own, picked from the run's ID.
  port: 20000 + (Number.parseInt(run.split('-')[1] ?? '0', 16) % 20000),
  dataDir: path.join(root, `.e2e-data-${run}`),
  tmuxSocket: `aubergine-e2e-${run}`,
};

export default defineConfig({
  testDir: 'e2e',
  // Per run as well, so that two runs in one checkout do not delete each other's traces.
  outputDir: path.join(root, 'test-results', run),
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${e2e.port}`,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    // An action that cannot happen fails by itself, naming the step, instead of using up the whole test.
    actionTimeout: 15_000,
  },
  webServer: {
    // Every run has a data folder and tmux socket of its own, so it starts from nothing.
    command: 'pnpm build && pnpm start',
    url: `http://127.0.0.1:${e2e.port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUBERGINE_PORT: String(e2e.port),
      AUBERGINE_DATA_DIR: e2e.dataDir,
      AUBERGINE_TMUX_SOCKET: e2e.tmuxSocket,
    },
  },
});
