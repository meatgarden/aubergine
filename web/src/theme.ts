import { useSyncExternalStore } from 'react';
import { themeShown, type ThemeSetting } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * How the page looks. The choice is one of the settings (light, dark, or match the system) and is kept in the
 * settings file, so every browser and the next start agree. What is drawn is that choice, or for "match the
 * system" whichever the system has now: followed while the page is open.
 */

const KEY = 'aubergine.theme';
const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;

const subscribe = (listener: () => void): (() => void) => {
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** Whether the system is set to light, followed as it changes. */
export function useSystemIsLight(): boolean {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false);
}

/** The theme that is drawn now: `light` or `dark`. Everything that draws colours of its own (a terminal) reads this. */
export function useThemeShown(): 'light' | 'dark' {
  const setting = useApp((s) => s.settings.theme);
  return themeShown(setting, useSystemIsLight());
}

/** Puts the theme on the page, and keeps a copy of the choice in this browser for the next load's first paint. */
export function applyTheme(setting: ThemeSetting, shown: 'light' | 'dark'): void {
  const root = document.documentElement;
  if (root.dataset.theme !== shown) {
    // The change is at once: for this moment nothing on the page takes time to change colour, so that no part of it
    // is caught half-way between the two themes.
    root.classList.add('theme-changing');
    window.setTimeout(() => root.classList.remove('theme-changing'), 60);
  }
  document.documentElement.dataset.theme = shown;
  document.documentElement.dataset.themeSetting = setting;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#17181c');
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    // Not being able to remember this is harmless: the server writes the choice on the page it sends.
  }
}

/**
 * Chooses how the page looks. The page follows at once; the choice is written into the settings file, and if that
 * cannot be done the page goes back to what the file says and says why.
 */
export function chooseTheme(theme: ThemeSetting): void {
  const store = useApp.getState();
  const was = store.settings.theme;
  if (was === theme) return;
  store.setTheme(theme);
  void api.setTheme(theme).catch((error: unknown) => {
    useApp.getState().setTheme(was);
    useApp.getState().setNotice(`The theme could not be saved: ${(error as Error).message}`);
  });
}
