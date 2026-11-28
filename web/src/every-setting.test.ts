import { DEFAULT_SETTINGS, PAGE_WRITTEN_SETTINGS, Settings, settingRows } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import { CONTROL_OF, everySetting, findSettings } from './every-setting';

describe('every setting, as data', () => {
  it('is every key of the file, at its default where nothing is set', () => {
    const groups = everySetting(DEFAULT_SETTINGS);
    expect(groups.flatMap((group) => group.rows.map((row) => row.key))).toEqual(settingRows().map((row) => row.key));
    expect(groups.flatMap((group) => group.rows).filter((row) => row.differs)).toEqual([]);
    expect(groups.filter((group) => group.pageOwn).map((group) => group.key)).toEqual(['font', 'theme', 'appearance', 'shortcuts', 'shortcutsInAppWindow', 'plugins']);
  });

  it('says a value now, its default where it differs, a list by its count, and the line to add with the value now', () => {
    const settings = Settings.parse({ font: { size: 15 }, access: { addresses: ['https://a.example.test', 'https://b.example.test'] } });
    const rows = Object.fromEntries(everySetting(settings).flatMap((group) => group.rows.map((row) => [row.key, row])));
    expect(rows['font.size']).toMatchObject({ words: '15', differs: true, defaultWords: '13', line: '"font": { "size": 15 }', byPage: true });
    expect(rows['access.addresses']).toMatchObject({ words: '2 entries', whole: '["https://a.example.test","https://b.example.test"]', line: '"access": { "addresses": ["https://a.example.test","https://b.example.test"] }', byPage: false });
    expect(rows.shell).toMatchObject({ words: 'null', differs: false, line: '"shell": null' });
  });

  it('finds by key and by what a key is, every word, and leaves out what is empty', () => {
    const groups = everySetting(DEFAULT_SETTINGS);
    expect(findSettings(groups, '')).toHaveLength(groups.length);
    expect(findSettings(groups, 'FONT.size').flatMap((group) => group.rows.map((row) => row.key))).toEqual(['font.size']);
    expect(findSettings(groups, 'cursor blinks').flatMap((group) => group.rows.map((row) => row.key))).toEqual(['appearance.cursorBlink']);
    expect(findSettings(groups, 'no such thing at all')).toEqual([]);
  });

  it('knows where each key the page writes is changed', () => {
    for (const key of PAGE_WRITTEN_SETTINGS) expect(CONTROL_OF[key](DEFAULT_SETTINGS)).toMatch(/^[a-z-]+$/);
  });
});
