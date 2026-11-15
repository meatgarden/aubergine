# Keys: what a page can count on

Aubergine runs in a browser, and a focused terminal must receive nearly every key. So a shortcut has to get past two owners before the canvas may use it:

1. **The browser and the system.** Some chords never reach a page (a new tab, closing the window). A page cannot detect this; it simply never sees the key.
2. **The program in the terminal.** Shells, editors such as vim and emacs, and tmux use plain keys, Ctrl with a key, and Alt (Option) with a key. Those are never taken while a terminal has focus.

This file records what is known about the first, how it was found out, and what has not been measured.

## Summary

| | Status |
|---|---|
| macOS, Chromium 158, browser tab | Driven by automation only. Real key presses **not measured**. |
| macOS, Chromium 158, app window | Driven by automation only. Real key presses **not measured**. |
| macOS, Safari and Firefox | **Untested.** |
| Linux, any browser | **Untested.** |
| Windows, any browser | **Untested.** |

The default keys were therefore chosen from what browsers document, and every one of them can be changed or removed in `config.json`. They come in two kinds:

- **Keys of Aubergine's own** (⌃⌘ chords on macOS, Ctrl+Shift chords elsewhere), chosen so that no browser is known to use them.
- **The keys browsers use for their own tabs** (Ctrl+Tab, ⌘1 and so on), bound to canvases as well. Status: *bound; delivered only where the browser allows; not measured.* In an installed app window there are no browser tabs and they are expected to arrive. In a browser tab the browser usually takes them first, and then the page never knows. Binding them costs nothing either way.

Anything is also reachable from the palette (⌘K, or Ctrl+Shift+K), which needs only keys that every browser delivers: with it open and nothing typed, `1` to `9` go to a canvas and `[` and `]` to the previous and next one.

## How to measure

`web/key-tester.html` is a page for this. It is served by the development server only and is not part of the built app.

```sh
pnpm dev
# then open http://localhost:5173/key-tester.html
```

Click the page, press each chord in its lists, and use **Copy results as Markdown**. A row says *delivered* once the page has received the chord; a chord the browser keeps never arrives. Results are stored in the browser, so a chord that closes the tab does not lose them. Run it once in a normal tab and once in an installed app window, because a window of its own has no tabs and gives some chords back to the page. Paste the result into this file under a heading that names the system, the browser and its version.

## What was measured, and why it settles little

On macOS 27.2 with Chromium 158, the tester was driven by a script that sends key events through the browser's automation interface: headless, in a visible tab, and in a visible window started as an app. All 59 chords in the tester's lists were delivered in all three, **including ⌘T, ⌘W, ⌘N and ⌘Q**, which a real key press never delivers to a page.

So events sent by automation skip the step where the browser takes its own shortcuts. The run shows two things only:

- the tester and the matching code agree on every chord (each press was recognised as the chord that was sent), including chords where the modifier changes the character typed, such as Option with a letter, which is why chords with Ctrl, ⌘ or Alt are matched by the physical key;
- nothing in the page itself swallows any of them.

It does **not** show which chords the browser keeps. That needs key presses from a real keyboard, which the machine these changes were made on did not allow a program to send. Until someone runs the tester by hand, the lists below are what browsers are documented and commonly seen to do.

## Chords assumed to be kept (not measured here)

A chord in these lists can still be bound, and works wherever the browser does let it through. The shortcut sheet shows such a key with a dashed outline and says it is not expected to work in this kind of window. When `config.json` sets one, the sheet and the server log also say so once.

macOS:

| Chord | What it does instead | Kept in an app window too? |
|---|---|---|
| ⌘T, ⇧⌘T | new tab, reopen tab | assumed free, unmeasured |
| ⌘1 to ⌘9 | switch tabs | assumed free, unmeasured |
| ⇧⌘[ and ⇧⌘], ⌥⌘← and ⌥⌘→, ⌃Tab, ⌃⇧Tab, ⌃PageUp, ⌃PageDown | switch tabs | assumed free, unmeasured |
| ⌘N, ⇧⌘N, ⌘W, ⇧⌘W, ⌘Q | windows, quit | yes |
| ⌘Tab, ⌘Space, ⌘H, ⌘M, ⌘` | the system | yes |
| ⌃⌘Q, ⌃⌘F, ⌃⌘Space, ⌃⌘D | lock, full screen, characters, look up | yes |

Linux and Windows (**entirely untested**):

| Chord | What it does instead |
|---|---|
| Ctrl+T, Ctrl+Shift+T, Ctrl+1 to Ctrl+9, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown | tabs |
| Ctrl+N, Ctrl+Shift+N, Ctrl+W, Ctrl+Shift+W, Ctrl+Shift+Q, Alt+F4 | windows, quit |
| Ctrl+Shift+I, Ctrl+Shift+J | developer tools |
| Ctrl+Shift+Escape, Alt+Tab | the system |

"Assumed free in an app window" means the sheet shows the key as expected to work there. It is an expectation from how app windows are documented to behave, not a measurement.

## The browser's tab keys, bound to canvases

| Chord | Command | Inside a focused terminal |
|---|---|---|
| Ctrl+Tab, Ctrl+Shift+Tab | next, previous canvas | yes |
| ⇧⌘] and ⇧⌘[, ⌥⌘→ and ⌥⌘← (macOS) | next, previous canvas | yes |
| ⌘1 to ⌘9 (macOS) | canvas by number | yes |
| Ctrl+PageDown, Ctrl+PageUp | next, previous canvas | no: Ctrl with a key may mean something to a program |
| Ctrl+1 to Ctrl+9 (Linux, Windows) | canvas by number | no, for the same reason |

Status of every row, in every browser and on every system: **bound; delivered only where the browser allows; not measured.** The key tester lists all of them, so one run in a tab and one in an app window answers it for a browser.

Ctrl+Tab is the one exception to the rule about terminals in the last section. A terminal cannot pass Ctrl+Tab to its program as a key of its own (the program would get a plain Tab), so no program can be waiting for it. Plain Tab and Shift+Tab are completion and are never taken from a terminal.

## The chords the canvas takes while a terminal has focus

macOS: all hold Control and Command together, except the palette.

| Chord | Command | Why this one |
|---|---|---|
| ⌘K | palette | a terminal never passes ⌘ chords to its program; not a browser shortcut in the browsers looked at |
| ⌃⌘← ⌃⌘→ ⌃⌘↑ ⌃⌘↓ | terminal to the left, right, above, below | no documented browser or system use; plain ⌃ with an arrow belongs to the system, and ⌥⌘ with an arrow to browser tabs |
| ⌃⌘[ and ⌃⌘] | previous and next canvas | plain ⌘[ and ⌘] are back and forward, ⇧⌘[ and ⇧⌘] are browser tabs |
| ⌃⌘. | leave the terminal | no documented use |
| ⌃⌘J | next waiting session | no documented use |

Status of every row: **not measured with real key presses.**

Linux and Windows: all hold Ctrl and Shift together, the pair terminals have long kept for themselves, because a program in a terminal cannot tell Ctrl+Shift+K from Ctrl+K.

| Chord | Command |
|---|---|
| Ctrl+Shift+K | palette |
| Ctrl+Shift+arrows | terminal to the left, right, above, below |
| Ctrl+Shift+[ and Ctrl+Shift+] | previous and next canvas |
| Ctrl+Shift+. | leave the terminal |
| (none) | next waiting session: nothing free is known, so it is left to the palette |

Status of every row: **untested.** Known risks to check first: desktop environments that use Ctrl+Shift with arrows or with punctuation for input methods or window management.

## Chords that are never taken from a terminal

Whatever `config.json` says, a chord works inside a focused terminal only if a program there cannot need it: on macOS it must include ⌘; elsewhere it must be Ctrl+Shift with a key and no Alt; and on both, Ctrl+Tab and Ctrl+Shift+Tab, as explained above. Anything else (a plain key, Ctrl with a key, Alt or Option with a key) works only while no terminal or text field has focus, and the shortcut sheet says so when such a chord is set in the file. This keeps Ctrl+C, Ctrl+R, Ctrl+A, Ctrl+E, Option with an arrow, Tab, Shift+Tab and Escape going to the shell.
