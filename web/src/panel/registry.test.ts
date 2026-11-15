import { afterEach, describe, expect, it } from 'vitest';
import { clampPanelWidth, panelSections, parsePanelPrefs, registerSection, sectionById, subscribeToSections, unregisterSection, type PanelSection } from './registry';

const dummy = (id: string, order: number, extra: Partial<PanelSection> = {}): PanelSection => ({
  id,
  title: `Section ${id}`,
  order,
  icon: id.slice(0, 1).toUpperCase(),
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
    expect(parsePanelPrefs(null)).toEqual({ open: true, width: 300, folded: [] });
    expect(parsePanelPrefs({ open: false, width: 9000, folded: ['terminals', 7] })).toEqual({ open: false, width: 560, folded: ['terminals'] });
    expect(parsePanelPrefs({ width: 'wide' }).width).toBe(300);
    expect(clampPanelWidth(10)).toBe(180);
  });
});
