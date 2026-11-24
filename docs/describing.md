# What a terminal says about itself

Each terminal carries a small record of the work in it, so that it can be followed at a glance: its name, its summary, the links that belong to the work, and what can be found about its folder. The record has three sources, and every item says which it came from and when.

## Who writes what

| Source | What | How |
| --- | --- | --- |
| **Found** by the server, with no one asked | The agent's conversation id; the folder; the branch and the repository of that folder; the pull request of that branch; addresses seen in the terminal | See "What is looked at, and when" below |
| **The agent** in the terminal | The terminal's name, its summary, links it was given or made, and fields of its own (a label and a value) | `aubergine describe --name … --summary …`, `aubergine link add <address>`, `aubergine field set <label> <value>`; the first two also as MCP tools (`describe_self`, `link_add`, `links_read`, `link_remove`). Fields have no MCP tool. |
| **You**, by hand, always | All of the above | In a terminal's details: the name, the summary, **Add a link**, and each chip's menu (Copy address, Edit…, Remove) |

**Your own words win.** Where you named a terminal, wrote its summary, or set a link's label or kind, nothing an agent or a program sends replaces it. What it sent is kept beside yours as a suggestion, with **Use this** in the details (for a link: **Use the agent's words** in the chip's menu). An agent is told so in plain words when this happens. A link you added or set is yours to remove: a program is refused.

## Links

A link is an address, a kind, a short label, who added it, and when. Only `http` and `https` addresses are links; anything else is refused with a sentence. An address with a name or a password in it is refused too. An address is kept and opened exactly as it was given.

No address is drawn as text. A link is a chip: two letters for its kind, a short label, and the whole address in the tooltip. This holds in a terminal's details, in its title on the canvas (the marks of at most three links, the ticket and the pull request first), in the summary and the log of its note, and in the list of what waits for you.

**The kind and the label are told from the address alone**, by one table (`shared/src/links.ts`):

| Kind | Told from | Label |
| --- | --- | --- |
| Pull request, issue, branch, commit, run or build, repository | The path on a code host (`github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`) | "PR 54", "Issue 12", the branch's name, "Commit 1a2b3c4", "Run 99", "owner/name" |
| Ticket | The key in the path on an issue tracker (`*.atlassian.net`, `linear.app`, `*.youtrack.cloud`) | "ABC-123" |
| Chat | The shape of the path on a chat (`*.slack.com`, `discord.com`) | "Chat thread", "Chat message", "Chat channel" (such an address holds the channel's id, not its name) |
| Design | The file's name in the path (`figma.com`) | "Canvas redesign" |
| Document | The page's title in the path (`notion.so`, `*.notion.site`, a wiki under `*.atlassian.net/wiki`), or which sort of document (`docs.google.com`, `drive.google.com`) | "Remote access plan", "Document", "Spreadsheet" |
| Link | Anything else | The host and the last part of the path |

A host is compared exactly, or by a registered suffix; never by whether it contains a word. A ticket's key is read from the path only. You can change the kind and the label of any link in its menu.

**The server never fetches an address.** No request leaves your computer because a link was added, seen or shown: the title of a page is not looked up. The one thing that is asked of a network is described next, and it is your own tool that asks.

## What is looked at, and when

- **The branch and the repository**: two Git commands that change nothing, in the terminal's folder. When a terminal's details are opened, when a command in it ends, and after an agent ran a command that makes or changes a branch; at most once in ten seconds for a terminal. Not on a timer.
- **The pull request of that branch**: only where the `gh` tool is installed and signed in. Aubergine starts it (`gh pr view`), as you, and reads the number, the address, the title and whether it is open, merged, closed or a draft. It is asked when the branch has changed, or while the terminal's details are open, and at most once a minute for a terminal. No `gh`, or no pull request: nothing is shown and nothing is said. To switch this off, write `"describe": { "pullRequests": false }` in the settings file.
- **Addresses seen in the terminal**: the screen and the end of its history are read (without attaching to the terminal) when a command ends and when the details are opened. The last twenty distinct addresses are remembered **in memory only**, as "Seen in this terminal", and are gone when the server stops. One of a kind the table knows, with nothing after a `?` or a `#`, is kept as a link by itself, marked as found. Any other can be kept with **Keep**. What was seen in a terminal is terminal content: a program may read it only with `terminal:read` reaching that terminal.

## Always, not usually

For an agent that Aubergine starts, three things happen through its hooks, with no one asking:

1. **When it begins** it is told, in three fixed lines, to name its terminal after the work, to keep its summary true, and to add every ticket, thread, design, document, branch and pull request it is given or makes.
2. **When it stops** and its terminal still has the name it was made with, or has no summary (or one older than the last hour of its work), it is told once what is missing and asked to set it. Once in a turn, never in a loop: after that the stop goes through, and the details say quietly that the terminal is not described. You can fill it in by hand.
3. **After it ran a command that makes or changes a branch or a pull request**, the folder is looked at again, so that the branch and the pull request appear without anyone writing them.

A plain shell, and an agent without these hooks, have what is found and what you write by hand; nothing says anything is wrong.

**To switch the reminder off:** Settings, **Remind agents to describe their terminal**. This is `describe.remind` in the settings file. With it off, an agent is told nothing at its start and nothing when it stops; everything else stays.

An agent describes its own terminal only: the commands and the hooks use the terminal's own credential, which reaches no other terminal.

## Over the API

`GET`, `POST /v1/sessions/<id>/links`, `PATCH` and `DELETE /v1/sessions/<id>/links/<link>`: reading with `read`, writing with `notes:write` (a session may write its own). `GET /v1/sessions/<id>/links/seen` needs `terminal:read`. Keeping a seen link, using a suggestion and looking again are the owner's alone. See [the API reference](api.md).
