import type { ComponentType } from 'react';

/** A small count with a word, shown on the collapsed strip under a section's icon. */
export interface SectionBadge {
  key: string;
  /** A character that stands for it, so it does not rest on color alone. */
  mark: string;
  count: number;
  title: string;
}

/** Something a section shows beside the panel for one of its rows, such as its notes. */
export interface SectionDrawer {
  /** The heading of the drawer for the thing with this id. */
  useTitle: (id: string) => string;
  Component: ComponentType<{ id: string; onClose: () => void }>;
}

/**
 * A section of the side panel. The panel knows nothing about what a section
 * shows: it draws whatever is registered, each one foldable, in `order`.
 * Adding something to the panel is adding one module under
 * `panel/sections/` that calls `registerSection`.
 */
export interface PanelSection {
  id: string;
  title: string;
  /** Lower numbers come first. */
  order: number;
  /** One or two characters for the collapsed strip. */
  icon: string;
  /** A hook giving the number shown beside the title, or null for none. */
  useCount?: () => number | null;
  /** A hook giving what the collapsed strip shows under the icon. */
  useBadges?: () => SectionBadge[];
  Component: ComponentType;
  /** Drawers this section can open, by kind. */
  drawers?: Record<string, SectionDrawer>;
}

const registry = new Map<string, PanelSection>();
const listeners = new Set<() => void>();
let snapshot: PanelSection[] = [];

function refresh(): void {
  snapshot = [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const listener of listeners) listener();
}

export function registerSection(section: PanelSection): void {
  registry.set(section.id, section);
  refresh();
}

export function unregisterSection(id: string): void {
  if (registry.delete(id)) refresh();
}

/** The registered sections in the order they are drawn. The same array until the registry changes. */
export function panelSections(): PanelSection[] {
  return snapshot;
}

export function sectionById(id: string): PanelSection | undefined {
  return registry.get(id);
}

/** For the panel to redraw when a section is added or removed. */
export function subscribeToSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ---------- What the panel remembers in this browser ---------- */

export const PANEL_MIN_WIDTH = 180;
export const PANEL_MAX_WIDTH = 560;
export const PANEL_DEFAULT_WIDTH = 300;
export const PANEL_STRIP_WIDTH = 34;

export interface PanelPrefs {
  /** False when the panel is collapsed to its strip. */
  open: boolean;
  width: number;
  /** Ids of the sections that are folded. */
  folded: string[];
}

export const DEFAULT_PANEL: PanelPrefs = { open: true, width: PANEL_DEFAULT_WIDTH, folded: [] };

export function clampPanelWidth(width: number): number {
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));
}

export function parsePanelPrefs(saved: unknown): PanelPrefs {
  if (!saved || typeof saved !== 'object') return DEFAULT_PANEL;
  const p = saved as Partial<Record<keyof PanelPrefs, unknown>>;
  return {
    open: p.open !== false,
    width: typeof p.width === 'number' && Number.isFinite(p.width) ? clampPanelWidth(p.width) : PANEL_DEFAULT_WIDTH,
    folded: Array.isArray(p.folded) ? p.folded.filter((id): id is string => typeof id === 'string') : [],
  };
}

const STORAGE_KEY = 'aubergine.panel';

export function loadPanelPrefs(): PanelPrefs {
  try {
    return parsePanelPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_PANEL;
  }
}

export function savePanelPrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not being able to remember this is harmless.
  }
}
