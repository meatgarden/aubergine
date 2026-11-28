# Themes of your own

Aubergine comes with ten color themes, four light and six dark. A theme of your own is a file: one of the ten, of the same kind, with your colors over it. It is listed in **Settings → Appearance** after the ten of its kind, marked "yours", and can be chosen wherever a theme can: for the light or the dark page, as the default for terminals, and for one terminal (**Theme…** in its menu).

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
aubergine theme check <file>      say what is wrong with a file, as the server reads it
aubergine theme path              where the theme files are
aubergine theme proposals         the themes agents and programs proposed that wait for you
```

`new` never writes over a file that is there, and never through a link. Change the colors you want and remove the ones you do not, then press **Read themes again**.

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

A theme that is chosen but whose file is no longer there is not an error. The page is drawn in Light or Dark in its place, a terminal in the next theme it would have (the default for terminals, then the page's), and Settings says which theme is missing. Put the file back and press **Read themes again**, and it is drawn as before.
