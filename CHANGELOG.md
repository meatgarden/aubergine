# Changelog

What changed in each version of Aubergine. The newest is first. The npm package is
[`@meatgarden/aubergine`](https://www.npmjs.com/package/@meatgarden/aubergine); a version is published when its tag
`v<version>` is pushed.

## Unreleased

### From another device
- Reach the server from a phone or another computer: outside addresses in the settings, a sign-in for each device
  with a pairing code (or its QR code), and Settings → Devices to list and revoke them. Off unless you set it up.
  See [Using Aubergine from elsewhere](docs/remote.md).
- `aubergine device add | list | revoke`; `aubergine doctor` lists the outside addresses.
- Two servers in one page: link another Aubergine from the project menu (**Link a server…**), switch between them,
  and unlink.

### In a container
- `docker/`: an image built from the checkout, with Caddy beside it for HTTPS. Run once, on 2026-11-22, on an
  Apple-silicon Mac with Docker in Colima (linux/arm64); see [In a container](docs/remote.md#in-a-container) for
  what was and was not tried.

### Smaller changes
- The run dialog lets you choose the terminal, and says when no agent is seen there.
- A page whose device was revoked shows the sign-in at once instead of trying to reconnect.
- Command status works in a server started without `$SHELL`.
- The README says which Node.js version is needed, and how to get it with nvm.
- Repository links point at [thirstyeggplant/aubergine](https://github.com/thirstyeggplant/aubergine); the npm
  package keeps its name.
- Contributor guide, security policy, code of conduct, issue templates, and a check that runs on every pull request (on macOS).

## 0.1.1 — 2026-11-20

- Releases publish to npm from a tag, through npm's trusted publishing; `npm install -g @meatgarden/aubergine` is the
  first way to install.
- Aubergine is MIT licensed.
- Screenshots in the README and on the website.
- The canvases can be shown as a column on the left (the default in a new browser), and **New terminal** is one full-width
  button at the top of the list.
- The website fits a phone's width.

## 0.1.0

The first version published to npm. It brings together everything built up to then: terminals on canvases as tabs,
command status from shell hooks, agents and who is waiting for you, the side panel, notes, the keyboard and the
palette, API tokens and the `/v1` API with its generated client, workflows and the library, approvals and the board,
working copies, the queue and the owner's list, schedules, projects and project files, messages between terminals, the
MCP server, recaps and past conversations, the demo and the tour. The [README](README.md) describes each.
