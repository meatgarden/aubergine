# Aubergine — project rules

Aubergine is a local, browser-based canvas where each terminal session is a node you can arrange and use. It is built in small stages; each stage is usable on its own.

## Layout

pnpm workspace, TypeScript in strict mode.

```
shared/   wire protocol (zod schemas), entity types, settings schema, the change-event reducer
daemon/   Fastify HTTP + WebSocket server, tmux session runtime, JSON store, CLI, start-at-login,
          shell integration (src/shell/), agent support (src/agents/), authorization (src/auth.ts),
          migration of existing terminals (src/migrate/)
web/      Vite + React + @xyflow/react + @xterm/xterm, Zustand for state
e2e/      Playwright smoke test
bin/      the `aubergine` command (a launcher for daemon/src/cli.ts)
```

## The four seams

These are the only abstractions in the code base. Each has exactly one implementation. Do not add another interface until a feature needs it.

1. **Wire protocol** — `shared/src/protocol.ts`. Every message between a client and the daemon is a versioned zod schema: HTTP bodies, change events, terminal WebSocket messages, and the URL paths themselves. The web app reaches the daemon only through `web/src/api.ts` and the terminal socket in `web/src/TerminalView.tsx`. The CLI (`daemon/src/cli.ts`) uses the same HTTP protocol; it does not reach into the daemon's state. Agent-facing routes live under `/v1`, and `SESSION_ENV` names the variables each session receives; `aubergine note` and `aubergine hook` use only those routes. `CreateSessionRequest` also takes `cwd`, `command`, `uniqueName` and `agentContinue`.
2. **`SessionRuntime`** — `daemon/src/runtime/runtime.ts`. Owns the running shells: `check`, `create` (folder, shell and `env`), `list` (with each session's folder, command and `activityAt`), `has`, `kill`, `attach(viewer)` → byte stream, `snapshot`, `typeLine`, `search`, `reveal`. Resizing is a method of the attachment that `attach` returns, because a size belongs to a viewer. Implementation: `TmuxRuntime`, one tmux session per session ID on a dedicated socket with the config in `daemon/src/runtime/tmux.conf`; each viewer is one `tmux attach` in its own pseudo-terminal. Sessions must outlive the daemon process. Scrollback, copy (OSC 52) and paste handling live in the runtime and in `TerminalView`, nowhere else, so the runtime can be swapped.
3. **`Store`** — `daemon/src/store/store.ts`. `load` and `save` of the whole canvas state. Implementation: `JsonStore`, one JSON file written atomically. Layout (nodes and frames) is stored apart from sessions and refers to them by ID. New fields get a zod default so older files still load.
4. **Change events** — `Canvas.emit(event)` in `daemon/src/canvas.ts` is the only way state changes. It applies the event with `applyEvent` from `shared/`, saves, and notifies subscribers; the browser receives the same events over a WebSocket and applies them with the same reducer. Never mutate state any other way. Events cover sessions (created, renamed, parked, restored, exited, restarted, activity, noted, closed, plus `session.status`, `session.attention` and `session.note.appended`), nodes and frames.

## Rules

- **Import boundary.** `web/` may import `shared/` but never `daemon/`. `shared/` imports neither, and no Node-only modules. ESLint enforces both (`eslint.config.js`); do not weaken those rules.
- **IDs** are UUIDv7 (`newId()` in `shared/`). Every session has a `projectId`; one default organization → workspace → project exists from the first run.
- **Paths.** The data folder comes from `dataDir()` in `daemon/src/paths.ts` and nowhere else. No hard-coded per-OS paths in other files. The one exception is the start-at-login module below.
- **Settings.** The schema is `Settings` in `shared/src/settings.ts`; the file is `config.json` in the data folder, read by `daemon/src/settings.ts`. A missing or invalid file means defaults, never a failed start.
- **Shell.** Sessions start a login shell: the user's `$SHELL`, or the one named in settings. Do not hard-code a shell. `shellEnvironment` in the tmux runtime builds the base environment; the login shell does the rest.
- **Start at login.** Everything that knows about launchd is in `daemon/src/service/launchd.ts`. A second service manager goes in a file beside it. Tests only inspect the generated file; never install the service from a test or a script.
- **Security.** The daemon binds `127.0.0.1` only. One `onRequest` hook in `daemon/src/server.ts` checks `Host` and `Origin` on every HTTP request and WebSocket upgrade, and requires the access-token cookie on `/api` and `/ws`. New routes must stay behind that hook.
- **Status never depends on a viewer.** Shell state comes from `ShellIntegration` (status files written by shell hooks), not from terminal output. Never edit the user's dotfiles; another shell is another class in `daemon/src/shell/integration.ts`.
- **Authorization.** Every route that acts for a bearer token calls `authorize(principal, action, resource)` in `daemon/src/auth.ts`. Add scopes by changing that function, not its callers. `/v1` accepts bearer tokens only; `/api` accepts the cookie only.
- **Agent hooks** print nothing and always exit 0. Agent settings are generated into the data folder and passed on the command line; never write to an agent's own configuration.
- **Search** of terminal output reads history on demand; no index, no recording.
- **Migration never touches what is running.** Scanning only reads. Nothing stops, signals or modifies a process the user started outside Aubergine, and nothing edits their dotfiles; snippets are printed for the user to add. Per-OS process inspection lives in `daemon/src/migrate/shells.ts` only, with parsing as pure functions under test.
- **The shell snippet must always fall through to a normal shell.** Any change to it needs the tests for server up, stopped, hanging and command missing to pass. `here --from-shell-hook` is quiet and reports failure only by exit code.
- **Generated files that start Node** (the shell snippet, the login service, agent settings) take the path from `stableNodePath()` in `daemon/src/node-path.ts`, never `process.execPath`, so they survive a Node upgrade.
- Session IDs are the only user-influenced values that reach a tmux command line, and they are validated as UUIDv7 first. Keep it that way.

### Canvas behaviour

- A terminal takes input only at 100% zoom and only while it has focus. Clicking a zoomed-out node zooms to it first. An unfocused terminal is covered by a shield: the first click focuses it.
- Terminal bodies never drag or pan the canvas. The wheel belongs to a terminal only while it has focus; anywhere else it zooms the canvas.
- One chord always reaches the canvas, even from a focused terminal: ⌘K on macOS, Ctrl+Shift+K elsewhere. Single-key canvas shortcuts work only when no terminal or text field has focus. The rules are in `web/src/keys.ts`.
- Closing a node parks its session; it does not end the shell. Ending a shell for good always asks first.
- A node keeps a live terminal (and its WebSocket) only while it is on screen and readable; otherwise it shows a snapshot or nothing. The decision is `nodeMode` in `web/src/culling.ts`.

### Tests

- Tests that type into a new session must wait for the shell's prompt first (`createReady` / `shellReady` in the daemon tests): a shell discards what is typed while it is starting.
- Tests await `sessions.refresh()`; never leave one running past teardown.
- Each test file that starts tmux uses its own socket name.
- Shell-integration tests use a stand-in `ZDOTDIR`; never assert against, or write to, the developer's own startup files. The same goes for the shell snippet tests.

## Checks

```
pnpm check
```

runs, in order: type checking, lint, unit tests (Vitest; the tmux runtime and server tests use a real tmux on test sockets) and the Playwright smoke test (builds the web app and starts a daemon with its own data folder, port and tmux socket). A task is not done until it passes.

Single steps: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`.

`pnpm dev` starts the daemon (port 4600, restarts on change) and the Vite dev server (port 5173, proxies `/api`, `/auth` and `/ws` to the daemon).

`pnpm load-canvas` fills a throwaway canvas with 90 sessions for judging scale by hand. It is not part of `pnpm check`.

Environment variables, all optional: `AUBERGINE_PORT`, `AUBERGINE_DATA_DIR`, `AUBERGINE_TMUX_SOCKET`, `AUBERGINE_TMUX_BIN`, `AUBERGINE_DEV_ORIGIN`. Use a separate data folder and socket for experiments so they do not touch real sessions.

## Scope so far

Stage 1: terminals on a canvas (add, drag, resize, rename), pan and zoom, one WebSocket per mounted terminal, sessions and layout that survive a browser reload and a daemon restart, an error page when tmux is missing or older than 3.2.

Stage 2: focus model and canvas shortcuts, wheel scrollback, copy and paste, parked sessions, handling of shells that exit, the session picker, zoom to fit, minimap, live folder and command per session, a Markdown note per session, frames, node colors, snapshots for off-screen and zoomed-out terminals, fresh shells in their last folders after a reboot, the settings file, the `aubergine` command, start at login, a web app manifest.

Stage 3: command status per session from shell hooks (busy or idle, command, exit code, unread output) shown as badges, session-scoped tokens and the first `/v1` routes, a timestamped note log with `aubergine note`, agent hooks that log prompts and raise or clear "waiting for you", the attention queue, and search of terminal output from the picker.

Migration: `aubergine here`, `scan`, `import` and `shell-hook print`, for moving terminals that are already open onto the canvas.

Not built yet: SQLite, an MCP server, presets, a finder agent, recording, bash or fish integration.

## Working in this repo

- One branch per task, small commits.
- Do not change the git identity configured for this repo.
