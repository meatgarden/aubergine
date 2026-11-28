import { PLUGIN_MANIFEST, starterManifest } from './plugins';

/**
 * What `aubergine plugin new` writes into `plugins/<id>/`: a manifest, a module and a stylesheet. The module uses the
 * plugin API alone (`aubergine`, given to `activate`), so that it keeps working from one version of the page to the
 * next: a section of the side panel that lists terminals by a field, a command in the palette, and a placeholder for a
 * title or a row. `docs/plugins.md` shows the same text, and a test runs it against the API with stand-ins.
 */

/** The field the starter lists terminals by. */
export const STARTER_FIELD = 'Ticket';

export function starterModule(name: string): string {
  const title = name.replace(/[\\`$]/g, '');
  return `// ${title}: a plugin of your own. It runs in this page as you, with everything the page can do: it can read
// every terminal and type into any of them. Nothing keeps it apart.
//
// It is a native ES module, imported by the page as it is: no build step, no bundler. Change it, then reload the
// page. A plugin whose files changed does not run until you switch it on again in Settings → Plugins, unless you
// ticked "Follow changes while I write it" there.
//
// Use what \`aubergine\` gives you (docs/plugins.md lists it). Everything else on the page (its elements, its classes,
// its modules) may change in any release; the API is only added to.

export function activate(aubergine) {
  // The page's own React: a plugin never brings a second one. There is no JSX without a build step, so elements are
  // made with createElement.
  const { React } = aubergine.ui;
  const h = React.createElement;

  // The value of a terminal's field with this label, whatever the capitals, or null.
  const LABEL = '${STARTER_FIELD}';
  const valueOf = (session) => session.fields.find((field) => field.label.toLowerCase() === LABEL.toLowerCase())?.value ?? null;

  // 1. A section of the side panel: the terminals of the project you look at that have a ${STARTER_FIELD} field.
  function Section() {
    // The page's view of the state, drawn again whenever it changes. Read it; change things through aubergine.api.
    const app = aubergine.state.use();
    const sessions = (app?.sessions ?? []).filter((session) => valueOf(session) !== null);
    if (sessions.length === 0) {
      return h('p', { className: 'plugin-empty' }, \`No terminal has a \${LABEL} field yet. Add one in a terminal’s details, as \${LABEL}: ABC-123.\`);
    }
    return h(
      'div',
      { className: 'plugin-list' },
      sessions.map((session) =>
        h(aubergine.ui.Row, { key: session.id, onClick: () => aubergine.openDetails(session.id) }, h('span', { className: 'plugin-value' }, valueOf(session)), ' ', session.name),
      ),
    );
  }
  aubergine.panel.addSection({
    id: 'by-field',
    title: \`By \${LABEL}\`,
    says: \`Terminals that have a \${LABEL} field, by its value.\`,
    icon: LABEL.slice(0, 1),
    order: 90,
    Component: Section,
  });

  // 2. A command, in the palette under this plugin's name. Its ID becomes plugin.<this plugin's ID>.copy.
  aubergine.commands.add({
    id: 'copy',
    title: \`Copy every \${LABEL}\`,
    description: \`Copies the \${LABEL} of every terminal that has one, one to a line.\`,
    run: () => {
      const values = (aubergine.state.get()?.sessions ?? []).map(valueOf).filter((value) => value !== null);
      void navigator.clipboard?.writeText(values.join('\\n'));
      aubergine.say(values.length === 0 ? \`No terminal has a \${LABEL} field.\` : \`Copied \${values.length} \${LABEL} values.\`);
    },
  });

  // 3. A placeholder for a terminal's title and its row: write {${STARTER_FIELD.toLowerCase()}} in Settings → Appearance → Titles and rows.
  aubergine.templates.addPart({
    name: '${STARTER_FIELD.toLowerCase()}',
    kind: 'words',
    where: ['title', 'row'],
    says: \`The value of its \${LABEL} field.\`,
    say: (session) => valueOf(session),
  });

  // Everything added through aubergine is taken away again when the plugin is switched off. What a plugin does past
  // the API (an element of its own on the page, a listener of its own) is not: undo it here.
}

export function deactivate() {}
`;
}

export function starterStyle(): string {
  return `/* Linked while the plugin runs: after the app's own stylesheets, before your own custom.css, which has the last word.
   Use the tokens (docs/hooks.md lists them) so that it looks right in every color theme. Rules here reach the whole
   page: a plugin's own elements are inside an element with data-plugin="<its ID>". */

[data-plugin] .plugin-empty {
  color: var(--text-muted);
  font-size: var(--font-meta);
  padding: var(--space-2) var(--gutter-panel);
}

[data-plugin] .plugin-value {
  font-weight: var(--weight-strong);
}
`;
}

/** Every file of a new plugin, by name. */
export function pluginStarter(name: string): Record<string, string> {
  return { [PLUGIN_MANIFEST]: starterManifest(name), 'index.js': starterModule(name), 'style.css': starterStyle() };
}
