import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scripts = (file: string): Record<string, string> => (JSON.parse(readFileSync(path.join(repo, file), 'utf8')) as { scripts: Record<string, string> }).scripts;

describe('which way of starting the server opens a browser', () => {
  it('`pnpm start` opens the browser on the sign-in link, and `pnpm serve` does not', () => {
    expect(scripts('package.json').start).toBe('pnpm --filter @aubergine/daemon start:open');
    expect(scripts('daemon/package.json')['start:open']).toBe('tsx src/main.ts --open');
    expect(scripts('package.json').serve).toBe('pnpm --filter @aubergine/daemon start');
    expect(scripts('daemon/package.json').start).not.toContain('--open');
  });

  it('the browser tests start the server without opening a browser on the desktop', () => {
    const config = readFileSync(path.join(repo, 'playwright.config.ts'), 'utf8');
    const command = /command: '([^']*)'/.exec(config)?.[1] ?? '';
    expect(command).toContain('pnpm serve');
    expect(command).not.toMatch(/pnpm start|--open|start:open/);
  });
});
