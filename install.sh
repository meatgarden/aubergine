#!/bin/sh
# Installs Aubergine for the current user:
#
#   curl -fsSL https://raw.githubusercontent.com/meatgarden/aubergine/main/install.sh | sh
#
# It needs Node.js 22 or newer, pnpm, tmux 3.2 or newer, and git (or curl and
# tar). It does not install those. It never uses sudo, never edits your shell
# startup files, and writes only to the install folder (~/.aubergine by
# default) and one link named "aubergine".
#
#   --dry-run   say what would be done and change nothing
#
#   AUBERGINE_HOME   the folder to install under (default: ~/.aubergine)
#   AUBERGINE_REF    the branch or tag to install (default: main)
#   AUBERGINE_REPO   where the code comes from (default: the public repository)
#
# Everything is inside one function that is called on the last line, so a
# download that was cut off runs nothing.

set -eu

main() {
  DRY_RUN=0
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=1 ;;
      -h | --help)
        say "Installs Aubergine for the current user, under ~/.aubergine, and links the \"aubergine\" command."
        say "  --dry-run        say what would be done and change nothing"
        say "  AUBERGINE_HOME   the folder to install under (default: ~/.aubergine)"
        say "  AUBERGINE_REF    the branch or tag to install (default: main)"
        say "  AUBERGINE_REPO   where the code comes from (default: the public repository)"
        exit 0
        ;;
      *)
        fail "Unknown option: $arg (the only option is --dry-run)"
        ;;
    esac
  done

  REPO="${AUBERGINE_REPO:-https://github.com/meatgarden/aubergine}"
  REF="${AUBERGINE_REF:-main}"
  BASE="${AUBERGINE_HOME:-$HOME/.aubergine}"
  APP="$BASE/app"
  TARGET="$APP/bin/aubergine.mjs"

  say "Aubergine installer"
  check_tools
  choose_link_dir

  say ""
  say "This will:"
  if [ -d "$APP/.git" ]; then
    say "  1. update the code in $APP (branch or tag: $REF)"
  elif [ "$HAVE_GIT" = 1 ]; then
    say "  1. download the code into $APP with git (branch or tag: $REF)"
  else
    say "  1. download the code into $APP as an archive (branch or tag: $REF)"
  fi
  say "  2. install its dependencies and build the web app there (pnpm install, pnpm build)"
  if [ "$LINK_STATE" = foreign ]; then
    say "  3. leave $LINK alone: something that is not this installer's link is already there"
  elif [ "$LINK_ON_PATH" = 1 ]; then
    say "  3. link the command: $LINK -> $TARGET"
  else
    say "  3. create $LINK_DIR and link the command: $LINK -> $TARGET"
  fi
  say "It will not use sudo, edit your shell startup files, or touch your Aubergine data."
  say ""

  if [ "$DRY_RUN" = 1 ]; then
    say "Dry run: nothing was changed."
    exit 0
  fi

  get_code
  # So that "aubergine uninstall" knows this folder is the installer's to remove.
  : >"$BASE/.installed-by-installer"
  build
  link_command
  finish
}

say() {
  printf '%s\n' "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

# How to get a tool on this system, as one or two lines of advice.
how_to_get() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
      say "      With Homebrew:  brew install $1"
      ;;
    Linux)
      say "      With your package manager, for example:"
      say "        sudo apt install $2    (Debian, Ubuntu)"
      say "        sudo dnf install $2    (Fedora)"
      say "        sudo pacman -S $2      (Arch)"
      ;;
    *)
      say "      Install it with your system's package manager."
      ;;
  esac
  say "      No admin rights? See \"Without admin rights\" in the README:"
  say "        https://github.com/meatgarden/aubergine#without-admin-rights"
}

# Stops, having changed nothing, unless everything Aubergine needs is there.
check_tools() {
  problems=0

  if ! have node; then
    problems=$((problems + 1))
    say ""
    say "  x Node.js is not installed (version 22 or newer is needed)."
    how_to_get node nodejs
  elif ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
    problems=$((problems + 1))
    say ""
    say "  x Node.js $(node -p 'process.versions.node' 2>/dev/null || echo '(unknown version)') is too old: version 22 or newer is needed."
    how_to_get node nodejs
  fi

  if ! have pnpm; then
    problems=$((problems + 1))
    say ""
    say "  x pnpm is not installed."
    if have corepack; then
      say "      It comes with Node.js:  corepack enable pnpm"
      say "      (or, without admin rights:  corepack enable --install-directory ~/.local/bin pnpm)"
    fi
    how_to_get pnpm pnpm
  fi

  TMUX_BIN="${AUBERGINE_TMUX_BIN:-tmux}"
  if ! have "$TMUX_BIN"; then
    problems=$((problems + 1))
    say ""
    say "  x tmux is not installed (version 3.2 or newer is needed). Aubergine keeps every terminal running inside it."
    how_to_get tmux tmux
    say "      If tmux is somewhere unusual, say where:  AUBERGINE_TMUX_BIN=/path/to/tmux"
  else
    tmux_version="$("$TMUX_BIN" -V 2>/dev/null || echo unknown)"
    tmux_numbers="$(printf '%s\n' "$tmux_version" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\.\([0-9][0-9]*\).*$/\1 \2/p')"
    if [ -z "$tmux_numbers" ]; then
      say "  ? Could not read the version of tmux (\"$tmux_version\"); carrying on. Aubergine needs 3.2 or newer."
    else
      tmux_major="${tmux_numbers% *}"
      tmux_minor="${tmux_numbers#* }"
      if [ "$tmux_major" -lt 3 ] || { [ "$tmux_major" -eq 3 ] && [ "$tmux_minor" -lt 2 ]; }; then
        problems=$((problems + 1))
        say ""
        say "  x $tmux_version is too old: version 3.2 or newer is needed."
        how_to_get tmux tmux
      fi
    fi
  fi

  HAVE_GIT=0
  if have git; then
    HAVE_GIT=1
  elif ! have curl || ! have tar; then
    problems=$((problems + 1))
    say ""
    say "  x Neither git, nor curl together with tar, is installed. One of the two is needed to download the code."
    how_to_get git git
  fi

  if [ "$problems" -gt 0 ]; then
    say ""
    fail "Nothing was installed or changed. Install what is missing above and run this again."
  fi
  if [ "$HAVE_GIT" = 1 ]; then
    downloader="git"
  else
    downloader="curl and tar"
  fi
  say "Found Node.js $(node -p 'process.versions.node'), pnpm, tmux, and $downloader."
}

on_path() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Picks the folder for the link: the first folder on PATH that the user may
# write to, out of Homebrew's, ~/.local/bin and ~/bin. With none, ~/.local/bin
# is created, and the user is told the one line that puts it on PATH.
choose_link_dir() {
  LINK_DIR=""
  LINK_ON_PATH=0
  brew_bin=""
  if have brew; then
    brew_bin="$(brew --prefix 2>/dev/null || true)/bin"
  fi
  for dir in "$brew_bin" "$HOME/.local/bin" "$HOME/bin"; do
    if [ -n "$dir" ] && [ "$dir" != "/bin" ] && [ -d "$dir" ] && [ -w "$dir" ] && on_path "$dir"; then
      LINK_DIR="$dir"
      LINK_ON_PATH=1
      break
    fi
  done
  if [ -z "$LINK_DIR" ]; then
    LINK_DIR="$HOME/.local/bin"
    if on_path "$LINK_DIR"; then
      LINK_ON_PATH=1
    fi
  fi
  LINK="$LINK_DIR/aubergine"

  # What is at the place of the link now: nothing, our link, or something else.
  LINK_STATE=free
  if [ -L "$LINK" ]; then
    if [ "$(readlink "$LINK")" = "$TARGET" ]; then
      LINK_STATE=ours
    else
      LINK_STATE=foreign
    fi
  elif [ -e "$LINK" ]; then
    LINK_STATE=foreign
  fi
}

# A local folder is given to git as a file:// address, so that a shallow copy is made of it too.
source_address() {
  case "$REPO" in
    /*) printf 'file://%s\n' "$REPO" ;;
    *) printf '%s\n' "$REPO" ;;
  esac
}

get_code() {
  mkdir -p "$BASE"
  if [ -d "$APP/.git" ]; then
    say "Updating the code in $APP ..."
    # Not --depth 1 here: the new commits must connect to the copy that is there, or it is not a fast-forward.
    if [ -n "$(git -C "$APP" status --porcelain 2>/dev/null)" ]; then
      fail "The code in $APP has been changed by hand, so it was not updated. Undo the changes (git -C \"$APP\" status shows them) or remove that folder, and run this again."
    fi
    git -C "$APP" fetch --quiet origin "$REF" || fail "Could not fetch \"$REF\" from $(git -C "$APP" remote get-url origin 2>/dev/null || echo origin)."
    git -C "$APP" merge --quiet --ff-only FETCH_HEAD || fail "The code in $APP could not be brought up to date. Remove that folder and run this again; your data is kept elsewhere and is not affected."
    return 0
  fi

  if [ -e "$APP" ] && [ ! -f "$APP/.installed-from-archive" ]; then
    fail "$APP already exists and was not put there by this installer. Move it away, or choose another place with AUBERGINE_HOME, and run this again."
  fi

  if [ "$HAVE_GIT" = 1 ]; then
    say "Downloading the code into $APP ..."
    git clone --quiet --depth 1 --branch "$REF" "$(source_address)" "$APP" || fail "Could not download \"$REF\" from $REPO."
    return 0
  fi

  # No git: fetch an archive of the branch, unpack it beside the old copy, then swap.
  archive="${AUBERGINE_ARCHIVE:-$REPO/archive/$REF.tar.gz}"
  say "Downloading the code into $APP (archive) ..."
  fresh="$BASE/app.new.$$"
  rm -rf "$fresh"
  mkdir -p "$fresh"
  if ! curl -fsSL "$archive" | tar -xz -C "$fresh" --strip-components 1; then
    rm -rf "$fresh"
    fail "Could not download and unpack $archive."
  fi
  if [ ! -f "$fresh/bin/aubergine.mjs" ]; then
    rm -rf "$fresh"
    fail "What was downloaded from $archive is not Aubergine."
  fi
  : >"$fresh/.installed-from-archive"
  rm -rf "$APP"
  mv "$fresh" "$APP"
}

build() {
  if [ "${AUBERGINE_SKIP_BUILD:-0}" = 1 ]; then
    say "Skipping the dependencies and the build (AUBERGINE_SKIP_BUILD=1)."
    return 0
  fi
  say "Installing dependencies ..."
  (cd "$APP" && pnpm install --frozen-lockfile) || fail "pnpm install failed in $APP. Nothing else was changed; fix what it reported and run this again."
  say "Building the web app ..."
  (cd "$APP" && pnpm build) || fail "pnpm build failed in $APP. Nothing else was changed; fix what it reported and run this again."
}

link_command() {
  LINKED=0
  if [ "$LINK_STATE" = foreign ]; then
    say ""
    say "Not linked: $LINK already exists and is not this installer's link, so it was left alone."
    say "Remove or rename it and run this again, or run the command by its full path:"
    say "  $TARGET"
    return 0
  fi
  mkdir -p "$LINK_DIR"
  ln -sf "$TARGET" "$LINK"
  LINKED=1
}

# The file a shell reads at start, for the hint about PATH. It is only named, never written.
startup_file() {
  case "${SHELL:-}" in
    */zsh) printf '%s\n' "$HOME/.zshrc" ;;
    */bash) printf '%s\n' "$HOME/.bashrc" ;;
    *) printf '%s\n' "$HOME/.profile" ;;
  esac
}

finish() {
  say ""
  say "Aubergine is installed in $APP."
  if [ "$LINKED" = 1 ]; then
    say "The command is $LINK."
    if [ "$LINK_ON_PATH" != 1 ]; then
      say ""
      say "$LINK_DIR is not on your PATH yet, so your shell will not find \"aubergine\"."
      say "Add this line to $(startup_file) and open a new terminal:"
      say ""
      # The user is meant to see $HOME and $PATH as written, not their values.
      # shellcheck disable=SC2016
      say '  export PATH="$HOME/.local/bin:$PATH"'
      say ""
      say "Until then, use the full path: $LINK"
    fi
  fi
  say ""
  say "Next:"
  say "  aubergine start    starts the server; leave it running"
  say "  then open the sign-in link it prints, once per browser"
  say "  (or:  aubergine start --open  to open the browser for you)"
  say ""
  say "To update later: aubergine update, or run this installer again."
}

main "$@"
