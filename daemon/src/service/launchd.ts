import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '../config';
import { shellEnvironment } from '../runtime/tmux-runtime';
import { stableNodePath } from '../node-path';

/**
 * Start at login, for macOS: a per-user launchd agent that runs the daemon.
 * Everything that knows about launchd lives in this one file, so support for
 * another service manager can be added beside it.
 */

export const SERVICE_LABEL = 'dev.aubergine.daemon';

export interface ServiceSpec {
  label: string;
  /** The command to run and its arguments. */
  programArguments: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  /** Receives the daemon's output. */
  logFile: string;
}

function xml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** The property list launchd reads. Pure: it only builds text. */
export function launchAgentPlist(spec: ServiceSpec): string {
  const args = spec.programArguments.map((a) => `    <string>${xml(a)}</string>`).join('\n');
  const env = Object.entries(spec.environment)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(spec.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(spec.workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${xml(spec.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(spec.logFile)}</string>
</dict>
</plist>
`;
}

export function launchAgentPath(label: string = SERVICE_LABEL, home: string = os.homedir()): string {
  return path.join(home, 'Library', 'LaunchAgents', `${label}.plist`);
}

/** How to run this checkout's daemon as a service, with the settings in use now. */
export function daemonServiceSpec(config: Config, env: NodeJS.ProcessEnv = process.env): ServiceSpec {
  const daemonDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const require = createRequire(path.join(daemonDir, 'package.json'));
  const environment: Record<string, string> = { PATH: shellEnvironment(env).PATH ?? '/usr/bin:/bin' };
  // Keep the choices made on the command line that installed the service.
  for (const key of ['AUBERGINE_PORT', 'AUBERGINE_DATA_DIR', 'AUBERGINE_TMUX_SOCKET', 'AUBERGINE_TMUX_BIN']) {
    const value = env[key];
    if (value) environment[key] = value;
  }
  return {
    label: SERVICE_LABEL,
    // An absolute Node path, because launchd does not search the user's PATH.
    programArguments: [stableNodePath(), require.resolve('tsx/cli'), path.join(daemonDir, 'src', 'main.ts')],
    workingDirectory: daemonDir,
    environment,
    logFile: path.join(config.dataDir, 'daemon.log'),
  };
}

function launchctl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('launchctl', args, (error, _stdout, stderr) => {
      if (error) reject(new Error(`launchctl ${args.join(' ')} failed: ${stderr.trim() || error.message}`));
      else resolve();
    });
  });
}

function requireMacOS(): void {
  if (process.platform !== 'darwin') {
    throw new Error('Start at login is only supported on macOS for now.');
  }
}

/** Writes the agent file and loads it. Returns the path of the file. */
export async function installService(spec: ServiceSpec): Promise<string> {
  requireMacOS();
  const file = launchAgentPath(spec.label);
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(path.dirname(spec.logFile), { recursive: true, mode: 0o700 });
  await writeFile(file, launchAgentPlist(spec), { mode: 0o644 });
  const domain = `gui/${os.userInfo().uid}`;
  await launchctl(['bootout', `${domain}/${spec.label}`]).catch(() => {}); // replace an older copy
  await launchctl(['bootstrap', domain, file]);
  return file;
}

/** Unloads the agent and removes its file. Running sessions are not affected. */
export async function uninstallService(label: string = SERVICE_LABEL): Promise<string> {
  requireMacOS();
  const file = launchAgentPath(label);
  await launchctl(['bootout', `gui/${os.userInfo().uid}/${label}`]).catch(() => {});
  await rm(file, { force: true });
  return file;
}
