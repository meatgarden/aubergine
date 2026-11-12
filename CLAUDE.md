# Aubergine — project rules

Aubergine is a local, browser-based canvas where each terminal session is a node you can arrange and use. It is built in small stages; each stage is usable on its own.

## Layout

pnpm workspace, TypeScript in strict mode.

```
shared/   wire protocol (zod schemas), entity types, the change-event reducer
daemon/   Fastify HTTP + WebSocket server, tmux session runtime, JSON store
web/      Vite + React + @xyflow/react + @xterm/xterm, Zustand for state
e2e/      Playwright smoke test
```

## The four seams

These are the only abstractions in the code base. Each has exactly one implementation. Do not add another interface until a feature needs it.

1. **Wire protocol** — `shared/src/protocol.ts`. Every message between browser and daemon is a versioned zod schema: HTTP bodies, change events, terminal WebSocket messages, and the URL paths themselves. The web app reaches the daemon only through `web/src/api.ts` and the terminal socket in `web/src/TerminalView.tsx`, and both use these schemas.
2. **`SessionRuntime`** — `daemon/src/runtime/runtime.ts`. Owns the running shells: `check`, `create`, `list`, `has`, `kill`, `attach(viewer)` → byte stream, `snapshot`. Resizing is a method of the attachment that `attach` returns, because a size belongs to a viewer. Implementation: `TmuxRuntime`, one tmux session per session ID on a dedicated socket with the config in `daemon/src/runtime/tmux.conf`; each viewer is one `tmux attach` in its own pseudo-terminal. Sessions must outlive the daemon process.
3. **`Store`** — `daemon/src/store/store.ts`. `load` and `save` of the whole canvas state. Implementation: `JsonStore`, one JSON file written atomically. Layout is stored apart from sessions and refers to them by ID.
4. **Change events** — `Canvas.emit(event)` in `daemon/src/canvas.ts` is the only way state changes. It applies the event with `applyEvent` from `shared/`, saves, and notifies subscribers; the browser receives the same events over a WebSocket and applies them with the same reducer. Never mutate state any other way.

## Rules

- **Import boundary.** `web/` may import `shared/` but never `daemon/`. `shared/` imports neither, and no Node-only modules. ESLint enforces both (`eslint.config.js`); do not weaken those rules.
- **IDs** are UUIDv7 (`newId()` in `shared/`). Every session has a `projectId`; one default organization → workspace → project exists from the first run.
- **Paths.** The data folder comes from `dataDir()` in `daemon/src/paths.ts` and nowhere else. No hard-coded per-OS paths in other files.
- **Shell.** Sessions start the user's `$SHELL` as a login shell. Do not hard-code a shell.
- **Security.** The daemon binds `127.0.0.1` only. One `onRequest` hook in `daemon/src/server.ts` checks `Host` and `Origin` on every HTTP request and WebSocket upgrade, and requires the access-token cookie on `/api` and `/ws`. New routes must stay behind that hook.
- **Terminals** take input only at 100% zoom. Clicking a zoomed-out node zooms to it first. Terminal bodies never start a canvas drag, pan or wheel-zoom.
- Session IDs are the only user-influenced values that reach a tmux command line, and they are validated as UUIDv7 first. Keep it that way.

## Checks

```
pnpm check
```

runs, in order: type checking, lint, unit tests (Vitest; the tmux runtime and server tests use a real tmux on test sockets) and the Playwright smoke test (builds the web app and starts a daemon with its own data folder, port and tmux socket). A task is not done until it passes.

Single steps: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`.

`pnpm dev` starts the daemon (port 4600, restarts on change) and the Vite dev server (port 5173, proxies `/api`, `/auth` and `/ws` to the daemon).

Environment variables, all optional: `AUBERGINE_PORT`, `AUBERGINE_DATA_DIR`, `AUBERGINE_TMUX_SOCKET`, `AUBERGINE_TMUX_BIN`, `AUBERGINE_DEV_ORIGIN`. Use a separate data folder and socket for experiments so they do not touch real sessions.

## Scope of stage 1

In: terminals on a canvas (add, drag, resize, rename, close with confirmation), pan and zoom, one WebSocket per mounted terminal, sessions and layout that survive a browser reload and a daemon restart, an error page when tmux is missing or older than 3.2.

Not in this stage: SQLite, search, notes, frames or colors, status badges, API tokens for agents, a CLI, virtualization or previews, start at login.

## Working in this repo

- One branch per task, small commits.
- Do not change the git identity configured for this repo.
