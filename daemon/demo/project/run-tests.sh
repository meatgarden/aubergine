#!/bin/sh
# Prints what a test run of the made-up project would print. It runs nothing.
echo "> demo-project test"
echo "  home   > shows the greeting                 ok"
echo "  login  > refuses a wrong password           ok"
echo "  login  > follows the redirect once          FAILED"
echo "           expected 1 redirect, saw 2 (login redirects twice)"
echo ""
echo "  2 passed, 1 failed"
