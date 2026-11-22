# Security policy

Aubergine starts shells and agents on your computer, so a mistake in it can matter. Thank you for reporting one
privately.

## Reporting a problem

Use **Report a vulnerability** on the repository's
[Security tab](https://github.com/thirstyeggplant/aubergine/security/advisories/new). That opens a private advisory
that only the maintainers see. Please do not open a public issue, a discussion or a pull request for it.

Say what you found, the version (`aubergine version`), how to reproduce it, and what someone could do with it. You
will hear back within a week. Once it is fixed and released, the advisory is published, with credit to you unless you
would rather not.

## Versions

Only the latest published version gets fixes. Update with `aubergine update`.

## What Aubergine means to protect, and what it does not

The [security page](https://thirstyeggplant.com/security/) says it in full. In short:

- The server listens on `127.0.0.1` only, and checks `Host` and `Origin` on every request and socket. A page on another
  site, or another computer on your network, is not meant to reach it.
- The browser signs in with an access token kept in the data folder; devices from outside are paired one by one and
  can be revoked. Tokens' and devices' secrets are kept only as hashes.
- An API token can do only what its scopes allow, and some things no token can do at all (making tokens, changing
  settings, accepting drafts).
- **An agent runs as you.** Anything an agent started in Aubergine does, it does with your permissions. Working copies
  keep agents apart; they are not a sandbox. Workflows and library items are instructions an agent will follow:
  read them before you accept them.
- Aubergine never calls a model and holds no credential for another service.

A way round any of the first four is a vulnerability. What an agent you started does with your own permissions is not,
unless Aubergine let it do something you had not allowed.
