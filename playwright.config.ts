import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const root = path.dirname(fileURLToPath(import.meta.url));

/** The smoke test runs against its own data folder, port and tmux socket. */
export const e2e = {
  port: 4710,
  dataDir: path.join(root, '.e2e-data'),
  tmuxSocket: 'aubergine-e2e',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${e2e.port}`,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    // Start from nothing each run: no saved state and no leftover shells.
    command: `rm -rf "${e2e.dataDir}" && (tmux -L ${e2e.tmuxSocket} kill-server 2>/dev/null || true) && pnpm build && pnpm start`,
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
