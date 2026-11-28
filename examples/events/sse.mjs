// What the two examples beside this file share: reading server-sent events, following
// `GET /v1/events` across drops, and telling "started waiting" from "is waiting".
// No dependencies: `fetch` and the standard library of Node 22.
//
// The token goes in the `Authorization` header and nowhere else: not into an address,
// not into a line that is printed, not into the message of an error.

/**
 * A parser of server-sent events. `feed` takes text as it arrives, cut anywhere;
 * `onEvent` is called once per event with `{ event, data, id }`.
 *
 * The rules are the standard's: a line ends with LF, CR or CRLF; a line that begins with a
 * colon is a comment (Aubergine sends one now and then to keep the connection open);
 * several `data:` lines of one event are joined with a newline; an empty line ends the event;
 * an event with no `data:` line is nothing.
 */
export function sseParser(onEvent) {
  let rest = '';
  let data = [];
  let event = '';
  let id = '';
  let first = true;

  const line = (text) => {
    if (text === '') {
      if (data.length > 0) onEvent({ event: event === '' ? 'message' : event, data: data.join('\n'), id });
      data = [];
      event = '';
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id' && !value.includes('\0')) id = value;
    // `retry` and anything unknown: ignored.
  };

  return {
    feed(chunk) {
      rest += chunk;
      if (first && rest.length > 0) {
        if (rest.startsWith('\uFEFF')) rest = rest.slice(1);
        first = false;
      }
      for (;;) {
        const at = rest.search(/[\r\n]/);
        if (at === -1) return;
        // A CR at the very end may be the first half of a CRLF whose LF is in the next chunk.
        if (rest[at] === '\r' && at === rest.length - 1) return;
        const ending = rest[at] === '\r' && rest[at + 1] === '\n' ? 2 : 1;
        const text = rest.slice(0, at);
        rest = rest.slice(at + ending);
        line(text);
      }
    },
  };
}

/** The server answered that this token may not follow the stream. Reconnecting cannot help. */
export class Refused extends Error {
  constructor(status) {
    super(
      status === 401
        ? 'The server did not take the token (401): it is wrong, revoked or expired. Make a new one with: aubergine token create <name> --scope read'
        : 'The token may not follow changes (403): it needs the scope "read".',
    );
    this.name = 'Refused';
    this.status = status;
  }
}

/** What the environment says: where the server is, and the token. Throws a sentence, never the token. */
export function settings(env = process.env) {
  const token = env.AUBERGINE_TOKEN ?? '';
  if (token === '') throw new Error('Set AUBERGINE_TOKEN to an API token. Make one with: aubergine token create <name> --scope read');
  // A header cannot hold these, and fetch would say so with the value in its message.
  if (/[^\x21-\x7e]/.test(token)) throw new Error('AUBERGINE_TOKEN holds a space or a character a header cannot carry.');
  const given = env.AUBERGINE_URL ?? 'http://127.0.0.1:4600';
  let url;
  try {
    url = new URL(given);
  } catch {
    throw new Error('AUBERGINE_URL is not an address. For example: http://127.0.0.1:4600');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('AUBERGINE_URL must begin with http:// or https://');
  if (url.username !== '' || url.password !== '') throw new Error('AUBERGINE_URL must not hold a user name or a password.');
  return { origin: url.origin, token };
}

/** One request to the server, with the token in its header. */
export function ask(server, path, init = {}) {
  return fetch(new URL(path, server.origin), {
    ...init,
    redirect: 'error',
    headers: { ...init.headers, authorization: `Bearer ${server.token}` },
  });
}

/** Why a request failed, in a few words, without anything that was sent. */
export function reasonOf(error) {
  if (error instanceof Refused) return error.message;
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : null;
  if (code === 'ECONNREFUSED') return 'nothing is listening there';
  if (code === 'UND_ERR_SOCKET' || code === 'ECONNRESET') return 'the connection was lost';
  if (code !== null) return code;
  if (error instanceof Error && error.name === 'TimeoutError') return 'no answer in time';
  if (error instanceof Error && error.name === 'AbortError') return 'stopped';
  return error instanceof Error ? error.message : 'unknown';
}

/** How long to wait before the next try: one second, then twice as long each time, at most half a minute. */
export function delayFor(attempt) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

const wait = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * Follows `GET /v1/events` until `signal` says stop, connecting again after a drop.
 *
 * - `onChange(change)`: one parsed change, in the order the server sent them.
 * - `onOpen()`: called each time a connection is made, before any change of it is handed over.
 *   What it reads from the server then is at least as new as the connection, so nothing falls between.
 * - `onNote(sentence)`: what happened to the connection, for whoever wants to print it.
 *
 * Throws `Refused` on 401 and 403. Changes made while it was not connected are not sent again:
 * the stream has no memory. Read the lists again in `onOpen` if that matters.
 */
export async function follow(server, { onChange, onOpen, onNote = () => {}, signal, path = '/v1/events' }) {
  let attempt = 0;
  while (!signal?.aborted) {
    try {
      const answer = await ask(server, path, { headers: { accept: 'text/event-stream' }, signal });
      if (answer.status === 401 || answer.status === 403) {
        await answer.body?.cancel();
        throw new Refused(answer.status);
      }
      if (!answer.ok || answer.body === null) {
        await answer.body?.cancel();
        throw new Error(`the server answered ${answer.status}`);
      }
      onNote(`connected to ${server.origin}`);
      if (onOpen) await onOpen();
      attempt = 0;
      const parser = sseParser(({ data }) => {
        let change;
        try {
          change = JSON.parse(data);
        } catch {
          return;
        }
        if (change !== null && typeof change === 'object' && typeof change.type === 'string') onChange(change);
      });
      const decoder = new TextDecoder();
      for await (const chunk of answer.body) parser.feed(decoder.decode(chunk, { stream: true }));
      throw new Error('the server closed the connection');
    } catch (error) {
      if (error instanceof Refused) throw error;
      if (signal?.aborted) return;
      attempt += 1;
      const ms = delayFor(attempt);
      onNote(`not connected (${reasonOf(error)}); trying again in ${Math.round(ms / 1000)}s`);
      await wait(ms, signal);
    }
  }
}

/**
 * Tells the moment a terminal starts waiting from its still waiting.
 *
 * `session.attention` carries the whole state each time, and is sent again when only its
 * message changes. So the previous state of each terminal is kept, and `started` is true
 * exactly when a terminal's state becomes `waiting` from anything else.
 *
 * `seed` is for what a list says when a connection is made: the first time it only
 * remembers (a terminal that already waits did not start now); pass `{ report: true }` after
 * a reconnect to learn which terminals began to wait while nobody listened.
 */
export function waitingTracker() {
  const last = new Map();
  const started = (sessionId, state) => {
    const before = last.get(sessionId);
    last.set(sessionId, state);
    return state === 'waiting' && before !== 'waiting';
  };
  return {
    /** A change from the stream. Answers the terminal's ID if it started waiting with this change, else null. */
    change(change) {
      if (change.type === 'session.attention' && typeof change.sessionId === 'string') {
        return started(change.sessionId, change.attention?.state ?? 'none') ? change.sessionId : null;
      }
      if (change.type === 'session.created' && typeof change.session?.id === 'string') {
        return started(change.session.id, change.session.attention?.state ?? 'none') ? change.session.id : null;
      }
      if (change.type === 'session.closed' && typeof change.sessionId === 'string') last.delete(change.sessionId);
      return null;
    },
    /** The terminals as a list gave them. Answers the IDs that started waiting since, when asked to report. */
    seed(sessions, { report = false } = {}) {
      const began = [];
      const here = new Set();
      for (const session of sessions) {
        if (typeof session?.id !== 'string') continue;
        here.add(session.id);
        if (started(session.id, session.attention?.state ?? 'none') && report) began.push(session.id);
      }
      for (const id of last.keys()) if (!here.has(id)) last.delete(id);
      return began;
    },
  };
}

/** Every terminal the token can see, over every project it reaches: `GET /v1/sessions`, page by page. */
export async function listSessions(server, signal) {
  const all = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ projectId: 'all', limit: '200' });
    if (cursor !== null) query.set('cursor', cursor);
    const answer = await ask(server, `/v1/sessions?${query}`, { signal });
    if (answer.status === 401 || answer.status === 403) {
      await answer.body?.cancel();
      throw new Refused(answer.status);
    }
    if (!answer.ok) {
      await answer.body?.cancel();
      throw new Error(`the server answered ${answer.status} to the list of terminals`);
    }
    const page = await answer.json();
    all.push(...(Array.isArray(page.items) ? page.items : []));
    cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null;
  } while (cursor !== null);
  return all;
}

/** Text on one line: a control character is shown as what it is, never sent to the terminal. */
export function oneLine(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);
}
