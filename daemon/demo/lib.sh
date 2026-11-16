#!/bin/sh
# Shared by the demo's stand-ins. Each stand-in is a script that plays the part
# of an agent with the same commands a real agent uses, and nothing else.

# Each stand-in sets `aubergine` to the command its session was given.
: "${aubergine:=aubergine}"

say() {
  printf '%s\n' "$*"
}

# The work of a stand-in is pretend: a short pause where an agent would think.
pause() {
  sleep "${AUBERGINE_DEMO_PAUSE:-1}"
}

# The server starts the run just after the terminal; wait until it is there.
wait_for_run() {
  tries=0
  until "$aubergine" workflow status >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 40 ]; then
      say "No run was started for this stand-in. Nothing to do."
      return 1
    fi
    sleep 0.5
  done
}

banner() {
  clear
  say "STAND-IN AGENT: a script from Aubergine's demo, not a real agent."
  say "It uses the same commands a real agent would. $1"
  # Where any agent learns what it can do in a terminal here. A stand-in reads it too, and says how long it is.
  guide_lines=$("$aubergine" guide 2>/dev/null | wc -l | tr -d ' ')
  say "An agent learns what it can do here from: aubergine guide ($guide_lines lines)"
  say ""
}
