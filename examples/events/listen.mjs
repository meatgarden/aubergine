#!/usr/bin/env node
// Prints every change an Aubergine server tells of, one line each, as it happens.
//
//   AUBERGINE_TOKEN=aubt_… node examples/events/listen.mjs
//   AUBERGINE_TOKEN=aubt_… node examples/events/listen.mjs --only session.
//   AUBERGINE_TOKEN=aubt_… node examples/events/listen.mjs --json
//   AUBERGINE_TOKEN=aubt_… node examples/events/listen.mjs --after <id>
//
// After a drop it goes on where it stopped: the server sends again what it missed, or says that
// it cannot (it was started again, or too much has changed). When it is stopped it says the id
// it stopped after; `--after <id>` starts from there.
//
// It reads `GET /v1/events` with an API token that has the scope `read`
// (`aubergine token create "listener" --scope read`). The server is the one at AUBERGINE_URL,
// or http://127.0.0.1:4600. The token is sent in a header to that server and is never printed.
//
// Node 22, no dependencies. docs/events.md says what the changes are.
import { Refused, follow, oneLine, reasonOf, settings } from './sse.mjs';

const USAGE = `usage: node listen.mjs [--only <prefix of a type, for example session.>] [--json] [--after <the id an earlier run stopped after>]`;

function options(argv) {
  const out = { only: null, json: false, after: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--only' && typeof argv[i + 1] === 'string') out.only = argv[(i += 1)];
    else if (arg === '--after' && typeof argv[i + 1] === 'string' && argv[i + 1] !== '') out.after = argv[(i += 1)];
    else throw new Error(USAGE);
  }
  return out;
}

/** What matters most about a change, as `key=value` words. The whole of it is what `--json` prints. */
function summary(change) {
  const words = [];
  const say = (key, value) => {
    if (value !== undefined && value !== null && value !== '') words.push(`${key}=${typeof value === 'string' ? JSON.stringify(value) : value}`);
  };
  const { session, attention, status, run, task, ask, canvas } = change;
  say('terminal', change.sessionId ?? session?.id);
  say('canvas', change.canvasId ?? canvas?.id);
  say('name', change.name ?? session?.name ?? canvas?.name);
  if (change.type === 'session.activity') {
    say('folder', change.cwd);
    say('program', change.command);
  }
  if (attention) {
    say('state', attention.state);
    say('message', attention.message);
  }
  if (status) {
    say('state', status.state);
    say('exit', status.lastExit);
    say('command', status.commandLine);
  }
  if (run) {
    say('run', run.id);
    say('terminal', run.sessionId);
    say('status', run.status);
    say('step', run.currentElementId);
  }
  if (task) {
    say('task', task.id);
    say('title', task.title);
    say('state', task.state);
    say('reason', task.reason);
  }
  if (ask) {
    say('ask', ask.id);
    say('text', ask.text);
  }
  return words.join(' ');
}

async function main() {
  const { only, json, after } = options(process.argv.slice(2));
  const server = settings();
  const stop = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop.abort());
  const last = await follow(server, {
    signal: stop.signal,
    lastEventId: after,
    onNote: (sentence) => console.error(`listen: ${sentence}`),
    onChange: (change) => {
      if (only !== null && !change.type.startsWith(only)) return;
      // JSON has no raw control character in it; the short form shows any that a name or a message holds.
      if (json) console.log(JSON.stringify(change));
      else console.log(oneLine(`${new Date().toISOString()} ${change.type} ${summary(change)}`.trimEnd()));
    },
  });
  // The id is the server's own and names nothing: it is safe to print, and it is checked before it is.
  if (last !== '') console.error(oneLine(`listen: stopped after ${last}; to go on from there: --after ${last}`));
}

main().catch((error) => {
  console.error(`listen: ${error instanceof Error ? error.message : reasonOf(error)}`);
  process.exitCode = error instanceof Refused ? 2 : 1;
});
