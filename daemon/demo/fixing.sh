#!/bin/sh
# A stand-in for an agent that is part-way through the "Fix a bug" workflow.
# It reports the first step done and then waits: each Enter in this
# terminal makes it finish the next one, as an agent would.
aubergine="$AUBERGINE_BIN/aubergine"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib.sh"

banner "It is on a workflow: watch the strip above this terminal."
wait_for_run || exit 0

say "> aubergine workflow status"
"$aubergine" workflow status | head -6
say ""
pause
say "Running the tests to see the bug..."
pause
say "  login > follows the redirect once        FAILED (redirected twice)"
"$aubergine" note "Reproduced: signing in sends the browser round twice before the home page." >/dev/null 2>&1
say ""
say "> aubergine workflow done --note \"Reproduced it: test/login.test.js fails, two redirects.\""
"$aubergine" workflow "done" --note "Reproduced it: test/login.test.js fails, two redirects." | head -4

while :; do
  say ""
  say "The stand-in is now working on the step the strip shows."
  say "Press Enter here to let it finish that step (or use Done on the run)."
  read -r _ || exit 0
  pause
  out=$("$aubergine" workflow "done" --note "Done by the stand-in agent." 2>&1) || break
  printf '%s\n' "$out" | head -4
  if ! "$aubergine" workflow status >/dev/null 2>&1; then
    say ""
    say "The workflow is finished. Its summary is in this terminal's notes."
    break
  fi
done
