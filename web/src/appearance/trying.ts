import { create } from 'zustand';
import type { Appearance, UserTheme } from '@aubergine/shared';

/**
 * A theme drawn on this page for a moment, to see it before it is accepted: "Try on this page" in the review of a
 * proposed theme. It is this browser's, in memory only. Nothing is saved, nothing is sent, and the browser's copies
 * for the next first paint are not touched (`applyTheme` with `remember` off): it lasts until the review shows
 * something else or closes, or the page is loaded again.
 */
interface Trying {
  theme: UserTheme | null;
  start: (theme: UserTheme) => void;
  stop: () => void;
}

export const useTrying = create<Trying>((set) => ({
  theme: null,
  start: (theme) => set({ theme }),
  stop: () => set({ theme: null }),
}));

/** The owner's themes with the one being tried among them, in place of one of the same ID. Pure. */
export function withTried(themes: readonly UserTheme[], tried: UserTheme | null): UserTheme[] {
  return tried ? [...themes.filter((theme) => theme.id !== tried.id), tried] : [...themes];
}

/** The appearance with the theme being tried as the theme of its kind. Pure. */
export function appearanceTried<A extends Pick<Appearance, 'light' | 'dark'>>(appearance: A, tried: UserTheme | null): A {
  return tried ? { ...appearance, [tried.kind]: tried.id } : appearance;
}
