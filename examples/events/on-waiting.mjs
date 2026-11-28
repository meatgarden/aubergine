#!/usr/bin/env node
// Does one thing each time a terminal STARTS waiting for you: prints a line, or with
// `--post <address>` sends a small JSON body to an address of your choosing.
//
//   AUBERGINE_TOKEN=aubt_… node examples/events/on-waiting.mjs
//   AUBERGINE_TOKEN=aubt_… node examples/events/on-waiting.mjs --post https://example.org/hooks/mine
//
// WHAT IT SENDS, and nothing else:
//
//   { "event": "terminal.waiting", "at": "<ISO time>",
//     "terminal": { "id": "<ID>", "name": "<the terminal's name>" }, "project": { "id": "<ID>" } }
//
// IDs, a time and the terminal's name. Not what the agent asks (the `message` of the change), not
// what the terminal showed, not a folder, not a command. WHERE it sends is the address you give
// after `--post`, and only that: the address is never made from anything the server said, a
// redirect is refused, the request is given 5 seconds and is not tried again, and the Aubergine
// token is never sent there. A chat tool's incoming webhook expects a body of its own shape
// (often a `text` field): change `bodyOf` below, or put a small service of yours in between.
//
// There is no `--run <command>`, on purpose: nothing here starts a shell because of an event.
//
// It needs an API token with the scope `read` (`aubergine token create "notifier" --scope read`).
// Node 22, no dependencies. docs/events.md has the rest.
import { Refused, ask, follow, listSessions, oneLine, reasonOf, settings, waitingTracker } from './sse.mjs';

const USAGE = 'usage: node on-waiting.mjs [--post <http or https address>]';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function options(argv) {
  if (argv.length === 0) return { post: null };
  if (argv.length !== 2 || argv[0] !== '--post') throw new Error(USAGE);
  let address;
  try {
    address = new URL(argv[1]);
  } catch {
    throw new Error('What follows --post is not an address.');
  }
  if (address.protocol !== 'http:' && address.protocol !== 'https:') throw new Error('The address after --post must begin with http:// or https://');
  return { post: address };
}

/** The body that is sent. Everything in it is named in the comment at the top of this file. */
function bodyOf(session, at) {
  return {
    event: 'terminal.waiting',
    at,
    terminal: { id: session.id, name: typeof session.name === 'string' ? session.name : null },
    project: { id: typeof session.projectId === 'string' ? session.projectId : null },
  };
}

/** One POST, once. Answers a few words about how it went; an address like this is often a secret, so only its host is said. */
async function post(address, body) {
  try {
    const answer = await fetch(address, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await answer.body?.cancel();
    return `${address.host} answered ${answer.status}`;
  } catch (error) {
    return `could not reach ${address.host} (${reasonOf(error)}); not tried again`;
  }
}

async function main() {
  const { post: address } = options(process.argv.slice(2));
  const server = settings();
  const stop = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop.abort());
  const tracker = waitingTracker();
  let connectedBefore = false;
  // One after another, so that lines and requests keep the order the waits began in.
  let line = Promise.resolve();

  const act = (sessionId) => {
    line = line.then(async () => {
      if (!ID.test(sessionId)) return;
      const at = new Date().toISOString();
      // The change names only the terminal's ID. Its name and its project are read now.
      let session = { id: sessionId };
      try {
        const answer = await ask(server, `/v1/sessions/${sessionId}`, { signal: AbortSignal.timeout(5000) });
        if (answer.ok) session = { ...(await answer.json()), id: sessionId };
        else await answer.body?.cancel();
      } catch {
        // Without its name, then.
      }
      const body = bodyOf(session, at);
      const said = oneLine(`${at} waiting: ${JSON.stringify(body.terminal.name ?? sessionId)} (${sessionId})`);
      console.log(address === null ? said : `${said}; ${await post(address, body)}`);
    });
  };

  await follow(server, {
    signal: stop.signal,
    onNote: (sentence) => console.error(`on-waiting: ${sentence}`),
    // What already waits when this starts did not start now. After a drop the server sends again what was
    // missed, and those changes come through `onChange`. This is called again only when it cannot (it says
    // `reset`): then the list is read, and what began to wait meanwhile is acted on once.
    onOpen: async () => {
      for (const id of tracker.seed(await listSessions(server, stop.signal), { report: connectedBefore })) act(id);
      connectedBefore = true;
    },
    onChange: (change) => {
      const id = tracker.change(change);
      if (id !== null) act(id);
    },
  });
  await line;
}

main().catch((error) => {
  console.error(`on-waiting: ${error instanceof Error ? error.message : reasonOf(error)}`);
  process.exitCode = error instanceof Refused ? 2 : 1;
});
