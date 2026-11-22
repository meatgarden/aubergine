# Aubergine in a container: the server, its terminals and the `aubergine` command.
#
# Run once on 2026-11-22, on an Apple-silicon Mac with Docker in Colima (linux/arm64), under
# https://aubergine.localhost with the web server's own certificate. Not tried: a real name with a
# public certificate, a cloud machine, linux/amd64 beyond the release workflow's trial (built, the server
# started and made a terminal, on a GitHub runner). See "In a container" in docs/remote.md.
#
# Built from this checkout (the build context is the repository's root, see docker/compose.yaml),
# by the repository's own package script, scripts/npm-package.mjs: not from the npm registry,
# whose package may be older than the checkout.
#
# Debian with glibc, not Alpine: the terminal library (node-pty) is compiled here against glibc,
# and the same Debian release (bookworm) is used in both stages so the compiled part fits.

ARG NODE_MAJOR=22

# ---------- Build: the npm package from this checkout, installed into /opt/aubergine ----------
FROM node:${NODE_MAJOR}-bookworm AS build

# node-pty 1.1.0 ships ready-made binaries for macOS and Windows only (its prebuilds/ folder has
# darwin-* and win32-*), so on Linux its install script compiles it with node-gyp: Python 3, make
# and a C++ compiler. The full node image is meant to have them; they are named here so that it
# does not depend on that. node-gyp also downloads Node's headers while it builds.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# pnpm at exactly the version in package.json's "packageManager". Corepack is in Node 22, but
# whether the copy in a given image can fetch and verify this pnpm depends on that copy's version;
# npm installs the exact version with nothing else involved.
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"

# The manifests and the lockfile first, so that installing the dependencies is cached until one
# of them changes. The root's postinstall runs scripts/fix-node-pty.mjs, so it comes too.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY mcp/package.json mcp/
COPY daemon/package.json daemon/
COPY web/package.json web/
COPY scripts/fix-node-pty.mjs scripts/
RUN pnpm install --frozen-lockfile

# Everything else (.dockerignore keeps out what the build does not read). The package script
# builds the web app itself (pnpm build) and needs nothing built before it but the dependencies.
COPY . .
RUN node scripts/npm-package.mjs --pack

# Installed here, where the compiler is, from the packed file and never from the registry by
# name. npm runs the package's install scripts, so node-pty is compiled for this system. Its
# dependencies come from the registry at the ranges in its package.json, as for the published
# package: not pinned by the lockfile.
RUN npm install -g --prefix /opt/aubergine ./dist/*.tgz
# The build fails here, not at the first terminal, if node-pty was not compiled.
RUN node -e "require('node:module').createRequire('/opt/aubergine/lib/node_modules/@meatgarden/aubergine/package.json')('node-pty')"


# ---------- Run ----------
FROM node:${NODE_MAJOR}-bookworm-slim

# What the server and the `aubergine` command start, each found by reading the code:
#   tmux             required: every terminal is a tmux session (daemon/src/runtime/tmux-runtime.ts).
#                    Debian bookworm has 3.3a; 3.2 or newer is needed.
#   zsh              the login shell of every terminal; command status comes from the zsh
#                    integration only (daemon/src/shell/integration.ts).
#   ncurses-term     terminfo entries beyond the minimal set, so that the tmux-256color that
#                    tmux.conf sets for the shells is known whichever package holds it.
#   git              working copies and library sources from Git (daemon/src/git/run.ts; 2.31 or
#                    newer, bookworm has 2.39), and your own clones.
#   openssh-client   for git over ssh.
#   ca-certificates  for git over https, and npm installing an agent's command.
#   procps           ps: `aubergine here`, `scan` and `move` read the process table with it
#                    (daemon/src/migrate/shells.ts, migrate/move.ts, cli.ts). The slim image has none.
#   less             the pager git and many tools expect.
# Left out: gh (optional; looking up a pull request is silent without it), xdg-open and the macOS
# programs (open, launchctl, lsof: macOS only), an editor (`aubergine workflow edit` uses $EDITOR,
# else vi), and any compiler.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tmux zsh ncurses-term git openssh-client ca-certificates procps less \
 && rm -rf /var/lib/apt/lists/*

# C.UTF-8 is part of glibc on Debian, so no locales package is needed.
ENV LANG=C.UTF-8

COPY --from=build /opt/aubergine /opt/aubergine
# The command on the PATH, as a link to the package's own bin/aubergine.mjs, which is what
# `aubergine doctor` looks for.
RUN ln -s /opt/aubergine/lib/node_modules/@meatgarden/aubergine/bin/aubergine.mjs /usr/local/bin/aubergine \
 && node -e "require('node:module').createRequire('/opt/aubergine/lib/node_modules/@meatgarden/aubergine/package.json')('node-pty')"

# The node image has a user `node` at uid 1000. It is removed, and `aubergine` made in its place
# at the same uid, so that the home, the shell and the name are this image's own.
RUN userdel --remove node \
 && if getent group node >/dev/null; then groupdel node; fi \
 && groupadd --gid 1000 aubergine \
 && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/aubergine --shell /bin/zsh aubergine \
 && install -d -o aubergine -g aubergine -m 755 /home/aubergine/.npm-global /home/aubergine/.npm-global/bin

# Made executable by a RUN of its own, not with COPY --chmod: that option needs BuildKit, and
# Compose without the buildx plugin builds with the classic builder, which refuses it.
COPY docker/entrypoint.sh /usr/local/bin/aubergine-entrypoint
RUN chmod 755 /usr/local/bin/aubergine-entrypoint

ENV SHELL=/bin/zsh
# `npm install -g` as this user (an agent's command, say) lands in the home volume, without root.
# That folder is at the end of the PATH, so the image's own `aubergine` is the one found first.
ENV NPM_CONFIG_PREFIX=/home/aubergine/.npm-global
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/aubergine/.npm-global/bin
ENV AUBERGINE_PORT=4600

USER aubergine
WORKDIR /home/aubergine

# Your work and Aubergine's data: the data folder is ~/.local/share/aubergine inside it
# (dataDir() in daemon/src/paths.ts, on Linux). Nothing may change the home after this line.
VOLUME /home/aubergine

# No EXPOSE: the server listens on 127.0.0.1 only, and its port is never published. The web server
# shares this container's network (docker/compose.yaml). The check runs inside, where 127.0.0.1 is
# the server; the page's own address answers without a sign-in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.AUBERGINE_PORT || 4600) + '/', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Run with an init process (compose.yaml says `init: true`; with `docker run`, pass --init): tmux
# and the shells are children that must be reaped. `aubergine start` runs in the foreground and
# opens no browser.
ENTRYPOINT ["/usr/local/bin/aubergine-entrypoint"]
CMD ["aubergine", "start"]
