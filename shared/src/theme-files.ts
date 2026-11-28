import { z } from 'zod';
import { contrastRatio } from './contrast';
import { BUILT_IN_THEME_COLORS } from './theme-colors.generated';
import { ANSI_NAMES, COLOR_THEMES, THEME_COLORS, THEME_ID, UserTheme, colorTheme, plain, type ColorThemeId, type ThemeColor, type ThemeKind, type ThemeOf, type ThemeTerminal } from './themes';
import { PLAIN_LINE } from './workflows';

export { BUILT_IN_THEME_COLORS };

/**
 * Themes of the owner's own, as files: `themes/<id>.json` in the data folder. A file names a built-in theme of its kind
 * (`base`) and colors over it; what it does not name is the base's. Nothing in a file is run: what comes out of one is a
 * plain name and colors written `#rrggbb`, and nothing else. The server reads the folder (`daemon/src/theme-files.ts`);
 * what a file holds is decided here, by `readThemeFile`, alone.
 */

/** The folder of theme files in the data folder. */
export const THEMES_FOLDER = 'themes';
/** How many theme files are read, and how large each may be. */
export const THEME_FILES_MAX = 50;
export const THEME_FILE_MAX_BYTES = 64 * 1024;
/** The schema of a theme file, written beside `config.schema.json`, and what a file says to use it. */
export const THEME_SCHEMA_FILE = 'theme.schema.json';
export const THEME_SCHEMA_LINE = `"$schema": "../${THEME_SCHEMA_FILE}"`;

/** The keys a theme file may hold. `$schema` is for an editor and is not read. */
const TOP_KEYS = new Set(['$schema', 'name', 'kind', 'base', 'colors', 'terminal']);
const TERMINAL_KEYS = ['foreground', 'cursor', 'selection'] as const;
const HEX = /^#[0-9a-f]{6}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hexOf = (value: unknown): string | null => {
  const hex = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return HEX.test(hex) ? hex : null;
};

/** Whether a file's name (without `.json`) may be a theme's ID: the shape of an ID, and no built-in theme's. */
export function themeIdProblem(id: string): string | null {
  if (!THEME_ID.test(id)) return 'its name is not one a theme can have: a lowercase letter, then up to 39 lowercase letters, digits and hyphens, then .json.';
  if (colorTheme(id)) return `"${id}" is the name of a theme that comes with Aubergine: a file of your own needs another name.`;
  return null;
}

/** Whether a theme's name is a plain name of one line, at most 60 characters. */
export const themeNameProblem = (name: unknown): string | null =>
  typeof name === 'string' && PLAIN_LINE.test(name) && name.trim() !== '' && name.trim().length <= 60 ? null : '"name" is not a plain name of one line, at most 60 characters.';

export type ThemeFileReading = { theme: UserTheme; problems: string[] } | { problem: string };

/**
 * What the text of a theme file comes to. A file that is not JSON, is too large, has no plain name, no `kind` of light
 * or dark, or a `base` that is no built-in theme of that kind, is refused whole, with one sentence. Anything else that is
 * wrong (a color that is not `#rrggbb`, a name that is no color, a key a theme file does not have) is reported and
 * skipped, as `resolveColors` does with colors set by hand; the rest of the file still counts. Pure.
 */
export function readThemeFile(id: string, text: string): ThemeFileReading {
  const where = `themes/${plain(id)}.json`;
  const wrongId = themeIdProblem(id);
  if (wrongId) return { problem: `${where}: ${wrongId} It is not read.` };
  if (text.length > THEME_FILE_MAX_BYTES) return { problem: `${where}: it is larger than ${THEME_FILE_MAX_BYTES} bytes. It is not read.` };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problem: `${where}: it is not JSON. It is not read.` };
  }
  if (!isRecord(raw)) return { problem: `${where}: it is not a JSON object with a name, a kind and colors. It is not read.` };

  const wrongName = themeNameProblem(raw.name);
  if (wrongName) return { problem: `${where}: ${wrongName} It is not read.` };
  const name = (raw.name as string).trim();
  const kind = raw.kind;
  if (kind !== 'light' && kind !== 'dark') return { problem: `${where}: "kind" is not "light" or "dark". It is not read.` };
  let base: ColorThemeId = kind;
  if (raw.base !== undefined) {
    const named = typeof raw.base === 'string' ? colorTheme(raw.base) : undefined;
    if (!named || named.kind !== kind) {
      const ofKind = COLOR_THEMES.filter((theme) => theme.kind === kind).map((theme) => theme.id).join(', ');
      return { problem: `${where}: "base" is not a ${kind} theme that comes with Aubergine (${ofKind}). It is not read.` };
    }
    base = named.id;
  }

  const problems: string[] = [];
  // Kept as lists of pairs, not looked up by name: a key such as `__proto__` is said, not lost.
  for (const key of Object.keys(raw)) if (!TOP_KEYS.has(key)) problems.push(`${where}: "${plain(key)}" is not a key of a theme file. It is skipped.`);

  const colors: Partial<Record<ThemeColor, string>> = {};
  const known = new Set<string>(THEME_COLORS);
  if (raw.colors !== undefined && !isRecord(raw.colors)) problems.push(`${where}: "colors" is not a list of colors by name. It is skipped.`);
  else if (raw.colors !== undefined)
    for (const [key, value] of Object.entries(raw.colors)) {
      if (!known.has(key)) {
        problems.push(`${where}, colors: "${plain(key)}" is not a color that can be set. It is skipped.`);
        continue;
      }
      const hex = hexOf(value);
      if (hex === null) problems.push(`${where}, colors: "${key}" is not a color written as #rrggbb. It is skipped.`);
      else colors[key as ThemeColor] = hex;
    }

  const terminal: ThemeTerminal = {};
  if (raw.terminal !== undefined && !isRecord(raw.terminal)) problems.push(`${where}: "terminal" is not a list of a terminal's colors. It is skipped.`);
  else if (raw.terminal !== undefined)
    for (const [key, value] of Object.entries(raw.terminal)) {
      if ((TERMINAL_KEYS as readonly string[]).includes(key)) {
        const hex = hexOf(value);
        if (hex === null) problems.push(`${where}, terminal: "${key}" is not a color written as #rrggbb. It is skipped.`);
        else terminal[key as (typeof TERMINAL_KEYS)[number]] = hex;
      } else if (key === 'ansi') {
        if (!Array.isArray(value)) {
          problems.push(`${where}, terminal: "ansi" is not a list of sixteen colors. It is skipped.`);
          continue;
        }
        if (value.length > 16) problems.push(`${where}, terminal: "ansi" has more than sixteen colors. Those after the sixteenth are skipped.`);
        terminal.ansi = value.slice(0, 16).map((one, at) => {
          if (one === null) return null;
          const hex = hexOf(one);
          if (hex === null) problems.push(`${where}, terminal: color ${at} of "ansi" (${ANSI_NAMES[at]}) is not a color written as #rrggbb. It is skipped.`);
          return hex;
        });
      } else problems.push(`${where}, terminal: "${plain(key)}" is not a color a terminal has here (foreground, cursor, selection, ansi). It is skipped.`);
    }

  // Held to the schema once more: whatever the code above let through, nothing else comes out.
  const theme = UserTheme.safeParse({ id, name, kind, base, colors, terminal });
  if (!theme.success) return { problem: `${where}: it could not be read as a theme. It is not read.` };
  return { theme: theme.data, problems };
}

/** A theme's colors as they are drawn, every one of them: its base's, with its own over them. Pure. */
export function themeColorValues(theme: Pick<ThemeOf, 'base' | 'colors'>): Record<ThemeColor, string> {
  return { ...BUILT_IN_THEME_COLORS[theme.base], ...theme.colors };
}

/**
 * Whether a theme of the owner's may be hard to read: its text on its ground or on its surface is less than 4.5 to 1.
 * Advice for Settings, nothing more: nothing is refused or disabled for it. Pure.
 */
export function mayBeHardToRead(theme: Pick<ThemeOf, 'base' | 'colors'>): boolean {
  const values = themeColorValues(theme);
  return contrastRatio(values.text, values.bg) < 4.5 || contrastRatio(values.text, values.surface) < 4.5;
}

/**
 * The text of a new theme file, as `aubergine theme new` writes it: over the base of the theme it starts from, every
 * color as that theme draws it, so that the owner changes the values; and the line that points an editor at the schema.
 * Pure.
 */
export function starterThemeFile(name: string, from: Pick<ThemeOf, 'base' | 'colors'>): string {
  const kind: ThemeKind = colorTheme(from.base)?.kind ?? 'dark';
  const colors = themeColorValues(from);
  const file = { $schema: `../${THEME_SCHEMA_FILE}`, name, kind, base: from.base, colors: Object.fromEntries(THEME_COLORS.map((color) => [color, colors[color]])) };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const HEX_SCHEMA = { type: 'string', pattern: '^\\s*#[0-9A-Fa-f]{6}\\s*$' } as const;

/** The JSON Schema of a theme file, for an editor: `theme.schema.json` beside the settings' schema. Pure. */
export function themeFileJsonSchema(): Record<string, unknown> {
  const kinds = ['light', 'dark'] as const;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Aubergine color theme',
    description: 'themes/<id>.json in the data folder of an Aubergine server: a theme of your own, a built-in theme of the same kind (base) with colors over it. The ID is the name of the file without .json.',
    type: 'object',
    required: ['name', 'kind'],
    properties: {
      $schema: { type: 'string', description: `Where an editor finds this schema: ${THEME_SCHEMA_LINE.split(': ')[1]}. Aubergine itself does not read it.` },
      name: { type: 'string', maxLength: 60, description: 'What the theme is called in Settings: one line of plain text.' },
      kind: { enum: [...kinds], description: 'Whether it is drawn as the light page or the dark one.' },
      base: {
        enum: COLOR_THEMES.map((theme) => theme.id),
        description: `A built-in theme of the same kind that it is laid over; left out, light or dark by its kind. Light ones: ${COLOR_THEMES.filter((t) => t.kind === 'light').map((t) => t.id).join(', ')}. Dark ones: ${COLOR_THEMES.filter((t) => t.kind === 'dark').map((t) => t.id).join(', ')}.`,
      },
      colors: {
        type: 'object',
        description: 'Colors over the base, by the names of the page’s color tokens, each #rrggbb. What is not named is the base’s. Shadows, the scrim and the focus ring are always the base’s.',
        properties: Object.fromEntries(THEME_COLORS.map((color) => [color, { ...HEX_SCHEMA, description: `The page’s color token --${color}.` }])),
        additionalProperties: false,
      },
      terminal: {
        type: 'object',
        description: 'A terminal’s own colors over the base’s. Its ground is the theme’s terminal-bg.',
        properties: {
          foreground: { ...HEX_SCHEMA, description: 'The color of a terminal’s words.' },
          cursor: { ...HEX_SCHEMA, description: 'The color of the cursor.' },
          selection: { ...HEX_SCHEMA, description: 'The color behind what is selected.' },
          ansi: {
            type: 'array',
            maxItems: 16,
            items: { anyOf: [HEX_SCHEMA, { type: 'null' }] },
            description: `The sixteen colors a program asks for by number, in order: ${ANSI_NAMES.join(', ')}. Null: the base’s.`,
          },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

/** The answer of the route that reads the theme files again, and the same in the state answer. */
export const ThemesAnswer = z.object({
  themes: z.array(UserTheme).max(THEME_FILES_MAX).describe('The themes of the owner’s own that were read, by the name of their file.'),
  problems: z.array(z.string().max(1000)).max(500).describe('One sentence for each file that was not read, and each entry of a file that was skipped.'),
});
export type ThemesAnswer = z.infer<typeof ThemesAnswer>;
