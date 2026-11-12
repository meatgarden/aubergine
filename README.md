# Aubergine

A local, browser-based canvas where each terminal session is a node you can arrange and use.

Terminals keep running when you close the browser or restart the Aubergine server: reopen the page and every terminal is where you left it, with the same shell.

## Quick start

You need macOS with [tmux](https://github.com/tmux/tmux) 3.2 or newer, Node.js 22 or newer, and pnpm. Linux should work the same way but has not been tested yet.

**1. Install the tools** (skip any you already have). With [Homebrew](https://brew.sh) on macOS:

```sh
brew install tmux node pnpm
```

**2. Get the code and its dependencies:**

```sh
git clone https://github.com/meatgarden/aubergine.git
cd aubergine
pnpm install
```

**3. Build the web app and start the server:**

```sh
pnpm build
pnpm start
```

**4. Open the sign-in link.** The server prints something like this:

```
Aubergine is running at http://127.0.0.1:4600
First visit in a browser? Open this link once:
  http://127.0.0.1:4600/auth?token=…
```

Open the `/auth?token=…` link once per browser. After that, `http://127.0.0.1:4600` works on its own. Use `127.0.0.1` rather than `localhost`, since the sign-in is remembered per address.

**5. Add a terminal.** Choose **New terminal** (or press `N`), click the terminal, and type.

### Stopping, restarting and updating

- **Stop the server** with Ctrl+C in the terminal where it runs. Your terminals on the canvas keep running; start the server again and reload the page to get them back.
- **End every session for good** with `tmux -L aubergine kill-server`. The canvas layout is kept, and each session gets a fresh shell the next time the server starts.
- **Update** to the latest version:

  ```sh
  git pull
  pnpm install
  pnpm build
  pnpm start
  ```

- **Start at login** so you only ever open the browser: see `aubergine service install` under [Command line](#command-line).

### If something goes wrong

| What you see | What to do |
|---|---|
| "This browser is not signed in yet" | Open the `/auth?token=…` link that the server printed when it started. |
| A page saying tmux is missing or too old | Install or upgrade tmux (`brew install tmux`), then restart the server. |
| The server will not start because the port is taken | Use another port: `AUBERGINE_PORT=4700 pnpm start`. |
| "The web app has not been built yet" | Run `pnpm build`, then `pnpm start` again; `start` serves the built web app. |
| A terminal shows no status badges | Status needs zsh, and a session created before an update keeps its old shell. Park it and start a new one, or restart its shell. |

The server listens on `127.0.0.1` only, so it is reachable from this computer and nowhere else.

In a Chromium-based browser you can install the page as an app window (address bar → install), which lets more keyboard shortcuts reach the canvas.

## Moving your existing terminals over

You probably have terminal tabs open already, some of them running agents. One thing cannot be done, by this or any tool: **a program that is already running in another terminal cannot be moved into an Aubergine session.** So moving over means three things: give each tab a canvas session in the same folder, carry agent conversations on inside those sessions, and make new tabs land on the canvas from now on.

Nothing here stops, signals or changes a program you have running, and nothing edits your dotfiles.

These steps use the `aubergine` command; see [Command line](#command-line) for putting it on your `PATH`. The server must be running.

### A tab that is sitting at its prompt

In that tab:

```sh
aubergine here
```

This creates a session in the tab's current folder, named after the folder, puts it on the canvas, and turns the tab into a view of that session. The tab and the canvas now show the same shell. Close the tab whenever you like; the session stays on the canvas.

Give it a name, or a command to start with, if you want:

```sh
aubergine here "api server" -- npm run dev
```

`aubergine here` starts a new shell; variables and shell history that only existed in the old shell's memory do not come along. The old shell is still underneath the view: if the session ends while the tab is open, you are back in it. Use `exec aubergine here` to replace the old shell completely.

### A tab with a command still running

Leave it alone until the command finishes, or stop it yourself when it suits you. Then run `aubergine here` in that tab, adding the command after `--` if you want it started again in the new session.

A running server or watcher cannot be carried over; it has to be started again inside the session.

### A tab running Claude Code

1. Let the agent finish its current turn.
2. Exit it (`/exit`).
3. In the same tab, in the same folder:

   ```sh
   aubergine here --claude
   ```

This starts Claude Code in a new canvas session with `--continue`, so the conversation carries on where it stopped, now with its status on the canvas (working, waiting for you, finished).

The limit: `--continue` picks the **most recent** conversation for that folder. If two agents were working in the same folder, only the first `aubergine here --claude` gets the right one by itself. For the other, run `aubergine here`, then `claude --resume` in the session and choose the conversation from the list.

### All tabs at once

```sh
aubergine scan
```

lists your open shells that are not on the canvas yet: the terminal, what is running in it, and its folder. It only reads.

```sh
aubergine import --dry-run
aubergine import
```

creates one canvas session per folder, grouped in a frame named "Imported", and prints what to do in each original tab: attach it if it is idle, or wait for its command or agent first. `--dry-run` shows the plan and changes nothing. Folders that already have a session are skipped; `--all` gives every tab its own session anyway. Your tabs are left exactly as they are.

### New tabs from now on

```sh
aubergine shell-hook print
```

prints a few lines for your `.zshrc`. Add them yourself, at the end of the file. From then on a new terminal tab starts inside a new canvas session, and closing the tab only detaches from it.

The lines cannot leave you without a shell. They do nothing inside Aubergine or tmux or in a non-interactive shell, and if the server is stopped, slow to answer, or anything else fails, the normal shell starts as usual (after a moment's wait, at most a few seconds).

For one plain tab on purpose, run `AUBERGINE_DISABLE=1 zsh`, or set `AUBERGINE_DISABLE=1` in the environment of a terminal profile.

Each new tab makes a new session, so park or end the ones you no longer need.

### Going back

- Remove the lines between the two `aubergine` markers from your `.zshrc`; new tabs are plain again.
- `AUBERGINE_DISABLE=1` switches the lines off without removing them.
- Sessions are ordinary tmux sessions on their own socket. With the server stopped you can still reach every one: `tmux -L aubergine ls`, then `tmux -L aubergine attach -t <id>` with an ID from that list.
- Ending the sessions (from the canvas, or `tmux -L aubergine kill-server`) leaves nothing running.

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
aubergine here [name] [-- cmd] start a session in this folder and turn this terminal into a view of it
                               --no-attach  only create it
                               --claude     start Claude Code in it, continuing this folder's last conversation
aubergine scan                 list open shells that are not on the canvas yet (read-only)
aubergine import               give each of those a canvas session (--dry-run, --all)
aubergine shell-hook print     print the zsh lines that make new tabs start on the canvas
aubergine note <text>          inside a session: add an entry to its note log
aubergine hooks print          print the Claude Code hook settings
aubergine service install      start the Aubergine server at login (macOS)
aubergine service uninstall    stop starting it at login
```

`attach` and `here` show the very same session as the canvas, so both views stay in step. Close the terminal window to detach; the session keeps running. See [Moving your existing terminals over](#moving-your-existing-terminals-over) for `here`, `scan`, `import` and `shell-hook`.

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
