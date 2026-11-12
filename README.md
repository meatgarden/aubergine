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

The server prints its address (`http://127.0.0.1:4600`) and a sign-in link ending in `/auth?token=…`. Open that link once per browser; after that the plain address works.

The server listens on `127.0.0.1` only.

## Use

- **New terminal** adds a terminal node. Drag it by its title bar, resize it from its edges, double-click the title to rename it, and use × to close it (this ends the shell, so it asks first).
- Drag the background to pan; scroll or pinch to zoom.
- A terminal takes input only at 100% zoom. Click a zoomed-out terminal to zoom to it. The percentage in the toolbar returns the view to 100%.
- Scrolling inside a terminal scrolls its history.

## Develop

```sh
pnpm dev      # daemon on :4600 and the web dev server on http://127.0.0.1:5173
pnpm check    # type check, lint, unit tests and the browser smoke test
```

The smoke test needs a browser once: `pnpm exec playwright install chromium`.

Settings are environment variables, all optional:

| Variable | Default | Purpose |
|---|---|---|
| `AUBERGINE_PORT` | `4600` | Port on `127.0.0.1` |
| `AUBERGINE_DATA_DIR` | per-user application data folder | Where state and the access token are kept |
| `AUBERGINE_TMUX_SOCKET` | `aubergine` | Name of the dedicated tmux socket |
| `AUBERGINE_TMUX_BIN` | `tmux` | tmux binary to use |

Sessions are ordinary tmux sessions on that socket, so `tmux -L aubergine ls` lists them.
