import type { DotTone } from '../ui';
import type { ComponentType } from 'react';

/** A small count with a word, shown on the collapsed strip under a section's icon. */
export interface SectionBadge {
  key: string;
  /** A character that stands for it, so it does not rest on color alone. */
  mark: string;
  count: number;
  title: string;
  /** Where the badge counts terminals in one state: the state, so that the strip draws the same dot as the list. The mark is then not drawn. */
  tone?: DotTone;
}

/** Something a section shows beside the panel for one of its rows, such as its notes. */
export interface SectionDrawer {
  /** The heading of the drawer for the thing with this id. */
  useTitle: (id: string) => string;
  /** Its own head, where the name alone is not enough: what the thing is, the one thing to do with it, the rest behind a menu. The shell adds nothing to it. */
  Head?: ComponentType<{ id: string; onClose: () => void }>;
  /** What is given the keyboard when the drawer closes: the row it was opened from. */
  returnTo?: (id: string) => HTMLElement | null;
  Component: ComponentType<{ id: string; onClose: () => void }>;
}

/**
 * A section of the side panel. The panel knows nothing about what a section
 * shows: its head is one menu of whatever is registered, in `order`, and the one
 * section that is chosen has all of the panel's height to itself.
 * Adding something to the panel is adding one module under
 * `panel/sections/` that calls `registerSection`.
 */
export interface PanelSection {
  id: string;
  title: string;
  /** Lower numbers come first. */
  order: number;
  /** The name it has in the panel's head and its menu, where the title would be taken for something else. */
  tab?: string;
  /** What it shows, in one line, for the menu of sections. */
  says: string;
  /** Whether its count is of things that wait on the owner: it is then said in the colour of waiting while it is not zero. */
  urgent?: boolean;
  /** One or two characters that stand for it. */
  icon: string;
  /** What it puts on the rail the panel folds to. The shell draws it under the button that opens the panel, and adds nothing. */
  Rail?: ComponentType;
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
export const PANEL_DEFAULT_WIDTH = 320;
export const PANEL_STRIP_WIDTH = 40;
/** The details beside the panel: dragged by their edge between these, and never more than half the window (the stylesheet). */
export const DRAWER_MIN_WIDTH = 320;
export const DRAWER_MAX_WIDTH = 720;
export const DRAWER_DEFAULT_WIDTH = 420;

export interface PanelPrefs {
  /** False when the panel is collapsed to its strip. */
  open: boolean;
  width: number;
  /** Ids of the sections that are folded. Kept from before the panel had tabs; nothing reads it now. */
  folded: string[];
  /** The section that is showing. Null, or one that is no longer registered, means the first. */
  tab: string | null;
  /** How wide the drawer beside the panel is. */
  drawerWidth: number;
}

/** With nothing remembered the panel is folded to its rail: the canvas has the room. Once a person opens or folds it, that is kept. */
export const DEFAULT_PANEL: PanelPrefs = { open: false, width: PANEL_DEFAULT_WIDTH, folded: [], tab: null, drawerWidth: DRAWER_DEFAULT_WIDTH };

export function clampPanelWidth(width: number): number {
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));
}

export function clampDrawerWidth(width: number): number {
  return Math.round(Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, width)));
}

export function parsePanelPrefs(saved: unknown): PanelPrefs {
  if (!saved || typeof saved !== 'object') return DEFAULT_PANEL;
  const p = saved as Partial<Record<keyof PanelPrefs, unknown>>;
  return {
    open: p.open !== false,
    width: typeof p.width === 'number' && Number.isFinite(p.width) ? clampPanelWidth(p.width) : PANEL_DEFAULT_WIDTH,
    folded: Array.isArray(p.folded) ? p.folded.filter((id): id is string => typeof id === 'string') : [],
    tab: typeof p.tab === 'string' ? p.tab : null,
    drawerWidth: typeof p.drawerWidth === 'number' && Number.isFinite(p.drawerWidth) ? clampDrawerWidth(p.drawerWidth) : DRAWER_DEFAULT_WIDTH,
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
