import type { FastifyReply, FastifyRequest } from 'fastify';
import { IDEMPOTENCY_HEADER, IdempotencyKey, type PageQuery } from '@aubergine/shared';

/**
 * Shapes shared by every public (/v1) route: cursor paging on lists, and
 * safe retries of creates. Kept apart from the routes so that each route
 * gets them the same way.
 */

export class BadCursorError extends Error {}

/**
 * One page of a list. The cursor names the last item of the page before, so
 * a page stays correct when items are added or removed between requests.
 */
export function paginate<T>(items: readonly T[], idOf: (item: T) => string, query: PageQuery): { items: T[]; nextCursor: string | null } {
  let start = 0;
  if (query.cursor !== undefined) {
    let after: unknown;
    try {
      after = (JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { after?: unknown }).after;
    } catch {
      throw new BadCursorError('The cursor is not one this server gave out');
    }
    if (typeof after !== 'string') throw new BadCursorError('The cursor is not one this server gave out');
    const index = items.findIndex((item) => idOf(item) === after);
    // The item it pointed at is gone: start over rather than skip or repeat silently.
    start = index < 0 ? 0 : index + 1;
  }
  const page = items.slice(start, start + query.limit);
  const last = page.at(-1);
  const more = start + query.limit < items.length;
  return {
    items: page,
    nextCursor: more && last !== undefined ? Buffer.from(JSON.stringify({ after: idOf(last) })).toString('base64url') : null,
  };
}

interface Remembered {
  status: number;
  body: unknown;
  at: number;
}

const KEEP_MS = 24 * 60 * 60 * 1000;
const KEEP_MAX = 2000;

/**
 * Remembers the answer to each create that carried an idempotency key, so
 * that the same request sent again gets the same answer and creates nothing
 * more. Kept in memory: a restart of the daemon forgets the keys.
 */
export class IdempotencyStore {
  private readonly answers = new Map<string, Remembered>();
  private readonly running = new Map<string, Promise<Remembered>>();

  /**
   * Runs `create` once per key (per caller and route). `key` is null when the
   * client sent none, and then `create` simply runs.
   */
  async run(key: string | null, create: () => Promise<{ status: number; body: unknown }>): Promise<{ status: number; body: unknown; replayed: boolean }> {
    if (key === null) return { ...(await create()), replayed: false };

    const known = this.answers.get(key);
    if (known && Date.now() - known.at < KEEP_MS) return { status: known.status, body: known.body, replayed: true };
    // The same key arriving twice at once must not create twice either.
    const inFlight = this.running.get(key);
    if (inFlight) {
      const answer = await inFlight;
      return { status: answer.status, body: answer.body, replayed: true };
    }

    const work = create().then((answer) => ({ ...answer, at: Date.now() }));
    this.running.set(key, work);
    try {
      const answer = await work;
      this.answers.set(key, answer);
      if (this.answers.size > KEEP_MAX) {
        const oldest = this.answers.keys().next().value;
        if (oldest !== undefined) this.answers.delete(oldest);
      }
      return { status: answer.status, body: answer.body, replayed: false };
    } finally {
      this.running.delete(key);
    }
  }
}

/** The idempotency key of a request, scoped to its route, or null when none was sent. Throws on a malformed one. */
export function idempotencyKey(request: FastifyRequest, scope: string): string | null {
  const header = request.headers[IDEMPOTENCY_HEADER];
  if (header === undefined) return null;
  const parsed = IdempotencyKey.safeParse(Array.isArray(header) ? header[0] : header);
  if (!parsed.success) throw new BadCursorError('The Idempotency-Key header must be 1 to 128 visible ASCII characters');
  return `${scope} ${request.method} ${request.url.split('?')[0]} ${parsed.data}`;
}

export function sendRemembered(reply: FastifyReply, answer: { status: number; body: unknown; replayed: boolean }): unknown {
  if (answer.replayed) reply.header('idempotent-replayed', 'true');
  reply.code(answer.status);
  return answer.body;
}
