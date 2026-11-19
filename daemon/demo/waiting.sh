#!/bin/sh
# A stand-in for an agent that has stopped to ask its owner something. It
# raises "waiting for you" the way an agent's hook does, reads the answer
# typed into this terminal, carries on, and reports that it has finished.
aubergine="$AUBERGINE_BIN/aubergine"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib.sh"

banner "It has a question for you."
say "I found the bug in two places. Which branch should I fix it on?"
say ""
printf '%s' '{"notification_type":"permission_prompt","message":"Which branch should I fix it on: main or release?"}' | "$aubergine" hook notification
printf 'Type an answer (for example: main) and press Enter: '
read -r answer || exit 0
[ -n "$answer" ] || answer="main"

# Carrying on: the same hook an agent's prompt goes through.
printf '%s' '{}' | "$aubergine" hook prompt
"$aubergine" note "Answered: $answer" >/dev/null 2>&1
say ""
say "Thank you. Fixing it on \"$answer\"..."
pause
pause
pause
say "Done."
# Stopping: the same hook an agent's stop goes through. Where this terminal is not described yet, the hook answers
# with a request to go on once and say what was done; the stand-in does as an agent would, and stops again.
held=$(printf '%s' '{"last_assistant_message":"Fixed on the branch you chose. The tests pass."}' | "$aubergine" hook stop)
case "$held" in
*decision*)
  say ""
  say "Aubergine reminds it, once: this terminal is not described yet."
  say "> aubergine describe --summary \"Fixed the double redirect.\""
  "$aubergine" describe --name "Stand-in agent · has a question" --summary "Fixed the double redirect on \"$answer\". The tests pass." >/dev/null 2>&1
  printf '%s' '{"stop_hook_active":true,"last_assistant_message":"Fixed on the branch you chose. The tests pass."}' | "$aubergine" hook stop
  ;;
esac
