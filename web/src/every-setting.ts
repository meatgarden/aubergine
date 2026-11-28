import { sameSetting, settingGroups, settingLine, settingValue, settingWords, type PageWrittenSetting, type SettingGroup, type SettingRow, type Settings } from '@aubergine/shared';
import { PAGE_SETTINGS } from './servers';

/**
 * The list of every setting in Settings, as data: every key of the settings file from its schema, with its value now,
 * whether that is the default, and the line to add to the file. The words are the schema's; nothing here writes a
 * setting. Pure, but for the schema, which is made once.
 */

export interface ShownSetting extends SettingRow {
  value: unknown;
  /** Not the default. */
  differs: boolean;
  /** The value as one line: text as it is, a list or a map by how many entries it holds. */
  words: string;
  /** The whole value, for a tooltip, where `words` is not all of it. */
  whole: string;
  defaultWords: string;
  /** What to add to the file for it, with the value now. */
  line: string;
}

export interface ShownGroup {
  key: string;
  description: string;
  /** The page's own (the theme, appearance, the font, the keys): of the page's own server whatever server is shown. */
  pageOwn: boolean;
  rows: ShownSetting[];
}

let groups: SettingGroup[] | null = null;
const theGroups = (): SettingGroup[] => (groups ??= settingGroups());

/** Every setting, grouped as the file is, with what `settings` say of each. Pure. */
export function everySetting(settings: Settings): ShownGroup[] {
  return theGroups().map((group) => ({
    key: group.key,
    description: group.description,
    pageOwn: (PAGE_SETTINGS as readonly string[]).includes(group.key),
    rows: group.rows.map((row): ShownSetting => {
      const value = settingValue(settings, row.key);
      const words = settingWords(row, value);
      const whole = value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
      return { ...row, value, differs: !sameSetting(value, row.default), words, whole, defaultWords: settingWords(row, row.default), line: settingLine(row.key, value) };
    }),
  }));
}

/** The settings whose key or description has every word of the search in it, case not minded; groups left empty are left out. Pure. */
export function findSettings(groups: readonly ShownGroup[], search: string): ShownGroup[] {
  const words = search.toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return [...groups];
  const fits = (row: ShownSetting): boolean => {
    const text = `${row.key} ${row.description}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return groups.map((group) => ({ ...group, rows: group.rows.filter(fits) })).filter((group) => group.rows.length > 0);
}

/**
 * Where each key the page writes is changed in Settings: the test id of its control, as it stands now (a choice among
 * several is the one chosen). Every key the page writes has one: the type says so.
 */
export const CONTROL_OF: Record<PageWrittenSetting, (settings: Settings) => string> = {
  theme: (s) => `theme-${s.theme}`,
  'appearance.light': (s) => `color-theme-${s.appearance.light}`,
  'appearance.dark': (s) => `color-theme-${s.appearance.dark}`,
  'appearance.terminal': () => 'terminal-theme-default',
  'appearance.byTag': () => 'by-tag-add',
  'appearance.titleFormat': () => 'title-format',
  'appearance.rowFormat': () => 'row-format',
  'appearance.cursor': (s) => `cursor-${s.appearance.cursor}`,
  'appearance.cursorBlink': () => 'cursor-blink',
  'appearance.customCss': () => 'custom-css-on',
  'font.family': () => 'font-family',
  'font.size': () => 'font-size',
  'desktop.openNew': () => 'settings-desktop-new',
  'describe.remind': () => 'settings-describe-remind',
};
