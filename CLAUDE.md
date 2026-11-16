# Aubergine — project rules

Aubergine is a local, browser-based set of canvases, shown as tabs, where each terminal session is a node you can arrange and use. It is built in small stages; each stage is usable on its own.

## Layout

pnpm workspace, TypeScript in strict mode.

```
shared/   wire protocol (zod schemas), entity types, settings schema, the change-event reducer,
          chords and the command names with their default keys (chords.ts, shortcuts.ts);
          the declarations of every /v1 route (routes.ts), the scope table (access.ts), openapi.ts;
          workflows.ts (entities, element kinds, the step function, what an agent is told, the file
          format), workflow-api.ts (bodies and answers), workflow-templates.ts,
          outputs.ts (output kinds), drafts.ts (drafts, the shelf, what a reviewer reads, the brief), repository.ts, terminal.ts, demo.ts (the labels that mark what the demo made)
daemon/   Fastify HTTP + WebSocket server, tmux session runtime, JSON store, CLI, start-at-login,
          shell integration (src/shell/), agent support (src/agents/), authorization (src/auth.ts),
          migration of existing terminals (src/migrate/), including reading agent
          process records (claude-sessions.ts), moving agent tabs (move.ts) and the
          shared implementation behind the panel and the CLI (outside.ts); the state
          holder (state-hub.ts), the public routes (v1.ts, public-api.ts) and viewers.ts;
          workflows: the service (workflows.ts), the archive of finished runs (run-archive.ts),
          the launcher for sessions (command-path.ts) and the commands (cli/workflow.ts), drafts.ts,
          repository-files.ts (finding and reading, nothing but the file system), repositories.ts
          (offers, acceptance, runs, saving), draft-log.ts,
          terminal-access.ts (reading, typing, run-and-wait, the limits), terminal-redact.ts, input-audit.ts,
          agents/agent-tools.ts (the file an agent is pointed at, and the token made for one session),
          demo.ts (the demo: make, status, remove) and demo/ (the stand-in scripts and the made-up project)
client/   a typed client for the public API, generated from its description; no dependencies;
          may not import from any other package
mcp/      the MCP server (`aubergine mcp`): the public API as tools over standard input and output;
          a client of @aubergine/client and shared/ only; tools.ts (what each tool stands on),
          errors.ts (sentences from the server's codes), quote.ts (other people's text)
web/      Vite + React + @xyflow/react + @xterm/xterm, Zustand for state; the tab bar (TabBar.tsx)
          and canvas addresses (address.ts); the side panel (panel/: SidePanel.tsx, registry.ts,
          sections/), terminal-rows.ts, list-filters.ts, list-model.ts, TagDialog.tsx;
          commands.ts, shortcuts.ts, canvas-actions.ts,
          spatial.ts, palette.ts, and the development-only key-tester.html
          workflows/ (run-model.ts, editor-model.ts, registries.ts, the screens), review/ (registry.ts, ReviewScreen.tsx, drafts-source.ts, repository-source.ts) and
          panel/sections/workflows.tsx, tour/ (registry.ts, steps.ts, Tour.tsx, tour-store.ts, placement.ts), EmptyCanvas.tsx, HelpPanel.tsx
docs/     keys.md: what is known about which keys reach a page; api.md: the API reference (generated)
e2e/      Playwright smoke test
install.sh  the one-line installer; its commands are in daemon/src/cli/install.ts (start, open,
          update, version, uninstall, doctor), its tests in daemon/src/install/*.installtest.ts,
          and scripts/shellcheck.mjs lints it
bin/      the `aubergine` command (a launcher for daemon/src/cli.ts)
```

## The four seams

These are the only abstractions in the code base. Each has exactly one implementation. Do not add another interface until a feature needs it.

1. **Wire protocol** — `shared/src/protocol.ts`. Every message between a client and the daemon is a versioned zod schema: HTTP bodies, change events, terminal WebSocket messages, and the URL paths themselves. The web app reaches the daemon only through `web/src/api.ts` and the terminal socket in `web/src/TerminalView.tsx`. The CLI (`daemon/src/cli.ts`) uses the same HTTP protocol; it does not reach into the daemon's state. Agent-facing routes live under `/v1`, and `SESSION_ENV` names the variables each session receives; `aubergine note` and `aubergine hook` use only those routes. `CreateSessionRequest` also takes `cwd`, `command`, `uniqueName`, `agentContinue` and `agentArgs`. `EventsServerMessage` has a `show` message, which is not a change event. `/v1` also has `PUT …/agent`. The three `/api/v1/outside` routes (list, add, move) and their schemas are part of the protocol too. So are `publicPaths` and the public schemas (`CanvasSummary`, `CanvasDetail`, `pageOf`, `PageQuery`, `IDEMPOTENCY_HEADER`), `PATCH /v1/sessions/<id>` and `tags` on the create requests, `canvasAddress`, the `viewing` message a browser sends on the events socket, `canvasId` on `CreateSessionRequest`, `CreateFrameRequest`, `OutsideTarget` and restore, and `defaultCanvasId` in the state response. Since API tokens: `publicPaths` also has `root`, `sessions`, `session`, `parkSession`, `restoreSession`, `showSession`, `showCanvas`, `sessionNotes`, `events`, `tokens`, `token` and `activity`; `EventsServerMessage` has `show-canvas`; error codes include `too_large` and `rate_limited`; the token, scope, activity and capability schemas are in `shared/src/tokens.ts`. Every `/v1` route is declared once, in `ROUTES` in `shared/src/routes.ts`: address, method, schemas, the action `authorize` is asked, a summary. The server registers handlers from that list (`daemon/src/v1.ts`), and the description of the API (`/v1/openapi.json`), the client and the reference are generated from it by `daemon/src/describe/`.
2. **`SessionRuntime`** — `daemon/src/runtime/runtime.ts`. Owns the running shells: `check`, `create` (folder, shell and `env`), `list` (with each session's folder, command and `activityAt`), `has`, `kill`, `attach(viewer)` → byte stream, `snapshot`, `typeLine`, `search`, `reveal`. Resizing is a method of the attachment that `attach` returns, because a size belongs to a viewer. Implementation: `TmuxRuntime`, one tmux session per session ID on a dedicated socket with the config in `daemon/src/runtime/tmux.conf`; each viewer is one `tmux attach` in its own pseudo-terminal. Sessions must outlive the daemon process. Scrollback, copy (OSC 52) and paste handling live in the runtime and in `TerminalView`, nowhere else, so the runtime can be swapped. For programs it also has `screen`, `lines`, `type`, `press` and `foreground`. Reading is `capture-pane` on the session: it attaches no viewer and changes no size. `type` sends the text as bytes (`send-keys -H`); nothing a caller wrote is ever an argument tmux parses.
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
- **Authorization.** Every route asks `authorize(principal, action, resource)` in `daemon/src/auth.ts` before it looks at the body or looks anything up, so a caller without the right learns nothing from the answer. There are three principals: the signed-in user, a session, an API token. A token's scopes are looked at in `authorize` only; no route checks a scope or the kind of caller. A new action is closed to tokens until one line in the scope table opens it.
- **One principal per request.** A request with an `Authorization` header is judged by that credential alone: a cookie beside it is ignored, and a wrong credential is refused, never retried as the cookie's owner. `/api` and `/ws` take the cookie only.
- **Never by token.** `NEVER_BY_TOKEN` in `auth.ts` lists what no token may do whatever its scopes: creating, listing and revoking tokens, reading the activity log, changing settings, and anything about terminals or processes outside Aubergine. Do not add a scope for any of these.
- **Session tokens do not grow.** A session token may set its own attention, add to its own note log, report its own agent, read and report on the run it is on, read what it was asked to write, propose drafts and read its own drafts, list the workflows its repository offers, and ask what the server can do. Wider access is an API token the owner makes on purpose. A session token must never reach a canvas, layout or other-session route, a run by its ID, a list of runs, a draft by its ID or anyone else's draft, the shelf, a workflow, a repository's files or their text, accepting anything, or starting any run.
- **A token's secret exists once.** It is returned by the create route and never stored, logged or sent again; only its hash is kept, and the hash is not sent to the browser. Comparisons are constant-time. A test searches every file in the data folder for a secret after using it; keep it passing.
- **`sessions:write` starts plain shells.** Starting a session with a command also needs `terminal:input` reaching the new session. Every description of these scopes (README, `SCOPE_MEANING`, the token screen) must say plainly what can run commands.
- **The activity log is not state.** One JSON line per call made with an API token, through the `ActivityLog` interface in `daemon/src/activity.ts`, in its own file with a size cap. It records who, what and how it ended; never the secret, never a request body or query. Nothing else reads or writes that file.
- **Limits** (`api` in settings) are read when the server starts. Refusals use the one error shape: 429 with `Retry-After`, 413.
- **Public routes are walked by tests.** `publicRoutesOf(app)` lists every `/v1` route; the tests try each with a read token, a token without `read`, a token with every scope, and a cross-origin browser. A new route needs no test of its own for these, and must pass them.
- **`GET /v1/events` is the stream for programs** (server-sent events) and leaves token events out; the WebSocket under `/ws` stays the browser's.
- **A run moves in one place.** `stepRun` in `shared/src/workflows.ts` is the only code that knows how a run goes from one state to the next, and `Workflows.apply` in the daemon is the only caller that saves the result. A button, a command and a route all send a report. Do not change a run any other way.
- **Workflow versions are never changed.** Editing a workflow appends a version. A run points at one; do not make a run follow the latest.
- **What an agent is told is one function.** `renderRun`. The preview, the route answers and `aubergine workflow status` all use it; do not build that text anywhere else.
- **Element kinds and run views are registered.** Nothing compares a kind to a name. A new kind is `registerElementKind` in `shared/` and `registerElementView` in the web app; another way of looking at a run is `registerRunView`.
- **Finished runs are not state.** They go to the archive through the `RunArchive` interface, into the archive first and out of the state second, and are read a page at a time. The browser holds live runs only.
- **A report is one event about one run.** Nothing rescans runs on a report. The terminal list is worked out again for a run only while a filter that looks at runs is on (`usesRuns`); a strip listens to its own run.
- **Only fixed sentences are typed.** `KICKOFF_LINE` and `BRIEF_LINE` in `shared/src/workflows.ts` are the only things `Sessions.tell` types for workflows, and the only text added to an agent's launch line. Nothing stored is in them: not a name, not a description, not a comment. What an agent needs to know it reads with a command. A test collects every line typed and compares it with those two. Reporting on a run never types into a terminal, and a token cannot cause typing.
- **`aubergine` in sessions.** The launcher is written to `bin/` in the data folder with `stableNodePath()` and goes at the end of a session's `PATH`, never the front; the zsh integration puts it back only when no `aubergine` is found. No startup file is edited.
- **Workflow files keep what they do not know.** Unknown fields go into `extra` on import and are written out on export; a change to the format needs the round-trip test to pass.
- **Names are plain text.** A workflow's or element's name passes `PlainName`: one line, no control characters, no characters that reverse text direction. Names are printed in terminals and beside buttons.
- **Tightening a stored schema needs a migration.** A state file that no longer passes its schema is set aside and a fresh state is started. So a rule that makes a schema stricter for anything already stored must come with a new state version and a migration that repairs old values, and a test with a fixture of the old file.
- **What is not written by the owner is a draft first.** An agent's or a program's workflow or element enters through `Drafts` and can only leave it through `accept`, which is the owner's alone (`drafts.review` is in `NEVER_BY_TOKEN`). No route starts a run of a draft, lists it among workflows, or renders it as a run's text. Do not add a way round the review screen.
- **The review screen knows no source.** It draws what `registerReviewSource` gives it. A new source of things to review is a module that registers; do not add content to `ReviewScreen.tsx`. Accepting waits until the whole text has been shown (`needsShowAll`).
- **What a reviewer reads is what an agent would be told.** `reviewText` goes through `previewRun`. Do not build that text another way.
- **Output kinds are registered**, in `shared/` (`registerOutputKind`) and in the web app (`registerOutputView`). The note stores nothing beyond the element's `note`.
- **A tick is not a report.** `tickRun` changes ticks and nothing else, and also works on a run that is over, through `RunArchive.amend`; the archive file still only grows, and the later line for a run wins.
- **A workflow made to run one element is unlisted** (`listed: false`), left out of every list, and removed when its run ends.
- **Optional fields of a change carry no defaults.** A body that changes part of something must leave what is not sent as it was; a schema with a default turns "left out" into "empty". Build such bodies from fields without defaults.
- **Commands show control characters.** Text that came from an agent, a token or a file is printed through `showControl`.
- **A token's review switch is decided in `authorize`.** `workflows.write` is refused for a token whose changes need review; nothing else looks at the switch.
- **Repository files are read in one place.** `daemon/src/repository-files.ts` decides what may be read: regular files directly in `.aubergine/workflows/`, a bounded number and size, no link followed, opened with `O_NOFOLLOW`. Do not read a repository's files anywhere else, and do not run Git.
- **A folder is read only as the repository of a session.** A `root` sent by a caller must be the repository of some session's folder now; otherwise 404 before anything is opened.
- **Only accepted content runs.** A repository workflow is run from the content stored with its acceptance, after the file was read again and its hash matched. Never from the file. A changed file is reviewed again. Nothing about a repository's files is cached.
- **The server writes into a repository only when the owner asks**, one file, named by `repositoryFileName`, never replacing one unasked, never through a link. `repository.write` and `repository.review` are in `NEVER_BY_TOKEN` and are not session actions.
- **Owner calls from outside the browser are visible.** `ownerCaller` in `server.ts` tells a page (which sends `Sec-Fetch-Site`) from anything else; the actions in `WATCHED` are recorded in the activity log as `owner-cli`. This is a trace, not a control: do not describe it as protection, and do not let anything depend on it for a decision. Tests that call as the page send `Sec-Fetch-Site`.
- **The record of drafts is not state**, like the activity log: `DraftLog`, its own file, never what a draft said.
- **Sessions know their server**: `AUBERGINE_PORT` and `AUBERGINE_DATA_DIR` are in every session's environment beside the others.
- **Terminal access is two scopes, a reach and a switch, all decided in `authorize`.** `terminal:read` and `terminal:input` are implied by nothing. `authorize` is handed the session's canvas, tags and people-only switch in the resource; do not look them up after it. A session token never has either. A token that holds the scope but whose reach does not cover a session is told `out_of_reach`, and told exactly the same about a session that does not exist.
- **People only is the owner's.** `sessions.protect` is in `NEVER_BY_TOKEN` and is not a session action. No route, field or default may let a token or a session change it.
- **Text is typed as it is, or refused.** `inputProblem` in `shared/src/terminal.ts` is the whole rule. Do not add escapes, key names inside text, or cleaning up: what is not plainly text is refused and nothing of the call is typed. Keys come from `NAMED_KEYS` only.
- **Nothing a caller wrote is on a tmux command line** except as bytes after `-H`, or on standard input.
- **Run-and-wait types only at a shell prompt:** the shell's report says idle and the foreground program is a shell. It never sends a signal or a key to stop anything.
- **Terminal content is not given without `terminal:read` on that session:** `status.commandLine` and prompt entries of the note log are taken out by `withoutTerminalContent`, in the route loop and on the event stream. A new field that carries what a terminal shows or was typed into it goes there.
- **What is typed is never in the activity log.** A length and a fingerprint only. The text goes to `input.log`, through `InputAudit`, only when `terminal.auditInput` is on.
- **A fixed sentence is typed for a run only for the owner or for a token that may type into that session** (`mayKickoff`).
- **Reading must not disturb a viewer.** Keep the test that attaches a viewer and counts what it is sent.
- **Terminal tests.** A token made in a test for anything but reach says `reach: { kind: 'all' }`; the stand-in runtime in `terminal-rules.test.ts` keeps everything it is asked to type, and the walks there must stay empty.
- **The MCP server decides nothing.** A tool names the route it stands on; whether it is listed comes from the access the description gives that route (`OPERATIONS[…].access`) and from what `GET /v1` says the caller is. Do not write a scope's name into `mcp/`, and do not refuse a call there for a reason of permission: pass it on and turn the server's answer into a sentence.
- **`mcp/` may import `@aubergine/client` and `shared/`, never the daemon.** ESLint enforces it.
- **Nothing but protocol messages on standard output** from `aubergine mcp`, whatever fails. Diagnostics go to standard error and never include a credential. The command never reads the owner's access file. Keep the tests that read every byte.
- **Other people's text is quoted.** What a terminal shows, a note, a search match and a command's output go through `quoted` (a mark made for that answer, a line saying it is data, `showControl`). A new tool that returns such text does the same and says so in its description. Quoting lowers the chance that a model takes such text for instructions; it does not remove it, and nothing may rely on it as a control.
- **Both forms of an answer say the same.** The structured form carries the whole text. Do not put anything a model needs into one form only.
- **No tool for what stays the owner's**: tokens, settings, people only, accepting or discarding drafts, accepting repository workflows, the activity log.
- **A token for an agent is made only by the owner's own request to start that session** (`agentTools` on the cookie-only create route). No `/v1` route, no token and no session can cause one. It has review of workflow changes on, belongs to one session (`ApiToken.sessionId`), and is revoked when that session is ended for good.
- **An agent's secret is in one file**: `agents/mcp/<session id>.json` in the data folder, mode 600, passed with `--mcp-config`. Never on the launch line, in the state, in an event or in a log. Ending the session, revoking the token and the sweep at start each remove it. The agent's own configuration is never written.
- **A field that needs a further permission is declared** (`fieldAlso` on the route), and for a route that makes a session the question is asked about the session being made. `sessions:write` alone starts plain shells; a `command` needs `terminal:input` whose reach covers the new session.
- **`out_of_reach` is said the same about a session that is not there.** Do not let that answer differ.
- **`X-Aubergine-Client` is a trace.** It is recorded as given and nothing is decided by it.
- **The MCP SDK versions are pinned exactly.** The protocol and the SDK change often: read their current documentation before changing `mcp/`, and say in the hand-over which versions and pages.
- **The demo is stand-ins only.** No real agent, no network, nothing outside `demo/` in the data folder. Its scripts are in `daemon/demo/`, are plain `sh`, pass shellcheck, and use only the commands a real agent uses. Do not give them a private way in.
- **The demo adds a canvas and its sessions, and nothing to the owner's workflows, shelf or tokens.** Its runs are of workflows made for them alone. What it made is written on its canvas's labels as it is made; removal reads those and removes exactly that. Keep the test that compares the state file before making it and after removing it.
- **`demo.manage` is the owner's**: in `NEVER_BY_TOKEN`, cookie-only routes, not a session action.
- **The demo types nothing of its own.** A stand-in is started by the `command` of its new session, like any other. Do not add a path that types into a terminal for the demo.
- **Tour steps are registered.** A step is `registerTourStep`: what it points at, what counts as done, at most two short sentences, a one-line reminder. Do not add content to `Tour.tsx`, and do not name a key combination in a step. The help panel reads the same registry.
- **A tour step waits for the real action.** Where the state does not show that something was done, the place it happens calls `tourSignal`; do not complete a step on a timer or on a click of the card.
- **The tour never blocks.** Its ring takes no clicks, its card is not a dialog and keeps off the buttons of whatever is open (`placement.ts`). It uses timers, not animation frames.
- **Nothing about the tour leaves the browser.** Whether it was finished or put away is one `localStorage` entry. No request, no log.
- **An empty canvas offers three ways to begin**, and its panel must not take clicks meant for the toolbar.
- **Canvases.** A session is on at most one canvas; a parked session is on none and remembers where it was (`parkedFrom`). Closing a canvas never ends a shell: the caller says move or park, and the last canvas cannot be closed. Where no canvas is named, `Sessions.canvas(null)` decides (most recently looked at, else first); do not pick a default anywhere else.
- **Public shapes.** Routes under `/v1` use one error shape, `pageOf` for every list, ignore unknown fields, use ISO times, and take `Idempotency-Key` on creates. Do not add a `/v1` route that departs from these. This API is public: only add to it; never rename or remove.
- **A `/v1` route is a declaration and a handler.** Add the entry to `ROUTES` and a handler of the same name in `v1.ts`. Do not call `app.get`/`app.post` for anything under `/v1`: a route registered by hand is not in the description, and the tests fail on it. A handler does not decide who may call it and does not parse its own input; the loop does both, in the order parameters, `authorize`, query and body, handler.
- **The scope table is in `shared/src/access.ts`.** `authorize` and the description both read it. A new action is a line there; a scope is never written into a route, a handler or the docs.
- **Generated files are committed and never edited.** `client/src/generated.ts` and `docs/api.md` are written by `pnpm generate` from the declarations. After changing a route or a schema, run it and commit the result; `pnpm check` fails otherwise. Nothing is generated at install time.
- **Schemas must be describable.** A schema used by a `/v1` route has to survive `z.toJSONSchema`: use `.overwrite` rather than `.transform` to tidy a value, and `.describe()` for what a field means.
- **Answers match their declarations.** Under the test runner every `/v1` answer is checked against its route's response schema, so a handler that returns something else fails whichever test calls it.
- **The client has no dependencies** and uses only `fetch`. Its hand-written part is `client/src/runtime.ts`; everything about particular routes is generated. The command line and the web app make their `/v1` calls through it.
- **Agent hooks** print nothing and always exit 0. Agent settings are generated into the data folder and passed on the command line; never write to an agent's own configuration.
- **Search** of terminal output reads history on demand; no index, no recording.
- **Migration reads; it does not touch what is running, with one exception.** Scanning and listing only read. Nothing edits the user's dotfiles or writes under an agent's own folder; snippets are printed for the user to add. Per-OS process inspection lives in `daemon/src/migrate/shells.ts` only, with parsing as pure functions under test. The single exception is stop-and-resume (`aubergine move --stop` and the panel's button), which may send one termination request (SIGTERM) to an agent process. It must stay limited to the exact process IDs the user selected, verify immediately before that each still is the same Claude Code process (start time from its record against the process table), refuse agents that are not idle unless forced, ask for confirmation, never send a second or stronger signal, and start nothing on the canvas if the process does not exit. Test it only against stand-in processes the test starts itself.
- **Outside terminals.** The panel and the CLI both go through `Outside` in `daemon/src/migrate/outside.ts` and its `/api` routes; do not add a second path. Those routes are cookie-only and must never accept a session token. A request carries only a terminal name and a process ID from the listing; the daemon re-derives the folder, conversation, idle state and process identity before acting, and never uses a folder, command or conversation ID sent by a client.
- **Agent launch line.** Built only by `claudeLaunchLine` from `agents.claudeCommand` in settings plus quoted arguments. The command is trusted configuration typed into the user's shell; it and the agent arguments must never come from anything a session token can send. Conversation IDs must pass `ConversationId` before they are stored or typed.
- **Agent process records** (`~/.claude/sessions`) are an internal detail of the agent: read them only in `daemon/src/migrate/claude-sessions.ts`, validate with zod, and always have a path for "not readable".
- **Showing a session** never changes state and never opens a browser from `--no-attach`, the shell snippet or `import`. Addresses never carry the access token.
- **The shell snippet must always fall through to a normal shell.** Any change to it needs the tests for server up, stopped, hanging and command missing to pass. `here --from-shell-hook` is quiet and reports failure only by exit code.
- **Generated files that start Node** (the shell snippet, the login service, agent settings) take the path from `stableNodePath()` in `daemon/src/node-path.ts`, never `process.execPath`, so they survive a Node upgrade.
- **The installer changes two things only**: the install folder (`~/.aubergine`, or `AUBERGINE_HOME`) and one link named `aubergine`. It never uses `sudo`, never writes a shell startup file, never installs Node, pnpm or tmux, never touches the data folder, and replaces nothing at the link's place that is not its own link. It stays POSIX `sh`, with its whole body in a function called on the last line. Every check runs before anything is changed.
- **`uninstall` removes only what the installer made**: links that point at this copy, and the copy's folder only when `.installed-by-installer` is beside it. Never a checkout someone made, never the data folder, never a session.
- **`open` does not print the access token** unless asked with `--print`.
- The launcher (`bin/aubergine.mjs`) passes signals on to the command it starts; keep it that way so stopping `aubergine start` stops the server.
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
- **Installer and command tests never touch the real machine**: a temporary `HOME`, a `PATH` made of links to individual tools (never a real bin folder, which may contain `brew`), a test port and a test tmux socket. Tests that keep the machine busy (`*.installtest.ts`, `*.busytest.ts`) run as their own step, not beside the daemon tests.
- Fixtures use made-up values: no process IDs, paths or names copied from a real machine.
- The Playwright test includes a pass made with the keyboard only; keep it mouse-free.
- Runs that stall for minutes inside a short wait mean the machine slept; check `pmset -g log` before changing a test.
- Playwright actions have a 15 s limit; wait for a node to be in view before clicking near it, since a click interrupts the glide.
- Shell-integration tests use a stand-in `ZDOTDIR`; never assert against, or write to, the developer's own startup files. The same goes for the shell snippet tests.

## Checks

```
pnpm check
```

runs, in order: type checking, lint, shellcheck on `install.sh` where it is installed (it skips with a note where it is not), unit tests (Vitest; the tmux runtime and server tests use a real tmux on test sockets) and the Playwright smoke test (builds the web app and starts a daemon with its own data folder, port and tmux socket). A task is not done until it passes.

Single steps: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm generate` (and `pnpm generate --check`, which `pnpm check` runs first).

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

Install: `install.sh`, and `aubergine start`, `open`, `update`, `version`, `doctor`, `uninstall`.

API tokens (stage B1): tokens with scopes (`daemon/src/tokens.ts`), the management routes under `/v1` open to tokens, the activity log (`daemon/src/activity.ts`), rate and size limits (`daemon/src/rate-limit.ts`), the capability endpoint `GET /v1`, the token and activity screens (`web/src/TokenScreen.tsx`), and `aubergine token`. The state file is version 3: it also holds API tokens, of which only a hash of the secret. Change events also include `token.created`, `token.revoked` and `token.used`.

Stage B2: every `/v1` route declared once, the OpenAPI description at `/v1/openapi.json`, the generated client in `client/`, the generated reference in `docs/api.md`.

Workflows, stage W1a: workflows with versions, runs moved by one step function, the routes and the two scopes, the archive of finished runs, `aubergine workflow`, the command on every session's `PATH`, four templates, the Workflows screen and editor, the run dialog, the strip, the Workflows panel section and the run view. The state file is version 4: it also holds workflows and the runs still going. Change events also include `workflow.changed`, `workflow.removed`, `run.started`, `run.moved` and `run.finished`.

Workflows, stage W1b: drafts and the review screen, asking an agent for an element or a workflow, needs, output kinds (note, checklist) with ticks, running one element by itself, the shelf, the per-token review switch. The state file is version 5: it also holds drafts and the shelf of elements. Change events also include `draft.changed`, `draft.removed`, `shelf.changed` and `shelf.removed`.

Workflows kept in a repository: found by walking up, read with bounds and without following links, reviewed before use and again on change, saved only by the owner. A record of resolved drafts. Owner calls from the command line in the activity log. The state file is version 6: it also holds the repository workflows the owner accepted, each with the content that was accepted. Change events also include `repository.accepted` and `run.ticked`.

Stage C part 1: terminal access over the API: reading the screen and output, search, input, run-and-wait, the two scopes, the reach, people only, the recording and the audit file, the limits, the commands. The state file is version 7: sessions may be people only and remember which token typed last; a token may carry which sessions its terminal scopes reach. Change events also include `session.protected` and `session.typed`.

Stage C part 2: the MCP server (`mcp/`, `aubergine mcp`), tools listed by what the credential may do, refusals as sentences, quoted terminal content, the client header in the activity log, the choice of tools when starting Claude Code, the token made for one agent session and its file. Error codes also include `out_of_reach`. A token may belong to a session.

The first five minutes: `aubergine demo` (a canvas of stand-ins, made and removed whole), the tour (eight registered steps on the demo), the start card of an empty canvas, the Help panel, `aubergine` by itself saying where to begin. Commands also include `tour.start`, `demo.remove` and `help.show`.

Not built yet: a packaged build without development dependencies, Linux tested, measured key tables for Safari, Firefox, Linux and Windows, publishing the client as a package, moving the remaining `/api/v1` routes onto `/v1`, the workflow library, the board of runs, approvals, branches, a pool of agents, a list of past runs in the browser, waiting for output, changing a token's reach, SQLite, an HTTP transport for the MCP server, presets, a finder agent, recording, bash or fish integration.

## Working in this repo

- One branch per task, small commits.
- Do not change the git identity configured for this repo.
