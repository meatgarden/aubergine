import { TOKEN_NAMES } from './token-names.generated';

/**
 * The hooks: what a stylesheet of the owner's own (`custom.css` in the data folder) may rely on from one release to the
 * next. This list is the whole promise. `docs/hooks.md` and the comment at the top of the starter stylesheet are made
 * from it, and tests hold the page to it: every token is in `tokens.css`, every part is drawn, and a part that is drawn
 * and not in this list fails. A hook is only ever added; one is never renamed or removed.
 *
 * Four kinds: the tokens (custom properties, read from `tokens.css`, never typed again here), attributes on the page's
 * root element, parts (`data-part="<name>"` on the stable pieces of the page, so that no class name is promised) and
 * attributes on some parts (a terminal's, a canvas tab's). Class names, test IDs and how the elements are nested are
 * not promised.
 */

export type HookKind = 'token' | 'root' | 'part' | 'attribute';

export interface TokenHook {
  kind: 'token';
  /** The custom property's name without its `--`. */
  name: string;
  /** Whether a color theme gives it a value. */
  color: boolean;
  /** What kind of value it is, from its name. */
  group: TokenGroup;
}
export interface RootHook {
  kind: 'root';
  /** The attribute's name, on `<html>`. */
  name: string;
  says: string;
}
export interface PartHook {
  kind: 'part';
  /** The value of `data-part`. */
  name: string;
  says: string;
}
export interface AttributeHook {
  kind: 'attribute';
  /** The attribute's name. */
  name: string;
  /** The parts it is on. */
  on: readonly PartName[];
  says: string;
}
export type UiHook = TokenHook | RootHook | PartHook | AttributeHook;

/** What a token is, told from its name: the sections of tokens.css. */
export type TokenGroup = 'type' | 'space' | 'size' | 'shape' | 'control' | 'motion' | 'layer' | 'color' | 'shadow';
export const TOKEN_GROUP_WORDS: Record<TokenGroup, string> = {
  type: 'Type: sizes, weights, line heights and the two font lists',
  space: 'Space: the grid of four and the gutters',
  size: 'Sizes of regions: the column of a page, the drawer, label columns',
  shape: 'Corners',
  control: 'Heights of controls and chips',
  motion: 'Motion: durations, the curve, how far what opens travels',
  layer: 'Layers, lowest first',
  color: 'Colors: every color theme gives each of these a value',
  shadow: 'Shadows, one for each layer that floats',
};
const groupOf = (name: string, color: boolean): TokenGroup => {
  if (name.startsWith('shadow-')) return 'shadow';
  if (color) return 'color';
  if (/^(font-|weight-|leading)/.test(name)) return 'type';
  if (/^(space-|gutter-)/.test(name)) return 'space';
  if (name.startsWith('radius-')) return 'shape';
  if (name === 'chip' || name.startsWith('control')) return 'control';
  if (name.startsWith('motion-')) return 'motion';
  if (name.startsWith('z-')) return 'layer';
  return 'size';
};

/** The parts of the page, by the value of their `data-part`. Short and plain; chosen once. */
export const PART_HOOKS = [
  { kind: 'part', name: 'top-bar', says: 'The bar at the top of the window: the app’s name, the project, the places, For you, Settings and Help.' },
  { kind: 'part', name: 'canvas-tabs', says: 'The bar of canvas tabs over the canvas (or the column of canvases at the left, as the canvases are shown).' },
  { kind: 'part', name: 'canvas-tab', says: 'One canvas’s tab, as tabs or in the column, and its dot on the folded column.' },
  { kind: 'part', name: 'side-panel', says: 'The side panel, open or folded to its rail.' },
  { kind: 'part', name: 'terminal-list', says: 'The list of terminals in the side panel.' },
  { kind: 'part', name: 'terminal-row', says: 'One terminal’s row in that list.' },
  { kind: 'part', name: 'canvas', says: 'The canvas: the surface the terminals and frames lie on.' },
  { kind: 'part', name: 'canvas-bar', says: 'The bar over the canvas: Go to…, the map’s button, the view and the rest.' },
  { kind: 'part', name: 'map', says: 'The map of the canvas, in its corner, while it is shown.' },
  { kind: 'part', name: 'terminal', says: 'A terminal on the canvas: the whole box, its title, body and the note beside it.' },
  { kind: 'part', name: 'terminal-title', says: 'A terminal’s title on the canvas: its state, its name, what it says after the name, its tools.' },
  { kind: 'part', name: 'terminal-body', says: 'A terminal’s body on the canvas: the terminal itself, live or as a snapshot, or what is said once its shell has ended.' },
  { kind: 'part', name: 'terminal-note', says: 'The note beside a terminal on the canvas: its summary and its log.' },
  { kind: 'part', name: 'frame', says: 'A frame on the canvas, with its label.' },
  { kind: 'part', name: 'details', says: 'The drawer beside the side panel: the details of one thing (a terminal, a run, a message thread).' },
  { kind: 'part', name: 'page', says: 'A page shown in place of the canvas: Library, Workflows, Runs.' },
  { kind: 'part', name: 'dialog', says: 'A dialog or a sheet over the page: Settings, Help, the review, a question.' },
  { kind: 'part', name: 'menu', says: 'A menu, wherever it hangs from.' },
  { kind: 'part', name: 'toast', says: 'The one place that says what just happened.' },
  { kind: 'part', name: 'focus-head', says: 'The head of a terminal in a browser tab of its own (`/t/<terminal>`).' },
  { kind: 'part', name: 'focus-body', says: 'The terminal itself in a browser tab of its own.' },
] as const satisfies readonly PartHook[];
export type PartName = (typeof PART_HOOKS)[number]['name'];
export const PART_NAMES: readonly PartName[] = PART_HOOKS.map((hook) => hook.name);
export const isPartName = (name: string): name is PartName => (PART_NAMES as readonly string[]).includes(name);

/** The parts that stand for one terminal, and carry its attributes. */
export const TERMINAL_PARTS = ['terminal', 'terminal-row', 'focus-head'] as const satisfies readonly PartName[];

export const ROOT_HOOKS = [
  { kind: 'root', name: 'data-theme', says: '`light` or `dark`: which kind the page is drawn as. There from the first paint.' },
  { kind: 'root', name: 'data-color-theme', says: 'The built-in color theme drawn (for a theme file of your own, the one it is laid over). There from the first paint.' },
  { kind: 'root', name: 'data-color-theme-id', says: 'The ID of the color theme drawn, a theme file’s own included. There from the first paint.' },
  { kind: 'root', name: 'data-page', says: '`canvas`, `library`, `workflows` or `runs`: what is shown under the top bar; `terminal` for a terminal in a browser tab of its own. Set once the page has loaded.' },
  { kind: 'root', name: 'data-project', says: 'The ID of the project looked at. Set once the page has loaded.' },
  { kind: 'root', name: 'data-server', says: '`own` while the page shows the server that sent it, `linked` while it shows a server linked in this browser. Set once the page has loaded.' },
  { kind: 'root', name: 'data-here', says: 'There while the page is used at the computer Aubergine runs on (not from another device, and not while a linked server is shown).' },
] as const satisfies readonly RootHook[];

/** Attributes on a terminal's parts and a canvas tab: values from what the page already knows, nothing worked out for them alone. */
export const ATTRIBUTE_HOOKS = [
  { kind: 'attribute', name: 'data-session', on: TERMINAL_PARTS, says: 'The terminal’s ID.' },
  { kind: 'attribute', name: 'data-name', on: TERMINAL_PARTS, says: 'The terminal’s name, as written: `[data-name^="prod"]`.' },
  { kind: 'attribute', name: 'data-state', on: TERMINAL_PARTS, says: 'Its state in one word, the same everywhere: `waiting` (for you), `processing`, `unread`, `failed`, `idle` or `ended`.' },
  { kind: 'attribute', name: 'data-tags', on: TERMINAL_PARTS, says: 'Its tags, in lowercase, separated by spaces: `[data-tags~="prod"]`. Empty when it has none.' },
  { kind: 'attribute', name: 'data-agent', on: TERMINAL_PARTS, says: 'There when an agent is on record in it, with the kind of agent (`claude-code`).' },
  { kind: 'attribute', name: 'data-color', on: TERMINAL_PARTS, says: 'Its color: a named one (`red`, `blue`…), `none`, or a color of your own as `#rrggbb`.' },
  { kind: 'attribute', name: 'data-selected', on: ['terminal', 'terminal-row'], says: '`true` on the terminal that is selected: on the canvas while no other has the keyboard, in the list while its row is marked.' },
  { kind: 'attribute', name: 'data-focused', on: ['terminal', 'terminal-row'], says: '`true` on the terminal that has the keyboard.' },
  { kind: 'attribute', name: 'data-theme-id', on: ['terminal-body', 'focus-body'], says: 'There where a terminal’s body is drawn in another color theme than the page: that theme’s ID.' },
  { kind: 'attribute', name: 'data-canvas', on: ['canvas-tab'], says: 'The canvas’s ID.' },
  { kind: 'attribute', name: 'data-current', on: ['canvas-tab'], says: '`true` on the tab of the canvas being looked at.' },
] as const satisfies readonly AttributeHook[];

export const TOKEN_HOOKS: readonly TokenHook[] = TOKEN_NAMES.map(({ name, color }) => ({ kind: 'token', name, color, group: groupOf(name, color) }));

/** Every hook: the whole promise. */
export const UI_HOOKS: readonly UiHook[] = [...TOKEN_HOOKS, ...ROOT_HOOKS, ...PART_HOOKS, ...ATTRIBUTE_HOOKS];

/** How a hook is written in a stylesheet. */
export function writtenHook(hook: UiHook): string {
  if (hook.kind === 'token') return `var(--${hook.name})`;
  if (hook.kind === 'part') return `[data-part="${hook.name}"]`;
  return `[${hook.name}]`;
}

/** Five small examples that use hooks only: the reference and the starter stylesheet show them. */
export const HOOK_EXAMPLES: readonly { says: string; css: string }[] = [
  { says: 'The title of every terminal tagged prod in red, on the canvas and in a tab of its own', css: '[data-part="terminal"][data-tags~="prod"] [data-part="terminal-title"],\n[data-part="focus-head"][data-tags~="prod"] {\n  background: #5c1f24;\n}' },
  { says: 'No map on the canvas', css: '[data-part="map"] {\n  display: none;\n}' },
  { says: 'Rounder corners everywhere, through a token', css: ':root {\n  --radius-surface: 16px;\n  --radius-control: 10px;\n}' },
  { says: 'A terminal waiting for you stands out in the list', css: '[data-part="terminal-row"][data-state="waiting"] {\n  font-weight: var(--weight-strong);\n}' },
  { says: 'A quieter canvas in the dark: its dots in the color of the ground', css: ':root[data-theme="dark"] {\n  --canvas-dot: var(--bg);\n}' },
];

/** `docs/hooks.md`: the promise, made from the list. Pure. */
export function hooksReferencePage(): string {
  const cell = (text: string): string => text.replace(/\|/g, '\\|');
  const tokenGroups = (Object.keys(TOKEN_GROUP_WORDS) as TokenGroup[])
    .map((group) => ({ group, names: TOKEN_HOOKS.filter((hook) => hook.group === group).map((hook) => `\`--${hook.name}\``) }))
    .filter((one) => one.names.length > 0);
  return [
    '# Hooks for your own stylesheet',
    '',
    'A stylesheet of your own (`custom.css` in the data folder; [custom-css.md](custom-css.md) says how it is loaded) may restyle anything on the page. What it can rely on from one release to the next is this list, and only this list: the tokens, the attributes on the page’s root, the parts, and the attributes on some parts. A hook is only ever added; none is renamed or removed. The list is `UI_HOOKS` in `shared/src/hooks.ts`, and this page, the comment at the top of the stylesheet `aubergine css new` writes, and the tests that hold the page to it are made from it.',
    '',
    '**Not promised:** class names, test IDs (`data-testid`), how elements are nested, and anything not on this page. A rule that names a class may stop matching in any release.',
    '',
    'An attribute selector is as specific as a class: a rule of yours on a part wins over the app’s own rule of the same specificity, because your file comes last. Where the app’s rule is more specific, match it, or add a part or an attribute to yours.',
    '',
    '## Tokens',
    '',
    'Every size, space, corner, layer, motion and color of the page is a custom property on `:root`. Set one there and everything that uses it follows; read one with `var(--name)`. The colors are given a value by each color theme, so set them under `:root[data-color-theme="<id>"]` or `:root[data-theme="dark"]` to change one theme or one kind only. [design.md](design.md) says what each is for.',
    '',
    ...tokenGroups.flatMap(({ group, names }) => [`- **${TOKEN_GROUP_WORDS[group]}:** ${names.join(', ')}.`]),
    '',
    '## On the root',
    '',
    'On `<html>`, for rules such as `:root[data-page="runs"] …` or `[data-server="linked"] …`.',
    '',
    '| Attribute | What it says |',
    '| --- | --- |',
    ...ROOT_HOOKS.map((hook) => `| \`${hook.name}\` | ${cell(hook.says)} |`),
    '',
    '## Parts',
    '',
    'The stable pieces of the page carry `data-part`: `[data-part="terminal-title"]`.',
    '',
    '| Part | What it is |',
    '| --- | --- |',
    ...PART_HOOKS.map((hook) => `| \`${hook.name}\` | ${cell(hook.says)} |`),
    '',
    '## Attributes of a part',
    '',
    `A terminal’s attributes are on each part that stands for one terminal (${TERMINAL_PARTS.map((part) => `\`${part}\``).join(', ')}), with the same values on all of them, so that one rule can match a terminal wherever it is drawn.`,
    '',
    '| Attribute | On | What it says |',
    '| --- | --- | --- |',
    ...ATTRIBUTE_HOOKS.map((hook) => `| \`${hook.name}\` | ${hook.on.map((part) => `\`${part}\``).join(', ')} | ${cell(hook.says)} |`),
    '',
    '## Examples',
    '',
    ...HOOK_EXAMPLES.flatMap((example) => [`${example.says}:`, '', '```css', example.css, '```', '']),
  ].join('\n');
}
