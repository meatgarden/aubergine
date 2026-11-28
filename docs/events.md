# Reacting to what happens: the event stream

Aubergine tells a program of yours about every change as it happens: a terminal starts waiting for you, a command ends, a run moves to its next step, a task fails. The program keeps one HTTP connection open and reads lines from it. Two small examples are in [`examples/events/`](../examples/events): one prints every change, the other does one thing each time a terminal starts waiting.

This page says what the stream is, which token it needs, which changes are most worth reacting to, and what it does not do. At the end it says what was tried and what was not.

## What it is

`GET /v1/events` answers with a stream of [server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) that does not end. Each change is one `data:` line holding one JSON object, followed by an empty line. The object's `type` names the change (`session.attention`, `run.moved`, `task.changed`); its other fields depend on the type. A line that begins with a colon is a comment: the server sends `: connected` at the start and `: still here` every 25 seconds, so that nothing between you and it closes a quiet connection.

```sh
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4600/v1/events
```

`?canvasId=<canvas id>` narrows it to what concerns one canvas.

These are the same changes the page in your browser follows. They are the server's own vocabulary, so there are many of them (a terminal's node being dragged is one), and a new version of Aubergine adds more: a program should act on the types it knows and pass over the rest.

**The stream has no memory.** A change is sent to whoever is connected at that moment. Nothing is numbered, nothing is sent again, and a program that connects later, or again after a drop, is not told what it missed. A program that must not miss a state reads the lists when it connects (`GET /v1/sessions`, `/v1/runs`, `/v1/tasks`) and follows the stream from there. `on-waiting.mjs` does this for terminals.

## A token for it

The stream needs an [API token](../README.md#api-tokens) with the scope **`read`**, and nothing more:

```sh
aubergine token create "listener" --scope read
```

The secret is printed once, as the only thing on standard output. `read` cannot change anything, start anything or type anywhere.

What each kind of token gets, as tried:

| Token | `GET /v1/events` |
|---|---|
| no token, or a wrong, revoked or expired one | 401 |
| a token without `read` (for example only `notes:write`) | 403 |
| `read` | every change in the table below, without terminal content (see next) |
| `read` and `terminal:read` with a reach that covers a terminal | the same, and for that terminal the command line being run |
| `read`, limited to some projects (`--project <name>`) | only changes of those projects, and of what is shared with every project (a workflow, a saved step) |

**What is left out without `terminal:read`.** What a terminal shows, and what is typed into it, is not given to a token that may not read that terminal, on the stream as on every other route. Three things are taken out: `status.commandLine` in `session.status` (it is `null`: you learn that a command runs and how it ended, not which command), entries of a terminal's note log that are a prompt typed to an agent (`session.note.appended` with `entry.kind` `prompt` is not sent at all), and links that were only seen on a terminal's screen. Granting `terminal:read` lets a token read what your terminals show, which can hold anything you would not paste into a chat; read [Terminal access](../README.md#terminal-access) before you do. The examples here do not need it.

**What is on the stream with `read` alone, and you may not expect:** a terminal's name, its folder, the name of the program in front, its notes and summary, and `attention.message`, the sentence an agent gives when it says it is waiting ("Which branch should this go on?"). An agent writes that sentence; treat it as someone else's text.

**Never on the stream, for any token:** changes to tokens (`token.…`) and to paired devices (`device.…`). A token limited to projects is also not told of changes to projects themselves, to what is shared, or of a canvas moving between projects.

Each connection is one line in the activity log, which you read in the signed-in browser: which token, when, and that it was `GET /v1/events`. The changes it was sent are not recorded.

## The changes most worth reacting to

The fields are from the schemas in `shared/src/events.ts`; every ID is a UUID and every time is ISO 8601 in UTC.

| When | `type` | The fields that matter |
|---|---|---|
| A terminal starts waiting for you | `session.attention` | `sessionId`; `attention.state` is `waiting`; `attention.message` (what it asks, or `null`); `attention.at` |
| An agent finishes its turn | `session.attention` | `attention.state` is `done`. `working` while it is busy; `none` when nothing was said or you have looked |
| A command ends | `session.status` | `sessionId`; `status.lastExit` (its exit code); `status.lastFinishedAt`; `status.state` (`busy` while one runs, `idle` at a prompt). `status.commandLine` is set only while busy, and only for a token that may read the terminal |
| A shell ends by itself | `session.exited` | `sessionId` |
| A terminal is made, renamed, ended for good | `session.created`, `session.renamed`, `session.closed` | `session` (the whole terminal: `id`, `name`, `projectId`, `cwd`, `attention`, `status`), `canvasId`; `sessionId`, `name`; `sessionId` |
| A run starts, moves, or is over | `run.started`, `run.moved`, `run.finished` | `run.id`; `run.sessionId` (its terminal); `run.status`: `queued`, `running`, `paused`, `blocked`, `awaiting` (it waits for your approval), `finished`, `stopped`; `run.currentElementId` (the step it is on, `null` when over); `run.blockedReason`; `run.elements[]` with each step's `state` and the `note` handed in |
| A task is added, or moves | `task.changed` | `task.id`; `task.title`; `task.state`: `proposed` (it waits for your yes), `queued`, `taken`, `working`, `needs-owner`, `done`, `failed`, `withdrawn`; `task.reason` (with `failed` and `needs-owner`); `task.sessionId`; `task.runId`; `task.projectId` |
| A task leaves the queue | `task.removed` | `taskId` |
| Something is asked of you in writing | `ask.changed` | `ask.id`; `ask.text`; `ask.addedBy` (`kind`: `agent`, `person` or `token`; `name`; `sessionId`); `ask.projectId` |
| It is taken off your list | `ask.removed` | `askId` |

Three things about these that the trial showed:

- **A change about a terminal names it by ID only.** `session.attention` and `session.status` carry `sessionId`, not the terminal's name or its project. Read `GET /v1/sessions/<id>` when you need them, or keep them from `session.created` and `session.renamed`.
- **A run names its step by ID.** `run.currentElementId` is something like `first-step`; the step's name is in the workflow (`GET /v1/workflows/<id>`).
- **A short command has no `busy`.** `ls /nowhere` was told as one `session.status` with `state: "idle"`, `lastExit: 2`, and no change before it. So "a command ended" is `status.lastFinishedAt` being different from the last one you saw for that terminal, not `busy` turning into `idle`. `lastFinishedAt` is in whole seconds. Status comes from Aubergine's shell integration, which exists for zsh: a terminal in another shell tells nothing of its commands.

## "Started" is not "is"

A change carries the whole of what changed, not the difference. `session.attention` with `state: "waiting"` is sent when a terminal starts waiting, and sent again when only its message changes; `session.status` is sent again when the next command starts, still carrying the `lastExit` of the one before. A program that sends a notification for every such line sends the same one several times.

So keep the previous value for each terminal (or run, or task) and act when it changes:

```js
const last = new Map();
function startedWaiting(change) {
  if (change.type !== 'session.attention') return false;
  const before = last.get(change.sessionId);
  last.set(change.sessionId, change.attention.state);
  return change.attention.state === 'waiting' && before !== 'waiting';
}
```

`waitingTracker` in [`examples/events/sse.mjs`](../examples/events/sse.mjs) is this, with two additions: what a list says when the connection is made is remembered without acting on it (a terminal that already waits did not start now), and after a drop the list is read again and whoever began to wait meanwhile is acted on once. A wait that began and ended while nothing was connected is never known.

Waiting has more than one form. A terminal's `attention.state` is `waiting` when its agent asks you something. A run whose `status` is `awaiting` waits for your approval, a task in `needs-owner` or `proposed` waits for you, and so does an `ask`. `GET /v1/for-you` is all of them as one list.

## The two examples

Both are single files for Node.js 22 with no dependencies: `fetch` and the standard library. They read the token from `AUBERGINE_TOKEN` and the server's address from `AUBERGINE_URL` (`http://127.0.0.1:4600` when it is not set). The token is sent in a header to that server, and is never printed or put in an address. Both connect again after a drop, waiting 1 second, then 2, 4, and so on up to 30; both stop at once, with a sentence and exit code 2, when the server answers 401 or 403.

Put the token in the environment without typing it on a command line (see [Keeping it safe](#keeping-it-safe)):

```sh
read -rs AUBERGINE_TOKEN && export AUBERGINE_TOKEN      # paste the secret, press Enter
```

**`listen.mjs`** prints each change as one line: the time it arrived, its type, and the fields that matter most.

```sh
node examples/events/listen.mjs
node examples/events/listen.mjs --only session.      # only types that begin with this
node examples/events/listen.mjs --json               # each change whole, as one line of JSON
```

```
2026-11-28T00:07:53.941Z session.status terminal="01a21f7a-…" state="idle" exit=2
2026-11-28T00:08:10.088Z session.attention terminal="01a21f7a-…" state="waiting" message="Which branch should this go on"
2026-11-28T00:08:42.479Z task.changed task="01a21f7b-…" title="Tidy the changelog" state="queued"
2026-11-28T00:08:59.476Z run.finished run="01a21f7b-…" terminal="01a21f7a-…" status="finished"
```

(IDs are shortened here.) What is said about the connection goes to standard error, so `--json` can be piped into another program.

**`on-waiting.mjs`** does one thing each time a terminal starts waiting. With no option it prints a line. With `--post <address>` it sends this, and nothing else, to the address you give:

```sh
node examples/events/on-waiting.mjs
node examples/events/on-waiting.mjs --post https://example.org/hooks/mine
```

```json
{ "event": "terminal.waiting", "at": "2026-11-28T00:08:10.089Z",
  "terminal": { "id": "01a21f7a-5e66-70dd-85e5-a6a169683cba", "name": "build" },
  "project": { "id": "01a21f79-e59b-7891-a324-b3188b4f8b8f" } }
```

IDs, a time and the terminal's name. Not what the agent asks, not what the terminal showed, not a folder. The address is the one you typed and is never made from anything the server said; a redirect is refused; the request is given 5 seconds and is not tried again; the Aubergine token is not sent there. Such an address is often a secret itself, so the script prints only its host.

This is how you would reach a service of your own, or a chat tool's incoming webhook. A chat tool expects a body of its own shape (often a field named `text`), so for one of those change `bodyOf` in the script, or put a few lines of your own in between. That was not tried against a real chat tool.

There is no option that runs a command. Starting a shell because of something an agent caused is a decision to make yourself, in your own program, knowing what is put on the command line.

## What this is not

**Aubergine does not call anything.** The server sends nothing to an address by itself: no webhook, no e-mail, no chat message. Inside Aubergine, [rules](../README.md#rules-when-something-happens-do-something) can notify the browser or run a saved step when something happens. Reaching anything outside is a program of yours that listens, like the examples, so **the listener has to be running**: what happens while it is not is not told later.

**It is on the same computer.** The server listens on `127.0.0.1` only, so the listener runs on the computer Aubergine runs on, unless you have set up a way in from elsewhere: [Using Aubergine from elsewhere](remote.md). An API token is taken the same from there.

**It is not a log.** Nothing is kept for a listener. For "what happened while I was away", the page has its own view; a program reads the lists.

## Keeping it safe

- **The token reads whatever its scopes allow**, for as long as it exists: with `read`, every terminal's name, folder, notes and state, and what agents ask. Make one token for one listener, give it `read` and no more, limit it to a project where that is enough (`--project`), let it expire (`--expires 30d`), and revoke it when the listener is gone (`aubergine token revoke`).
- **Keep it out of shell history and out of repositories.** `export AUBERGINE_TOKEN=aubt_…` typed at a prompt is in your history; `read -rs` above is not. Do not write it into a script, a `.env` file that is committed, or an address.
- **What you send onward is your decision.** Aubergine decides what a token may read; once your program has read it, where it goes is up to the program. A terminal's name or an agent's question sent to a chat tool is then kept by that tool. The example sends IDs and a name for that reason.
- **Text on the stream is other people's text.** Names, notes and an agent's message are written by agents and programs. Do not put them on a command line, and do not let another agent take them for instructions.

## What was tried, and what was not

Tried on 2026-11-28, on Linux (x86_64, Node.js 22.23, tmux, zsh), against a throwaway server of version 0.3.0 on its own port, data folder and tmux socket:

- `listen.mjs` with a `read` token while two terminals were made, a command failed (`exit=2`), a terminal was set waiting, told to wait again with another message, cleared and set waiting again, a task was added, a question was asked from a terminal, and a run was started and finished: every one arrived as in the table.
- The same with a `read` and `terminal:read` token: the same changes, and `status.commandLine` filled in while a command ran.
- A token limited to a second project: it was told of the terminal made in that project and of a workflow (shared), and of nothing in the first project.
- A wrong token (401) and a token without `read` (403): one sentence, exit code 2, no retry.
- `on-waiting.mjs --post` against a small receiver on the same computer: one request for each wait (three waits, three requests), none for the same wait told again with a new message, none after the server was stopped and started again, and no `Authorization` header on what the receiver got.
- The server stopped and started: both scripts said so, waited 1, 2 and 4 seconds, and connected again.
- No token appeared in anything either script printed.
- The parser and the tracker have tests (`pnpm examples:test`): events cut at every position, comments, several `data:` lines, CRLF.

Not tried: a real agent setting a terminal waiting (the `aubergine attention` command was typed in a shell instead); a real chat tool or any address outside this computer; HTTPS; a server reached from another computer; a listener left running for days; macOS and Windows; a people-only terminal; `?canvasId=`; many terminals at once; any Node.js other than 22.
