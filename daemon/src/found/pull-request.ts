import { spawn } from 'node:child_process';
import { FoundPullRequest } from '@aubergine/shared';

/**
 * The pull request of the branch a folder is on, as a signed-in local tool tells it. This is the one place the
 * `gh` tool is started. The server itself asks nothing of a network: it starts the owner's own tool, as the owner,
 * and reads what it prints. Where the tool is not installed, not signed in, or knows no pull request, the answer
 * is null and nothing is said.
 */
export interface PullRequestFinder {
  /** The pull request of the branch checked out in `folder`, or null. Never throws. */
  find(folder: string): Promise<FoundPullRequest | null>;
}

/** Which program is the tool. A test, or a server that must start nothing, points this at a stand-in or at nothing. */
export const ghBin = (): string => process.env.AUBERGINE_GH_BIN ?? 'gh';

/** What the tool printed, as a pull request; null for anything else. Pure. */
export function readPullRequest(printed: string): FoundPullRequest | null {
  let data: unknown;
  try {
    data = JSON.parse(printed);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { url, number, title, state, isDraft } = data as Record<string, unknown>;
  const said = typeof state === 'string' ? state.toLowerCase() : '';
  const parsed = FoundPullRequest.safeParse({
    url,
    number,
    title: typeof title === 'string' ? title.slice(0, 300) : '',
    state: said === 'merged' ? 'merged' : said === 'closed' ? 'closed' : isDraft === true ? 'draft' : 'open',
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The tool itself. Started without a shell, with fixed arguments, in the folder; it may not prompt, and it is given
 * a few seconds. Under the test runner it is never started unless a test names a stand-in for it.
 */
export function ghFinder(bin: () => string = ghBin, timeoutMs = 8000): PullRequestFinder {
  return {
    find: (folder) =>
      new Promise((resolve) => {
        if (process.env.VITEST && !process.env.AUBERGINE_GH_BIN) return resolve(null);
        let out = '';
        let done = false;
        const finish = (found: FoundPullRequest | null): void => {
          if (done) return;
          done = true;
          resolve(found);
        };
        try {
          const child = spawn(bin(), ['pr', 'view', '--json', 'number,url,title,state,isDraft'], {
            cwd: folder,
            stdio: ['ignore', 'pipe', 'ignore'],
            env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' },
          });
          const timer = setTimeout(() => {
            child.kill();
            finish(null);
          }, timeoutMs);
          child.stdout.on('data', (chunk: Buffer) => {
            if (out.length < 20_000) out += chunk.toString('utf8');
          });
          child.on('error', () => {
            clearTimeout(timer);
            finish(null);
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            finish(code === 0 ? readPullRequest(out) : null);
          });
        } catch {
          finish(null);
        }
      }),
  };
}
