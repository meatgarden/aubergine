import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from './settings';
import { PAGE_WRITTEN_SETTINGS, SETTINGS_SCHEMA_FILE, entriesWords, settingGroups, settingLine, settingRows, settingValue, settingWords, settingsJsonSchema } from './settings-schema';
import { COMMAND_IDS } from './shortcuts';
import { COLOR_THEMES, THEME_COLORS } from './themes';

type Node = { [key: string]: unknown };
const isNode = (value: unknown): value is Node => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every property of a JSON Schema, by its dotted path, at every depth. */
function propertiesOf(node: Node, at = ''): [string, Node][] {
  const out: [string, Node][] = [];
  if (isNode(node.properties))
    for (const [name, child] of Object.entries(node.properties)) {
      if (!isNode(child)) continue;
      const key = at === '' ? name : `${at}.${name}`;
      out.push([key, child], ...propertiesOf(child, key));
    }
  return out;
}

describe('the schema of the settings file', () => {
  it('is what zod makes of the settings, in both directions, without throwing', () => {
    expect(() => z.toJSONSchema(Settings, { io: 'input' })).not.toThrow();
    expect(() => z.toJSONSchema(Settings, { io: 'output' })).not.toThrow();
    expect(() => settingsJsonSchema()).not.toThrow();
  });

  it('describes every key, at every depth', () => {
    const missing = propertiesOf(z.toJSONSchema(Settings, { io: 'input' }) as Node)
      .filter(([, node]) => typeof node.description !== 'string' || node.description.trim() === '')
      .map(([key]) => key);
    expect(missing).toEqual([]);
    const missingHere = propertiesOf(settingsJsonSchema()).filter(([, node]) => typeof node.description !== 'string' || node.description === '').map(([key]) => key);
    expect(missingHere).toEqual([]);
  });

  it('leaves every key optional, allows "$schema" and keys it does not know, and gives the defaults', () => {
    const schema = settingsJsonSchema();
    expect(schema.required).toBeUndefined();
    expect(propertiesOf(schema).filter(([, node]) => node.required !== undefined)).toEqual([]);
    expect(schema.additionalProperties).toBe(true);
    expect((schema.properties as Node).$schema).toMatchObject({ type: 'string' });
    for (const row of settingRows()) expect([row.key, row.default]).toEqual([row.key, settingValue(DEFAULT_SETTINGS, row.key)]);
    // Nothing of zod's own that JSON Schema does not know.
    expect(JSON.stringify(schema)).not.toContain('starts_with');
  });

  it('names the commands of the keys and the colors set by hand', () => {
    const properties = settingsJsonSchema().properties as Record<string, Node>;
    for (const key of ['shortcuts', 'shortcutsInAppWindow']) {
      expect(Object.keys(properties[key]?.properties as Node)).toEqual([...COMMAND_IDS]);
      expect(properties[key]?.additionalProperties).toBe(false);
    }
    const colors = ((properties.appearance as Node).properties as Record<string, Node>).colors as Node;
    expect(Object.keys(colors.properties as Node)).toEqual([...THEME_COLORS, ...COLOR_THEMES.map((theme) => `[${theme.id}]`)]);
    const accent = (colors.properties as Record<string, Node>).accent as { pattern: string };
    expect(new RegExp(accent.pattern).test('#C678dd')).toBe(true);
    expect(new RegExp(accent.pattern).test(' #c678dd ')).toBe(true);
    expect(new RegExp(accent.pattern).test('#c67')).toBe(false);
    expect(new RegExp(accent.pattern).test('red')).toBe(false);
  });

  it('is one group for each top-level key, in the order of the file', () => {
    expect(settingGroups().map((group) => group.key)).toEqual(Object.keys(Settings.shape));
    const kinds = Object.fromEntries(settingRows().map((row) => [row.key, row.kind]));
    expect(kinds).toMatchObject({ 'font.size': 'value', 'appearance.colors': 'map', 'access.addresses': 'list', 'access.pages': 'list', shortcuts: 'map', theme: 'value' });
  });

  it('knows each key the page writes, and says so of those only', () => {
    const rows = settingRows();
    for (const key of PAGE_WRITTEN_SETTINGS) expect(rows.find((row) => row.key === key)?.byPage, key).toBe(true);
    expect(rows.filter((row) => row.byPage).map((row) => row.key).sort()).toEqual([...PAGE_WRITTEN_SETTINGS].sort());
  });

  it('keeps "$schema" in a file it reads, and reads it as it did', () => {
    expect(Settings.parse({ $schema: `./${SETTINGS_SCHEMA_FILE}`, font: { size: 15 } })).toEqual({ ...DEFAULT_SETTINGS, font: { ...DEFAULT_SETTINGS.font, size: 15 } });
  });
});

describe('a setting as words and as a line of the file', () => {
  it('writes the line in the shape of the file', () => {
    expect(settingLine('font.size', 14)).toBe('"font": { "size": 14 }');
    expect(settingLine('shell', null)).toBe('"shell": null');
    expect(settingLine('access.addresses', ['https://a.example.test'])).toBe('"access": { "addresses": ["https://a.example.test"] }');
    expect(JSON.parse(`{ ${settingLine('agents.claudeCommand', 'my "claude"')} }`)).toEqual({ agents: { claudeCommand: 'my "claude"' } });
  });

  it('says a value, and counts a list or a map', () => {
    expect(settingWords({ kind: 'value' }, 'dark')).toBe('dark');
    expect(settingWords({ kind: 'value' }, 13)).toBe('13');
    expect(settingWords({ kind: 'value' }, null)).toBe('null');
    expect(settingWords({ kind: 'list' }, [])).toBe('no entries');
    expect(settingWords({ kind: 'map' }, { a: 1 })).toBe('1 entry');
    expect(entriesWords(['a', 'b', 'c'])).toBe('3 entries');
    expect(settingValue({ a: { b: 2 } }, 'a.b')).toBe(2);
    expect(settingValue({ a: { b: 2 } }, 'a.c')).toBeUndefined();
    expect(settingValue({}, 'constructor')).toBeUndefined();
  });
});
