import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The access token: random, created on first run, kept in the data folder
 * readable by the owner only.
 */
export async function loadOrCreateToken(dir: string): Promise<string> {
  const file = path.join(dir, 'token');
  try {
    const existing = (await readFile(file, 'utf8')).trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return token;
}

export function tokensMatch(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
