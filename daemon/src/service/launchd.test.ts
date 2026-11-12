import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { SERVICE_LABEL, daemonServiceSpec, launchAgentPath, launchAgentPlist, type ServiceSpec } from './launchd';

const spec: ServiceSpec = {
  label: SERVICE_LABEL,
  programArguments: ['/usr/local/bin/node', '/opt/app/tsx/cli.mjs', '/opt/app/daemon/src/main.ts'],
  workingDirectory: '/opt/app/daemon',
  environment: { PATH: '/usr/bin:/bin', AUBERGINE_DATA_DIR: '/Users/me/Data & <Stuff>' },
  logFile: '/Users/me/Data/daemon.log',
};

// These tests only build and inspect text. Nothing is installed or loaded.
describe('launchd agent', () => {
  it('describes a per-user agent that starts at login and is kept running', () => {
    const plist = launchAgentPlist(spec);
    expect(plist).toContain(`<key>Label</key>\n  <string>${SERVICE_LABEL}</string>`);
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>KeepAlive</key>\n  <true/>');
    expect(plist).toContain('<string>/opt/app/daemon/src/main.ts</string>');
    expect(plist).toContain('<key>StandardErrorPath</key>\n  <string>/Users/me/Data/daemon.log</string>');
  });

  it('escapes values so any path is safe', () => {
    const plist = launchAgentPlist(spec);
    expect(plist).toContain('<string>/Users/me/Data &amp; &lt;Stuff&gt;</string>');
    expect(plist).not.toContain('& <');
  });

  it.runIf(process.platform === 'darwin')('produces a file the system accepts as a property list', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'aubergine-plist-'));
    try {
      const file = path.join(dir, 'agent.plist');
      writeFileSync(file, launchAgentPlist(spec));
      expect(execFileSync('plutil', ['-lint', file], { encoding: 'utf8' })).toContain('OK');
      const json = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
      expect(json.ProgramArguments).toEqual(spec.programArguments);
      expect(json.EnvironmentVariables).toEqual(spec.environment);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lives in the user\'s LaunchAgents folder', () => {
    expect(launchAgentPath(SERVICE_LABEL, '/Users/me')).toBe(`/Users/me/Library/LaunchAgents/${SERVICE_LABEL}.plist`);
  });

  it('runs this daemon with an absolute Node path and carries over chosen settings', () => {
    const env = { PATH: '/repo/node_modules/.bin:/usr/bin', AUBERGINE_PORT: '4777', AUBERGINE_DATA_DIR: '/tmp/aub-data', npm_x: '1' };
    const built = daemonServiceSpec(loadConfig(env), env);
    expect(path.isAbsolute(built.programArguments[0] ?? '')).toBe(true);
    expect(built.programArguments.at(-1)).toMatch(/daemon\/src\/main\.ts$/);
    expect(built.environment).toMatchObject({ AUBERGINE_PORT: '4777', AUBERGINE_DATA_DIR: '/tmp/aub-data' });
    expect(built.environment.PATH).not.toContain('node_modules');
    expect(built.environment).not.toHaveProperty('npm_x');
    expect(built.logFile).toBe('/tmp/aub-data/daemon.log');
  });
});
