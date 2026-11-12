import os from 'node:os';
import path from 'node:path';

/**
 * The one place that decides where Aubergine keeps its data (state file,
 * access token). Nothing else in the code base may build such a path itself.
 */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.AUBERGINE_DATA_DIR;
  if (override) return path.resolve(override);

  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Aubergine');
    case 'win32':
      return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Aubergine');
    default:
      return path.join(env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'aubergine');
  }
}
