#!/bin/sh
# A stand-in for the tool that knows a branch's pull request, for the browser tests: it reaches no network.
# It answers only in a folder where a test left the answer, and otherwise says there is none, as the tool would.
[ -f ./.stand-in-pull-request.json ] || exit 1
cat ./.stand-in-pull-request.json
