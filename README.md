# Aubergine

## What it is

Aubergine puts your terminals on a canvas in your browser, side by side, so you can see all of them at once and use any of them. It is made for running several coding agents at a time: it shows which one is waiting for you, which step of its work each is on, and what each has written for you to read. Everything runs on your own computer, and your terminals keep running when you close the browser or restart Aubergine.

## Try it

```sh
curl -fsSL https://raw.githubusercontent.com/meatgarden/aubergine/main/install.sh | sh
aubergine start --open
```

The first line installs it (it needs macOS with tmux, Node.js and pnpm; [Quick start](#quick-start) says what the installer does and does not do). The second starts it and opens your browser, signed in. Then click **Show me around** in the middle of the empty canvas: it makes a canvas named "Demo" with a few stand-in agents on it and walks you round in eight short steps, about five minutes. Nothing in the demo is real, and **Remove the demo** (or `aubergine demo --remove`) takes it away again. From a terminal, `aubergine demo` does the same as the button.

<!-- A recording of the tour goes here. -->

**?** in the toolbar lists the eight things the tour shows, one line each.

The rest of this page is the reference: every section below stands on its own.

## Quick start

You need macOS with [tmux](https://github.com/tmux/tmux) 3.2 or newer, Node.js 22 or newer, and pnpm. Linux should work the same way but has not been tested yet. With [Homebrew](https://brew.sh) on macOS, `brew install tmux node pnpm` gets all three.

**1. Install Aubergine** with one line:

```sh
curl -fsSL https://raw.githubusercontent.com/meatgarden/aubergine/main/install.sh | sh
```

Prefer to read a script before running it? The same thing in two steps:

```sh
curl -fsSL https://raw.githubusercontent.com/meatgarden/aubergine/main/install.sh -o install.sh
less install.sh        # read it; sh install.sh --dry-run shows what it would do and changes nothing
sh install.sh
```

What the installer does, and says before doing it:

- checks that Node.js, pnpm, tmux and git (or curl and tar) are there and new enough. If one is missing it tells you how to get it and stops, having changed nothing;
- puts the code in `~/.aubergine/app`, installs its dependencies and builds the web app there;
- links the `aubergine` command into a folder on your `PATH` that you can write to: Homebrew's if you have it, else `~/.local/bin` or `~/bin`. If none of those is on your `PATH` it uses `~/.local/bin` and prints the one line to add to your shell's startup file.

What it does not do: **it does not install Node.js, pnpm or tmux**, it never uses `sudo`, it never edits your shell's startup files, and it touches nothing outside `~/.aubergine` and that one link. Running it again updates the copy in place. `AUBERGINE_HOME` changes where it installs and `AUBERGINE_REF` which branch or tag.

**2. Start the server** and leave it running:

```sh
aubergine start
```

It prints something like this:

```
Aubergine is running at http://127.0.0.1:4600
First visit in a browser? Open this link once:
  http://127.0.0.1:4600/auth?token=…
```

**3. Open the sign-in link** once per browser. After that, `http://127.0.0.1:4600` works on its own. Use `127.0.0.1` rather than `localhost`, since the sign-in is remembered per address. `aubergine start --open` does both steps: it starts the server and opens your browser signed in. With the server already running, `aubergine open` opens a signed-in browser.

**4. Add a terminal.** Choose **New terminal** (or press `N`), click the terminal, and type. An empty canvas offers three ways to begin: **Show me around** (the demo and its tour), **+ New terminal**, and **Bring in a terminal I already have open**. `aubergine`, typed by itself while nothing is on your canvas, says the same three.

If something is not right, `aubergine doctor` checks everything Aubergine needs, one line per check.

### Manual install

The same result by hand, if you would rather not run the installer, or want the code somewhere of your own choosing to work on it.

**1. Install the tools** (skip any you already have). With [Homebrew](https://brew.sh) on macOS:

```sh
brew install tmux node pnpm
```

**2. Get the code and its dependencies:**

```sh
git clone https://github.com/meatgarden/aubergine.git
cd aubergine
pnpm install
```

**3. Build the web app and start the server:**

```sh
pnpm build
pnpm start
```

**4. Open the sign-in link.** The server prints something like this:

```
Aubergine is running at http://127.0.0.1:4600
First visit in a browser? Open this link once:
  http://127.0.0.1:4600/auth?token=…
```

Open the `/auth?token=…` link once per browser. After that, `http://127.0.0.1:4600` works on its own. Use `127.0.0.1` rather than `localhost`, since the sign-in is remembered per address.

**5. Add a terminal.** Choose **New terminal** (or press `N`), click the terminal, and type.

**6. Install the `aubergine` command** (optional, but the sections below on moving terminals over, notes and start at login use it).

With a manual install nothing links it for you (the installer does this step by itself). The command is the file `bin/aubergine.mjs` in this folder, and it stays here: installing means creating a **link**, a small pointer named `aubergine`, in a folder your shell already searches for commands (a folder on your `PATH`). Nothing is copied or moved. When you type `aubergine`, the shell finds the link and runs the file in this folder.

From the `aubergine` folder, with Homebrew:

```sh
ln -s "$PWD/bin/aubergine.mjs" "$(brew --prefix)/bin/aubergine"
```

Reading that command from left to right:

| Part | Meaning |
|---|---|
| `ln -s` | create a link |
| `"$PWD/bin/aubergine.mjs"` | what the link points to: the file in this folder (`$PWD` is the folder you are in) |
| `"$(brew --prefix)/bin/aubergine"` | where the link goes and what it is called: `aubergine`, in Homebrew's command folder (`/opt/homebrew/bin` on Apple Silicon Macs), which is already on your `PATH` |

Without Homebrew, put the link in any folder that is on your `PATH`, for example:

```sh
mkdir -p ~/.local/bin
ln -s "$PWD/bin/aubergine.mjs" ~/.local/bin/aubergine
```

(If `~/.local/bin` is not on your `PATH` yet, add `export PATH="$HOME/.local/bin:$PATH"` to your `.zshrc` and open a new terminal.)

Check it from any folder:

```sh
aubergine list
```

Because it is a link and not a copy:

- after `git pull` the command is already up to date, with nothing to reinstall;
- if you move or delete this folder, the command stops working until you make the link again;
- to uninstall, delete the link: `rm "$(brew --prefix)/bin/aubergine"`. That removes only the pointer, never the file in this folder.

You can also skip the link and run it by path. From this folder that is `node bin/aubergine.mjs list`; from anywhere else, give the full path to the file, for example `node ~/code/aubergine/bin/aubergine.mjs list` if you cloned into `~/code`.

### Questions about the `aubergine` command

**What has to be true for `aubergine` to work in a terminal?** Two things. A file named `aubergine` has to exist in some folder, which is the link the installer makes, or the one from step 6 of the manual install. And that folder has to be on your `PATH`, the list of folders your shell searches when you type a command name. With Homebrew the second part is already done, because Homebrew's command folder was put on your `PATH` when Homebrew was installed. So only the link is missing.

**Do I have to be inside this folder to use it?** No. Once the link exists, `aubergine list`, `aubergine here` and the rest work from any folder. That is the point of `aubergine here`, which you run inside your other projects.

**Then why does step 6 say "from the `aubergine` folder"?** Only because that one command contains `$PWD`, which means "the folder I am in right now". Run from anywhere else, it would point the link at the wrong place. To run it from anywhere, write the path out, for example:

```sh
ln -s ~/code/aubergine/bin/aubergine.mjs "$(brew --prefix)/bin/aubergine"
```

**What is `$(brew --prefix)/bin/aubergine`?** It is not a command; it is the place the link is put and the name it is given. `brew --prefix` prints the folder Homebrew lives in, and `$( … )` pastes that in. On an Apple Silicon Mac the whole thing becomes `/opt/homebrew/bin/aubergine`; on an Intel Mac, `/usr/local/bin/aubergine`. Asking Homebrew where it lives is what lets the same line work on both.

**Does this folder have to stay where it is?** Yes. The link is a pointer, so the command runs the code in this folder. It needs the folder to stay put, its dependencies installed (`pnpm install`), and, for most commands, the server running.

**Is the command available inside terminals on the canvas?** Only if you made the link. Terminals on the canvas use your normal `PATH`. Status and agent hooks do not depend on it, because they record the full path to the file, but typing `aubergine note "…"` yourself does.

### Without admin rights

Nothing in Aubergine needs an administrator password. What can need one is getting its tools onto a managed computer.

**The link.** Creating a link never needs admin rights; it needs a folder you are allowed to write to. The installer picks such a folder by itself: it tries Homebrew's folder only if you can write to it, and otherwise uses `~/.local/bin` or `~/bin` in your own home. By hand, the Homebrew line in step 6 fails on a computer with no Homebrew, or where someone else installed it (`permission denied`). Use a folder in your own home instead, which always works:

```sh
mkdir -p ~/.local/bin
ln -s "$PWD/bin/aubergine.mjs" ~/.local/bin/aubergine
```

and make sure that folder is on your `PATH` (add `export PATH="$HOME/.local/bin:$PATH"` to your `.zshrc` and open a new terminal). Or make no link at all and run the command by its full path.

**The tools.**

| Tool | Without admin rights |
|---|---|
| Node.js | Install it into your home folder with a version manager. |
| pnpm | Its standalone installer puts it in your home folder. |
| tmux | The hard one: it has no per-user installer of its own. Ask your IT department for it, use a per-user package manager your company allows, or build it from source into your home folder. If `tmux` is somewhere unusual, point Aubergine at it with `AUBERGINE_TMUX_BIN`. |

**Everything else stays in your account.** The server listens on `127.0.0.1` only, its data is in your own application-data folder, and start at login is a per-user launchd agent.

### Stopping, restarting and updating

- **Stop the server** with Ctrl+C in the terminal where it runs. Your terminals on the canvas keep running; start the server again (`aubergine start`) and reload the page to get them back. If you start it while it is already running, it says so and gives you the address instead of failing.
- **End every session for good** with `tmux -L aubergine kill-server`. The canvas layout is kept, and each session gets a fresh shell the next time the server starts.
- **Update** to the latest version, then restart the server:

  ```sh
  aubergine update
  ```

  It fetches the new code, installs dependencies and builds the web app. It refuses if you have changed the code in that folder. Running the installer again does the same, and is the way to update a copy that was installed without git. For a manual install you can equally run `git pull`, `pnpm install`, `pnpm build` yourself.
- **See what is installed**: `aubergine version` prints the version, the commit, where the code is and where your data is.
- **Start at login** so you only ever open the browser: see `aubergine service install` under [Command line](#command-line).
- **Uninstall** with `aubergine uninstall`. It removes the link and, after asking, the copy the installer made (and start at login, if it starts this copy). It never removes a folder you cloned yourself, never removes your data, and never ends your terminals; it prints the two commands that do those by hand, should you want that.

### If something goes wrong

| What you see | What to do |
|---|---|
| "This browser is not signed in yet" | Open the `/auth?token=…` link that the server printed when it started. |
| A page saying tmux is missing or too old | Install or upgrade tmux (`brew install tmux`), then restart the server. |
| The server will not start because the port is taken | Use another port: `AUBERGINE_PORT=4700 pnpm start`. |
| `aubergine: command not found` | The command is not linked onto your `PATH` yet: do step 6 above, or run `node bin/aubergine.mjs` from this folder. |
| "The web app has not been built yet" | Run `pnpm build`, then `pnpm start` again; `start` serves the built web app. |
| A terminal shows no status badges | Status needs zsh, and a session created before an update keeps its old shell. Park it and start a new one, or restart its shell. |

The server listens on `127.0.0.1` only, so it is reachable from this computer and nowhere else.

In a Chromium-based browser you can install the page as an app window (address bar → install), which lets more keyboard shortcuts reach the canvas.

## Moving your existing terminals over

You probably have terminal tabs open already, some of them running agents. One thing cannot be done, by this or any tool: **a program that is already running in another terminal cannot be moved into an Aubergine session.** So moving over means three things: give each tab a canvas session in the same folder, carry agent conversations on inside those sessions, and make new tabs land on the canvas from now on.

Nothing here edits your dotfiles, and with one exception nothing stops, signals or changes a program you have running. The exception is **Stop and resume**, which asks one Claude Code agent to exit, only when you choose it for that agent and only after you confirm.

### From the canvas

The quickest way is the **Outside terminals** button in the canvas toolbar. It lists every terminal you have open outside the canvas: the terminal's name, its folder, what is running in it, and for a Claude Code tab the conversation's name and whether the agent is idle or busy. **Refresh** looks again; nothing is looked up while the panel is closed.

Each row has its own action, so you bring terminals over one at a time:

- **Add to canvas**, for a shell at its prompt or one running a command: a canvas session in the same folder. A command that is running stays where it is; start it again in the new session if you need it there.
- **Fork to canvas**, for a Claude Code tab: a copy of the conversation starts on the canvas, and the original keeps running until you exit it.
- **Stop and resume here**, for a Claude Code tab whose agent is idle: the original is asked to exit and the same conversation carries on on the canvas. It asks you first, and it is switched off, with the reason shown, while the agent is busy.

After an action the canvas goes to the new terminal, and the row tells you what to do with the old tab.

The same things can be done from the command line, described next. These steps use the `aubergine` command; install it first with step 6 of the [quick start](#quick-start). The server must be running.

If you have not linked the command, every `aubergine …` below still works when you write it as `node` followed by the full path to `bin/aubergine.mjs`. Most of these commands are run from your other tabs, in their own folders, so a relative path will not do. For example, if you cloned into `~/code`:

```sh
node ~/code/aubergine/bin/aubergine.mjs scan
node ~/code/aubergine/bin/aubergine.mjs here
```

### A tab that is sitting at its prompt

In that tab:

```sh
aubergine here
```

This creates a session in the tab's current folder, named after the folder, puts it on the canvas, and turns the tab into a view of that session. The tab and the canvas now show the same shell. Close the tab whenever you like; the session stays on the canvas.

If the canvas is open in a browser, it pans to the new terminal and focuses it. If it is not open anywhere, your default browser opens on it. `--no-open` skips that.

Give it a name, or a command to start with, if you want:

```sh
aubergine here "api server" -- npm run dev
```

`aubergine here` starts a new shell; variables and shell history that only existed in the old shell's memory do not come along. The old shell is still underneath the view: if the session ends while the tab is open, you are back in it. Use `exec aubergine here` to replace the old shell completely.

### A tab with a command still running

Leave it alone until the command finishes, or stop it yourself when it suits you. Then run `aubergine here` in that tab, adding the command after `--` if you want it started again in the new session.

A running server or watcher cannot be carried over; it has to be started again inside the session.

### A tab running Claude Code

The running agent itself cannot be moved, but its conversation can. Start with a look:

```sh
aubergine move
```

lists your Claude Code tabs: terminal, whether the agent is idle or busy, the conversation's name and its folder, followed by a ready-to-copy command for each one. It only reads. Then move the ones you want by terminal name, one at a time or several, or all of them:

```sh
aubergine move ttys004 --dry-run     # show the plan, change nothing
aubergine move ttys004
aubergine move --all
```

There are two ways to move, and the default is the careful one.

**Copy (the default).** A new canvas session starts in the same folder with a copy of the conversation. The original tab is not touched and keeps running. Exit the original (`/exit`) when you are ready; until you do, two agents with the same history are working in the same folder, so do not give both of them work.

**Stop and resume (`--stop`).** The original agent is asked to exit, and the same conversation carries on in a new canvas session:

```sh
aubergine move ttys004 --stop
```

- It only does this for an agent that is **idle**, checked again at the last moment. A busy one is refused; wait for its turn to end. (`--force` overrides this and interrupts the agent's work.)
- It asks you to confirm first (`--yes` skips the question).
- It asks the original process to exit once, politely, waits, and checks that it has gone. It is never forced. If it does not exit, nothing is started on the canvas for it and you are told.
- It only ever signals the exact processes you chose, each checked to still be the same Claude Code process.

Either way, the old tab cannot be turned into a view of the new session from outside. After `--stop` the tab is back at its shell prompt; run `aubergine attach "<name>"` there if you want it to show the session, or just close it.

`aubergine move` finds each conversation in the records Claude Code keeps for its running processes. That is an internal detail of Claude Code that may change; if a record cannot be read, the copy falls back to the most recent conversation in the folder and says so, and `--stop` is refused for that tab.

#### By hand

1. Let the agent finish its current turn.
2. Exit it (`/exit`).
3. In the same tab, in the same folder:

   ```sh
   aubergine here --claude
   ```

This starts Claude Code in a new canvas session with `--continue`, so the conversation carries on where it stopped, now with its status on the canvas (working, waiting for you, finished).

The limit: `--continue` picks the **most recent** conversation for that folder. If two agents were working in the same folder, only the first `aubergine here --claude` gets the right one by itself. For the other, name the conversation yourself. Anything after `--` goes to the agent in place of `--continue`:

```sh
aubergine here --claude -- --resume <conversation id>
aubergine here --claude -- --resume <conversation id> --fork-session
```

### Other tabs: one, a few, or all at once

```sh
aubergine scan
```

lists your open terminals that are not on the canvas yet: the terminal's name, what is running in it, and its folder, followed by a ready-to-copy command for each one. It only reads.

To bring over just one or a few, name them:

```sh
aubergine import ttys004
```

Or take all of them:

```sh
aubergine import --dry-run
aubergine import
```

creates one canvas session per folder, grouped in a frame named "Imported", and prints what to do in each original tab: attach it if it is idle, or wait for its command or agent first. `--dry-run` shows the plan and changes nothing. Folders that already have a session are skipped; `--all` gives every tab its own session anyway. Your tabs are left exactly as they are.

### New tabs from now on

```sh
aubergine shell-hook print
```

prints a few lines for your `.zshrc`. Add them yourself, at the end of the file. From then on a new terminal tab starts inside a new canvas session, and closing the tab only detaches from it.

The lines cannot leave you without a shell. They do nothing inside Aubergine or tmux or in a non-interactive shell, and if the server is stopped, slow to answer, or anything else fails, the normal shell starts as usual (after a moment's wait, at most a few seconds).

For one plain tab on purpose, run `AUBERGINE_DISABLE=1 zsh`, or set `AUBERGINE_DISABLE=1` in the environment of a terminal profile.

Each new tab makes a new session, so park or end the ones you no longer need.

### Going back

- Remove the lines between the two `aubergine` markers from your `.zshrc`; new tabs are plain again.
- `AUBERGINE_DISABLE=1` switches the lines off without removing them.
- Sessions are ordinary tmux sessions on their own socket. With the server stopped you can still reach every one: `tmux -L aubergine ls`, then `tmux -L aubergine attach -t <id>` with an ID from that list.
- Ending the sessions (from the canvas, or `tmux -L aubergine kill-server`) leaves nothing running.

## Use

### The demo and the tour

`aubergine demo`, or **Show me around** on an empty canvas, makes a canvas named "Demo" with a small scene on it: a shell with some output, a stand-in agent part-way through the "Fix a bug" workflow, one that is waiting with a question, one that has handed in a checklist and proposed an element for you to review, and a parked terminal. A tour of eight steps points at each in turn and waits for you to try it.

- **Nothing in it is real.** The stand-ins are short scripts in `daemon/demo/`, labelled as stand-ins where they run. They use the same commands a real agent uses (`aubergine workflow`, `aubergine note`, the hooks), so they also show that those work. They react: answer the one that is waiting and it carries on and reports that it has finished; press Enter in the first one's terminal, or **Done** on its run, and the strip moves.
- **It touches nothing of yours.** It adds a canvas and its terminals, working in a folder of its own inside Aubergine's data folder. No workflow, shelf element or token is added. Making it twice makes one.
- **Removing it removes all of it and nothing else**: `aubergine demo --remove`, **Remove the demo** on its canvas, or the last step of the tour. The canvas, its terminals, their runs, the draft and the folder go; so does an element you accepted from a stand-in's draft. Its runs are no longer among the past runs, and what became of its draft is no longer under "Decided lately". A terminal of your own that you put on the demo's canvas is moved to another canvas, still running.
- **The tour** can be skipped step by step, put away ("Not now") and taken up again from the palette ("Take the tour") or from **?**, or put away for good. Whether you finished it is remembered in your browser only; nothing about it is sent anywhere or recorded.

**?** in the toolbar lists the same eight things as one-line reminders. **Show me** beside a line points at the thing on the canvas you are looking at.

### Canvas

- **New terminal** (or `N`) adds a terminal in free space near the middle of the view, on the canvas you are looking at.
- Drag a node by its title bar; resize it from its edges; double-click the title to rename it.
- Drag the background to pan; scroll or pinch to zoom. **Fit** (or `F`) shows everything; the percentage (or `0`) returns to 100%. The minimap in the corner also pans and zooms.
- **+ Frame** adds a labeled frame. Drag a frame by its label and the terminals inside it move along.
- The dot in a title bar gives a node or frame a color.
- The title bar shows the running command and current folder of each session.

### Canvases

You can have several canvases, shown as tabs along the top: one per project, say, or one for long-running jobs. You start with one, named Main.

- **+** adds a canvas. Double-click a tab to rename it, drag it to reorder, and use its dot to give it a color.
- Each canvas has its own address (`/c/<id>`), so you can bookmark one, or keep two browser windows on two canvases. Opening the plain address returns to the canvas you looked at last. Each canvas remembers its own pan and zoom in each browser.
- A terminal is on one canvas at a time. **Move** in its title bar puts it on another canvas; the shell is not touched.
- Only the canvas you are looking at keeps live terminals. Shells on the others keep running all the same.
- A tab shows how many of its sessions are waiting for you, and a dot when one has output you have not seen. The waiting queue, the palette (⌘K) and the Parked list cover every canvas, say which canvas a session is on, and take you there.
- **×** on a tab closes the canvas. That never ends a shell: if terminals are on it you choose between moving them to another canvas and parking them. The last canvas cannot be closed.
- A parked session is on no canvas. Restoring it puts it on the canvas you are looking at, in its old spot if that was on this canvas and is still free.

From a terminal, `aubergine canvas list` and `aubergine canvas new <name>` do the same, and `new`, `here` and `import` take `--canvas <name>`; see [Command line](#command-line).

### Keyboard

Everything you do often has a key, and **?** shows all of them for your system.

**Focus.** Click a terminal to give it the keyboard. A terminal takes input only at 100% zoom; clicking a zoomed-out terminal zooms to it first. While a terminal has the keyboard, every key goes to the program in it, apart from the few chords in the first table below. Those are chosen so that no shell, editor or tmux can need them: Ctrl+C, Ctrl+R, Ctrl+A, Option with an arrow, Escape and the rest all reach the terminal.

Leaving a terminal (⌃⌘. or a click on the background) keeps it **selected**, shown with a dashed ring. The single keys in the second table then act on the selected terminal, and Enter goes back into it.

Work everywhere, inside a terminal too:

| | macOS | Linux, Windows |
|---|---|---|
| Palette: go to a session or canvas, run any command | ⌘K | Ctrl+Shift+K |
| Terminal to the left, right, above, below | ⌃⌘← ⌃⌘→ ⌃⌘↑ ⌃⌘↓ | Ctrl+Shift+arrows |
| Previous, next canvas | ⌃⌘[ ⌃⌘] | Ctrl+Shift+[ Ctrl+Shift+] |
| Previous, next canvas, in an app window (see below) | ⌃⇧Tab ⌃Tab, ⇧⌘[ ⇧⌘], ⌥⌘← ⌥⌘→ | Ctrl+Shift+Tab, Ctrl+Tab |
| Canvas by number, in an app window | ⌘1–⌘9 | |
| Leave the terminal | ⌃⌘. | Ctrl+Shift+. |
| Next session that is waiting for you | ⌃⌘J | (palette) |

Work while no terminal or text field has the keyboard:

| Key | |
|---|---|
| `N`, `C`, `G` | new terminal, new Claude Code session, new frame |
| `Tab`, `Shift+Tab` | select the next, the previous terminal, as the [terminal list](#side-panel-and-terminal-list) shows them |
| arrows or `H` `J` `K` `L`, `Enter` | select the terminal in that direction, go into the selected one |
| `P`, `U`, `Shift+P` | park the selected terminal, bring back the last parked one, open the parked list |
| `R`, `M`, `E`, `#` | rename the terminal, move it to another canvas, open or close its notes, edit its tags |
| `T`, `[` `]`, `1`–`9`, `Shift+R` | new canvas, previous and next canvas, go to a canvas, rename the canvas |
| `W` | next session that is waiting for you |
| `F`, `0` | zoom to fit, zoom to 100% |
| `B`, `S`, `/` | show or hide the side panel; list this canvas or all canvases; filter the list by text |
| `F6` | move the keyboard to the list, the toolbar, the tabs, and back |
| `O`, `?`, `Esc` | Outside terminals, the shortcut sheet, close a panel or clear the selection |

**Tab.** While the canvas has the keyboard, Tab does not walk through the buttons: it selects the next terminal in the list on the left, moving the view only if that terminal is off screen. Inside a terminal, Tab and Shift+Tab always go to the program, so completion works as usual. To reach the buttons from the keyboard press `F6`: it moves the keyboard to the terminal list, then the toolbar, then the canvas tabs, then back to the canvas, and inside each of those Tab moves from control to control as it does on any page. `Esc` returns to the canvas.

**The keys browsers use for their own tabs** switch canvases too: Ctrl+Tab and Ctrl+Shift+Tab, Ctrl+PageDown and Ctrl+PageUp, on macOS also ⇧⌘] ⇧⌘[, ⌥⌘→ ⌥⌘← and ⌘1–⌘9, elsewhere Ctrl+1–Ctrl+9. They are meant for Aubergine installed as an app with a window of its own, where there are no browser tabs. In an ordinary browser tab the browser usually takes these keys for itself before the page sees them, so do not count on them there; the shortcut sheet shows them with a dashed outline when they are not expected to work in the window you are in. Which of them a given browser lets through has not been measured. The route that works everywhere is ⌘K followed by `]`, `[` or a digit.

**The palette** (⌘K) lists sessions, canvases and every command with its key. Type part of a name, folder, command or note and press Enter. `>` in front shows commands only. With nothing typed, `1`–`9` goes to that canvas and `[` and `]` to the previous and next one: this needs no special chord, so it works in every browser. Anything that has no key of its own can always be run from here.

**Changing keys.** Add `shortcuts` to `config.json` (see [Settings](#settings)): a command name with a chord, a list of chords, or `null` for no key. The names are in the tooltip of each row of the shortcut sheet, and the palette finds a command by its name.

```json
{
  "shortcuts": {
    "terminal.park": "X",
    "attention.next": ["Ctrl+Cmd+G", "W"],
    "view.fit": null
  }
}
```

Reload the page to apply. If a key is set twice or cannot be read, the shortcut sheet says so at the top and the server prints it; the rest of the file still applies. A key the browser usually keeps for itself (⌘T, ⌘W and so on) is bound all the same, with a warning that it may never arrive. A chord that a program in a terminal may need (a plain key, Ctrl with a key, Option with a key) is accepted but works only outside terminals.

**In an installed app window** there are no browser tabs, so the tab keys above are expected to reach the canvas. `shortcutsInAppWindow` takes the same entries as `shortcuts` and applies only there, for keys of your own that should exist only in the app window, for example `{ "canvas.new": "Cmd+T" }`.

**How sure are these keys?** The chords in the first table were chosen from what browsers document, not from measurement with a real keyboard, and Linux and Windows are untested. [docs/keys.md](docs/keys.md) has the details and a page to measure your own browser with. If a chord does nothing for you, rebind it; the palette always works.

### Side panel and terminal list

A panel down the left side holds sections. Today it has one, **Terminals**; further sections will appear here as they are added. Each section folds, and the whole panel collapses to a narrow strip that shows each section's icon and counts (`B`, or the arrow at the top). Drag its right edge to change the width. All of this is remembered by the browser.

**Terminals** lists every session: the terminals on every canvas, and the parked ones.

- **This canvas / All canvases** at the top chooses the scope. It starts on *This canvas*. Parked sessions are on no canvas and are listed in both.
- **Filters** narrow the list: waiting for me, busy, unread, has an agent, parked, the text box (name, folder, command, note, tags; every word must match), and tags. They combine: a row must pass all that are on. Each one in effect shows as a chip you can remove, **Clear** removes them all, and the count beside the section title is the number of rows shown. If nothing is left, the list says which filters are hiding everything.
- **Grouping**: by canvas, in tab order, each canvas a heading that folds and shows its waiting count, with frames as sub-headings and the terminals in the order they read on the canvas (top to bottom, then left to right); or one flat list, ordered by canvas, last updated, last typed in, or name.
- **Compact** shows one line per terminal instead of two.

Filters, grouping, order, density and what is folded are remembered by the browser.

**A row** shows:

- a state, as a mark and a word. One state per row, the most pressing first: `!` waiting for you, `◐` processing (a command or an agent is running), `●` unread output, `✕` failed (the last command ended with an error), `○` idle and read;
- the name, and *agent* when an agent runs there;
- on the second line the running command and folder, **typed … ago**, **updated … ago**, and the tags.

*Typed* is when input last reached the session, *updated* when it last printed. Both are recorded at most once every five seconds, so they can lag by that much. Input is seen when it passes through Aubergine: typing in the browser, or a line Aubergine types for you. What you type in a view opened elsewhere with `aubergine attach` does not pass through the server; for that the start of each command is used, which is the best signal available, so text typed there but not yet run does not count.

Click a row to go to that terminal at 100% and give it the keyboard, switching canvas if needed; a parked row has **Restore**. **⋯** on a row of the canvas you are looking at has the node's actions: rename, notes, tags, move to another canvas, park.

**Tags** are short words of your own on a session (up to 12, each up to 32 characters; `Api` and `api` are the same tag). Edit them from **⋯**, from the `#` button on the node, or with `#` on the selected terminal. Click a tag on a row to show only the terminals with that tag; several chosen tags show the terminals with any of them.

**Notes from the list.** A row has a pencil mark when its session has a note or log entries, with the number of entries added since you last opened them.

- Rest the pointer on the mark (or reach it with the keyboard) for a glance: the first lines of the pinned note and the newest log entry. It is read-only and never takes the keyboard.
- Click the mark, or press `E`, to open the notes in a drawer beside the panel: the pinned note, the log and the entry box, the same as on the node. The drawer lies over the edge of the canvas and moves nothing. It follows the selection, so with the keyboard in the list (`F6`, then the arrows) you can read through the notes of one terminal after another. `Esc` closes it. The note panel on the node still works; the two show the same thing.

**Keyboard.** `Tab` and `Shift+Tab` move through the rows exactly as the list shows them, filters and order included. With *This canvas* they stay on the canvas; with *All canvases* they go on into the next canvas, switching as they go. That is why the list starts on *This canvas*: Tab does not jump between canvases unless you ask for it. `S` switches the scope and `/` puts the keyboard in the text box. With the keyboard in the list (`F6`), the arrows move through the rows, `Enter` goes into the terminal and `Esc` returns to the canvas. The filters, grouping and order are commands too, so they are in the palette (type `list`) and can be given keys.

The list costs nothing to keep open, also with hundreds of sessions: it is drawn from what the page already knows, only the rows in view are drawn, no terminal is attached for it and nothing is fetched.

### Scrolling, copy and paste

- The wheel scrolls the history of the terminal that has focus. Anywhere else it zooms the canvas.
- Select text in a terminal with the mouse and it is copied to the system clipboard when you release the button.
- Paste with ⌘V (Ctrl+Shift+V outside macOS). Multi-line pastes are bracketed, so a shell does not run them line by line.

### Parking, and shells that end

- × on a node **parks** the session: the node leaves the canvas but the shell keeps running. **Parked (n)** in the toolbar lists parked sessions; restore one, or end it for good (this asks first).
- When a shell exits by itself, its node stays and offers **Restart here** (a new shell in the same folder) and **Remove**.

### Status at a glance

With zsh, each node's title bar shows what its shell is doing:

- a pulsing dot and the full command line while a command runs;
- a red `exit N` badge when the last command failed (hover for when it finished);
- a blue dot when the session has printed something since you last looked at it.

These work for parked and off-screen sessions too. Other shells run normally but report no command status yet.

How it works: a session starts zsh with `ZDOTDIR` pointing at a small folder inside the data folder. The files there load your own `.zshenv`, `.zprofile`, `.zshrc` and `.zlogin` exactly as usual and then add two hooks. Your dotfiles are never edited, and `ZDOTDIR` is back to your own value once the shell has started.

### Agents: who is waiting for you?

**+ Claude Code** starts `claude` in a new session with a settings file that Aubergine generates in its data folder. Your own Claude Code configuration is not touched. The hooks in that file tell the canvas what the agent is doing:

- when you submit a prompt, the prompt is added to the session's note log and the node shows **working**;
- when the agent needs you (a permission question, or it is idle waiting for input), the node turns orange and shows **waiting for you**;
- when the agent stops, the node shows **finished** and a line is added to the log.

The toolbar shows **N waiting**; click it to go to the next waiting session. Looking at a node clears its state, and so does the agent starting to work again. **Notify** turns on desktop notifications for sessions that start waiting.

Aubergine remembers which conversation an agent session was in. When its shell is back at a prompt (you exited the agent, or the computer was restarted), the node's title bar offers **Resume agent**, which starts the agent again in that conversation.

To use the hooks in sessions you start yourself, print them and add them to your own Claude Code settings by hand:

```sh
aubergine hooks print
```

They do nothing outside an Aubergine session.

Prompts can contain secrets. To keep them out of the note log, set `"agents": { "logPrompts": false }` in `config.json`.

### Notes

**Note** in a title bar opens the session's notes: a pinned Markdown summary that you edit freely and that is saved as you type, above a log that only grows. Each log entry has an author (you, or the agent in that session) and a time. Add an entry in the panel, or from inside the session:

```sh
aubergine note "migrations done, starting the backfill"
```

The palette searches both the summary and the log.

### Searching terminal output

The palette (⌘K) also searches what terminals have printed, in a **Terminal output** section at the end of its list. Choosing a result opens that session scrolled back to the match; press `q` to return to the bottom. It reads each running session's history when you search, parked sessions included. Nothing is indexed or recorded, so it only reaches as far back as the history tmux keeps (50,000 lines) and does not cover sessions that have ended.

### Many sessions

A terminal is live only while it is on screen and large enough to read. Zoomed far out, a node shows a plain-text picture of its screen, refreshed about once a second; off screen it costs nothing. Either way the shell keeps running.

## Workflows

A workflow is an ordered list of **elements** that an agent goes through one at a time: it reads the current one, does it, reports it done, and is given the next. Each element is a name, some instructions, and one line saying how to tell it is finished. The canvas shows where every terminal stands.

Nothing in a workflow is run by Aubergine. An element is text for whoever does the work, and what moves a run is a report: from the agent, by a command it runs in its terminal, or from you, with a button. So a workflow works with any agent that can run a command, and a plain shell can be on one too, with a person moving it.

### Make one

**Workflows** in the toolbar (or ⌘K, `Workflows`) lists them. Four come as templates to start from:

- **Plan, build, check**
- **Fix a bug**: reproduce, find the cause, fix, test, summarise
- **Review a change**: understand, look for problems, report
- **Specify, design, then build**

**Use** makes an ordinary workflow from a template and opens it in the editor. There you set its name, the text that holds **for every element**, what a run is given when it starts (one input, the task, unless you add more; write `{{task}}` in any text to use it), and the elements: add, remove, rename, and drag them into order. The right-hand side shows exactly what an agent will be told on the element you are editing.

Saving makes a **new version**. A run keeps to the version it started on, so editing a workflow never moves or confuses a run that is going.

### Run one

On a terminal: the **⇶** button in its title bar, or ⌘K, `Run workflow`. Choose the workflow, fill in the task, read what the agent will be told first, and start. If an agent is running in that terminal, Aubergine types one line into it:

```
You are on an Aubergine workflow. Run `aubergine workflow status` to read your current element and follow it. When its "done when" is true, run `aubergine workflow done --note "<what you did>"` and follow what it prints.
```

From there the agent drives itself: `status` prints the element, and `done` records it and prints the next one, with the note the element before handed over. If no agent is running there, nothing is typed (a shell would try to run the sentence); the run is shown with its buttons, and with that line to give an agent yourself.

On a new agent: the **⇶** button beside **+ Claude Code** starts a Claude Code session that is told about the run in its first prompt.

A terminal is on one run at a time. **Resume agent** on a terminal that is on a run tells the agent about the run again, so it carries on where the run stands.

### Watch it

- The terminal's title bar has a **strip**: one mark per element and the name of the current one. The same is on its row in the side panel.
- The side panel's **Workflows** section lists every run that is going, on whichever canvas, those that need someone first. The terminal list can be narrowed to terminals **on a workflow**, or by the state of their run.
- Click a strip or a run for the **run view**: every element with its state, how long it took, who moved it (the agent, you, or a token) and the note handed in; the current element open with its text. Buttons: the current element **is done**, **Go to** any element (back to redo it, or forward, skipping what lies between), **Pause**, **Resume**, **Stop**.
- A run the agent reports **blocked** puts its terminal in the waiting queue, naming the element and the reason. So does a run that **finishes**.
- **quiet** on a strip means the terminal has kept printing for five minutes since the last report, so the picture may be behind what is really going on: the agent may have moved on without saying so. The time is `workflows.quietAfterSeconds` in the settings.
- When a run finishes, a summary (each element and its note) is added to the terminal's notes. Finished and stopped runs leave the list; they are kept in `runs.log` in the data folder and can be read with `GET /v1/runs?status=ended`.

### Let an agent write one

**Describe an element…** and **Describe a workflow…** (on the Workflows screen, or ⌘K) ask an agent to write one for you. Say what you want, pick a terminal with an agent (or a new Claude Code session), and send.

Your description is **not typed into the terminal**. The agent is typed one fixed sentence that tells it to run `aubergine workflow brief`; that command prints your description, the format with an example, the limits, and how to hand the result in:

```sh
aubergine element propose --file to-dos.json     # or: aubergine workflow propose --file flow.json
```

What an agent writes arrives as a **draft**. A draft cannot be run, is not among your workflows, and no agent is told any of it. **Review** (the toolbar shows "1 to review") is where you read it: the whole text exactly as an agent would be told it, what it needs, who it is from, and, for a second version, what changed. A text longer than the view is not accepted until you have asked to see all of it. Then:

- **Accept**: an element goes on the shelf; a workflow becomes a workflow (or a new version, when the draft says which one it revises).
- **Edit, then accept**: change the text first.
- **Send back with a comment**: the agent is typed the same fixed sentence, reads your comment with `aubergine workflow brief`, and hands in a new version.
- **Discard**.

What became of each draft is kept in `drafts.log` in the data folder and shown at the foot of Review ("Decided lately"): who proposed it, what kind it was, whether it was accepted or discarded, when, and whether that was done in the browser or from the command line. Not what the draft said.

Programs can propose too: a token with `workflows:write` posts to `/v1/drafts`. A new token has **changes to workflows need my review** switched on, which closes the routes that create and change workflows to it and leaves it the draft route; switch it off, when you make the token in the browser, for one you trust to write workflows directly. No token, whatever its scopes, can accept, send back or discard a draft, and a session's own token can only propose drafts and read its own.

### What an element needs, and what it produces

An element can list what it **needs**: an MCP server, a command, access to something, or anything else, each with a short name. Aubergine does not supply or check these; the agent's own setup does. They are shown in the editor, before a run starts, and on the review screen, and the element tells the agent: *if you do not have one of these, report blocked and say which.*

An element also says what it **produces**. Every element can hand over a note. One that produces a **checklist** must hand in a list when it is done:

```sh
aubergine workflow done --output list.json      # {"items": [{"text": "one line", "detail": "optional"}]}
```

`done` without it is refused, with the format. In the run view the checklist is a list you can tick, also after the run is over (the side panel lists the runs that ended lately). Your ticks are kept with the run, with when you made them, and the next element is told the list with your choices marked, so "do the ones I ticked" works.

### The shelf, and running one element by itself

The **shelf** on the Workflows screen keeps elements for reuse. **Insert from shelf…** in the workflow editor puts a copy into a workflow (changing the shelf later does not change the workflow), and **Save to shelf** keeps a copy of an element you wrote in one.

**Run…** on a shelf element (or ⌘K, `Run an element by itself`, or the command below) runs just that element on a terminal, with no workflow around it. It shows up as a run like any other, and nothing is added to your workflows for it.

```sh
aubergine element list
aubergine element run "Collect my to-dos" --session helper
```

An example, end to end: ask an agent for "a to-do list from what people asked me in the team chat". It proposes an element, *Collect my to-dos*, that needs an MCP server for the chat and produces a checklist. You read it, send it back once ("shorter"), accept the second version, and run it by itself on the agent's terminal. The agent hands in the list; you tick the items you will do.

### Workflows kept in a project's repository

A team can share workflows through Git. A folder `.aubergine/workflows/` at the top of a repository holds workflow files (`*.json`, as `aubergine workflow export` writes them). A terminal whose folder is inside such a repository is offered them: in the run dialog, in their own group named after the repository's folder, and from the command line inside that terminal:

```sh
aubergine workflow list                      # your workflows, then what the repository offers
aubergine workflow run "Release checklist" --input task="version 2"
```

**You read one before it can run.** Anyone who can push to a repository can change those files, and what is in them is text your agent will obey. So a repository workflow shows up in **Review** like anything an agent wrote: the whole text as an agent would be told it, and what it needs. It cannot be run, by you, an agent or a token, until you have accepted that exact content. When the file changes it must be reviewed again, and Review shows what changed against what you accepted. An agent that asks for one that is not accepted is told that a person has to review it first.

A run of an accepted one works from the content you accepted, not from the file, so a later change to the file never reaches a run that is going.

How the files are found and read:

- The repository is the first folder, going up from the terminal's folder, that holds `.git`. The search stops at your home folder and at the top of the disk, and does not run Git.
- Only regular files directly in `.aubergine/workflows/` are read: at most 50, each at most 512 KiB and within the limits on workflows. A symbolic link is never followed; it is listed as skipped. A file that is not a workflow is listed with the reason and does not stop the others.
- Nothing is remembered about the files between readings. What is remembered is what you accepted: the repository's folder, the file's name and a hash of its content.

**Aubergine does not write there by itself.** **Save to the repository…** in the workflow editor, and `aubergine workflow export <name> --to-repository` typed inside a terminal, write one file into that folder, named after the workflow (`Fix a bug` becomes `fix-a-bug.json`; lower-case letters, digits and dashes only). A file of that name is not replaced unless you say so (`--overwrite`, or the second button). Committing it is yours to do. Only you can do this: no token and no session's own token can write into a repository or accept a file from one.

### From the command line

```sh
aubergine workflow new "Hotfix" --template fix-a-bug
aubergine workflow run "Hotfix" --session api --input task="the login page rejects valid passwords"
```

`workflow list`, `show`, `edit`, `copy`, `remove`, `export` and `import` do what they say; see [Command line](#command-line). `export` writes one workflow as a JSON file to pass on, and `import` makes a workflow from such a file. The file has a format number, and fields a version does not know are kept and written out again.

Inside a session that is on a run:

```sh
aubergine workflow status              # where the run stands and what to do now
aubergine workflow done --note "…"     # the current element is finished; prints what comes next
aubergine workflow done --output f     # the same, handing in what the element produces (a checklist)
aubergine workflow brief               # what this session was asked to write, and how to hand it in
aubergine workflow blocked "…"         # you cannot go on without a person
aubergine workflow goto <element>      # by name, ID or number
aubergine workflow pause | resume | stop
```

### The `aubergine` command inside terminals

An agent can only report if it can run `aubergine`. So every terminal started on the canvas gets a small launcher for the command, kept in the data folder (`bin/aubergine`), at the **end** of its `PATH`. If you have linked the command yourself, yours comes first and is the one used. In zsh the folder is put back after your own startup files have run, in case they rebuild `PATH` from nothing, unless a command of that name is already found. No startup file of yours is edited.

Terminals that were already open when you updated keep the `PATH` they started with. If `aubergine` is not found in one of those, restart its shell (type `exit`, then **Restart here**), or run the launcher by its full path: `bin/aubergine` inside the data folder (the server prints where that is when it starts). Terminals started since also have that folder in `$AUBERGINE_BIN`.

### For programs

Workflows, the shelf, drafts and runs are in the [API](docs/api.md): propose drafts, and with review switched off for the token create and change workflows and shelf elements (`workflows:write`); start runs, report on them and tick checklist items (`runs:write`); read all of it (`read`). Reporting on a run does not type into a terminal: a token that starts a run is given the line above in the answer, and nothing is typed. Limits on the size of a workflow are under `workflows` in the settings.

## Updating from an older version

When a newer version changes how the canvas is saved, the server updates `state.json` in the data folder the first time it starts, and keeps the file as it was beside it (for example `state.json.v1.backup`). To go back to an older version of the code, stop the server and put that copy back as `state.json`.

## After a reboot

A reboot ends the shells. The next time the server starts, every session gets a fresh shell in its last known folder, in the same place on the canvas. Nothing is re-run.

## Settings

Create `config.json` in the data folder (the server prints its location at start). Every field is optional:

```json
{
  "font": { "family": "Menlo, monospace", "size": 13 },
  "theme": "dark",
  "shell": null,
  "defaultFolder": "~/work",
  "agents": { "logPrompts": true, "claudeCommand": "claude" },
  "api": { "rateLimitPerMinute": 600, "maxBodyBytes": 1048576, "activityLogMaxBytes": 5242880 },
  "workflows": { "maxElements": 50, "maxElementChars": 20000, "quietAfterSeconds": 300 },
  "terminal": { "protectNewSessions": false, "protectAgentSessions": true, "auditInput": false },
  "shortcuts": {},
  "shortcutsInAppWindow": {}
}
```

- `theme`: `"dark"` or `"light"`.
- `shell`: absolute path of the shell to start; `null` uses your own `$SHELL`.
- `defaultFolder`: where new terminals start; `null` means your home folder.
- `agents.logPrompts`: `false` keeps prompts given to agents out of the note log. Default `true`.
- `agents.claudeCommand`: the command line that starts Claude Code, used by **+ Claude Code**, `aubergine here --claude`, `aubergine move` and **Resume agent**. Default `claude`. It can be a whole launcher:

  ```json
  { "agents": { "claudeCommand": "mytool launch -- claude" } }
  ```

  Aubergine adds its own flags (`--settings <file>`, and `--continue` or `--resume <id>`) at the end. If your launcher needs them somewhere else, mark the place with `{flags}`, for example `"mytool run claude {flags} --then-something"`. The line is typed into your shell exactly as you wrote it, so quote it as you would on the command line.

- `api`: limits on calls made with [API tokens](#api-tokens): calls per minute per token, the largest request body, and the size of the activity log. They apply when the server is next started.
- `workflows`: how many elements a [workflow](#workflows) may have, how long the text of one element (and the text for every element) may be, and after how many seconds of output without a report a run is marked quiet. The two limits apply when the server is next started.
- `terminal`: [terminal access](#terminal-access) for API tokens: whether new terminals, and new agent sessions, start "people only"; the limits on typing; and `auditInput`, which keeps what tokens type in a file.
- `shortcuts`, `shortcutsInAppWindow`: your own keys; see [Keyboard](#keyboard).

Font, theme and keys apply when you reload the page; shell and folder apply to the next new terminal.

## Shell environment

Every session starts your shell as a **login shell**, so your own profile files build its environment (`PATH` and the rest) no matter how the server was started: from a terminal, or at login with no terminal at all. The server passes on its own environment as the base, without the variables that belong to the tool that launched it, and fills in `HOME`, `USER`, `LOGNAME`, `SHELL` and `LANG` when they are missing.

One thing to know: tmux fixes that base environment when its server first starts. A variable you export later in some other terminal does not appear in existing or new sessions until all sessions have ended.

## Command line

`bin/aubergine.mjs` is the `aubergine` command. The installer links it onto your `PATH`; with a manual install, step 6 of the [manual install](#manual-install) does.

```
aubergine start                start the server here, in the foreground (--open: and open the browser, signed in)
aubergine open                 open the canvas in your browser, signed in (--print: show the sign-in address instead)
aubergine update               fetch the latest code, install and build
aubergine version              version, commit, where the code and your data are
aubergine doctor               check everything Aubergine needs, one line per check
aubergine uninstall            remove the command and an installed copy; data and terminals are kept (--yes: do not ask)
aubergine list                 sessions with their state, command and folder
aubergine new [name]           start a new terminal on a canvas
aubergine canvas list          the canvases, with how many terminals are on each and how many wait for you
aubergine canvas new <name>    add a canvas
aubergine attach <name>        open a session in this terminal
aubergine here [name] [-- cmd] start a session in this folder and turn this terminal into a view of it
                               --canvas <name>  put it on this canvas
                               --no-attach  only create it
                               --no-open    do not bring it up in the browser
                               --claude     start Claude Code in it, continuing this folder's last conversation
                               --claude -- <args>   start it with these arguments instead of --continue
aubergine move                 list running Claude Code tabs that can be moved (read-only)
aubergine move <terminal>…     start a copy of each one's conversation on the canvas (or --all)
                               --stop       ask an idle original to exit, then resume the same conversation
                               --dry-run, --yes, --force, --no-open
aubergine scan                 list open terminals that are not on the canvas yet (read-only)
aubergine import <terminal>…   give those terminals a canvas session in the same folder
aubergine import               the same for every one, one per folder (--all, --dry-run)
                               --canvas <name>  put them on this canvas
aubergine shell-hook print     print the zsh lines that make new tabs start on the canvas
aubergine token create <name> --scope <scope>…   make an API token; its secret is printed once (--expires 30d)
                               --no-review  let it create and change workflows directly, without your review
                               --reach all | canvas:<name> | tag:<tag>   which terminals terminal:read and terminal:input reach
aubergine token list           the API tokens, their scopes and when each was last used
aubergine token revoke <name>  revoke a token; it stops working at once
aubergine workflow list        the workflows, with their elements and how many runs are going
aubergine workflow show <name> one workflow in full
aubergine workflow new <name> [--template <template>]   make one; `workflow templates` lists the templates
aubergine workflow edit <name> change one in your editor ($VISUAL or $EDITOR), or from --file <path>
aubergine workflow copy <name> [new name]
aubergine workflow remove <name>   remove one (--yes: do not ask); refused while a run of it is going
aubergine workflow export <name> [file]   write one as a file to pass on
aubergine workflow export <name> --to-repository [--overwrite]   inside a session: write it into the repository's .aubergine/workflows
aubergine workflow import <file> [--name <name>]   make one from such a file ("-" reads standard input)
aubergine workflow run <name> [--session <name|id>] [--input key=value]… [--replace]
                               start a run on a session: the one it is typed in, when typed inside one
aubergine workflow status      inside a session on a run: where it stands and what to do now
aubergine workflow done [--note <text>] [--output <file>]   the current element is finished; prints what comes next
aubergine workflow brief       inside a session asked to write a workflow or an element: the request
aubergine workflow propose --file <file>   hand a workflow in as a draft, for you to review
aubergine element propose --file <file>    the same for one element
aubergine element list         the shelf; also show <name> and remove <name>
aubergine element run <name> [--session <name|id>] [--input key=value]…   run one element by itself
aubergine workflow blocked <reason>, goto <element>, pause, resume, stop
aubergine screen <session>     what that terminal shows now, as text
aubergine output <session> [--lines n]   what it printed recently
aubergine send <session> <text> [--enter]   type text into it, exactly as given
aubergine run <session> [--timeout s] -- <command>   run a command at its prompt, wait, print the output
aubergine protect <session>    mark it people only: no API token may read it or type into it (unprotect undoes it)
aubergine note <text>          inside a session: add an entry to its note log
aubergine demo                 make a canvas named "Demo" with stand-in agents on it and a tour of it (--remove: take it all away; --no-open)
aubergine mcp [--url <address>]   an MCP server on standard input and output: the API as tools, for an agent or another MCP client
aubergine hooks print          print the Claude Code hook settings
aubergine service install      start the Aubergine server at login (macOS)
aubergine service uninstall    stop starting it at login
```

`attach` and `here` show the very same session as the canvas, so both views stay in step. Close the terminal window to detach; the session keeps running. See [Moving your existing terminals over](#moving-your-existing-terminals-over) for `here`, `move`, `scan`, `import` and `shell-hook`.

`new`, `here` and `import` take `--canvas <name>`: the name, the start of it if that is unambiguous, or the canvas's ID. Capitals do not matter. Without it the session goes to the canvas you looked at most recently in a browser, or to the first canvas if the server has not seen a browser since it started. `canvas list` marks that canvas with `*`.

`service install` writes a per-user launchd agent that runs the server from the copy the command belongs to (an installed copy or a checkout alike), with the port and data folder in effect when you ran it. The web app must be built: the installer does that, and `aubergine start` does it on first use; for a manual install run `pnpm build` first.

`open --print` prints an address that signs a browser in. Treat it like a password: anyone who can open it on this computer can use your terminals.

## For programs inside a session

Every session's shell has these variables:

| Variable | Meaning |
|---|---|
| `AUBERGINE_URL` | Address of the server |
| `AUBERGINE_SESSION_ID` | This session's ID |
| `AUBERGINE_TOKEN` | A token that is valid for this session only |
| `AUBERGINE_BIN` | The folder with the `aubergine` command, also at the end of `PATH` |
| `AUBERGINE_PORT`, `AUBERGINE_DATA_DIR` | The port and data folder of the server the session belongs to, so that `aubergine` typed in it talks to that server |

With the token as a bearer credential, a program may do these things, all for its own session and no other:

```
PUT  /v1/sessions/<id>/attention    {"state": "working" | "waiting" | "done" | "none", "message": "..."}
POST /v1/sessions/<id>/notes        {"text": "..."}
GET  /v1/sessions/<id>/run          the run the session is on, and what to do now
POST /v1/sessions/<id>/run/report   {"type": "done", "elementId": "...", "note": "..."} and the other reports
GET  /v1/sessions/<id>/brief        what the session was asked to write
GET  /v1/sessions/<id>/drafts       the drafts it proposed, with the comments on them
GET  /v1/sessions/<id>/repository-workflows   the workflows its repository offers, and whether each was accepted
POST /v1/sessions/<id>/drafts       propose a workflow or an element as a draft
```

Everything else is refused: it cannot list runs or workflows, start a run, reach another session's run, read a draft it did not propose, accept anything, or run a repository workflow nobody accepted. `aubergine note`, `aubergine hook` and the in-session `aubergine workflow` commands are thin wrappers around these calls. This token is made for the session by Aubergine and is separate from the [API tokens](#api-tokens) you create yourself, which can do more.

## API tokens

A program of your own (a script, a build job, another tool on this computer) can read and change the canvas over HTTP with an **API token**. You create the token, choose what it may do, and can revoke it at any time.

**Create one.** In the browser: ⌘K, type `API tokens`, give it a name and scopes, and copy the secret. Or from a terminal:

```sh
aubergine token create "build script" --scope read --scope sessions:write --expires 30d
```

The secret (it starts with `aubt_`) is shown **once**: in the browser with a copy button, on the command line as the only thing on standard output, so that `TOKEN=$(aubergine token create …)` captures it. Aubergine keeps only a hash of it and cannot show it again. Keep it like a password; if it gets out, revoke the token.

**Call the API.** Send the secret as a bearer token, to `127.0.0.1` only:

```sh
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4600/v1/canvases

curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"name": "tests", "cwd": "/path/to/project", "command": "npm test"}' \
     http://127.0.0.1:4600/v1/canvases/<canvas id>/sessions
```

`GET /v1` needs no scope: it says which features and scopes this server has and, for a token, its own name, its scopes, which terminals its terminal scopes reach, and whether its workflow changes need your review.

**Scopes.**

| Scope | Allows |
|---|---|
| `read` | see canvases, sessions, layout and notes; follow changes |
| `canvases:write` | create, rename, reorder and close canvases; move and resize nodes; frames; show a canvas in the browser |
| `sessions:write` | start, rename, tag, move, park, restore and end sessions; show a session in the browser. By itself it starts plain shells and runs nothing: starting a session **with a command** also needs `terminal:input` with a reach that covers the new session (its canvas, its tags), and is refused where new sessions start people only |
| `notes:write` | change a session's pinned note and add entries to its note log |
| `workflows:write` | propose workflows and elements as drafts for you to review. With review switched off for the token: create, change, copy and remove workflows and shelf elements directly |
| `runs:write` | start runs of workflows on sessions and report on them (done, blocked, go to, pause, resume, stop). By itself it types nothing into a terminal; with `terminal:input` on that terminal, the one fixed kickoff sentence is typed |
| `terminal:read`, `terminal:input` | read what terminals show, and type into them. Not implied by anything above, and each token says which terminals it may reach. **With `terminal:input` a token can run any command as you.** See [Terminal access](#terminal-access) before granting either |

Neither terminal scope is implied by any other, `read` included.

**What no token can do, whatever its scopes:** create, list or revoke tokens; read the activity log; change settings; see, bring in or stop terminals outside Aubergine. Those stay with you, in the signed-in browser and the `aubergine` command.

**The routes** are in [docs/api.md](docs/api.md): one section for each, with the scope it needs, its parameters, what it takes and gives, and an example with curl. In short: canvases (list, create, read, change, close, show), sessions (list, start, read, change, end, move, park, restore, show), notes, layout (nodes and frames), and a stream of changes.

That reference is not written by hand. Every route is declared once in the code; the server registers its handlers from those declarations and describes them, as an OpenAPI 3.1 document, at:

```sh
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4600/v1/openapi.json
```

The reference and a typed TypeScript client (`client/` in this repository) are generated from that description, so they cannot say something the server does not do. The description needs no scope, and `GET /v1` says where it is.

**From TypeScript,** in Node or a browser, with no dependencies:

```ts
import { AubergineError, createClient } from '@aubergine/client';

const api = createClient({ baseUrl: 'http://127.0.0.1:4600', token: process.env.TOKEN });

const canvas = await api.createCanvas({ body: { name: 'Builds' } });
await api.startSession({ canvasId: canvas.id, body: { name: 'tests', command: 'npm test' } });

for await (const session of api.each.listSessions({ query: { state: 'open' } })) {
  console.log(session.name);          // every session, fetched a page at a time
}

try {
  await api.endSession({ sessionId });
} catch (error) {
  if (error instanceof AubergineError) console.error(error.status, error.code, error.message);
}
```

The client is part of this repository's workspace for now, not a published package.

The shapes are meant to last:

- Errors are always `{"error": {"code": "...", "message": "..."}}` with a fitting HTTP status: `401` for a missing, wrong, revoked or expired token, `403` when its scopes do not allow the call.
- Lists return `{"items": [...], "nextCursor": "..." | null}`. Pass `?cursor=<nextCursor>` for the next page and `?limit=` for its size. A cursor is opaque.
- Fields you send that the server does not know are ignored, and responses may gain fields.
- Times are ISO 8601 in UTC.
- A `POST` that creates something takes an optional `Idempotency-Key` header: sending the same key again returns the first answer instead of creating a second thing. Keys are remembered until the server restarts.

**Limits.** Each token may make 600 calls a minute; beyond that the answer is `429` with a `Retry-After` header. A request body may be at most 1 MiB; larger gets `413`. Change both under `api` in `config.json` (`rateLimitPerMinute`, `maxBodyBytes`); they apply from the next start of the server.

**The activity log.** Every call made with a token is recorded: when, which token, what it asked for, and how it ended. The secret and what was sent are never recorded. See it in the browser (⌘K, `API activity`), where it can be narrowed to one token, or read the file: `activity.log` in the data folder, one JSON object per line. It is kept to 5 MiB (`api.activityLogMaxBytes`); when it is half full the older half moves to `activity.log.1`, replacing the one before.

**What you do from the command line is recorded too, for a few things.** An agent in one of your terminals runs as you, so it can run `aubergine` commands that only you may use, or call the server with your sign-in. That cannot be prevented on your own computer; it can be seen. When one of the things only you may do (accepting or discarding a draft, accepting a repository workflow, writing into a repository, making or revoking a token) is done as you from outside a browser page, the activity log records it as "you, from the command line", with the terminal it came from when the caller says so. Read this as a trace of ordinary use, not as a guard: the server tells a browser page from other callers by a header browsers add, and learns the terminal from the command itself, so a program that wants to hide can leave both out or fake them. What is done in the browser is not recorded here.

**Revoke** in the browser, or with `aubergine token revoke <name>`. A revoked or expired token is refused on its very next call. `aubergine token list` shows every token with its scopes and when it was last used.

Tokens work on this computer only. The server listens on `127.0.0.1` and that does not change.

## Terminal access

A program with an API token can read what your terminals show and type into them. This is the most that can be given to a token, so it is given in pieces, and each piece is yours to decide.

**Read these three sentences before you make such a token.** A token with `terminal:input` can run any command on this computer as you, in every terminal it may reach. A token with `terminal:read` can read whatever is on those screens, secrets included. Neither comes with any other scope: `read` does not read terminals.

### What you decide

- **The two scopes**, `terminal:read` and `terminal:input`. Both are off unless you tick them.
- **Which terminals.** A token with either scope must be told when it is made: only terminals on certain canvases, only terminals with a certain tag, or every terminal. There is no default. The limit is checked on every call, so a terminal moved onto a canvas, or given the tag, comes within reach, and one that leaves is out.
- **People only.** The lock in a terminal's title bar (or `aubergine protect <session>`) closes that terminal to every token, whatever its scopes and reach: no reading, no typing, and its matches are left out of searches. Only you can switch it, in the browser or from the command line; no token can, and neither can the terminal's own programs. **New Claude Code sessions start people only**: a program typing into an agent is the riskiest case. Change that, or make every new terminal start people only, under `terminal` in the settings.

```sh
aubergine token create "deploy bot" --scope terminal:read --scope terminal:input --reach tag:deploy
aubergine protect api        # close the terminal "api" to every token
aubergine unprotect api
```

### What a token can do

Reading needs `terminal:read`:

```
GET /v1/sessions/<id>/screen             what the terminal shows now: text, size, cursor
GET /v1/sessions/<id>/output?lines=200   what it printed recently; "nextCursor" reads further back
GET /v1/search?q=<text>                  search what terminals printed
```

What comes back is text only: colors and other control sequences are not in it. Reading does not attach to the terminal, so nothing is resized and nothing changes for you while a program reads. A search covers only the terminals the token may read; the answer says when some were left out, not which.

Typing needs `terminal:input`:

```
POST /v1/sessions/<id>/input   {"text": "git status", "enter": true}
POST /v1/sessions/<id>/input   {"keys": ["Ctrl+C"]}
POST /v1/sessions/<id>/run     {"command": "pnpm test", "timeoutSeconds": 120}
```

- **`text` is typed exactly as it is.** Nothing in it is read as the name of a key or as an escape: `"Enter"` types five letters. Enter is pressed only when `enter` is true. Text with control characters is refused; press keys by name instead. Text with line breaks is refused too, unless you set `"paste": true`: then it is handed over as a paste (bracketed, where the program in the terminal asked for that), which is how a terminal takes several lines without each line break being the Enter key. In a shell that does not use bracketed paste, each pasted line runs as it arrives.
- **`keys`** are from a fixed list: Enter, Tab, Escape, Backspace, Delete, Space, the arrows, Home, End, PageUp, PageDown, Ctrl+C, Ctrl+D, Ctrl+Z, Ctrl+L, Ctrl+U, Ctrl+A, Ctrl+E, Ctrl+R.
- **Whatever has the keyboard receives it.** Typed into a shell, text with Enter is a command that runs. Typed into an agent, it is a prompt.
- **`run`** types one command into a shell that is at its prompt, waits until the shell says the command finished, and answers with the exit code, what the terminal showed meanwhile and how long it took. It is refused when a program or an agent has the keyboard (`not_at_prompt`), when the shell does not report when commands finish (`no_shell_integration`; today that means any shell but zsh), and when another run is being waited for there (`run_in_progress`). When the time is up it answers `"finished": false` and leaves the command running: it never stops anything. A token with `terminal:input` but not `terminal:read` gets the exit code without the output.

A session that is people only answers every one of these with `403` and the code `people_only`. A session outside a token's reach answers `403` with the code `out_of_reach`, in the same words whether or not there is such a session.

With `runs:write` and `terminal:input` on a terminal, a token that starts a workflow run there has the one fixed kickoff sentence typed for it, so `workflow run` works with no browser open. Without input on that terminal the run starts and nothing is typed, as before.

What a `read` token no longer sees: the command line a terminal is running (`status.commandLine`) and the prompts in a session's note log are terminal content, and are given only to a token that may read that terminal.

### What you see

- When a token types into a terminal, its title bar shows **typed by <token>** for half a minute, and its row in the list keeps "typed by <token>" with the time.
- The **activity log** (⌘K, `API activity`) records every read and every input by a token: when, which token, which terminal, how many characters, how it ended, and for input a short fingerprint, so that two entries can be seen to be the same text. It can be narrowed to one terminal. **It does not keep what was typed or read.**
- If you want what was typed kept in full, set `"terminal": { "auditInput": true }` in the settings. Then every text and key a token types (and what you type with `aubergine send` and `aubergine run`) is written to `input.log` in the data folder, one JSON line each, readable only by you. That file then holds whatever was typed, passwords included; it is not trimmed. It is off unless you turn it on.

### Limits

Per token and per terminal: 60 input calls a minute and 20,000 characters a minute; 4,000 characters in one call; at most 8 runs being waited for at once. All under `terminal` in the settings (`inputCallsPerMinute`, `inputCharsPerMinute`, `inputCharsPerCall`, `maxWaitingRuns`); they apply from the next start of the server. Beyond them the answer is `429` with `Retry-After`, or `413`.

### From the command line, as you

```sh
aubergine screen api                        # what the terminal "api" shows now
aubergine output api --lines 500
aubergine send api "git status" --enter     # typed exactly as given; without --enter nothing is pressed
aubergine run api --timeout 120 -- pnpm test   # prints the output, exits with the command's exit code
```

These are you, not a token, so scopes, reach and "people only" do not apply to them. They are recorded in the activity log as done from the command line.

## How an agent is set up

You start an agent and want to know what it has been given: which MCP servers (connectors), which plugins, hooks and skills, which settings files apply, and what Aubergine itself added. **⚙ on** on an agent's terminal shows that; so does "What is switched on for this agent…" in the palette, and the notes drawer of the side list. It is for Claude Code today.

**What it is, and what it is not.** It is what the agent's configuration files say, read at the moment you open the panel. It is not a list of what the running agent has loaded, and Aubergine starts and contacts nothing to make it: an MCP server shown as "configured" has not been checked, and may not work. Read it as "this is how it is set up", and ask the agent itself (`/mcp`, `/plugin`, `/status` inside it) for what is live.

**What is shown.** Grouped by kind, each item with where it comes from as a plain word:

| Source | Means |
|---|---|
| yours | your own settings for the agent, in every project |
| this project | files in the terminal's folder that anyone working there shares |
| yours, for this project | your own settings for this one project |
| Aubergine | what Aubergine passes to an agent it starts |
| a plugin: *name* | brought by a plugin that is switched on |
| your organization | settings files your organization put on this computer |
| your account | comes with your account at the agent's maker, not from a file |

and whether it is on, off, waiting for your approval in the agent, or simply configured. Where the same MCP server is set in two places, the one that wins is shown and the other is marked as not used. A line at the top says what Aubergine added for this session: its hooks, the tools you chose for it (none, its own work only, or more), and the one sentence it types to start a workflow.

**Names only.** These files can hold secrets: tokens in an MCP server's environment, in its arguments, in an address, in a header, in a hook's command. The panel shows the name of the program a server or a hook runs, the host of an address, and the names of environment variables and headers. It never shows a value, an argument, the rest of a command line, or the text of a permission rule beyond its tool and program. **Copy as text** gives the same list for a bug report, with the same rule. Nothing that is read is kept: not in Aubergine's state, not in a log.

**What it cannot say**, and says so at the bottom of every list:

- **Connectors from your account** (for example Slack, switched on in your account with the agent's maker). The agent fetches these itself; they are in no file on your computer. They are not in the list, whether or not the agent has them. This is the biggest gap: if you came here to see whether Slack is connected, ask the agent with `/mcp`.
- **Whether anything works.** Checking would mean running the commands your configuration names, which Aubergine does not do.
- **What the running agent has loaded.** An agent reads most of its configuration when it starts. What changed since, and what was on its command line when you started it yourself, is not known.
- **Settings your organization delivers without a file** (from its console, or by device management).

A file that is there but cannot be read, or is not in the form Aubergine was written to read, is named at the top of the panel as making the list incomplete. It is never shown as "nothing is on".

**Only you, in the browser.** No API token and no session can read this, and the MCP server has no tool for it.

**What an element needs.** When you start a workflow on an agent's terminal, each thing its elements need that is an MCP server or a command gets a mark: **found** (something configured has a name like it; hover to see what), **not found**, or **cannot tell**. The marks compare names. They do not check that anything works, and they never stop a run.

## Tools for agents: the MCP server

`aubergine mcp` is an MCP server on standard input and output. It offers the API above as tools to an agent, or to any other MCP client. It is a client of the public API and nothing more: it holds no rules of its own about who may do what. It asks the server once, when it starts, what its credential is, lists the tools that credential can use, and passes every call on; the server decides each one.

It needs two things, both from its environment:

| | |
|---|---|
| Where the server is | `AUBERGINE_URL`, which every Aubergine session has; or `--url http://127.0.0.1:4600` |
| A credential | `AUBERGINE_API_TOKEN`, the secret of an API token; when that is not set, the session's own `AUBERGINE_TOKEN` |

It never reads your sign-in, and it has no tool for what only you may do: making or revoking tokens, settings, "people only", accepting or discarding drafts, accepting a repository's workflows, the activity log.

**Which tools are listed depends on the credential.**

| With | Tools |
|---|---|
| a session's own token | `workflow_status`, `workflow_done`, `workflow_blocked`, `workflow_goto`, `note_add`, `attention_set`, `draft_brief`, `draft_propose_element`, `draft_propose_workflow`, `repository_workflows`: its own work, on its own session only |
| `read` | `canvases_list`, `sessions_list`, `session_get`, `notes_read`, `workflows_list`, `runs_list`, `run_get`, `workflow_status`, `repository_workflows` |
| `sessions:write` | `session_start`, `session_move`, `session_park` |
| `notes:write` | `note_add`, `note_write` |
| `runs:write` | `workflow_run`, `element_run`, `workflow_done`, `workflow_blocked`, `workflow_goto` |
| `workflows:write` | `draft_propose_element`, `draft_propose_workflow`: drafts for you to review, never a workflow that can run |
| `terminal:read` | `terminal_screen`, `terminal_output`, `terminal_search` |
| `terminal:input` | `terminal_send`, `terminal_keys`, `terminal_run` |

`aubergine_status` is always there: it says which server, what the credential is and may reach, and, when nothing else is listed, why. A tool takes a session by its ID or by its exact name.

**What comes back.** A short text, and the same as data where the protocol has a place for it. The data carries the whole text as well: some clients hand their model only one of the two forms, and what a model reads must not depend on which. A refusal is a sentence the model can act on: that a terminal is "people only" and only you can open it to programs; that the credential's reach does not cover that terminal; when to try again after too many calls. What a terminal shows, a note, and a search match are other people's text: such text is returned between two marker lines that carry a mark made for that one answer, with a line before it saying that it is data and not instructions, and with control characters shown as pictures of themselves. This lowers the chance that a model takes what it reads in a terminal for an instruction. It does not remove it: give an agent `terminal:read` only on terminals whose content you would let it act on.

**It says what it is.** Its calls carry the header `X-Aubergine-Client: mcp/<version>`, and the activity log shows that beside each call made with a token. This is the program's own word, kept as a trace; nothing is allowed or refused because of it.

### Giving a Claude Code session the tools

The small button beside **+ Claude Code** (or "New Claude Code session with Aubergine tools…" in the palette) asks first, under **Aubergine tools for this agent**:

- **None.** As before. The agent still has the `aubergine` command in its terminal.
- **Its own work only.** The MCP server runs with the session's own credential: its workflow, its notes, saying when it needs you, handing in drafts. No token is made, and it reaches no other session.
- **More…** You choose scopes and, for the terminal scopes, a reach (this canvas by default). When you press the button, and only then, an API token is made for that one session. It is named after the session, listed with your other tokens, has "changes to workflows need my review" on, and is revoked when the session is ended for good. No token and no session can cause one to be made.

An agent given "More…" still cannot read or type into a terminal marked "people only", and other Claude Code sessions are marked so from the start unless you changed that in the settings.

Nothing of the agent's own configuration is written. A file that names the MCP server is written to `agents/mcp/` in the data folder, readable by you only, and passed to the agent on its launch line (`--mcp-config`), as the hook settings are. For "More…", the token's secret is in that one file and nowhere else: not in the state (only its hash is), not on the launch line, not in a log. The file is removed when the session is ended for good, when you revoke the token, and, for whatever a crash left behind, when the server next starts.

### Other MCP clients

Anything that can start an MCP server as a command can use it. The general shape of the configuration is a command, its arguments, and an environment:

```json
{
  "mcpServers": {
    "aubergine": {
      "command": "aubergine",
      "args": ["mcp", "--url", "http://127.0.0.1:4600"],
      "env": { "AUBERGINE_API_TOKEN": "<the token's secret>" }
    }
  }
}
```

Where the file goes and what the outer key is called differs from client to client; the command, the arguments and the environment are the same everywhere. If the client does not find `aubergine` on its `PATH`, give the full path that `which aubergine` prints.

Make the token for it with the scopes it should have, and no more:

```sh
aubergine token create "my MCP client" --scope read --scope notes:write
aubergine token create "CI helper" --scope read --scope terminal:read --scope terminal:input --reach tag:ci
```

The secret is printed once. A client started inside an Aubergine session needs neither `--url` nor a token for the session's own work: it finds both in its environment.

The server speaks the current revision of the protocol and the earlier one that opens with a handshake, over standard input and output only. It writes nothing but protocol messages to standard output; what it has to say about itself goes to standard error, and never includes a credential.

## Develop

```sh
pnpm dev          # daemon on :4600 and the web dev server on http://127.0.0.1:5173
pnpm check        # type check, lint, unit tests and the browser smoke test
pnpm generate     # write the client and docs/api.md again after changing a route or a schema
pnpm load-canvas  # three throwaway canvases with 90 sessions between them, for judging scale by hand
```

The smoke test needs a browser once: `pnpm exec playwright install chromium`.

Environment variables, all optional:

| Variable | Default | Purpose |
|---|---|---|
| `AUBERGINE_PORT` | `4600` | Port on `127.0.0.1` |
| `AUBERGINE_DATA_DIR` | per-user application data folder | Where state, settings and the access token are kept |
| `AUBERGINE_TMUX_SOCKET` | `aubergine` | Name of the dedicated tmux socket |
| `AUBERGINE_TMUX_BIN` | `tmux` | tmux binary to use |

Sessions are ordinary tmux sessions on that socket, so `tmux -L aubergine ls` lists them.
