# Aubergine

A local, browser-based canvas where each terminal session is a node you can arrange and use.

Terminals keep running when you close the browser or restart the Aubergine server: reopen the page and every terminal is where you left it, with the same shell.

## Requirements

- macOS or Linux
- [tmux](https://github.com/tmux/tmux) 3.2 or newer
- Node.js 22 or newer
- pnpm

## Install

```sh
pnpm install
```

## Run

```sh
pnpm build
pnpm start
```

The server prints its address (`http://127.0.0.1:4600`) and a sign-in link ending in `/auth?token=…`. Open that link once per browser; after that the plain address works. The server listens on `127.0.0.1` only.

In a Chromium-based browser you can install the page as an app window (address bar → install), which lets more keyboard shortcuts reach the canvas.

## Use

### Canvas

- **New terminal** (or `N`) adds a terminal in free space near the middle of the view.
- Drag a node by its title bar; resize it from its edges; double-click the title to rename it.
- Drag the background to pan; scroll or pinch to zoom. **Fit** (or `F`) shows everything; the percentage (or `0`) returns to 100%. The minimap in the corner also pans and zooms.
- **+ Frame** adds a labeled frame. Drag a frame by its label and the terminals inside it move along.
- The dot in a title bar gives a node or frame a color.
- The title bar shows the running command and current folder of each session.

### Keyboard and focus

- Click a terminal to give it the keyboard. A terminal takes input only at 100% zoom; clicking a zoomed-out terminal zooms to it first.
- While a terminal has focus, every key goes to it. `N`, `F` and `0` work when no terminal or text field has focus; click the background to get there.
- **⌘K** (Ctrl+Shift+K outside macOS) always reaches the canvas, even from inside a terminal. It opens the session picker: type part of a name, folder, command or note, press Enter, and the view moves to that session and focuses it.

### Scrolling, copy and paste

- The wheel scrolls the history of the terminal that has focus. Anywhere else it zooms the canvas.
- Select text in a terminal with the mouse and it is copied to the system clipboard when you release the button.
- Paste with ⌘V (Ctrl+Shift+V outside macOS). Multi-line pastes are bracketed, so a shell does not run them line by line.

### Parking, and shells that end

- × on a node **parks** the session: the node leaves the canvas but the shell keeps running. **Parked (n)** in the toolbar lists parked sessions; restore one, or end it for good (this asks first).
- When a shell exits by itself, its node stays and offers **Restart here** (a new shell in the same folder) and **Remove**.

### Status at a glance

With zsh, each node's title bar shows what its shell is doing:

- a pulsing dot and the full command line while a command runs;
- a red `exit N` badge when the last command failed (hover for when it finished);
- a blue dot when the session has printed something since you last looked at it.

These work for parked and off-screen sessions too. Other shells run normally but report no command status yet.

How it works: a session starts zsh with `ZDOTDIR` pointing at a small folder inside the data folder. The files there load your own `.zshenv`, `.zprofile`, `.zshrc` and `.zlogin` exactly as usual and then add two hooks. Your dotfiles are never edited, and `ZDOTDIR` is back to your own value once the shell has started.

### Agents: who is waiting for you?

**+ Claude Code** starts `claude` in a new session with a settings file that Aubergine generates in its data folder. Your own Claude Code configuration is not touched. The hooks in that file tell the canvas what the agent is doing:

- when you submit a prompt, the prompt is added to the session's note log and the node shows **working**;
- when the agent needs you (a permission question, or it is idle waiting for input), the node turns orange and shows **waiting for you**;
- when the agent stops, the node shows **finished** and a line is added to the log.

The toolbar shows **N waiting**; click it to go to the next waiting session. Looking at a node clears its state, and so does the agent starting to work again. **Notify** turns on desktop notifications for sessions that start waiting.

To use the hooks in sessions you start yourself, print them and add them to your own Claude Code settings by hand:

```sh
aubergine hooks print
```

They do nothing outside an Aubergine session.

Prompts can contain secrets. To keep them out of the note log, set `"agents": { "logPrompts": false }` in `config.json`.

### Notes

**Note** in a title bar opens the session's notes: a pinned Markdown summary that you edit freely and that is saved as you type, above a log that only grows. Each log entry has an author (you, or the agent in that session) and a time. Add an entry in the panel, or from inside the session:

```sh
aubergine note "migrations done, starting the backfill"
```

The picker searches both the summary and the log.

### Searching terminal output

The picker (⌘K) also searches what terminals have printed, in a **Terminal output** section below the session matches. Choosing a result opens that session scrolled back to the match; press `q` to return to the bottom. It reads each running session's history when you search, parked sessions included. Nothing is indexed or recorded, so it only reaches as far back as the history tmux keeps (50,000 lines) and does not cover sessions that have ended.

### Many sessions

A terminal is live only while it is on screen and large enough to read. Zoomed far out, a node shows a plain-text picture of its screen, refreshed about once a second; off screen it costs nothing. Either way the shell keeps running.

## After a reboot

A reboot ends the shells. The next time the server starts, every session gets a fresh shell in its last known folder, in the same place on the canvas. Nothing is re-run.

## Settings

Create `config.json` in the data folder (the server prints its location at start). Every field is optional:

```json
{
  "font": { "family": "Menlo, monospace", "size": 13 },
  "theme": "dark",
  "shell": null,
  "defaultFolder": "~/work",
  "agents": { "logPrompts": true }
}
```

- `theme`: `"dark"` or `"light"`.
- `shell`: absolute path of the shell to start; `null` uses your own `$SHELL`.
- `defaultFolder`: where new terminals start; `null` means your home folder.
- `agents.logPrompts`: `false` keeps prompts given to agents out of the note log. Default `true`.

Font and theme apply when you reload the page; shell and folder apply to the next new terminal.

## Shell environment

Every session starts your shell as a **login shell**, so your own profile files build its environment (`PATH` and the rest) no matter how the server was started: from a terminal, or at login with no terminal at all. The server passes on its own environment as the base, without the variables that belong to the tool that launched it, and fills in `HOME`, `USER`, `LOGNAME`, `SHELL` and `LANG` when they are missing.

One thing to know: tmux fixes that base environment when its server first starts. A variable you export later in some other terminal does not appear in existing or new sessions until all sessions have ended.

## Command line

`bin/aubergine.mjs` is the `aubergine` command; link it onto your `PATH` if you like:

```sh
ln -s "$PWD/bin/aubergine.mjs" /usr/local/bin/aubergine
```

```
aubergine list                 sessions with their state, command and folder
aubergine new [name]           start a new terminal on the canvas
aubergine attach <name>        open a session in this terminal
aubergine note <text>          inside a session: add an entry to its note log
aubergine hooks print          print the Claude Code hook settings
aubergine service install      start the Aubergine server at login (macOS)
aubergine service uninstall    stop starting it at login
```

`attach` shows the very same session as the canvas, so both views stay in step. Close the terminal window to detach; the session keeps running.

`service install` writes a per-user launchd agent that runs the server from this checkout, with the port and data folder in effect when you ran it. Run `pnpm build` first.

## For programs inside a session

Every session's shell has three variables:

| Variable | Meaning |
|---|---|
| `AUBERGINE_URL` | Address of the server |
| `AUBERGINE_SESSION_ID` | This session's ID |
| `AUBERGINE_TOKEN` | A token that is valid for this session only |

With the token as a bearer credential, a program may do exactly two things, both for its own session:

```
PUT  /v1/sessions/<id>/attention   {"state": "working" | "waiting" | "done" | "none", "message": "..."}
POST /v1/sessions/<id>/notes       {"text": "..."}
```

Everything else is refused. `aubergine note` and `aubergine hook` are thin wrappers around these two calls.

## Develop

```sh
pnpm dev          # daemon on :4600 and the web dev server on http://127.0.0.1:5173
pnpm check        # type check, lint, unit tests and the browser smoke test
pnpm load-canvas  # a throwaway canvas with 90 sessions, for judging scale by hand
```

The smoke test needs a browser once: `pnpm exec playwright install chromium`.

Environment variables, all optional:

| Variable | Default | Purpose |
|---|---|---|
| `AUBERGINE_PORT` | `4600` | Port on `127.0.0.1` |
| `AUBERGINE_DATA_DIR` | per-user application data folder | Where state, settings and the access token are kept |
| `AUBERGINE_TMUX_SOCKET` | `aubergine` | Name of the dedicated tmux socket |
| `AUBERGINE_TMUX_BIN` | `tmux` | tmux binary to use |

Sessions are ordinary tmux sessions on that socket, so `tmux -L aubergine ls` lists them.
