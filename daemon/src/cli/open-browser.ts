import { spawn } from 'node:child_process';

/** The command that opens an address in the default browser, or null where we do not know one. */
export function openCommand(platform: NodeJS.Platform, url: string): { file: string; args: string[] } | null {
  switch (platform) {
    case 'darwin':
      return { file: 'open', args: [url] };
    case 'linux':
      return { file: 'xdg-open', args: [url] };
    default:
      return null;
  }
}

/** Opens `url` in the default browser. Returns false when that could not be started. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const command = openCommand(platform, url);
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const child = spawn(command.file, command.args, { stdio: 'ignore', detached: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** The address that lands a canvas on one session. It never carries the access token. */
export function canvasAddress(port: number, sessionId: string, param: string): string {
  return `http://127.0.0.1:${port}/?${param}=${encodeURIComponent(sessionId)}`;
}
