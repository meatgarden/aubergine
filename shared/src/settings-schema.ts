import { z } from 'zod';
import type { JsonSchema } from './openapi';
import { Settings } from './settings';
import { COMMAND_IDS } from './shortcuts';
import { COLOR_THEMES, THEME_COLORS, THEME_ID } from './themes';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isNode = (value: unknown): value is { [key: string]: Json } => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The keys of the settings file the page writes, each through a route of its own (`PUT /v1/settings/appearance`,
 * `…/desktop`, `…/describing`). Every other key is written by hand. The reference, `aubergine settings list` and the
 * list of every setting in Settings read this; nothing else says which are which.
 */
export const PAGE_WRITTEN_SETTINGS = [
  'theme',
  'appearance.light',
  'appearance.dark',
  'appearance.terminal',
  'appearance.byTag',
  'appearance.cursor',
  'appearance.cursorBlink',
  'font.family',
  'font.size',
  'desktop.openNew',
  'describe.remind',
] as const;
export type PageWrittenSetting = (typeof PAGE_WRITTEN_SETTINGS)[number];
export const isPageWritten = (key: string): key is PageWrittenSetting => (PAGE_WRITTEN_SETTINGS as readonly string[]).includes(key);

/** The name of the schema's file, beside `config.json` in the data folder, and what a file says to use it. */
export const SETTINGS_SCHEMA_FILE = 'config.schema.json';
export const SCHEMA_LINE = `"$schema": "./${SETTINGS_SCHEMA_FILE}"`;

/** What one chord setting may be: a chord, a list of chords, or null for no key. */
const chordValue = (command: string): JsonSchema => ({
  description: `The key of ${command}: a chord such as "Ctrl+Meta+J", a list of chords, or null for no key.`,
  anyOf: [{ type: 'string', maxLength: 100 }, { type: 'array', items: { type: 'string', maxLength: 100 } }, { type: 'null' }],
});

/** A color set by hand, as `resolveColors` takes it: six hexadecimal digits, case and spaces round it not minded. */
const HAND_COLOR: JsonSchema = { type: 'string', pattern: '^\\s*#[0-9A-Fa-f]{6}\\s*$' };
const colorProperties = (): { [key: string]: Json } => Object.fromEntries(THEME_COLORS.map((name) => [name, { ...HAND_COLOR, description: `The page’s color token --${name}, as #rrggbb.` }]));

/**
 * The JSON Schema of `config.json`, as an editor wants it: the shape a person writes (every key may be left out), with
 * each key's description and default, `"$schema"` allowed at the top, and keys it does not know allowed, since the file
 * keeps them. Where the server reports an entry it cannot use (a command's name in `shortcuts`, a color's name in
 * `appearance.colors`), the schema names the ones there are, so that an editor says the same. Pure.
 */
export function settingsJsonSchema(): JsonSchema {
  // `unrepresentable: 'any'`: nothing in the settings is, but a field added later that is must not stop the server.
  const raw = z.toJSONSchema(Settings, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
  const tidy = (node: Json): Json => {
    if (Array.isArray(node)) return node.map(tidy);
    if (!isNode(node)) return node;
    const out: { [key: string]: Json } = {};
    for (const [key, value] of Object.entries(node)) {
      // zod's own word for `startsWith`, which is no format of JSON Schema: the pattern beside it says the same.
      if (key === 'format' && value === 'starts_with') continue;
      out[key] = tidy(value);
    }
    return out;
  };
  const schema = tidy(raw) as { [key: string]: Json };
  const properties = schema.properties as { [key: string]: { [key: string]: Json } };

  for (const key of ['shortcuts', 'shortcutsInAppWindow'] as const) {
    const node = properties[key] as { [key: string]: Json };
    delete node.propertyNames;
    node.properties = Object.fromEntries(COMMAND_IDS.map((id) => [id, chordValue(id)]));
    node.additionalProperties = false;
  }

  const appearance = (properties.appearance as { properties: { [key: string]: { [key: string]: Json } } }).properties;
  const colors = appearance.colors as { [key: string]: Json };
  delete colors.propertyNames;
  colors.properties = {
    ...colorProperties(),
    ...Object.fromEntries(
      COLOR_THEMES.map((theme) => [`[${theme.id}]`, { type: 'object', description: `Colors set by hand for ${theme.name} alone, over those for every theme.`, properties: colorProperties(), additionalProperties: false }]),
    ),
  };
  // A theme file's own: its ID is its file's name, which the schema cannot know.
  colors.patternProperties = {
    [`^\\[${THEME_ID.source.slice(1, -1)}\\]$`]: { type: 'object', description: 'Colors set by hand for a theme of your own (a file in themes/ in the data folder) alone, over those for every theme.', properties: colorProperties(), additionalProperties: false },
  };
  colors.additionalProperties = false;

  // A theme is one that comes with Aubergine, listed so that an editor offers them, or the ID of a theme file of your own.
  const idOf = (ids: string[]): Json => [{ enum: ids }, { type: 'string', pattern: THEME_ID.source }];
  for (const kind of ['light', 'dark'] as const) {
    const node = appearance[kind] as { [key: string]: Json };
    delete node.type;
    delete node.pattern;
    node.anyOf = idOf(COLOR_THEMES.filter((theme) => theme.kind === kind).map((theme) => theme.id));
  }
  const terminal = appearance.terminal as { [key: string]: Json };
  delete terminal.type;
  delete terminal.pattern;
  terminal.anyOf = [...(idOf(COLOR_THEMES.map((theme) => theme.id)) as Json[]), { type: 'null' }];

  const access = (properties.access as { properties: { [key: string]: { [key: string]: Json } } }).properties;
  for (const kind of ['addresses', 'pages'] as const) (access[kind] as { [key: string]: Json }).items = { type: 'string', description: 'An origin alone, such as "https://aubergine.example.net".' };

  return {
    $schema: schema.$schema ?? 'https://json-schema.org/draft/2020-12/schema',
    title: 'Aubergine settings',
    description: 'config.json in the data folder of an Aubergine server. Every key may be left out; what is left out takes its default.',
    type: 'object',
    properties: {
      $schema: { type: 'string', description: `Where an editor finds this schema: ${SCHEMA_LINE.split(': ')[1]}. Aubergine itself does not read it.` },
      ...properties,
    },
    additionalProperties: true,
  };
}

/** One key of the settings file, as the reference and the list in Settings show it. */
export interface SettingRow {
  /** Dotted, as the file nests it: `font.size`. */
  key: string;
  /** The top-level key it is under (itself, for a top-level value). */
  group: string;
  description: string;
  /** What it is when left out. */
  default: unknown;
  /** A plain value, a list of entries, or a map of entries. */
  kind: 'value' | 'list' | 'map';
  /** The page writes it, in Settings; otherwise it is written by hand. */
  byPage: boolean;
  /** The words it may be, where it is one of a few (null left out). */
  choices: string[];
}

/** One top-level key of the file, with what is under it. */
export interface SettingGroup {
  key: string;
  description: string;
  rows: SettingRow[];
}

/**
 * Every key of the settings file, in the order of the schema, grouped by its top-level key. A key goes down into an
 * object only where the object is a group of keys; one that holds entries of its own (a list, `shortcuts`,
 * `appearance.colors`) is one row. Pure.
 */
export function settingGroups(schema: JsonSchema = settingsJsonSchema()): SettingGroup[] {
  const groups: SettingGroup[] = [];
  const top = schema.properties as { [key: string]: { [key: string]: Json } };
  for (const [key, node] of Object.entries(top)) {
    if (key === '$schema') continue;
    const rows: SettingRow[] = [];
    walk(key, key, node, rows);
    groups.push({ key, description: typeof node.description === 'string' ? node.description : '', rows });
  }
  return groups;
}

function walk(key: string, group: string, node: { [key: string]: Json }, rows: SettingRow[]): void {
  const isGroup = node.type === 'object' && isNode(node.properties) && node.additionalProperties === undefined;
  if (isGroup) {
    for (const [name, child] of Object.entries(node.properties as { [key: string]: Json })) if (isNode(child)) walk(`${key}.${name}`, group, child, rows);
    return;
  }
  const kind = node.type === 'array' ? 'list' : node.type === 'object' ? 'map' : 'value';
  rows.push({ key, group, description: typeof node.description === 'string' ? node.description : '', default: node.default, kind, byPage: isPageWritten(key), choices: choicesOf(node) });
}

/** The words a value may be, from `enum`, also inside `anyOf`. */
function choicesOf(node: { [key: string]: Json }): string[] {
  if (Array.isArray(node.enum)) return node.enum.filter((one): one is string => typeof one === 'string');
  if (Array.isArray(node.anyOf)) return node.anyOf.flatMap((one) => (isNode(one) ? choicesOf(one) : []));
  return [];
}

/** Every key of the settings file, in order. Pure. */
export const settingRows = (schema?: JsonSchema): SettingRow[] => settingGroups(schema).flatMap((group) => group.rows);

/** The value at a dotted key of some settings, or undefined where there is none. Pure. */
export function settingValue(settings: unknown, key: string): unknown {
  let at: unknown = settings;
  for (const part of key.split('.')) {
    if (!isNode(at) || !Object.hasOwn(at, part)) return undefined;
    at = at[part];
  }
  return at;
}

/** Whether two values of a setting are the same. Pure. */
export const sameSetting = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** How many entries a list or a map of a setting holds, in words: "no entries", "1 entry", "3 entries". Pure. */
export function entriesWords(value: unknown): string {
  const count = Array.isArray(value) ? value.length : isNode(value) ? Object.keys(value).length : 0;
  return count === 0 ? 'no entries' : count === 1 ? '1 entry' : `${count} entries`;
}

/** A value of a setting as one line of text: text as it is, anything else as JSON, a list or a map as its count. Pure. */
export function settingWords(row: Pick<SettingRow, 'kind'>, value: unknown): string {
  if (row.kind !== 'value') return entriesWords(value);
  if (typeof value === 'string') return value;
  return value === undefined ? '' : JSON.stringify(value);
}

/**
 * The line to add to the settings file for a key, in the shape of the file and with the value given:
 * `"font": { "size": 14 }`. Pure.
 */
export function settingLine(key: string, value: unknown): string {
  const parts = key.split('.');
  let line = JSON.stringify(value ?? null);
  for (const part of parts.slice(1).reverse()) line = `{ ${JSON.stringify(part)}: ${line} }`;
  return `${JSON.stringify(parts[0])}: ${line}`;
}

/** A default for a table: JSON in code, a list or a map by what it holds. Pure. */
const defaultWords = (row: SettingRow): string => (row.kind !== 'value' ? `${entriesWords(row.default)}` : `\`${JSON.stringify(row.default)}\``);
const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

/** The reference of the settings file (`docs/settings.md`): one table for each top-level key. Pure. */
export function settingsReferencePage(): string {
  const lines = [
    '# The settings file',
    '',
    '`config.json` in the data folder holds the settings of one server. Every key may be left out; what is left out takes its default. A file that cannot be read as settings is reported when the server starts, and the defaults are used; a wrong entry in a list (`access`, `shortcuts`, `appearance.colors`) is reported and skipped, and the rest of the file still counts. Keys the server does not know are kept.',
    '',
    `The page writes some keys from Settings, and leaves every other key of the file as it was; the rest are written by hand. \`aubergine settings path\` prints where the file is, and \`aubergine settings list\` every key with its value now.`,
    '',
    `## An editor that completes the keys`,
    '',
    `The server writes \`${SETTINGS_SCHEMA_FILE}\` beside \`config.json\` each time it starts (only when it changed). Add this line to \`config.json\` and an editor that reads JSON Schema describes and completes each key:`,
    '',
    '```json',
    `{ ${SCHEMA_LINE} }`,
    '```',
    '',
    `The same schema is \`docs/${SETTINGS_SCHEMA_FILE}\` in the repository, and \`aubergine settings schema\` prints it.`,
  ];
  for (const group of settingGroups()) {
    lines.push('', `## \`${group.key}\``, '');
    if (group.rows.length > 1 || group.rows[0]?.key !== group.key) lines.push(group.description, '');
    lines.push('| Key | What it is | Default | Written |', '|---|---|---|---|');
    for (const row of group.rows) lines.push(`| \`${row.key}\` | ${cell(row.description)}${row.choices.length > 0 ? ` One of ${row.choices.map((one) => `\`${one}\``).join(', ')}.` : ''} | ${cell(defaultWords(row))} | ${row.byPage ? 'Settings' : 'by hand'} |`);
  }
  return lines.join('\n');
}
