# Themes of your own

Aubergine comes with ten color themes, four light and six dark. A theme of your own is a file: one of the ten, of the same kind, with your colors over it. It is listed in **Settings → Appearance** after the ten of its kind, marked "yours", and can be chosen wherever a theme can: for the light or the dark page, for a project, as the default for terminals, for terminals by tag, and for one terminal (**Theme…** in its menu).

## Where the files are

`themes/` in the data folder, beside `config.json`. `aubergine theme path` prints where that is. Each file is `<name>.json`; the name, without `.json`, is the theme's ID, which the settings file and the menus use. It is a lowercase letter, then up to 39 lowercase letters, digits and hyphens, and it may not be the ID of one of the ten (`dark`, `nord` and the rest).

The server reads the folder when it starts, each time it reads its settings file (when a page is loaded, for one), and when you press **Read themes again** in Settings. At most 50 files are read, each at most 64 KB. A file is read only if it is a regular file directly in `themes/`: a link is not followed, the folder's own included.

## A file

```json
{
  "$schema": "../theme.schema.json",
  "name": "Harbor",
  "kind": "dark",
  "base": "nord",
  "colors": {
    "bg": "#0e1a24",
    "surface": "#152431",
    "accent": "#5fb3b3",
    "terminal-bg": "#0b1620"
  },
  "terminal": {
    "foreground": "#d8dee9",
    "cursor": "#5fb3b3",
    "selection": "#2b4252",
    "ansi": ["#3b4252", "#cf8a90", "#a3be8c", "#ebcb8b", "#81a1c1", "#b692b0", "#88c0d0", "#e5e9f0",
             "#939db2", "#cf8a90", "#a3be8c", "#ebcb8b", "#81a1c1", "#b692b0", "#8fbcbb", "#eceff4"]
  }
}
```

- `name`: what Settings and the menus call it. One line of plain text, at most 60 characters.
- `kind`: `light` or `dark`: whether it is drawn as the light page or the dark one.
- `base`: one of the ten, of the same kind. Left out: `light` or `dark`, by the kind.
- `colors`: any of the page's 35 color tokens (`bg`, `surface`, `surface-raised`, `field`, `text`, `text-muted`, `accent`, `terminal-bg` and the rest; [design.md](design.md) says what each is for), each `#rrggbb`. What is not named is the base's.
- `terminal`: a terminal's own colors, each `#rrggbb` and each optional: `foreground` (its words), `cursor`, `selection`, and `ansi`, the sixteen colors a program asks for by number, in order (black, red, green, yellow, blue, magenta, cyan, white, then the bright eight); `null` keeps the base's for that one. A terminal's ground is the theme's `terminal-bg`.
- `$schema` points an editor at `theme.schema.json`, which the server writes beside `config.schema.json`; Aubergine itself does not read it. The same schema is [docs/theme.schema.json](theme.schema.json).

A file that is not JSON, has no plain `name`, no `kind` of light or dark, or a `base` that is not one of the ten of its kind, is not read, and Settings and `aubergine theme list` say why in one sentence. Anything else that is wrong (a color that is not `#rrggbb`, a name that is no color, a key a theme file does not have) is skipped and said, and the rest of the file still counts.

Colors set by hand in the settings file (`appearance.colors`) are laid over a theme file's own: first the file's colors, then those for every theme, then those under `"[<name>]"` for that theme alone.

## Commands

```
aubergine theme [list]            every theme, built-in and yours, with what is wrong in a file
aubergine theme new <name>        write themes/<name>.json to start from: every color of the theme it is from
                                  --from <theme>  the theme it is from (default: dark); one of yours copies its colors
                                  --name <words>  what it is called (default: from the name of the file)
                                  --accent "#rrggbb"  only the accent: see "An accent of your own" below
aubergine theme check <file>      say what is wrong with a file, as the server reads it
aubergine theme path              where the theme files are
aubergine theme proposals         the themes agents and programs proposed that wait for you
```

`new` never writes over a file that is there, and never through a link. Change the colors you want and remove the ones you do not, then press **Read themes again**.

## An accent of your own

Most of a theme can stay as it is: a different accent is often enough to tell one place from another. `--accent` writes a theme that sets only what an accent needs, over the theme it is from:

```
aubergine theme new teal --from nord --accent "#2f9e8f"
```

writes `themes/teal.json` with six colors and nothing else: `accent`, `accent-soft` (the accent mixed into the surface), `accent-text` (the accent made lighter or darker until it is 4.5 to 1 on the surfaces and on `accent-soft`), `on-accent` (whichever of the theme's `bg` and `text` reads on the accent), `accent-pressed` (one step further from the surface) and `selection` (the accent mixed into a terminal's ground). Every pair the ten themes are tested for that has the accent in it holds for what is written; over a high-contrast theme, its stronger ratio for the accent's words. Where the accent itself cannot be read as a line on the page, or no words read on it, it is darkened on a light theme or lightened on a dark one, and the command says to what. From a theme of your own, its own colors are kept beside the six.

## While you look at a project

A project may have a theme of its own for each kind: in **Projects** (the project menu, then Projects…), **When light** and **When dark** beside each project, "As the page" first, then the themes of that kind, the ten and then yours. While the page looks at that project, the light or dark page is drawn in the project's theme of that kind; everywhere else, and for a kind the project leaves as the page, in the page's own (`appearance.light`, `appearance.dark`). Settings → Appearance says so in one sentence while it is the case, and choosing a theme there still changes the page's own. A project's theme is the owner's to set, like everything else about a project: no token and no terminal can, and it is not written into a project file.

A project names the themes of the page, those of the server that sent it. When a linked server is shown, its projects' themes are looked up among the page's own themes, and a project there that names a theme the page does not have is drawn as the page is, without a word.

A page loaded on a project's address (`/p/<project>/…`) is drawn in that project's theme from its first paint, from what this browser last drew for that project; the server sending the page cannot know which project it will show. An address without a project, or one this browser has not drawn a project's theme for yet, is drawn in the page's own first and changes once when the project is known.

## For terminals, by tag

In **Settings → Appearance**, under Terminal theme, **By tag** is a list of lines, each a tag and a theme (`appearance.byTag` in the settings file, at most 20):

```json
"appearance": {
  "byTag": [
    { "tag": "prod", "theme": "dracula" },
    { "tag": "docs", "theme": "solarized-light" }
  ]
}
```

A terminal with no theme of its own and the tag `prod` (whatever its capitals) is drawn in Dracula, at once, whatever the page is drawn in. The first line whose tag a terminal has wins, so a terminal tagged both `prod` and `docs` is in Dracula; **Move up** and **Move down** in a line's menu change the order. A line whose theme is not there now is passed over, and Settings says so. Only the terminal's body is drawn in it, as with a terminal's own theme, and its menu and details say where the theme came from ("Now Dracula, by the tag prod").

## The whole order

The page, light or dark, is drawn in:

1. the theme of that kind of the project looked at, where it has one;
2. else the page's own theme of that kind (`appearance.light`, `appearance.dark`);
3. else, where that is not there now, Light or Dark.

A terminal's body is drawn in:

1. its own theme (**Theme…** in its menu);
2. else the theme of the first line of **By tag** whose tag it has;
3. else the default for terminals (`appearance.terminal`);
4. else the theme the page is drawn in, as above, the project's included.

At each step a theme that is not there now is passed over for the next.

## Proposed by an agent or a program

An agent in one of your terminals, or a program with an API token, may propose a theme; it cannot write one. Inside a terminal the commands change:

```
aubergine theme list                       the themes there are, asked of the server with the terminal's own credential
aubergine theme new <id> [--from <theme>]  writes <id>.json in the current folder, not in themes/
aubergine theme propose <file> [--id <id>] [--why "<one line>"]
                                           sends the file's text, for you to read
aubergine theme proposals                  what became of this terminal's own: waiting, accepted or declined
```

A program uses `POST /v1/themes/proposals` (the scope `workflows:write`, the one that proposes drafts) and `GET /v1/themes` (`read`); there are two MCP tools, `themes_list` and `theme_propose`. A terminal's own credential proposes through its own address and reads back only its own proposals.

The text is read the moment it arrives, by the same reader as a file in `themes/`: a file that would not be read is refused whole, with its sentence, and nothing is kept; one with entries that are skipped is kept with what was skipped. It is kept exactly as it was sent, with a digest of that text. At most 20 wait at once, and a newer proposal of the same ID from the same terminal or token takes the place of its older one. Nothing about it is typed into a terminal: whoever proposed asks what became of it.

Nothing of a proposal is drawn or written until you have looked at it. It waits on your list (**For you**, "Theme to read") and in **Settings → Appearance**, and is read under **Review**: who proposed it and their line on why, the theme drawn on a small page and a terminal beside the theme it is laid over, every color it sets with its value, what was skipped, and the file's whole text. **Try on this page** draws it on this page, in this browser only, until you read something else in the review or close it; nothing is saved or sent.

**Accept** writes `themes/<id>.json` with exactly the text that was shown (the server compares the digest), never through a link and never over a file that is there: if one of that name is there, accepting is refused until you rename or remove it. Accepting chooses nothing: the page stays as it is, and **Use it**, in the line that says it was accepted, chooses it as any theme is chosen. **Discard** declines it: nothing of it is kept but that it was declined. Both are yours alone, in the browser: the routes take your sign-in, and no token and no terminal's credential accepts or declines. A decision made as you from outside the browser is in the activity log. What became of the latest 50 is kept in the state, without their text, for whoever proposed them to read.

## What a file cannot set

Only plain colors. The shadows, the scrim behind a dialog, the focus ring and the map's mask are made of more than one value, and are always the base's; so are every size, space, corner and motion. A QR code keeps its own two colors.

## Nothing in a file is run

A theme file is read, never run: what comes out of one is a plain name and colors written `#rrggbb`, and nothing else reaches the page. A name is shown as text.

## Contrast is yours

The ten themes are tested for contrast; a theme of yours is not. Settings says, in one quiet sentence, when a theme of yours has text that is less than 4.5 to 1 on its background or its surface, and nothing more: it is advice, and nothing is refused or disabled for it.

## When a file is gone

A theme that is chosen but whose file is no longer there is not an error. The page is drawn in Light or Dark in its place, a terminal in the next theme it would have (a tag's, the default for terminals, then the page's), and Settings says which theme is missing. Put the file back and press **Read themes again**, and it is drawn as before.
