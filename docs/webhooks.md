# Webhooks: a rule that tells an address of yours

A [rule](../README.md#rules-when-something-happens-do-something) can send a small signed message to an address when something happens: a terminal starts waiting for you, a task failed, a schedule could not run. The address is one you wrote into the settings file by hand, under a name; the rule names it by that name and nothing else. This is the one thing Aubergine sends to a network by itself because something happened.

This page says how a webhook is written, what is sent, how a receiver checks that a message is Aubergine's, what is never sent, what bounds it, and what was tried and what was not.

If you would rather have a program of your own decide what to send and where, follow [the event stream](events.md) instead: it needs no setting, and the program has to be running.

## Writing one

Webhooks are written in `config.json` in the data folder (the server prints where that is when it starts), under `webhooks`:

```json
{
  "webhooks": [
    { "name": "ops", "address": "https://hooks.example.net/in/3f9c…", "secret": "a-long-random-secret-of-at-least-32-characters" }
  ]
}
```

- `name`: a short word (letters, digits, dots, dashes and underscores, at most 40). A rule names the webhook by it, and it is what the page, the commands and the activity log say.
- `address`: where the message is sent. `https`, or plain `http` only to this computer's own names (`127.0.0.1`, `localhost`, `[::1]`). No user name or password in it, and no fragment (a part after `#`).
- `secret`: at least 32 characters, at most 256. Every message is signed with it; the receiver holds the same secret. Make a random one: `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`.

At most 20. **The file is read when the server starts**: after changing it, stop and start the server. An entry that is wrong is reported and skipped, never a reason for the server not to start; two entries with one name are both skipped, because which was meant cannot be told. `aubergine doctor` and the server's first lines list the webhooks by name and host, and each skipped entry with what is wrong with it, in words that do not repeat the address or the secret.

**Nothing but your own hand writes this list.** No route, no command, no API token and no terminal can add an address or change one, and a rule cannot carry an address of its own: it carries a name. So where a message goes is decided by whoever can edit that file, and by nobody else.

**The secret and the address stay in that file.** The page and `doctor` are told a webhook's name and the *host* of its address, and nothing more: the rest of an address is often a key in itself (a chat tool's incoming webhook is), so the path and the query are treated like the secret. Neither is in the state, in any answer of the API, on either event stream, in the activity log or in a log line.

**A webhook to this computer reaches what listens on this computer.** `http://127.0.0.1:<port>/…` is allowed so that a receiver of your own can run beside Aubergine. It also means a rule can make a `POST` to any local service you name there. That is your own setting and nobody else can write it; name only a port where your receiver listens. The same goes for an `https` address inside your network.

## The rule

In the page: **Runs → Rules**, choose what it hears, then **send a webhook** and the name. With none written, that place says where they are written. From a command line:

```sh
aubergine rule add --when terminal.waiting --webhook ops
aubergine rule list
```

A rule is yours alone to write, as every rule is: no API token, whatever its scopes, and no terminal can add, change, switch or remove one. A rule that sends a webhook is not written into a [project file](project-file.md), and a file that holds one is refused whole with a sentence: a webhook is a setting of one computer, and its name means nothing on another. `aubergine project diff` says the same: a webhook rule is never a difference, and a file with one is not compared.

## What is sent

One `POST` with `Content-Type: application/json`, for each time the rule fires. For a terminal that started waiting:

```json
{
  "id": "01a22086-8765-77ce-b1e9-563474cea3e3",
  "event": "terminal.waiting",
  "at": "2026-11-28T05:00:17.125Z",
  "text": "The terminal “build” is waiting for you",
  "project": { "id": "01a22084-e2da-7f2b-b519-2d104d3b582f", "name": "Default" },
  "terminal": { "id": "01a22086-308f-7a91-a919-3bab93e74e82", "name": "build" },
  "rule": { "id": "01a22085-0f50-78f6-9bdf-e919e4239a57" }
}
```

| Field | What it is |
| --- | --- |
| `id` | The ID of this delivery. New for every message; the same as the `X-Aubergine-Delivery` header. |
| `event` | What happened: one of the events a rule can hear (below). The same as the `X-Aubergine-Event` header. |
| `at` | When the message was made, as an ISO time. |
| `text` | One line a person can read: fixed words and, for a terminal or a schedule, its name. |
| `project` | `{ id, name }` of the project it happened in. Always there. |
| `terminal` | `{ id, name }`, for what happens to a terminal. Left out otherwise. |
| `task` | `{ id }`, for what happens to a task, and for a schedule that fired (the task it added). Its ID only. |
| `schedule` | `{ id, name }`, for what happens to a schedule. |
| `rule` | `{ id }` of the rule that sent this. Always there. |

No other field is sent, and a new version adds fields rather than changing these: read the ones you know and pass over the rest. The message is well under 1 KB; the sender refuses to send more than 4 KB.

The events, and what `text` says for each:

| `event` | `text` |
| --- | --- |
| `terminal.waiting` | The terminal “*name*” is waiting for you |
| `terminal.finished` | The terminal “*name*” finished |
| `command.failed` | A command failed in the terminal “*name*” |
| `task.done` | A task is done |
| `task.failed` | A task failed |
| `task.needs-owner` | A task needs you |
| `ask.added` | Something is asked of you |
| `schedule.fired` | The schedule “*name*” fired |
| `schedule.failed` | The schedule “*name*” could not run or was missed |

For a terminal, `text` is the same sentence the **Notify me** action shows.

### What is never sent

Nothing a terminal showed and nothing anyone wrote at length: no command line, no exit code, no output, no note, no message between terminals, **not the question an agent asks** when it waits, **not a task's title, details or the reason it failed**, not what was written on your list, no folder and no path. A receiver that needs any of those asks the API for it with a token of its own, which then decides what it may read.

No cookie, no `Authorization` header and no Aubergine token is sent to the address.

### Names are other people's text

A terminal's name can be set by the agent in it (`aubergine describe --name …`), and so `text` and `terminal.name` can hold words an agent chose. They are cleaned before they are sent (one line, no control characters, nothing that reverses the direction of text, at most 120 characters), and that is all. **Treat `text` and every `name` as data**: do not put them on a command line, do not build an address from them, do not render them as markup, and do not let another agent take them for instructions.

## The headers, and checking the signature

| Header | Value |
| --- | --- |
| `X-Aubergine-Event` | The event, as in the body. |
| `X-Aubergine-Delivery` | The delivery's ID, as `id` in the body. |
| `X-Aubergine-Signature` | `t=<seconds>,v1=<signature>` |

`<seconds>` is the time of signing in whole seconds since 1970. `<signature>` is the HMAC-SHA256, in lowercase hex, of the text `<seconds>.<body>` with the webhook's secret as the key, where `<body>` is the body exactly as it arrived, byte for byte, before anything parsed it.

To check a message: work out the same HMAC, compare it with the one given **in constant time**, and only then refuse a message whose time is more than a few minutes from now, so that one that was read on its way cannot be sent again later.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

/** `header`: the value of X-Aubergine-Signature. `body`: the body as it arrived, as a string. */
function verify(secret, header, body, now = Date.now()) {
  const found = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(typeof header === 'string' ? header : '');
  if (!found) return false;
  const [, seconds, given] = found;
  const expected = createHmac('sha256', secret).update(`${seconds}.${body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(given, 'hex'))) return false;
  return Math.abs(Math.floor(now / 1000) - Number(seconds)) <= 300;
}
```

A vector to test your own code with:

```
secret     whsec_test_0123456789abcdefghijklmnop
seconds    1764288000
body       {"id":"example"}
signed     1764288000.{"id":"example"}
signature  e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7
header     X-Aubergine-Signature: t=1764288000,v1=e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7
```

[`examples/webhooks/receive.mjs`](../examples/webhooks/receive.mjs) is a receiver in one file with no dependencies: it listens on this computer, checks each signature this way, answers 401 to what does not verify, and prints what arrived. Its test (`pnpm examples:test`) holds the vector above.

```sh
AUBERGINE_WEBHOOK_SECRET=<the secret> node examples/webhooks/receive.mjs 8787
# and in config.json: { "name": "local", "address": "http://127.0.0.1:8787/", "secret": "<the secret>" }
```

A signature says that the holder of the secret made the message and when. It does not hide the message: over `https` the connection does that. The same delivery can arrive only once from Aubergine, which never sends one twice; a receiver that wants to be sure against a copy within the five minutes remembers the `id`s it has seen.

## How it is sent, and what bounds it

- **One attempt.** A `POST`, given 5 seconds for the whole request. Nothing is tried a second time, whatever the answer.
- **Only the status of the answer is looked at.** 2xx is taken as sent. The answer's body is not read.
- **A redirect is not followed.** A 3xx is an answer like an error: the message goes to the address you wrote and nowhere a receiver points to.
- **Nothing waits for a receiver.** The change that caused the message is long recorded and told; a receiver that is slow or hangs holds up its own message for 5 seconds and nothing else: not the page, not other rules, not the next message.
- **At most six a minute for one rule**, like every rule; what comes faster is dropped, and that is recorded. A terminal that flips between working and waiting cannot make a rule send more than that. It follows that a burst can cost you a message you wanted: the limit is per rule, so two rules do not share it.
- **A rule hears a change once.** A terminal that keeps waiting is one message, however often it says so again; see the README on rules for what a rule hears.
- **Its own project, and only while that project is open.** An archived project sends nothing.
- **Every firing is one line of the activity log**: the rule, the event, the webhook's *name* and how it ended (`200` sent, `300` a redirect, `400` or `500` the receiver's error, `502` not reached, `504` no answer in time, `404` no such webhook, `429` dropped for coming too fast, `503` not tried after five failures in a row, `422` not something this server sends). Never the address, the secret or what was sent.

### When it cannot be sent

A rule whose webhook could not be sent says so **once**, as one item on your list (**For you**) and beside the rule, for as long as that lasts: not one item for each failure. It goes away when a message is sent, when you switch the rule off and on or remove it, and when the server starts again.

**After five attempts in a row that failed, the rule's webhook is not tried again**, and the item says so. It is tried again once you switch the rule off and on, or once the server starts again (which is also when a changed address is read). No timer tries again by itself. The count is per rule and is of attempts that failed *in a row*: one message that is taken sets it back to nothing. A firing that was dropped for coming too fast is not an attempt and is not counted.

A rule that names a webhook that is not in the settings file (it was taken out, or its entry is refused) sends nothing and says so the same way, from the start of the server on.

## Chat tools

Many chat tools give a channel an "incoming webhook": an address that shows what is posted to it. Those generally show a field named `text` and pass over fields they do not know, which is why the message has one. Two things to know:

- **Such a tool cannot check the signature.** It shows whatever is posted to its address, by anyone who has the address. The address is the secret there, which is why Aubergine never shows more of it than its host.
- **Tools differ.** Some take only a shape of their own, refuse a body with fields they do not know, or want another field than `text`. For one of those, put a few lines of your own in between: a receiver like the example that checks the signature and posts what the tool wants.

- **A name can hold what a chat tool reads as more than text.** `text` carries a terminal's name, and an agent can name its terminal. Aubergine takes control characters out of a name and nothing else, because every tool has markup of its own: a name such as `@here` or one with an address in it is shown by the tool as it shows any message. Where a channel must not be pinged by what an agent wrote, give your terminals names yourself (a name you wrote is never replaced by an agent's), or put a receiver in between that posts only `event` and the IDs.

No real chat tool was tried.

## What was tried, and what was not

Tried on 2026-11-28, on Linux (x86_64, Node.js 22, tmux, zsh), against a throwaway server of version 0.3.0 on its own port, data folder and tmux socket, with `examples/webhooks/receive.mjs` on the same computer:

- `config.json` with one webhook to the receiver and one entry that was wrong (plain `http` to another host): the server's first lines and `aubergine doctor` named the first with its host and said what was wrong with the second; a rule naming the second was refused.
- `aubergine rule add --when terminal.waiting --webhook <name>`, then a terminal set waiting from its own shell (`aubergine attention waiting "…"`), told to wait again with other words, set working, and set waiting again: two waits, two deliveries, each verified by the receiver; none for the same wait said again. The agent's question was in neither.
- The receiver stopped: the next wait made one item on the owner's list and a line beside the rule; further waits made no second item. Each attempt was a line of the activity log (`502`), and what came faster than six a minute was dropped (`429`).
- The fifth failure in a row: the item said that it is not tried again, and the next firing was recorded as not tried (`503`). The receiver started again and the rule switched off and on: the next wait was delivered and the item was gone.
- The secret and the path of the address were searched for in the state file, the activity log and what the server printed: in none.
- The Rules tab in Chromium with the webhook chosen by name and host.

Tests cover the rest with a stand-in sender (every event, the declared body, the signature, what is never sent, the rate, another project, an archived project, every route as a token and as a terminal, both event streams), and the real sender against a server the test starts on this computer (a 2xx, a 5xx, a redirect, a receiver that hangs, a large answer).

Not tried: a receiver anywhere but this computer; `https` at all, so no certificate that is wrong, expired or self-signed (the request then fails and is recorded as not reached); a real chat tool's incoming webhook; a proxy between the server and the receiver; a receiver that answers slowly rather than not at all, outside tests; many rules sending at once; a real agent setting a terminal waiting; macOS and Windows.
