# Your own stylesheet

The page is yours to restyle. A stylesheet of your own, `custom.css` in the data folder, is drawn over the app's own look: change a color, hide something you never use, make a terminal tagged `prod` stand out. Full control over the look is the point; what keeps a file of yours working from one release to the next is a list of hooks the page promises to keep, [hooks.md](hooks.md).

## Where the file is

`custom.css` directly in the data folder, beside `config.json`. `aubergine css path` prints where that is and says whether there is one; `aubergine css new` writes one to start from: a comment that lists every hook, and three small examples, commented out. It never writes over a file that is there.

The server reads the file when it sends the page, when the page asks for it, and when you press **Read it again** in **Settings → Appearance → Your stylesheet**. It is read only if it is a regular file directly in the data folder, at most 256 KB: a link is not followed. A file that cannot be read is said once in the server's log and in Settings, and the page is drawn without it. Nothing in the file is looked at or changed: it is sent to your page as it is.

It is sent to you alone: at one address of the page's own (`/api/v1/custom.css`), to the owner signed in at this computer or on a paired device, and to nobody else, no token, no session, and no page of another Aubergine that shows this server. The page of another Aubergine that has linked this one draws its own server's stylesheet, not this one's.

## How it is loaded, and why it wins

The server writes one line into the page it sends, as the last thing in its `<head>`, after the app's own stylesheet:

```html
<link rel="stylesheet" href="/api/v1/custom.css?v=<a short hash of its content>" data-custom-css>
```

So it is there from the first paint: nothing is drawn in the app's look first and then changed. The hash changes when the file does, so a browser takes the new one; **Read it again** links the new one without a reload.

The app's own styles are in two kinds of place: the pieces (buttons, fields, menus, cards) in no cascade layer, and the screens' rules and the canvas library's in layers below them. Your file is in no layer and comes last, so:

- a rule of yours beats any rule of the app's that is in a layer, whatever its specificity;
- a rule of yours beats a piece's rule of the same specificity: `[data-part="page"]` (an attribute, as specific as one class) beats `.ui-page`. No `!important` is needed for that;
- a rule of the app's that is more specific than yours still wins. Match it, or make yours more specific with another part or attribute (`[data-part="terminal"] [data-part="terminal-title"]`), or use `!important` where you mean it.

In `pnpm dev` the page is served by Vite, not by the server, so no stylesheet of yours is linked there. Try it on a page the server sends (`pnpm serve`, or an installed copy).

## When it breaks the page

Open the page with `?plain` after its address, for example `http://127.0.0.1:4600/?plain`: the server sends it without your stylesheet, and the page loads none of your [plugins](plugins.md). Nothing keeps it: the next page you open is drawn with your stylesheet again. **Settings → Appearance → Your stylesheet** has the address as a link, **Open without your stylesheet**, and a switch, **Draw the page with it** (`appearance.customCss` in the settings, on unless you switch it off), that takes it off the page at once and keeps it off.

## What a stylesheet may fetch

The page says to the browser that a stylesheet, a picture, a font, a sound or a film may come only from this server, or from inline data (`data:` and `blob:` addresses). So a rule like `background: url("https://elsewhere.example/a.png")` draws nothing: the browser refuses it before it is sent. That matters for a snippet pasted from somewhere: a stylesheet can be written to load a picture from another address for each thing it matches, and so tell someone else what is on your page. Here it cannot.

This is a guard for a file you wrote or pasted, not a sandbox. It restricts only what a stylesheet can make the page load; it does not restrict scripts, the page's own connections (it talks to linked servers and opens sockets), or anything else. A picture or a font you want to use can be written inline as a `data:` address.

## Five examples

Every one uses hooks only ([hooks.md](hooks.md)); none names a class.

The title of every terminal tagged `prod` in a dark red, on the canvas and at the head of its browser tab of its own:

```css
[data-part="terminal"][data-tags~="prod"] [data-part="terminal-title"],
[data-part="focus-head"][data-tags~="prod"] {
  background: #5c1f24;
}
```

No map in the corner of the canvas:

```css
[data-part="map"] {
  display: none;
}
```

Rounder corners everywhere, by changing two tokens:

```css
:root {
  --radius-surface: 16px;
  --radius-control: 10px;
}
```

A terminal waiting for you stands out in the list:

```css
[data-part="terminal-row"][data-state="waiting"] {
  font-weight: var(--weight-strong);
}
```

A different accent in one color theme only, and a quieter canvas while the page is dark:

```css
:root[data-color-theme="nord"] {
  --accent: #5fb3b3;
}
:root[data-theme="dark"] {
  --canvas-dot: var(--bg);
}
```

A color set by hand in `config.json` (`appearance.colors`) or in a theme file of your own ([themes.md](themes.md)) is written on the page's root as an inline value, which wins over a rule of yours on `:root`. Where both set the same token, the inline one is drawn.

## What is not built

One file, for every project and every browser of yours: there is no stylesheet per project, and no second file. It has been tried in Chromium only, not in Safari or Firefox.
