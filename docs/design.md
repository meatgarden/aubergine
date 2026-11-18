# How the page looks

Every screen is made from one set of sizes, colours, spaces, shapes and controls. This page says what they are and when to use which. Two tests keep the page to it: `web/src/ui/design.test.ts` reads the stylesheets, and the browser test "one look" measures the page.

## Where things are

| File | What it holds |
| --- | --- |
| `web/src/tokens.css` | The tokens: every size, weight, colour, space, corner, control height and layer, for both themes. |
| `web/src/ui/ui.css` | The pieces: the one button, field, select, chip, tab, menu, card, heading. Outside any layer, so it decides. |
| `web/src/ui/index.tsx` | The same pieces as components, for the kind of a thing (`Button`, `IconButton`, `TextField`, `Select`, `Segmented`, `Badge`, `StateDot`, `Card`, `Row`, `SectionTitle`, `EmptyState`, `Menu`, `ScreenHead`). |
| `web/src/styles.css` | The screens' own rules: where things are put. In the layer `legacy`, below the pieces. |
| `web/src/vendor.css` | The canvas library's and the terminal's own styles, in the lowest layer. |

A rule in `styles.css` says where something is and how big a region is. It does not say what a control looks like: that is the pieces. Where both speak, the piece wins, because it is outside the layers.

A plain `<button>`, `<input>` or `<select>` already has the anatomy of a control: the rules are on the elements. The components add the kind (primary, quiet, danger) and the things an element cannot say by itself.

## Type

Four sizes and two weights. Nothing else, anywhere outside a terminal's own text.

| Token | Size | For |
| --- | --- | --- |
| `--font-meta` | 12px | What is known about a thing: time, folder, counts, hints. Chips and badges. |
| `--font-body` | 13px | Everything by default: rows, buttons, fields, paragraphs. |
| `--font-title` | 15px | The heading of a part of a surface, a terminal's name on its node, the title of a dialog. |
| `--font-screen` | 20px | The name of a screen, and the name of the product. |

Weights are `--weight-normal` (400) and `--weight-strong` (600). Lines of text are `--leading` (1.45) apart; the two heading sizes `--leading-heading` (1.25). Nothing is smaller than 12px. Labels are written as sentences, never in capitals.

## Colour

Named by what it is for.

- **Surfaces:** `--bg` (the page and the canvas), `--surface` (panels, screens, menus), `--surface-raised` (fields, what the pointer is on), `--surface-active` (pressed, the row that is chosen).
- **Lines:** `--border` (between things), `--border-strong` (a control that is pressed or open), `--border-control` (the line round a button, a field or a select: it is 3 to 1 against what it lies on).
- **Text:** `--text` and `--text-muted`. Muted is for what is known about a thing only: a time, a folder, a count, a hint. A name, a heading, a button's words and a paragraph are `--text`.
- **Meaning:** `--accent` (the product, what is chosen, the one primary button, the focus ring), `--attention` (it waits for the owner), `--working` (busy, running), `--ok`, `--danger`. Each has `-soft` (a background) and `-text` (words that are 4.5 to 1 on that background and on a surface). `--on-accent`, `--on-attention` and `--on-danger` are the words on the full colour.

No colour is written outside the tokens, with two exceptions that are not the system's to decide: the colours a person picks for a terminal, a tab or a frame (`--swatch`), and the terminal's own theme.

The light theme gives the same names other values and changes nothing else. The contrast of every pair above is tested in both themes.

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

- **Two heights.** `--control` (32px) in screens and dialogs and in the bar at the top. `--control-compact` (28px) in the side panel, the bar over the canvas, a terminal's title and the bar of tabs. A surface says which by setting `--control-h`; nothing sets a height on a control.
- **A button that is only a sign** is a square of that height, and always says in words what it does (`IconButton`).
- **A text area** has the padding and corner of a field.

Four kinds of button:

| Kind | Looks | When |
| --- | --- | --- |
| primary | filled with the accent | The one thing most people came to a surface to do. At most one on a surface. |
| default | a line round it | Anything else that is done from a form or a dialog. |
| quiet | no line until the pointer or the keyboard is on it | Bars, heads, the actions of a row. |
| danger | filled with the danger colour | It ends or removes something. |

Not to be pressed now, and busy, look the same everywhere (half as strong). One focus ring on everything that can have the keyboard: 2px of the accent, 2px away. One change on hover, over `--ease` (120ms).

## Chips and badges

One height (`--chip`, 20px), `--font-meta`, a pill. A count and a status are the same piece in different colours (`Badge` with a tone). A chip that can be pressed (a tag, a filter) is the same pill with a line round it.

## One thing shouts

The colour of waiting is filled in one place on the page: the count beside **For you** at the top, and only while something waits. Everything else that says the same says it quietly:

- **A count on a tab** (a canvas, a part of the side panel) is a plain number in `--text-muted`. The number of what waits on the owner may be written in `--attention-text`; it is never filled.
- **A state in words** (waiting for you, finished, exit 1) is a chip in the soft tint with coloured words, in a row, in a title, anywhere. Finished is `--ok`, not `--attention`.
- **The mark of a state** is one dot (`StateDot`): 8px in a slot 16px wide, coloured by the state (waiting, finished, working, new output, failed, nothing new), hollow for what is put away or over. The list, a terminal's title and a card on the Board draw the same dot from the same function (`dotTone`), so they cannot disagree. Its word is its label for whoever cannot see the colour. No letters or signs stand for a state.
- **A terminal's line** is one width (2px) in every state: `--border` ordinarily, `--attention` while it waits, `--accent` while it is selected or typed into. Selected wins the line; the chip in the title still says that it waits. Nothing is drawn outside the line.

The browser test "calm canvas" counts what is filled with the colour of waiting and measures the lines and the dots.

## Choice controls

A tick box or a radio button is 16px, one gap (`--space-2`) from its words and level with their first line. A label that directly holds one lays the two out itself, so no screen sets that gap. "one look" measures it wherever it measures.

## Rows, cards, headings

- **A row of a list:** the dot of its state in a slot 16px wide, then its name in `--text` with the whole first line; on the second its state as a soft chip where that is not the ordinary one, then what is known about it in `--text-muted`; its one menu quiet at the right, shown while the pointer or the keyboard is on the row. Nothing else is on a row.
- **A card:** `--gutter-card` inside, `--radius-surface`, a line round it.
- **A heading inside a list** (a canvas's name over its terminals, Parked): strong words on the list's gutter with an arrow that folds it and a plain count. No fill, open or shut.
- **The heading of a part** (`SectionTitle`): `--font-title`, strong, 24px above and 8px below.
- **Nothing here yet** (`EmptyState`): a sentence and one thing to do.
- **The head of a screen** (`ScreenHead`): its name in `--font-screen`, a line under it where one helps, Close at the right. It stays in view while the screen scrolls.

## Layers

Lowest first: `--z-canvas`, `--z-panel`, `--z-menu`, `--z-screen`, `--z-tour`, `--z-toast`. No other number. The canvas is a layer of its own (`isolation`), so nothing on it comes above a menu or a screen however it is raised there. The tour is above a screen, and so keeps out of a screen's way: while a screen is open that does not hold what the tour points at, the ring is not drawn and the card is put away.

## What is not the system's

- A terminal's own text and theme.
- The colours a person picks.
- What is pressed as a whole (a row, a card, a line of a menu, a step of a run): it is as tall as what it holds.

## Adding something

Use a piece. If nothing fits and the same thing is wanted in three places, add a piece to `ui.css` and `index.tsx` and a line here. A new size, colour or height is a change to the tokens and to this page, with its reason, not a number in a screen's rule: the test of the stylesheets fails on the number.
