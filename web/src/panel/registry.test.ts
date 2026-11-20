import { afterEach, describe, expect, it } from 'vitest';
import { DRAWER_DEFAULT_WIDTH, PANEL_DEFAULT_WIDTH, clampPanelWidth, panelSections, parsePanelPrefs, registerSection, sectionById, subscribeToSections, unregisterSection, type PanelSection } from './registry';

const dummy = (id: string, order: number, extra: Partial<PanelSection> = {}): PanelSection => ({
  id,
  title: `Section ${id}`,
  order,
  icon: id.slice(0, 1).toUpperCase(),
  says: `What section ${id} shows.`,
  Component: () => null,
  ...extra,
});

afterEach(() => {
  for (const section of [...panelSections()]) if (section.id.startsWith('test-')) unregisterSection(section.id);
});

describe('the section registry', () => {
  it('takes a section the panel has never heard of and lists it in order', () => {
    const before = panelSections().map((s) => s.id);
    registerSection(dummy('test-later', 900));
    registerSection(dummy('test-first', -5, { useCount: () => 3 }));
    const ids = panelSections().map((s) => s.id);
    expect(ids[0]).toBe('test-first');
    expect(ids.at(-1)).toBe('test-later');
    expect(ids.filter((id) => !id.startsWith('test-'))).toEqual(before);
    expect(sectionById('test-first')?.useCount?.()).toBe(3);
  });

  it('replaces a section registered again under the same id, and forgets one that is removed', () => {
    registerSection(dummy('test-a', 1));
    registerSection(dummy('test-a', 1, { title: 'Renamed' }));
    expect(panelSections().filter((s) => s.id === 'test-a')).toHaveLength(1);
    expect(sectionById('test-a')?.title).toBe('Renamed');
    unregisterSection('test-a');
    expect(sectionById('test-a')).toBeUndefined();
  });

  it('tells the panel when the sections change, and gives the same list until then', () => {
    let calls = 0;
    const stop = subscribeToSections(() => (calls += 1));
    const before = panelSections();
    expect(panelSections()).toBe(before);
    registerSection(dummy('test-b', 2));
    expect(calls).toBe(1);
    expect(panelSections()).not.toBe(before);
    stop();
    unregisterSection('test-b');
    expect(calls).toBe(1);
  });

  it('breaks ties in order by id, so the order never depends on which loaded first', () => {
    registerSection(dummy('test-z', 50));
    registerSection(dummy('test-y', 50));
    const ids = panelSections().map((s) => s.id).filter((id) => id.startsWith('test-'));
    expect(ids).toEqual(['test-y', 'test-z']);
  });
});

describe('what the panel remembers', () => {
  it('reads saved preferences and repairs odd ones', () => {
    // With nothing remembered the panel is folded; whatever a person left it as is kept.
    expect(parsePanelPrefs(null)).toEqual({ open: false, width: PANEL_DEFAULT_WIDTH, folded: [], tab: null, drawerWidth: DRAWER_DEFAULT_WIDTH });
    expect(parsePanelPrefs({ open: true }).open).toBe(true);
    expect(parsePanelPrefs({ width: 300 }).open).toBe(true);
    expect(parsePanelPrefs({ open: false, width: 9000, folded: ['terminals', 7] })).toEqual({ open: false, width: 560, folded: ['terminals'], tab: null, drawerWidth: DRAWER_DEFAULT_WIDTH });
    // The drawer's width is kept between its bounds; one remembered from before it could be changed is the usual one.
    expect(parsePanelPrefs({ drawerWidth: 9000 }).drawerWidth).toBe(720);
    expect(parsePanelPrefs({ drawerWidth: 10 }).drawerWidth).toBe(320);
    expect(parsePanelPrefs({ drawerWidth: 'wide' }).drawerWidth).toBe(DRAWER_DEFAULT_WIDTH);
    expect(parsePanelPrefs({ tab: 'for-you' }).tab).toBe('for-you');
    expect(parsePanelPrefs({ tab: 7 }).tab).toBeNull();
    expect(parsePanelPrefs({ width: 'wide' }).width).toBe(PANEL_DEFAULT_WIDTH);
    expect(clampPanelWidth(10)).toBe(180);
  });
});
