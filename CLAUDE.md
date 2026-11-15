# Aubergine — project rules

Aubergine is a local, browser-based set of canvases, shown as tabs, where each terminal session is a node you can arrange and use. It is built in small stages; each stage is usable on its own.

## Layout

pnpm workspace, TypeScript in strict mode.

```
shared/   wire protocol (zod schemas), entity types, settings schema, the change-event reducer,
          chords and the command names with their default keys (chords.ts, shortcuts.ts)
daemon/   Fastify HTTP + WebSocket server, tmux session runtime, JSON store, CLI, start-at-login,
          shell integration (src/shell/), agent support (src/agents/), authorization (src/auth.ts),
          migration of existing terminals (src/migrate/), including reading agent
          process records (claude-sessions.ts), moving agent tabs (move.ts) and the
          shared implementation behind the panel and the CLI (outside.ts); the state
          holder (state-hub.ts), the public routes (v1.ts, public-api.ts) and viewers.ts
web/      Vite + React + @xyflow/react + @xterm/xterm, Zustand for state; the tab bar (TabBar.tsx)
          and canvas addresses (address.ts); the side panel (panel/: SidePanel.tsx, registry.ts,
          sections/), terminal-rows.ts, list-filters.ts, list-model.ts, TagDialog.tsx;
          commands.ts, shortcuts.ts, canvas-actions.ts,
          spatial.ts, palette.ts, and the development-only key-tester.html
docs/     keys.md: what is known about which keys reach a page
e2e/      Playwright smoke test
bin/      the `aubergine` command (a launcher for daemon/src/cli.ts)
```

## The four seams

These are the only abstractions in the code base. Each has exactly one implementation. Do not add another interface until a feature needs it.

1. **Wire protocol** — `shared/src/protocol.ts`. Every message between a client and the daemon is a versioned zod schema: HTTP bodies, change events, terminal WebSocket messages, and the URL paths themselves. The web app reaches the daemon only through `web/src/api.ts` and the terminal socket in `web/src/TerminalView.tsx`. The CLI (`daemon/src/cli.ts`) uses the same HTTP protocol; it does not reach into the daemon's state. Agent-facing routes live under `/v1`, and `SESSION_ENV` names the variables each session receives; `aubergine note` and `aubergine hook` use only those routes. `CreateSessionRequest` also takes `cwd`, `command`, `uniqueName`, `agentContinue` and `agentArgs`. `EventsServerMessage` has a `show` message, which is not a change event. `/v1` also has `PUT …/agent`. The three `/api/v1/outside` routes (list, add, move) and their schemas are part of the protocol too. So are `publicPaths` and the public schemas (`CanvasSummary`, `CanvasDetail`, `pageOf`, `PageQuery`, `IDEMPOTENCY_HEADER`), `PATCH /v1/sessions/<id>` and `tags` on the create requests, `canvasAddress`, the `viewing` message a browser sends on the events socket, `canvasId` on `CreateSessionRequest`, `CreateFrameRequest`, `OutsideTarget` and restore, and `defaultCanvasId` in the state response.
2. **`SessionRuntime`** — `daemon/src/runtime/runtime.ts`. Owns the running shells: `check`, `create` (folder, shell and `env`), `list` (with each session's folder, command and `activityAt`), `has`, `kill`, `attach(viewer)` → byte stream, `snapshot`, `typeLine`, `search`, `reveal`. Resizing is a method of the attachment that `attach` returns, because a size belongs to a viewer. Implementation: `TmuxRuntime`, one tmux session per session ID on a dedicated socket with the config in `daemon/src/runtime/tmux.conf`; each viewer is one `tmux attach` in its own pseudo-terminal. Sessions must outlive the daemon process. Scrollback, copy (OSC 52) and paste handling live in the runtime and in `TerminalView`, nowhere else, so the runtime can be swapped.
3. **`Store`** — `daemon/src/store/store.ts`. `load` and `save` of the whole state (`AppState`). Implementation: `JsonStore`, one JSON file written atomically. Each canvas holds its own layout (nodes and frames), which refers to sessions by ID. The file has a version; an older version is migrated on load (`migrate` in `json-store.ts`), a copy of the older file is kept beside it first, and every change of shape needs a fixture of the old file under test. New fields get a zod default so older files still load.
4. **Change events** — `StateHub.emit(event)` in `daemon/src/state-hub.ts` is the only way state changes. It applies the event with `applyEvent` from `shared/`, saves, and notifies subscribers; the browser receives the same events over a WebSocket and applies them with the same reducer. Never mutate state any other way. Events cover sessions (created, renamed, parked, restored, exited, restarted, activity, noted, closed, plus `session.status`, `session.attention`, `session.note.appended` `session.agent`, `session.moved`, `session.times` and `session.tagged`), canvases (`canvas.created`, `canvas.updated`, `canvas.removed`), nodes and frames; node and frame events carry a `canvasId`.

## Rules

- **Import boundary.** `web/` may import `shared/` but never `daemon/`. `shared/` imports neither, and no Node-only modules. ESLint enforces both (`eslint.config.js`); do not weaken those rules.
- **IDs** are UUIDv7 (`newId()` in `shared/`). Every session has a `projectId`; one default organization → workspace → project exists from the first run.
- **Paths.** The data folder comes from `dataDir()` in `daemon/src/paths.ts` and nowhere else. No hard-coded per-OS paths in other files. The one exception is the start-at-login module below.
- **Settings.** The schema is `Settings` in `shared/src/settings.ts`; the file is `config.json` in the data folder, read by `daemon/src/settings.ts`. A missing or invalid file means defaults, never a failed start.
- **Shell.** Sessions start a login shell: the user's `$SHELL`, or the one named in settings. Do not hard-code a shell. `shellEnvironment` in the tmux runtime builds the base environment; the login shell does the rest.
- **Start at login.** Everything that knows about launchd is in `daemon/src/service/launchd.ts`. A second service manager goes in a file beside it. Tests only inspect the generated file; never install the service from a test or a script.
- **Security.** The daemon binds `127.0.0.1` only. One `onRequest` hook in `daemon/src/server.ts` checks `Host` and `Origin` on every HTTP request and WebSocket upgrade, and requires the access-token cookie on `/api` and `/ws`. New routes must stay behind that hook.
- **Status never depends on a viewer.** Shell state comes from `ShellIntegration` (status files written by shell hooks), not from terminal output. Never edit the user's dotfiles; another shell is another class in `daemon/src/shell/integration.ts`.
- **Authorization.** Every route that acts for a bearer token calls `authorize(principal, action, resource)` in `daemon/src/auth.ts`. Add scopes by changing that function, not its callers. `/api` accepts the cookie only. `/v1` accepts a session's bearer token on the agent routes and the signed-in browser's cookie (with the Origin check on anything that changes state) on all of them. A session token must never reach a canvas, layout or other-session route: that decision stays in `authorize`.
- **Canvases.** A session is on at most one canvas; a parked session is on none and remembers where it was (`parkedFrom`). Closing a canvas never ends a shell: the caller says move or park, and the last canvas cannot be closed. Where no canvas is named, `Sessions.canvas(null)` decides (most recently looked at, else first); do not pick a default anywhere else.
- **Public shapes.** Routes under `/v1` use one error shape, `pageOf` for every list, ignore unknown fields, use ISO times, and take `Idempotency-Key` on creates. Do not add a `/v1` route that departs from these. This API is public: only add to it; never rename or remove.
- **Agent hooks** print nothing and always exit 0. Agent settings are generated into the data folder and passed on the command line; never write to an agent's own configuration.
- **Search** of terminal output reads history on demand; no index, no recording.
- **Migration reads; it does not touch what is running, with one exception.** Scanning and listing only read. Nothing edits the user's dotfiles or writes under an agent's own folder; snippets are printed for the user to add. Per-OS process inspection lives in `daemon/src/migrate/shells.ts` only, with parsing as pure functions under test. The single exception is stop-and-resume (`aubergine move --stop` and the panel's button), which may send one termination request (SIGTERM) to an agent process. It must stay limited to the exact process IDs the user selected, verify immediately before that each still is the same Claude Code process (start time from its record against the process table), refuse agents that are not idle unless forced, ask for confirmation, never send a second or stronger signal, and start nothing on the canvas if the process does not exit. Test it only against stand-in processes the test starts itself.
- **Outside terminals.** The panel and the CLI both go through `Outside` in `daemon/src/migrate/outside.ts` and its `/api` routes; do not add a second path. Those routes are cookie-only and must never accept a session token. A request carries only a terminal name and a process ID from the listing; the daemon re-derives the folder, conversation, idle state and process identity before acting, and never uses a folder, command or conversation ID sent by a client.
- **Agent launch line.** Built only by `claudeLaunchLine` from `agents.claudeCommand` in settings plus quoted arguments. The command is trusted configuration typed into the user's shell; it and the agent arguments must never come from anything a session token can send. Conversation IDs must pass `ConversationId` before they are stored or typed.
- **Agent process records** (`~/.claude/sessions`) are an internal detail of the agent: read them only in `daemon/src/migrate/claude-sessions.ts`, validate with zod, and always have a path for "not readable".
- **Showing a session** never changes state and never opens a browser from `--no-attach`, the shell snippet or `import`. Addresses never carry the access token.
- **The shell snippet must always fall through to a normal shell.** Any change to it needs the tests for server up, stopped, hanging and command missing to pass. `here --from-shell-hook` is quiet and reports failure only by exit code.
- **Generated files that start Node** (the shell snippet, the login service, agent settings) take the path from `stableNodePath()` in `daemon/src/node-path.ts`, never `process.execPath`, so they survive a Node upgrade.
- Session IDs are the only user-influenced values that reach a tmux command line, and they are validated as UUIDv7 first. Keep it that way.

### Canvas behaviour

- A terminal takes input only at 100% zoom and only while it has focus. Clicking a zoomed-out node zooms to it first. An unfocused terminal is covered by a shield: the first click focuses it.
- Terminal bodies never drag or pan the canvas. The wheel belongs to a terminal only while it has focus; anywhere else it zooms the canvas.
- **Commands.** Everything a button, a key or the palette does is a command in `web/src/commands.ts`, implemented once. A new action is a new command there and a new name in `COMMAND_IDS` in `shared/src/shortcuts.ts`; a button calls `runCommand`. Do not handle a key anywhere else: `web/src/shortcuts.ts` is the only key listener for commands.
- **Two layers of keys.** A chord works inside a focused terminal only if `belongsToTerminal` says no program there can need it: it includes ⌘ on macOS, or is Ctrl+Shift with a key elsewhere. Everything else (plain keys, Ctrl+key, Alt/Option+key) works only while no terminal, text field, menu or list has the keyboard, whatever the settings file says. Do not weaken that function; its tests list the shell keys that must get through.
- **Keys are data.** Defaults per platform are in `shared/src/shortcuts.ts`; `resolveShortcuts` applies `shortcuts` (and `shortcutsInAppWindow`) from the settings and returns problems, which the sheet and the server log both show. A wrong entry is reported and skipped, never a reason to drop the file. The sheet, the palette and tooltips read keys from the resolved bindings; never write a key into the interface by hand.
- **Do not claim a chord is safe without measuring it.** `docs/keys.md` records what was measured and how; the list of chords browsers keep (`keptByBrowser`) is documented behaviour until someone runs the key tester. Automation cannot measure this: it delivers chords a real key press never would.
- **The browser's tab keys.** Ctrl+Tab and Ctrl+Shift+Tab are the one exception in `belongsToTerminal`: terminal programs do not receive them as distinct keys, so they may switch canvas from inside a terminal. Plain Tab and Shift+Tab in a focused terminal always go to the program. Chords a browser keeps are bound, not refused; whether they arrive is the browser's decision. Function keys work from a text field or a list, never from a terminal; `F6` reaches every group of controls.
- **The side panel is a shell.** It draws registered sections and knows nothing about what they show. A new panel feature is a module in `web/src/panel/sections/` that calls `registerSection`; do not add content to `SidePanel.tsx` or import a section from anywhere else. The detail drawer belongs to the shell: a section declares a drawer by kind and opens it with `openDrawer`; it never draws its own.
- **A new filter is a registered predicate.** `registerFilter` in `web/src/list-filters.ts`, a pure test of one row. Filters combine with AND. Do not filter rows anywhere else, and do not special-case a filter in the component.
- **The list is data first.** Rows, state, filtering, grouping, sorting and windowing are pure functions in `terminal-rows.ts` with tests; the component only draws their result. The list and the commands that move through it both ask `listModel`, so they cannot disagree. Only rows in view are drawn; a change to one session must rebuild one row (there is a test with 1,000 sessions; keep it passing).
- **Row state is derived, never stored.** `rowState` works it out from `status`, `attention` and `state`. Do not add a stored field for "read" or "processing".
- **Times are throttled.** `lastInputAt` and `lastOutputAt` are recorded at most once per `TIMES_INTERVAL_MS` per session, never per keystroke or per line of output. What a terminal sends by itself (`isTerminalReply` in `daemon/src/terminal-replies.ts`) is not input. A test counts the events for a line typed key by key.
- **One implementation each** for notes (`NotePanel`, embedded in the drawer) and for editing tags (`TagDialog`); the list and the node both use them.
- **Tab follows the list.** `select.next` and `select.previous` walk `listModel(...).order`; the default scope is the canvas being looked at so Tab does not change canvas by surprise. A button pressed with the mouse gives the keyboard back to the canvas (also inside the list), so plain keys keep working after a click.
- **Selected is not focused.** `selected` in the store is the terminal that commands act on while none has the keyboard; focusing selects, leaving keeps the selection. Keys typed between asking for a terminal and its having the keyboard are never canvas keys (`settleUntil`).
- A glide that stays at 100% must pan in a straight line (`interpolate: 'linear'`): the default path zooms out on the way and a focused terminal loses the keyboard.
- Closing a node parks its session; it does not end the shell. Ending a shell for good always asks first.
- A node keeps a live terminal (and its WebSocket) only while it is on screen and readable; otherwise it shows a snapshot or nothing. The decision is `nodeMode` in `web/src/culling.ts`.
- Going to a node (`goToNode`) must not depend on animation frames, which stop in a tab that is not showing.
- Only the canvas being looked at mounts terminals or fetches snapshots. The address is `/c/<id>`; pan and zoom are kept per canvas per browser. A request to show a session (`show` in the store) is used once and then cleared. `Viewers` decides which tab is asked to show a session.

### Tests

- Tests that type into a new session must wait for the shell's prompt first (`createReady` / `shellReady` in the daemon tests): a shell discards what is typed while it is starting.
- Tests await `sessions.refresh()`; never leave one running past teardown.
- **Test runs must not share anything on the machine.** Every test file that starts tmux takes its socket name from `testSocketName()` in `daemon/src/test-support.ts` (unique per run) and tears down with `destroyTmuxServer`, which ends only that server. Ports are 0 or per run, data folders are temporary and per run, and the browser test's port, data folder, socket and results folder come from the run ID in `playwright.config.ts`. Two checkouts must be able to run `pnpm check` at the same time.
- Fixtures use made-up values: no process IDs, paths or names copied from a real machine.
- The Playwright test includes a pass made with the keyboard only; keep it mouse-free.
- Runs that stall for minutes inside a short wait mean the machine slept; check `pmset -g log` before changing a test.
- Playwright actions have a 15 s limit; wait for a node to be in view before clicking near it, since a click interrupts the glide.
- Shell-integration tests use a stand-in `ZDOTDIR`; never assert against, or write to, the developer's own startup files. The same goes for the shell snippet tests.

## Checks

```
pnpm check
```

runs, in order: type checking, lint, unit tests (Vitest; the tmux runtime and server tests use a real tmux on test sockets) and the Playwright smoke test (builds the web app and starts a daemon with its own data folder, port and tmux socket). A task is not done until it passes.

Single steps: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`.

`pnpm dev` starts the daemon (port 4600, restarts on change) and the Vite dev server (port 5173, proxies `/api`, `/auth` and `/ws` to the daemon).

`pnpm load-canvas` fills three throwaway canvases with 90 sessions between them for judging scale by hand. It is not part of `pnpm check`.

Environment variables, all optional: `AUBERGINE_PORT`, `AUBERGINE_DATA_DIR`, `AUBERGINE_TMUX_SOCKET`, `AUBERGINE_TMUX_BIN`, `AUBERGINE_DEV_ORIGIN`. Use a separate data folder and socket for experiments so they do not touch real sessions.

## Scope so far

Stage 1: terminals on a canvas (add, drag, resize, rename), pan and zoom, one WebSocket per mounted terminal, sessions and layout that survive a browser reload and a daemon restart, an error page when tmux is missing or older than 3.2.

Stage 2: focus model and canvas shortcuts, wheel scrollback, copy and paste, parked sessions, handling of shells that exit, the session picker, zoom to fit, minimap, live folder and command per session, a Markdown note per session, frames, node colors, snapshots for off-screen and zoomed-out terminals, fresh shells in their last folders after a reboot, the settings file, the `aubergine` command, start at login, a web app manifest.

Stage 3: command status per session from shell hooks (busy or idle, command, exit code, unread output) shown as badges, session-scoped tokens and the first `/v1` routes, a timestamped note log with `aubergine note`, agent hooks that log prompts and raise or clear "waiting for you", the attention queue, and search of terminal output from the picker.

Migration: `aubergine here`, `scan`, `import` and `shell-hook print`, for moving terminals that are already open onto the canvas.

Agents: the launch command setting, pass-through arguments, showing a new session on the canvas, remembered conversations with Resume agent, `aubergine move`, and the Outside terminals panel.

Canvases, stage A: several canvases as tabs, `/v1` canvas routes for the signed-in browser, `aubergine canvas`, `--canvas`.

Keyboard: commands, the palette, two layers of keys, the shortcut sheet, rebinding through `shortcuts` and `shortcutsInAppWindow` in the settings.

Side panel: a Terminals section over every canvas with filters, grouping and sorting, tags, last typed and last updated, a notes preview and drawer; Tab through the list; the browser's tab keys bound to canvases (expected in an app window, unmeasured).

Not built yet: measured key tables for Safari, Firefox, Linux and Windows, API tokens, the activity log, an OpenAPI description and client, terminal input and output over `/v1`, SQLite, an MCP server, presets, a finder agent, recording, bash or fish integration.

## Working in this repo

- One branch per task, small commits.
- Do not change the git identity configured for this repo.
