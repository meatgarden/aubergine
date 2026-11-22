# Contributing to Aubergine

Thank you for looking. Bug reports, measurements of keys in a browser, and small, focused pull requests are all
welcome.

## Ways to help that need no code

- **Report a bug** with the [bug form](https://github.com/thirstyeggplant/aubergine/issues/new/choose). The output of
  `aubergine doctor` says most of what is needed.
- **Try it on Linux.** It has been run only in the container in [`docker/`](docker). Telling us what works on your
  machine, and what does not, is worth a lot.
- **Measure keys in your browser.** Which chords reach a page is documented behaviour, not measured, for Safari,
  Firefox, Linux and Windows. [docs/keys.md](docs/keys.md) has a page to measure your own browser with.
- **Say what was hard** in the first five minutes, in an issue. The demo and the tour are meant to make it easy.

Look for issues labelled `good first issue` and `help wanted`.

## Setting up

You need tmux 3.2 or newer, Node.js 22 or newer and pnpm (the version is in `package.json`, under `packageManager`).
On macOS, `brew install tmux node pnpm`. On Linux, node-pty is compiled when it is installed, which needs Python 3,
make, a C++ compiler and `node-gyp` (`npm install -g node-gyp`).

```sh
git clone https://github.com/thirstyeggplant/aubergine.git
cd aubergine
pnpm install
pnpm exec playwright install chromium   # once, for the browser test
pnpm dev                                # the server on :4600 and the web app on http://127.0.0.1:5173
```

Use a data folder and a tmux socket of their own for experiments, so they do not touch your real terminals:

```sh
AUBERGINE_DATA_DIR=/tmp/aubergine-dev AUBERGINE_TMUX_SOCKET=aubergine-dev AUBERGINE_PORT=4700 pnpm dev
```

## Before a pull request

```sh
pnpm check
```

runs type checking, lint, shellcheck, the check of generated files, the unit tests (with a real tmux on test sockets)
and the browser smoke test. A change is ready when it passes; the same check runs on every pull request.

- **One branch per change, small commits.** A commit message is a plain sentence that says what is now true, as in
  the history.
- **Generated files are committed, never edited.** After changing a `/v1` route or a schema, run `pnpm generate` and
  commit the result (`client/src/generated.ts`, `docs/api.md`, `docs/for-agents.md`, `docs/element.md`).
- **The state file has a version.** A change of its shape needs a migration and a fixture of the old file under test.
- **The look is in tokens.** Sizes, colours, spaces and layers come from `web/src/tokens.css`; see
  [docs/design.md](docs/design.md). `web/src/ui/design.test.ts` fails on a number where a token belongs.
- **Security rules are not loosened in passing.** The server binds `127.0.0.1` only, every route is behind one hook
  and asks `authorize`, and what a token may do is one table (`shared/src/access.ts`). A change to any of these is a
  pull request of its own, with its reason.

[CLAUDE.md](CLAUDE.md) holds every rule of the code base: the layout, the four seams (the wire protocol, the session
runtime, the store and change events), and why each rule is there. It is written for people and coding agents
alike; read the parts that touch what you change.

## Reporting a security problem

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## Conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE), like the rest of
Aubergine.
