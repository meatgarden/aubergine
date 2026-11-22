#!/bin/sh
# Runs before the server in the container (docker/Dockerfile). Run once, on a Mac with Colima: see
# "In a container" in docs/remote.md.
#
# It does two things, each only when the thing is missing, and never replaces a file:
#   1. ~/.zshrc, empty but for a comment, when there is none.
#   2. config.json in the data folder, naming the outside address, when there is none and
#      AUBERGINE_ADDRESS is set.
# Then it runs the command it was given (`aubergine start`) in its own place, so that signals
# reach the server.
set -eu

say() {
  printf 'aubergine-entrypoint: %s\n' "$1" >&2
}

# The data folder as dataDir() in daemon/src/paths.ts works it out on Linux.
data_folder() {
  if [ -n "${AUBERGINE_DATA_DIR:-}" ]; then
    printf '%s' "$AUBERGINE_DATA_DIR"
  else
    printf '%s' "${XDG_DATA_HOME:-$HOME/.local/share}/aubergine"
  fi
}

main() {
  home=${HOME:-}
  if [ -z "$home" ] || [ ! -d "$home" ] || [ ! -w "$home" ]; then
    say "the home folder (${home:-HOME is not set}) is not a folder this user ($(id -un 2>/dev/null || id -u)) can write to; give the volume on it to uid $(id -u)."
    exit 1
  fi

  # This is the image's own user, in the home the image made for it, on its first start: not
  # someone's own machine. A home with no zsh startup file at all makes zsh stop at a first-run
  # question in every shell opened with `docker compose exec`. A file that is there, empty or
  # not, is left exactly as it is.
  if [ ! -e "$home/.zshrc" ]; then
    printf '# Your zsh settings. Made empty by the Aubergine container on its first start.\n' >"$home/.zshrc"
  fi

  data=$(data_folder)
  case $data in
    /*) ;;
    *)
      say "the data folder \"$data\" is not an absolute path; set AUBERGINE_DATA_DIR to one, or leave it unset."
      exit 1
      ;;
  esac
  config="$data/config.json"
  address=${AUBERGINE_ADDRESS:-}

  # The operator's own setting, given when the container starts: the same as writing the file by
  # hand before the first start. No route writes it, and an existing file is never changed.
  if [ -n "$address" ]; then
    # Only the characters an origin can have, so that the address cannot break out of its JSON
    # string. The server checks everything else about it, and reports a wrong entry when it starts.
    if [ "${#address}" -gt 300 ] || [ "$(printf '%s|' "$address" | LC_ALL=C tr -d 'A-Za-z0-9.:/\133\135-')" != '|' ]; then
      say "AUBERGINE_ADDRESS may hold only letters, digits and . : / [ ] - (an origin such as https://aubergine.example.net); nothing was written."
      exit 1
    fi
    if [ -e "$config" ]; then
      if ! grep -F -q -- "\"$address\"" "$config"; then
        say "$config was left as it is, and does not name $address. Add it by hand under \"access\": { \"addresses\": [...] }, then restart."
      fi
    else
      umask 077
      if [ ! -d "$data" ]; then
        mkdir -p "$(dirname "$data")"
        mkdir -m 700 "$data"
      fi
      tmp="$data/.config.json.$$"
      printf '{ "access": { "addresses": ["%s"] } }\n' "$address" >"$tmp"
      # A hard link fails if a file appeared at that name meanwhile: nothing is replaced.
      if ln "$tmp" "$config" 2>/dev/null; then
        say "wrote $config with the outside address $address."
      else
        say "$config appeared while it was being written; it was left as it is."
      fi
      rm -f "$tmp"
    fi
  fi

  exec "$@"
}

main "$@"
