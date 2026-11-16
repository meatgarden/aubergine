/**
 * The part of the client that is written by hand: making a request, turning
 * the server's one error shape into one error, paging through lists, and
 * reading the stream of changes. It uses `fetch` and nothing else, so it runs
 * in Node and in a browser, and has no dependencies.
 *
 * What the routes are, and the types of what they take and give, is in
 * `generated.ts`, which is produced from the server's description.
 */

/** The codes the server gives, and two for when no answer from the server could be read. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'runtime_unavailable'
  | 'too_large'
  | 'rate_limited'
  | 'internal'
  /** The server could not be reached at all. */
  | 'network'
  /** The server answered, but not with what this client understands. */
  | 'unexpected';

/** Every failure of a call, whatever went wrong: one kind of error, with the server's code and message. */
export class AubergineError extends Error {
  override readonly name = 'AubergineError';

  constructor(
    /** The HTTP status; 0 when the server could not be reached. */
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    /** For `rate_limited`: in how many seconds to try again. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  /** Where the server is, for example `http://127.0.0.1:4600`. Leave out in a page served by the server itself. */
  baseUrl?: string;
  /** An API token's secret. It is sent as `Authorization: Bearer …`. */
  token?: string;
  /**
   * In a browser page served by the server: sign in with the page's own
   * cookie instead of a token. Ignored when `token` is given.
   */
  useCookie?: boolean;
  /** Headers to send with every request. */
  headers?: Record<string, string>;
  /** The `fetch` to use. Defaults to the global one. */
  fetch?: typeof fetch;
}

/** What the generated code knows about one route. */
export interface OperationInfo {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** With `{name}` for each parameter. */
  path: string;
  params: readonly string[];
  hasBody: boolean;
  paged: boolean;
  idempotent: boolean;
  stream: boolean;
}

/** What may be passed to any call besides the route's own input. */
export interface CallOptions {
  /** Stops the request. */
  signal?: AbortSignal;
  /** For a create: a key of your choosing, so that sending the same request again creates nothing more. */
  idempotencyKey?: string;
}

type Args = Record<string, unknown> & { query?: Record<string, unknown>; body?: unknown } & CallOptions;

function addressOf(base: string, info: OperationInfo, args: Args): string {
  let path = info.path;
  for (const name of info.params) {
    const value = args[name];
    if (typeof value !== 'string' || value === '') throw new AubergineError(0, 'bad_request', `${name} is needed`);
    path = path.replace(`{${name}}`, encodeURIComponent(value));
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(args.query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return `${base.replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`;
}

async function errorFrom(response: Response): Promise<AubergineError> {
  const retryAfter = Number(response.headers.get('retry-after'));
  let code: ErrorCode = 'unexpected';
  let message = `The server answered HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof body.error?.code === 'string') code = body.error.code as ErrorCode;
    if (typeof body.error?.message === 'string') message = body.error.message;
  } catch {
    // Not the server's error shape: keep what the status says.
  }
  return new AubergineError(response.status, code, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
}

/** Makes the function that performs a call, for the given server and credentials. */
export function requester(options: ClientOptions): {
  call: (info: OperationInfo, args: Args) => Promise<unknown>;
  stream: (info: OperationInfo, args: Args) => AsyncGenerator<unknown, void, void>;
} {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? '';

  const send = async (info: OperationInfo, args: Args, accept: string): Promise<Response> => {
    const headers: Record<string, string> = { accept, ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (info.hasBody && args.body !== undefined) headers['content-type'] = 'application/json';
    if (info.idempotent && args.idempotencyKey) headers['idempotency-key'] = args.idempotencyKey;
    // Worked out before the request: a missing parameter is the caller's mistake, not the network's.
    const address = addressOf(base, info, args);
    let response: Response;
    try {
      response = await doFetch(address, {
        method: info.method,
        headers,
        ...(info.hasBody && args.body !== undefined ? { body: JSON.stringify(args.body) } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
        // A token decides alone who is calling; the cookie is for a page that has none.
        ...(options.useCookie && !options.token ? { credentials: 'same-origin' as const } : {}),
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') throw error;
      throw new AubergineError(0, 'network', `The server could not be reached${base ? ` at ${base}` : ''}: ${(error as Error).message}`);
    }
    if (!response.ok) throw await errorFrom(response);
    return response;
  };

  return {
    call: async (info, args) => {
      const response = await send(info, args, 'application/json');
      if (response.status === 204) return undefined;
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new AubergineError(response.status, 'unexpected', 'The server answered with something that is not JSON');
      }
    },

    // Server-sent events: each `data:` line is one JSON object. Lines that start with `:` only keep the connection open.
    stream: async function* (info, args) {
      const response = await send(info, args, 'text/event-stream');
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          pending += decoder.decode(value, { stream: true });
          let end = pending.indexOf('\n');
          while (end >= 0) {
            const line = pending.slice(0, end).replace(/\r$/, '');
            pending = pending.slice(end + 1);
            if (line.startsWith('data:')) {
              try {
                yield JSON.parse(line.slice(5).trimStart()) as unknown;
              } catch {
                // A line this client cannot read: skip it rather than end the stream.
              }
            }
            end = pending.indexOf('\n');
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    },
  };
}

/** One page of a list, as every list answers. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Every item of a list, fetched a page at a time as they are asked for.
 * `fetchPage` is given the cursor of the page to fetch (undefined for the first).
 */
export async function* everyItem<T>(fetchPage: (cursor: string | undefined) => Promise<Page<T>>): AsyncGenerator<T, void, void> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
}
