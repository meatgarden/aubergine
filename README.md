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

### Notes

**Note** in a title bar opens a Markdown note for that session. It is saved as you type and is searched by the picker.

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
  "defaultFolder": "~/work"
}
```

- `theme`: `"dark"` or `"light"`.
- `shell`: absolute path of the shell to start; `null` uses your own `$SHELL`.
- `defaultFolder`: where new terminals start; `null` means your home folder.

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
aubergine service install      start the Aubergine server at login (macOS)
aubergine service uninstall    stop starting it at login
```

`attach` shows the very same session as the canvas, so both views stay in step. Close the terminal window to detach; the session keeps running.

`service install` writes a per-user launchd agent that runs the server from this checkout, with the port and data folder in effect when you ran it. Run `pnpm build` first.

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
