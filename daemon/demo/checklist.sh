#!/bin/sh
# A stand-in for an agent that was given one step to do by itself, an
# element that produces a checklist. It hands the list in, and then proposes
# a step of its own for the owner to review.
aubergine="$AUBERGINE_BIN/aubergine"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib.sh"

banner "It was asked for a list of what is left to do."
wait_for_run || exit 0

work="./.handed-in"
mkdir -p "$work"
cat > "$work/list.json" <<'LIST'
{ "items": [
  { "text": "Follow the redirect only once after signing in", "detail": "src/login.js" },
  { "text": "Add a test for signing in with an expired session" },
  { "text": "Say in the README which Node version the tests need" }
] }
LIST
cat > "$work/element.json" <<'ELEMENT'
{
  "name": "Check the sign-in page by hand",
  "instructions": "Open the sign-in page, sign in with the test account, and watch the address bar. Write down every address the browser goes through.",
  "doneWhen": "The note lists the addresses in order, and says whether any appears twice."
}
ELEMENT

say "Reading the project..."
pause
say "> aubergine workflow done --note \"Three things are left.\" --output list.json"
"$aubergine" workflow "done" --note "Three things are left." --output "$work/list.json" | head -3
say ""
say "> aubergine element propose --file element.json"
"$aubergine" element propose --file "$work/element.json" | head -2
say ""
say "The list is on this terminal's run: tick what is done."
say "The step waits for you under Review: nothing an agent writes is used until you accept it."
