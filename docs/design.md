# How the page looks

Every screen is made from one set of sizes, colors, spaces, shapes and controls. This page says what they are and when to use which. Two tests keep the page to it: `web/src/ui/design.test.ts` reads the stylesheets, and the browser test "one look" measures the page.

## Where things are

| File | What it holds |
| --- | --- |
| `web/src/tokens.css` | The tokens: every size, weight, color, space, corner, control height and layer, with the colors of the two themes that come first, Light and Dark. |
| `web/src/themes.css` | The colors of every other color theme, one block each. Part of the tokens: nothing but color tokens. |
| `web/src/terminal-themes.ts` | A terminal's own colors in each color theme. |
| `web/src/ui/ui.css` | The pieces: the one button, field, select, chip, tab, menu, card, heading. Outside any layer, so it decides. |
| `web/src/ui/index.tsx` | The same pieces as components, for the kind of a thing (`Button`, `IconButton`, `TextField`, `Select`, `Segmented`, `Badge`, `StateDot`, `Card`, `Row`, `RadioRow`, `SectionTitle`, `EmptyState`, `Menu`, `ScreenHead`, `Page`, `Banner`). |
| `web/src/styles.css` | The screens' own rules: where things are put. In the layer `legacy`, below the pieces. |
| `web/src/vendor.css` | The canvas library's and the terminal's own styles, in the lowest layer. |

A rule in `styles.css` says where something is and how big a region is. It does not say what a control looks like: that is the pieces. Where both speak, the piece wins, because it is outside the layers.

A plain `<button>`, `<input>` or `<select>` already has the anatomy of a control: the rules are on the elements. The components add the kind (primary, quiet, danger) and the things an element cannot say by itself.

## Type

Four sizes and two weights. Nothing else, anywhere outside a terminal's own text.

| Token | Size | For |
| --- | --- | --- |
| `--font-meta` | 12px | A time, a count, a chip, a badge, and the second line of a row in a list. Never what a person reads to decide: in the details of a thing nothing longer than three words is this size, except a time. |
| `--font-body` | 13px | Everything by default: rows, buttons, fields, paragraphs. |
| `--font-title` | 15px | The heading of a part of a surface, a terminal's name on its node, the title of a dialog. |
| `--font-screen` | 20px | The name of a screen, and the name of the product. |

Weights are `--weight-normal` (400) and `--weight-strong` (600). Lines of text are `--leading` (1.45) apart; the two heading sizes `--leading-heading` (1.25). Nothing is smaller than 12px. Labels are written as sentences, never in capitals.

## Color

Named by what it is for.

- **Surfaces:** `--bg` (the page and the canvas), `--surface` (panels, screens, menus), `--surface-raised` (fields, what the pointer is on), `--surface-active` (pressed, the row that is chosen).
- **Lines:** `--border` (between things), `--border-strong` (a control that is pressed or open), `--border-control` (the line round a button, a field or a select: it is 3 to 1 against what it lies on).
- **Text:** `--text` and `--text-muted`. Muted is for what is known about a thing only: a time, a folder, a count, a hint. A name, a heading, a button's words and a paragraph are `--text`.
- **Meaning:** `--accent` (the product, what is chosen, the one primary button, the focus ring), `--attention` (it waits for the owner), `--working` (busy, running), `--ok`, `--danger`. Each has `-soft` (a background) and `-text` (words that are 4.5 to 1 on that background and on a surface). `--on-accent`, `--on-attention` and `--on-danger` are the words on the full color.

- **A QR code:** `--qr-dark` on `--qr-light`, near black on white, the same in every theme: a scanner reads dark modules on a light ground, and a code drawn in the dark theme's colors would be light on dark. Nothing else uses them.

No color is written outside the tokens, with two exceptions that are not the system's to decide: the colors a person picks for a terminal, a tab or a frame (`--swatch`), and the terminal's own theme.

### Color themes

The page is drawn light or dark (`theme`: light, dark, or as the system is), and each kind in a color theme of its own (`appearance.light`, `appearance.dark`). The themes are `COLOR_THEMES` in `shared/src/themes.ts`, each with its kind:

| Light | Dark |
| --- | --- |
| Light, High contrast light, Solarized light, Gruvbox light | Dark, High contrast dark, Solarized dark, Gruvbox dark, Nord, Dracula |

- **A theme is three things, and the tests fail on one without the others:** a row of `COLOR_THEMES`, a block of color tokens (Light and Dark in `tokens.css`, every other in `themes.css`), and a terminal's colors in `terminal-themes.ts`.
- **A theme gives every color token a value and nothing else.** No size, space, corner, motion or layer differs between themes. A block applies to the page under `:root[data-color-theme='<id>']`, beside `data-theme`, which stays light or dark.
- **Every theme passes the same contrast pairs:** text and muted text at least 4.5 to 1 on every surface and soft tint, the words of meaning on their tints, the line round a control and the accent 3 to 1. The two high-contrast themes pass stronger ones: text 12 to 1 and muted text 7 to 1 on every surface, the words of meaning 7 to 1, the line round a control 4.5 to 1. A dark theme's ground is darker than its words, a light theme's the reverse. The QR code's two colors are the same in every theme.
- **A preview of a theme is drawn from its own tokens.** An element with `data-theme-preview="<id>"` carries that theme's colors for everything inside it, whatever the page is drawn in; it sets `color: var(--text)` and its own background. Settings draws each theme this way (`.ui-theme-preview`).
- **A terminal has its own colors in each theme** (`terminal-themes.ts`): its ground is the theme's `--terminal-bg`, and the sixteen colors a program asks for come from the theme's published palette, made lighter or darker, with their hue kept, where one would be less than 4.5 to 1 on the ground. Black on a dark theme, and white and bright white on a light one, are left as published. Light and Dark leave the sixteen to the terminal's own.
- **Colors set by hand are the owner's.** `appearance.colors` in the settings file, written by hand and by no route: a token's name from `THEME_COLORS` (the color tokens that are one plain color) and `#rrggbb`, for every theme or for one theme under `"[<id>]"`. `resolveColors` checks them, and they are checked again where they are written on the page; a wrong entry is reported in Settings and skipped. They are put on the page's root as inline values, so a preview still shows its theme's own. They are not tested for contrast.

- **A theme of the owner's own is a file, drawn as a built-in theme with colors over it.** `themes/<id>.json` in the data folder (docs/themes.md), read by `readThemeFile` in `shared/src/theme-files.ts`: a base among the ten of its kind and any of the plain colors over it. What an ID comes to is `themeOf`, for built-in themes and files alike. It is drawn as colors set by hand are: the base's block (`data-color-theme="<base>"` on the root, `data-theme-preview="<base>"` on a preview or a terminal's body) with what is laid over it written inline (`colorsOver`: the file's colors, then those set by hand for every theme, then those for that theme alone), and its own ID beside as `data-color-theme-id` on the root and `data-theme-id` on a preview or a body. The composite tokens (shadows, the scrim, the ring) are the base's. The colors of the ten outside the browser (`shared/src/theme-colors.generated.ts`) are generated from tokens.css and themes.css by `pnpm generate`, never written by hand. A theme file is not tested for contrast; Settings says when its text is under 4.5 to 1 on `bg` or `surface` (`mayBeHardToRead`), as advice.
- **An ID that names no theme falls back, and is said.** The light or dark page is drawn in Light or Dark in its place (`colorThemeShown`), a terminal in the next of `terminalThemeOf`'s order, and Settings says which in one sentence (`themeFallbacks`).
- **The page's theme asks the project first.** `pageThemeOf` (and `pageThemeFrom`, which also says where it came from) in `shared/src/themes.ts`: the theme of the kind drawn of the project looked at (`Project.themes`, set in Projects), where it names one there is now and of that kind; else the page's own (`colorThemeShown`). Everything that asks which theme the page is drawn in asks it (`useColorThemeShown`, `applyTheme`), and Settings says in one sentence while a project's is drawn. A project's IDs name the page's themes; under a linked server they are looked up among the page's own and fall back silently. For the first paint this browser keeps, per project, what it last drew of the project's own (`aubergine.project.<id>.theme.<kind>`, with `.id` and `.colors`), and the lines in `index.html` use that copy on an address `/p/<project>/…`.

- **Which theme a terminal is drawn in is one function**, `terminalThemeOf` in `shared/src/themes.ts` (`terminalThemeFrom`, which it reads, also says where the theme came from): the terminal's own (`Session.theme`) where it has one; else the theme of the first entry of `appearance.byTag` whose tag it has; else the default for terminals (`appearance.terminal`) where one is set; else the theme the page is drawn in, the project's included. A terminal's tags changing redraws its body at once, from the change event. Nothing else decides it. A terminal's own is chosen from Theme… in its title's menu, its row's menu, its details' menu or the palette (`terminal.theme`), and changed in its details once it has one; the default is chosen in Settings → Appearance.
- **Only a terminal's body is in its theme.** The body element (`.node-body` on the canvas, live and as a snapshot alike, and `.terminal-page-body` in the focus view) carries `data-theme-preview="<id>"` where its theme is not the page's, so its ground (`--terminal-bg`), its words and the shield over it are that theme's, and that theme's colors set by hand are written on the body itself (`bodyThemeOf` in `web/src/theme.ts`). Its title, its note, its details and the terminal's box with its line stay the page's. The live terminal's own colors are `terminal-themes.ts` for the same theme, so a node going from live to snapshot does not change color. A snapshot is plain text: its words are the theme's `--text`, and the sixteen colors a program asks for are seen only live.

Which theme is drawn is chosen in Settings (or from the palette) and written to the settings file. The page is sent with the choice on it (the kind, each kind's theme as the base drawn and its own ID, and what is laid over each), and a few lines in `index.html` put it on the page before first paint, so it is never drawn in another theme first. Whatever draws colors of its own reads the color theme that is drawn (`useColorThemeShown`), a terminal its own (`useTerminalTheme`), and follows at once. A terminal's body is drawn by the page's code, after the first paint, so its theme is not written on the page.

## Space

A grid of four: `--space-1` (4px), `--space-2` (8), `--space-3` (12), `--space-4` (16), `--space-6` (24), `--space-8` (32). 1px and 2px are for hairlines inside a control.

One gutter for each kind of surface, and everything in it starts on that gutter's left edge:

| Surface | Gutter |
| --- | --- |
| The side panel | `--gutter-panel` (12px) |
| A card | `--gutter-card` (16px) |
| A screen | `--gutter-screen` (24px) |

## Shape

`--radius-control` (6px) for buttons, fields and selects. `--radius-surface` (10px) for cards, screens, menus and a terminal on the canvas. `--radius-pill` for chips and badges. Square where two things join.

## Controls

A button, a field, a select and the parts of a segmented switch have one anatomy: the same height, text, corner and padding at the sides, so two of them side by side line up.

- **Two heights.** `--control` (32px) in screens and dialogs and in the bar at the top. `--control-compact` (28px) in the side panel's lists, the bar over the canvas and a terminal's title. A canvas tab and the side panel's head are 32px. The bar over the canvas shows only "New terminal" until the pointer or the keyboard is in it, or one of its menus is open; then it opens to its whole row in place, nothing else moving. Where it stands is chosen in Settings; at the foot of the canvas its menus open upward, from the edge they hang from. A surface says which by setting `--control-h`; nothing sets a height on a control. One exception: `--control-large` (40px) for New terminal at the top of the list of terminals, the side panel's one primary, whose words need room above and below.
- **A name too long for its room is cut off** where the room ends, with no "…": a terminal's name in the list, in its title, on a card and on its own page, and a canvas's on its tab.
- **A button that is only a sign** is a square of that height, and always says in words what it does (`IconButton`).
- **A text area** has the padding and corner of a field.

Four kinds of button:

| Kind | Looks | When |
| --- | --- | --- |
| primary | filled with the accent | The one thing most people came to a surface to do. At most one on a surface. |
| default | a line round it | Anything else that is done from a form or a dialog. |
| quiet | no line until the pointer or the keyboard is on it | Bars, heads, the actions of a row. |
| danger | filled with the danger color | It ends or removes something. |

Not to be pressed now, and busy, look the same everywhere (half as strong). One focus ring on everything that can have the keyboard: 2px of the accent, 2px away. One change on hover, over `--motion-quick`.

## States

Everything that can be pressed draws five states, from tokens, the same in both themes:

| State | What changes |
| --- | --- |
| rest | nothing |
| hover | one step of surface (`--surface-raised`, or `--accent-hover` and its like on a filled button) |
| pressed | one step more (`--surface-active`, or `--accent-pressed`, `--danger-pressed`, `--attention-pressed`) |
| keyboard focus | the ring: 2px of the accent, 2px away |
| disabled | half as strong, the ordinary pointer, and a tooltip saying why where there is a reason |

Nothing moves or grows under the pointer or a press: a state changes a surface or a color, never a size or a place. A button that started something slow says so (`aria-busy`): it keeps its strength, beats slowly, and cannot be pressed again until the answer is here. A link among words (`ui-link`) is underlined and changes its color.

## Motion

Two durations and one curve: `--motion-quick` (120ms) for a change of state, `--motion-open` (180ms) for what opens, both over `--motion-ease`. `--motion-busy` is the slow beat of a busy button and is used for nothing else.

What opens, opens the same way: a short fade and `--motion-travel` (6px) from the edge it hangs from. A menu, the note under a fold and a banner come down; a dialog, the tour's card and the line that says what just happened come up; the drawer comes from its side; a page only fades. Nothing bounces, and closing is at once. For someone who asked the system for less motion nothing travels: the same things only fade, quickly.

Changing the theme, the color theme or a color set by hand is at once. For that moment no color on the page takes time to change, so nothing is caught half-way between the two.

## What floats

One shadow for each layer that floats, each defined in every theme: `--shadow-bar` (the bar over the canvas and what is beside it), `--shadow-node` (a terminal), `--shadow-menu` (a menu, a palette, a tooltip of our own), `--shadow-dialog` (a dialog, the tour's card, the line of what just happened). In the light theme a surface is told from the page by its border and its shadow, not by a grey of its own: grey is what disabled looks like.

## What just happened

Something that was done and shows nowhere else by itself is said in one place, one way: a short line at the foot of the window (`say` in the store, drawn by `Toast`), which goes by itself, with Undo where the action has one. A mistake is not said there: it stays where it was made.

The text a person selects, the caret and the scroll bars follow the theme (`--selection`); a terminal has its own selection color in each.

## The switcher

`Switcher` in `web/src/ui` says which of several things is being looked at and opens the list of them: a word for what it is where the name alone would be taken for something else, the name, what there is to know at a glance, an arrow. The project at the top and the side panel's sections are both this piece. Its menu is placed against the window, each line is a name with one quiet line under it, and what is counted is at the line's right. Escape closes the menu and nothing behind it.

## The canvas's columns

"New terminal" is the side panel's one primary: the filled button with its ▾ at the top of the list of terminals, as wide as the rows, with room above and below and no line between it and them; the bar over the canvas does not have it, and folds to **Go to…** and the map's button. Its usual place is the map's corner, the bottom right, with the map over it when shown.

**A page says where it stands.** Under the name of Library, Workflows and Runs, one line says what the page is for, and one strip shows them in the order work goes through them, the page being looked at marked as the places in the top bar are. An empty place a newcomer meets is `FirstSteps`: one sentence in the title size, at most three numbered steps in body text, one ordinary button that makes the first real thing.

Under the top bar there are two groups of columns. The side panel and the drawer of what it lists are one, from the top bar to the foot of the window. The bar of canvas tabs and the canvas are the other: the bar begins where the canvas does, has the surface color and a line under its whole width, 12px of air above and below its tabs and 24px at its sides, and its first control, the button whose menu shows the canvases as tabs, as one list or as a column, begins on the canvas's gutter, where the bar over the canvas begins when it stands at the left. The tab being looked at is a filled pill inside the bar, with no edge and a line of the accent under it as wide as the pill, resting on the bar's own line; it does not open into the canvas. Every other tab has a faint edge, so it reads as something to press, and quieter words (a step below muted) that come up to full when pointed at, as the places in the top bar do. "New canvas" stands directly after the last tab, and stays in sight while the tabs scroll sideways: it is the bar's one primary, a button with an arrow beside it like "New terminal", and its menu hangs from the window. The side panel's head is as tall as the bar of tabs and has the same line under it. Shown as a column, the canvases are a third group before the other two, from the top bar to the foot, `--canvas-column-width` wide (room for a name of a few words), with a line down its right side: the tabs one under another, the accent line down the left edge of the one being looked at instead of under it, and "New canvas" first, under its head. Folded, it is a rail as wide as the side panel's: the button that opens it, a dot in each canvas's color with the accent line down the left of the one being looked at, and a plus.

The places in the top bar (Canvas, Queue, Board, Workflows, Library) are a row of tabs: each stands on a short 2px line of its own, with a small gap between. The place being looked at has no fill: its words are strong and its line is the accent, as wide as the button. The others have a faint line and words a step below muted (`--text-muted` mixed toward the surface), which come up to `--text` when pointed at.

Folded, the side panel is a rail (40px) with the same edge: the button that opens it, and what a section puts there (the terminals' section puts "New terminal" as a plus, which opens out to the whole button over what is beside the rail while pointed at, and the mark of each terminal on this canvas). With nothing remembered, the panel is folded.

## Chips and badges

One height (`--chip`, 20px), `--font-meta`, a pill. A count and a status are the same piece in different colors (`Badge` with a tone). A chip that can be pressed (a tag, a filter) is the same pill with a line round it.

## One thing shouts

The color of waiting is filled in one place on the page: the count beside **For you** at the top, and only while something waits. Everything else that says the same says it quietly:

- **A count on a tab** (a canvas, a part of the side panel) is a plain number in `--text-muted`. The number of what waits on the owner may be written in `--attention-text`; it is never filled.
- **A state in words** (waiting for you, finished, exit 1) is a chip in the soft tint with colored words, in a row, in a title, anywhere. Finished is `--ok`, not `--attention`.
- **The mark of a state** is one dot (`StateDot`): 8px in a slot 16px wide, colored by the state (waiting, finished, working, new output, failed, nothing new), hollow for what is put away or over. The list, a terminal's title and a card on the Board draw the same dot from the same function (`dotTone`), so they cannot disagree. Its word is its label for whoever cannot see the color. No letters or signs stand for a state.
- **A terminal's line** is one width (2px) in every state: `--border` ordinarily, `--attention` while it waits, `--accent` while it is selected or typed into. Selected wins the line; the chip in the title still says that it waits. Nothing is drawn outside the line.

The browser test "calm canvas" counts what is filled with the color of waiting and measures the lines and the dots.

## Choice controls

A tick box or a radio button is 16px, one gap (`--space-2`) from its words and level with their first line. A label that directly holds one lays the two out itself, so no screen sets that gap. "one look" measures it wherever it measures.

## Rows, cards, headings

- **One of a group of choices as rows** (`RadioRow` in `RadioRows`): a row pressed as a whole, a tick at its end when it is its group's choice, and the soft fill and the accent line down its left edge when it is the one in use now, as the selected row of a list. Only the ticked row is reached with Tab; the arrow keys move and choose within the group. Settings → Appearance lists the color themes this way.
- **A row of a list:** the dot of its state in a slot 16px wide, then its name in `--text` with the whole first line; on the second its state as a soft chip where that is not the ordinary one, then what is known about it in `--text-muted`; its one menu quiet at the right, shown while the pointer or the keyboard is on the row. Nothing else is on a row.
- **A card:** `--gutter-card` inside, `--radius-surface`, a line round it.
- **A heading inside a list** (a canvas's name over its terminals, Parked): strong words on the list's gutter with an arrow that folds it and a plain count. No fill, open or shut.
- **The heading of a part** (`SectionTitle`): `--font-title`, strong, 24px above and 8px below.
- **A page** (`Page`): a screen that is a place in the app (Queue, Board, Workflows, Library). It takes the room under the top bar. Its head stays while it scrolls: the row of its name is `--page-head` (72px) high, with the name in `--font-screen`, one line of what it is, and what is done most at the right (the one primary). Its tabs are under that, inside the head. Its content is one column on `--gutter-screen`, `--page-width` (1120px) wide at most, from the left; a page that is columns itself (`wide`, the Board) has all the width. It has no Close: the top bar marks where you are and leads back. "one look" measures that the four are laid out the same.
- **What is a page and what is a dialog:** a page is a place you go to and stay in, about the whole project, with no one thing it is about. A dialog is a question about one thing (run this, describe that, these tags, this draft) that ends with a decision; it opens over a page or the canvas alike.
- **A part of a page** is a title and rows or cards on the page's own surface. A card is never inside a card. Items of a list are rows with a hairline between them, pressed as a whole where the one thing to do is to open them; an item is a card only where it stands alone with actions of its own (a workflow). Not both in one list, and no item has an edge of another color: what kind it is, is a dot or a soft chip.
- **A banner** (`Banner`): what waits to be read or decided, said once at the top of a page: the soft attention tint, one sentence, one button. It is not the filled thing of "One thing shouts".
- **The details of one thing** (the drawer beside the side panel): `--drawer-width` (420px) wide, with the ordinary controls and the body size (what it asks is in the title size; a fact is a row of at least 28px), between the panel and the canvas and under the bar of tabs, so that nothing of it lies over the canvas's bar. In this order: what the thing is and the one thing to do with it (the primary), with the rest behind the same menu as its row; what it asks of the owner, in its own words, on the soft tint, with how to answer; for a terminal, what it is for: its summary, read as words on the gutter until it is pressed, and then a box no shorter than the words were (**Saved** is said under its end only after a change there); what is known about it as a list of facts (`.ui-facts`: a label and a value, never a whole path) in groups with `--space-3` between them and no headings, and the times as one quiet line at the end; for a terminal, its fields (the owner's, and its agent's, which say so in a quiet word after the value), rows of the same list of facts with a value's address a chip and each row's small menu right after the value, as a link's follows its chip, and under a row the owner set, what the agent would set it to with **Use this**; at the most a terminal can have, a muted sentence where **Add a field** was; its links; then its parts as tabs (a terminal's log is the tab **Log**, its entries under a quiet heading for each day), so that one thing is typed into at a time. What is known, the fields and the links fold: each has a heading that is pressed (`FoldHeading` in `web/src/ui`: a quiet button in the weight of a heading, its words on the gutter, a small ▾ or ▸ after them, drawn as words until it is pointed at, never as pressed while open); folded, what it holds is not drawn and folded Fields and Links say how many there are. A field is added or changed in one box, as a line `Label: value`, laid out as a link's. Every list of facts in the details has one label column, `--facts-label` (96px: the longest of Known's own labels, "Last command", measured 91px at the body size, on the grid of four), so that Known and Fields line up; a longer label takes a second line and pushes no value aside. Elsewhere a list of facts sizes its labels to their words. A text box gives way while another part is typed into: the summary is read, the log's field is put away, and the message and Type boxes wait behind a quiet button. The way out is a × at the end of the name's line. It opens at its top however long the terminal's log is; the row that adds to the log follows the last entry and stays at the foot while the log is in view.
- **A terminal by itself** (the focus view, `/t/<terminal>`): a head of one row (Canvases first; the dot, the name and what it runs; Details, Note and "Show on its canvas" at the right, in words, quiet, no primary), and under it a row of columns to the foot of the window. Each column is a piece the canvas page already has, not a second one: the column of canvas tabs (`--canvas-column-width`, links, the accent line down the one the terminal is on, a count in the color of waiting as text), the drawer's details (its width and its edge, with "Details" and a × for a head; while the note is open beside them they leave out the summary and the Log tab, and name their one part left, Messages, instead of drawing a row of one tab), the terminal with the room that is left, and the note beside a node standing at the right as a column (280px, a line at its left, no box). All three are closed until asked for. The command gives way first in the head, then the name is cut. The head is the terminal's title, so it carries the terminal's color as a node's title does (the 3px line along its top and the 16% tint over `--surface`, from `--swatch`), from the same function a list row's color comes from; with no color it is the plain bar.
- **A row of what waits** (`ForYouRow`): the same on the Queue page and in the side panel. Line 1: whose it is in the strong weight, and when at the right. Line 2: its kind as a chip in a column of one width (`--kind-column`), then what waits in its own words, so that the words stand under each other. Its kind names the one thing to do with it; that is the button at the row's end, shown while the pointer or the keyboard is on the row, and pressing the row does the same.
- **Nothing here yet** is one sentence saying what will be here, and one button that makes the first one where there is one to make.
- **The head of a dialog** (`ScreenHead`): its name in `--font-screen`, a line under it where one helps, Close at the right. It stays in view while the screen scrolls.

## Layers

Lowest first: `--z-canvas`, `--z-panel`, `--z-menu`, `--z-screen`, `--z-tour`, `--z-toast`. No other number. The canvas is a layer of its own (`isolation`), so nothing on it comes above a menu or a screen however it is raised there. The tour is above a screen, and so keeps out of a screen's way: while a screen is open that does not hold what the tour points at, the ring is not drawn and the card is put away.

## What is not the system's

- A terminal's own text and theme.
- The colors a person picks.
- What is pressed as a whole (a row, a card, a line of a menu, a step of a run): it is as tall as what it holds.

## Adding something

Use a piece. If nothing fits and the same thing is wanted in three places, add a piece to `ui.css` and `index.tsx` and a line here. A new size, color or height is a change to the tokens and to this page, with its reason, not a number in a screen's rule: the test of the stylesheets fails on the number.

The selected row of the list of terminals, and the one being typed into, are marked as the canvas being looked at is in the column of canvases: a soft fill and a 2px line of the accent down the left edge of the box, nothing round the whole box. Its words and marks keep their own colors. A canvas that has the keyboard in the column shows the same line, in `--border-strong`, rather than a focus ring.
