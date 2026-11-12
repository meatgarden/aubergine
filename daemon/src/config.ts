import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './paths';

export interface Config {
  /** TCP port on 127.0.0.1. */
  port: number;
  dataDir: string;
  /** Name of the dedicated tmux socket (`tmux -L <name>`). */
  tmuxSocket: string;
  /** tmux binary to run. */
  tmuxBin: string;
  /**
   * Origin of a development front-end server that proxies to this daemon.
   * Its host and origin are accepted in addition to the daemon's own.
   */
  devOrigin: string | null;
  /** Folder holding the built web app, served when it exists. */
  webDist: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.AUBERGINE_PORT ?? 4600);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`AUBERGINE_PORT is not a valid port: ${env.AUBERGINE_PORT}`);
  }
  const tmuxSocket = env.AUBERGINE_TMUX_SOCKET ?? 'aubergine';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tmuxSocket)) {
    throw new Error(`AUBERGINE_TMUX_SOCKET is not a valid socket name: ${tmuxSocket}`);
  }
  const devOrigin = env.AUBERGINE_DEV_ORIGIN ? new URL(env.AUBERGINE_DEV_ORIGIN).origin : null;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    port,
    dataDir: dataDir(env),
    tmuxSocket,
    tmuxBin: env.AUBERGINE_TMUX_BIN || 'tmux',
    devOrigin,
    webDist: path.resolve(here, '..', '..', 'web', 'dist'),
  };
}
