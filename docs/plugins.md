# Plugins: your own code in the page

A plugin is JavaScript of your own that the page loads and runs. It can change the interface as much as you like: add a section to the side panel, a command to the palette, a placeholder to a terminal's title, a filter to the list, a way of looking at a run, or anything else the page can do, including replacing parts of it.

**A plugin runs in the page as you, and nothing keeps it apart.** It is not sandboxed. It can read every terminal, type into any of them, call every route the page calls, and change or remove anything on the page. Switch on only code you wrote or have read.

**The switch is not a lock.** A plugin runs only once you have switched it on, and only as its files were when you did: that keeps code from running by accident or after it changed without you looking. But an agent in one of your terminals runs as you too, and could write a plugin and the settings file that switches it on. Switching one on is recorded (in the activity log, when it is not done from the page); it is not prevented. Do not rely on the switch to keep out anything that already runs as you.

A sandboxed way of running other people's plugins, with less than everything, may come later. It is not built.

## The folder

Each plugin is a folder directly in `plugins/` in the data folder: `plugins/<id>/`. Its ID is its folder's name: a lowercase letter, then up to 39 lowercase letters, digits and hyphens.

```
plugins/
  ticket-column/
    plugin.json
    index.js
    style.css
```

`aubergine plugin path` prints where the folder is; `aubergine plugin list` lists what is in it, whether each is on, and what is wrong; `aubergine plugin new <id> [--name <name>]` writes a plugin to start from (the worked example below). It never writes over anything that is there, and never through a link. No command switches a plugin on.

The server reads at most 20 plugins, in the order of their IDs. In a plugin it reads only regular files directly in its folder: at most 40 of them, at most 1 MB each, named with letters, digits, dots, hyphens and underscores. A link is not followed, a subfolder is not read, and each is said and skipped. A plugin with more files, or a file over the bound, is not loaded.

The server reads the manifest and nothing else in a plugin as anything but bytes. It runs nothing of a plugin, fetches nothing for it, and sends its files to your page alone.

## The manifest

`plugin.json` says what the plugin is and how it runs:

```json
{ "name": "Ticket column", "version": "0.1.0", "runs": "page", "main": "index.js", "style": "style.css", "api": 1 }
```

- `name`: what it is called, one line of plain text.
- `version`: its version as you write it, one line of at most 40 characters.
- `runs`: how it runs. `page` is the one way there is: in the page, as you. Any other value is not loaded, and Settings says "not loaded: this Aubergine cannot run a plugin that way". Nothing is guessed. A later way of running plugins (a sandboxed one) would be a new word here.
- `main`: the module the page imports, a `.js` file directly in the folder.
- `style` (may be left out): a stylesheet the page links while the plugin runs, a `.css` file directly in the folder.
- `api`: the version of the plugin API it was written for. A higher number than the page offers is not loaded, and said.

A manifest that is not this is not loaded, with one sentence that says why. A key a manifest does not have is said and skipped.

## Switching one on

A plugin found in the folder is off. **Settings → Plugins** (the command **Plugins**, `plugins.show`) lists every plugin found, with its files, its state, and the one thing to do:

- **off**: **Switch on…** asks once, in a dialog that lists its files and their sizes and says what a plugin can do.
- **on**: it runs. **Switch off** takes it out of the page.
- **on, following changes**: it runs whatever is in its folder.
- **changed since you switched it on**: a file changed (or one was added or removed) since then. It is not loaded until you look at it and press **Switch on again…**.
- **not loaded**: something about it is wrong; the sentence says what.
- **failed**: it was loaded, and something it did threw; the sentence is what it said.

Switching one on writes one entry of `plugins.on` in the settings file, and nothing else in the file changes:

```json
{ "plugins": { "on": { "ticket-column": "3f1c…64 hexadecimal digits…", "my-draft": "follow" } } }
```

The value is the plugin's **digest**: a SHA-256 over the names and the contents of all its files, in the order of their names. The server works it out each time it reads the folder, and refuses to switch on a digest that is not the plugin's digest at that moment, so what is switched on is what you were just shown. The page asks for a plugin's files at an address with that digest in it (`/api/v1/plugins/<id>/<digest>/<file>`), and the server sends them only while that digest is both the one the plugin has now and the one switched on. So a file that changes after you switched the plugin on is not sent, even to a page that is already open.

`"follow"` runs whatever is there, at whatever digest it has: for a plugin you are writing. Tick **Follow changes while I write it** once it is on; untick it to go back to the digest it has now.

You may write `plugins.on` by hand too. An entry that is not a plugin's ID with a digest or `"follow"` is said and skipped, and the others still count.

Switching on and off is the owner's alone: no API token and no session can do it, whatever its scopes (`plugins.manage`), and no MCP tool does it. A plugin's files are sent only to you, signed in at this computer or on a paired device: not to a token, a session, or the page of another Aubergine that shows this server.

## Loading

The page loads plugins once it is signed in and drawn: never on the sign-in screen, never before the first paint. It loads those switched on, in the order of their IDs, one after the other, each by a native `import()` of its `main` module: no bundler, no `eval`, no build step. A plugin whose `activate` takes more than five seconds is let finish, and the next is loaded meanwhile.

A plugin's stylesheet is linked after the app's own and before your own `custom.css`, so that your stylesheet keeps the last word. It is in no cascade layer, as `custom.css` is not: a rule in it wins over the app's rules of the same specificity.

Because the digest is in the path, a module may import another of its own files by a relative address (`import { x } from './x.js'`), and a stylesheet may name a picture or a font of its folder (`url("./icon.svg")`); both are sent under the same digest. The files that are sent are `.js`, `.css`, `.json`, `.map`, `.svg`, `.png`, `.woff2` and `.txt`.

A plugin that cannot be loaded, has no `activate`, or whose `activate` throws or rejects is said in Settings with what it said, and what it added is taken away; the page carries on, and so does every other plugin. A component of a plugin's that throws while it is drawn is drawn as one sentence in its place.

The page's policy does not restrict scripts or connections, and this does not change that: a plugin may fetch whatever it likes, from anywhere. It does restrict styles, pictures, fonts and sounds to this server and inline data, so a plugin's pictures and fonts must come from its own folder (or be inline).

### The way out

Open the page with `?plain` after its address, for example `http://127.0.0.1:4600/?plain`: no plugin is loaded, and your stylesheet is left out. Nothing keeps it; the next page you open loads them again. Settings → Plugins has it as a link, **Open without plugins and your stylesheet**.

Switching a plugin off calls its `deactivate`, and takes away at once everything it added through the API. What it did past the API (an element it put on the page itself, a listener of its own) the page cannot know about: Settings says **Reload the page to be sure it is gone**, with **Reload**.

## Writing one, without a build step

The module is a native ES module that exports `activate` (named, or as the default export, or the default export is the function itself), and may export `deactivate`:

```js
export function activate(aubergine) {
  aubergine.say(`Hello from ${aubergine.plugin.name}`);
}
export function deactivate() {}
```

There is no JSX without a build step: make elements with the page's own React, `aubergine.ui.React.createElement`. Never bring a second React: components of another copy cannot be drawn in the page.

```js
const h = aubergine.ui.React.createElement;
const Hello = () => h(aubergine.ui.Button, { onClick: () => aubergine.say('Pressed') }, 'Press me');
```

Change a file and reload the page. Without **Follow changes**, the plugin is then "changed since you switched it on" until you switch it on again.

A plugin's surfaces should look like the rest of the page: use the pieces in `aubergine.ui` and the tokens (`var(--text)`, `var(--space-2)`; [hooks.md](hooks.md) lists them all), so that it is right in every color theme. Everything a plugin adds through the API is drawn inside an element that says whose it is, `data-plugin="<id>"`, which its stylesheet can start from.

## The API

`activate` is given one object, `aubergine`, at version 1 (`aubergine.apiVersion`). Every member listed here is promised: from one version of Aubergine to the next it is only added to, never renamed or removed, and neither is the list of hooks ([hooks.md](hooks.md)). Everything else is reachable too, since a plugin runs in the page: `document`, `window`, the page's elements, its classes, its store. None of that is promised: it may change in any release, and a plugin that leans on it may break.

Each `add…` returns a function that takes what it added away again; the page also takes it all away when the plugin is switched off. An ID a plugin gives (of a section, a filter, a command, a view) is lowercase letters, digits and hyphens, and becomes `plugin.<plugin ID>.<id>`.

| Member | What it is |
| --- | --- |
| `aubergine.apiVersion` | `1`. |
| `aubergine.plugin` | `{ id, name, version }`: this plugin, as its folder and manifest say. |
| `aubergine.ui` | The page's own React and the pieces of its look. |
| `aubergine.ui.React` | The page's React. Use `React.createElement`, and its hooks (`React.useState`). |
| `aubergine.ui.Badge` | A small chip: `h(Badge, { tone: 'ok' }, 'done')`. |
| `aubergine.ui.Banner` | One sentence and one button: `h(Banner, { action: 'Open', onAction }, 'One waits.')`. |
| `aubergine.ui.Button` | A button: `kind` is `default`, `primary`, `quiet` or `danger`; `busy` while something is slow. |
| `aubergine.ui.Card` | A card. |
| `aubergine.ui.EmptyState` | A sentence for an empty place, with an `action`. |
| `aubergine.ui.FirstSteps` | A `title`, at most three `steps`, and an `action`. |
| `aubergine.ui.FoldHeading` | A heading that folds what is under it: `folded`, `onToggle`, `controls`. |
| `aubergine.ui.HowThisWorks` | One `line`, with more folded under it. |
| `aubergine.ui.IconButton` | A button with a sign: `label` names it for a screen reader. |
| `aubergine.ui.Menu` | A menu's box. |
| `aubergine.ui.MenuButton` | A button that opens a menu of `MenuItem`s: `label`, `againstWindow` in something that scrolls. |
| `aubergine.ui.MenuItem` | A line of a menu. |
| `aubergine.ui.RadioRow` | One choice among rows: `checked`, `onChoose`. |
| `aubergine.ui.RadioRows` | The group of them: `label`. |
| `aubergine.ui.Row` | A row pressed as a whole (a button): `h(Row, { onClick }, 'words')`. |
| `aubergine.ui.SectionTitle` | A section's heading. |
| `aubergine.ui.Segmented` | A choice of a few: `value`, `options`, `onChange`, `label`. |
| `aubergine.ui.Select` | A select. |
| `aubergine.ui.StateDot` | The mark of a state: `tone`, `word`. |
| `aubergine.ui.Switcher` | "Which of several, and the list of them": `name` and the list as children. |
| `aubergine.ui.Tabs` | Tabs: `value`, `tabs`, `onChange`, `label`. |
| `aubergine.ui.TextField` | A text field. |
| `aubergine.panel` | The side panel. |
| `aubergine.panel.addSection(section)` | A section of the side panel, in its menu of sections: `{ id, title, says, icon, order, Component }`. `says` is one line of what it shows; `order` places it (the page's own are 10 to 30; a plugin's is 80 unless it says). |
| `aubergine.list` | The list of terminals. |
| `aubergine.list.addFilter(filter)` | A line of the list's Filter menu: `{ id, label, order, test(session, { canvasId, parked }) }`, a pure test of one terminal. Filters that are on combine with AND. |
| `aubergine.templates` | What a terminal's title and its row say after the name. |
| `aubergine.templates.addPart(part)` | A placeholder: `{ name, says, where, kind, say(session, where) }`. `name` is what is written between braces (`ticket` for `{ticket}`), lowercase letters and hyphens, not one there is; `where` is `['title', 'row']` unless it says; `kind` is `words` (plain words) or `field` (an address in it is a chip). `say` gives the text, or null for nothing; it is drawn as text, whatever it holds. Write it in **Settings → Appearance → Titles and rows**. |
| `aubergine.commands` | The palette. |
| `aubergine.commands.add(command)` | A command: `{ id, title, description, run }`, in the palette under "Plugin: <its name>". It is not one of the page's commands: no key is bound to it, and `shortcuts` in the settings cannot bind one yet. |
| `aubergine.runs` | The dialog of a run. |
| `aubergine.runs.addView(view)` | Another way of looking at a run, as a tab of its dialog: `{ id, title, order, Component }`; `Component` is given `{ picture, elements, live, now, text, kickoff }`. |
| `aubergine.steps` | Steps of workflows. |
| `aubergine.steps.addView(view)` | How a step of a kind there is (`instructions`, `approval`) is edited and read: `{ kind, Editor, Detail }`, drawn over the page's own until it is taken away. |
| `aubergine.outputs` | What steps hand in. |
| `aubergine.outputs.addView(view)` | How an output of a kind there is (`note`, `checklist`) is drawn: `{ kind, View }`, over the page's own until it is taken away. |
| `aubergine.state` | What the page knows. |
| `aubergine.state.get()` | The page's view of the state now: the project looked at, of the server shown (its `sessions`, `canvases`, `runs` and the rest). Read it; never change it: change things through `aubergine.api`. |
| `aubergine.state.use()` | The same in a component, drawn again whenever it changes. |
| `aubergine.state.subscribe(listener)` | Calls `listener(state)` each time it changes. |
| `aubergine.state.onEvent(listener)` | Calls `listener(event)` with each change event, as the page applies it (`{ type: 'session.renamed', … }`; [api.md](api.md) describes them). |
| `aubergine.api` | The page's own calls to the server shown, as the page makes them, as you: `await aubergine.api.updateSession(id, { name: 'build' })`, `await aubergine.api.sendInput(id, { text: 'ls', enter: true })`. Everything the page can do. |
| `aubergine.ownApi` | The page's own calls to its own server, whatever server is shown. |
| `aubergine.settings` | The settings. |
| `aubergine.settings.get()` | The settings the page is drawn with now. |
| `aubergine.runCommand(id)` | Runs one of the page's commands (`'view.fit'`; the shortcut sheet lists them) or a plugin's (`'plugin.<id>.<name>'`). Answers whether it ran. |
| `aubergine.say(text)` | Says one line where the page says what just happened. |
| `aubergine.openDetails(sessionId)` | Opens a terminal's details beside the side panel. |
| `aubergine.goTo(sessionId)` | Goes to a terminal: its canvas, with the terminal in view and the keyboard in it. |
| `aubergine.hooks` | What a stylesheet may rely on: the tokens, the root's attributes, the parts ([hooks.md](hooks.md)). |
| `aubergine.root` | The element the app is drawn in. |

This table is held to the object itself: a test fails when a member is added to one and not the other. The types are those of `web/src/plugins/api.ts`.

## A whole example

This is what `aubergine plugin new ticket-column --name "Ticket column"` writes. It uses the API alone: a section of the side panel that lists the terminals that have a field `Ticket`, by its value; a command that copies every ticket; and a placeholder, `{ticket}`, for a title or a row.

`plugin.json`:

```json
{
  "name": "Ticket column",
  "version": "0.1.0",
  "runs": "page",
  "main": "index.js",
  "style": "style.css",
  "api": 1
}
```

`index.js`:

```js
export function activate(aubergine) {
  const { React } = aubergine.ui;
  const h = React.createElement;

  const LABEL = 'Ticket';
  const valueOf = (session) => session.fields.find((field) => field.label.toLowerCase() === LABEL.toLowerCase())?.value ?? null;

  // A section of the side panel.
  function Section() {
    const app = aubergine.state.use();
    const sessions = (app?.sessions ?? []).filter((session) => valueOf(session) !== null);
    if (sessions.length === 0) return h('p', { className: 'plugin-empty' }, `No terminal has a ${LABEL} field yet.`);
    return h('div', { className: 'plugin-list' },
      sessions.map((session) => h(aubergine.ui.Row, { key: session.id, onClick: () => aubergine.openDetails(session.id) },
        h('span', { className: 'plugin-value' }, valueOf(session)), ' ', session.name)));
  }
  aubergine.panel.addSection({ id: 'by-field', title: `By ${LABEL}`, says: `Terminals that have a ${LABEL} field, by its value.`, icon: 'T', order: 90, Component: Section });

  // A command, in the palette under this plugin's name.
  aubergine.commands.add({
    id: 'copy',
    title: `Copy every ${LABEL}`,
    description: `Copies the ${LABEL} of every terminal that has one, one to a line.`,
    run: () => {
      const values = (aubergine.state.get()?.sessions ?? []).map(valueOf).filter((value) => value !== null);
      void navigator.clipboard?.writeText(values.join('\n'));
      aubergine.say(`Copied ${values.length} ${LABEL} values.`);
    },
  });

  // A placeholder: write {ticket} in Settings → Appearance → Titles and rows.
  aubergine.templates.addPart({ name: 'ticket', kind: 'words', where: ['title', 'row'], says: `The value of its ${LABEL} field.`, say: (session) => valueOf(session) });
}

export function deactivate() {}
```

(The file it writes says the same with comments.) `style.css` uses the tokens:

```css
[data-plugin] .plugin-empty {
  color: var(--text-muted);
  font-size: var(--font-meta);
  padding: var(--space-2) var(--gutter-panel);
}
```

Then **Settings → Plugins**, **Switch on…**, read the list of files, **Switch on**. Give a terminal a field `Ticket: ABC-123` in its details, and the section **By Ticket** is in the panel's menu.

## What is promised, and what is not

- Promised: the members of `aubergine` listed above, at version 1, and the hooks in [hooks.md](hooks.md). They are only added to. A later version of the API adds members; a manifest's `api` says which it needs.
- Promised: the manifest's shape, the folder, the digest's rule, `plugins.on`, `?plain`, and `data-plugin="<id>"` on the element around what a plugin adds through the API.
- Not promised: anything a plugin reaches past the API. The page's elements, classes, modules and store, and the shape of what the server answers beyond [api.md](api.md), may change in any release.

## Not built

A sandboxed way of running a plugin someone else wrote, with less than everything; installing a plugin through the review screen or the library; a plugin proposed by an agent; keys for a plugin's commands; undoing what a plugin did past the API without a reload.
