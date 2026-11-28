import { useEffect, useRef, useState } from 'react';
import { themeChoices, themeOf, type Appearance, type TerminalThemeFrom, type ThemeKind, type UserTheme } from '@aubergine/shared';
import { api, isSuperseded } from './api';
import { useApp } from './store';
import { Select } from './ui';
import { useTerminalThemeFrom } from './theme';

/**
 * A terminal's own color theme: chosen from its title's menu or its details, cleared to go back to the default for
 * terminals. Which theme a terminal is drawn in is `terminalThemeOf` in shared/, and nothing here decides it.
 */

/** A theme's name, or, for one that is not there now, its ID and that it is not. */
const nameOf = (id: string, themes: readonly UserTheme[]): string => themeOf(id, themes)?.name ?? `${id} (not there now)`;
const KINDS = [
  { kind: 'light', words: 'Light' },
  { kind: 'dark', words: 'Dark' },
] as const;

/** What a terminal without a theme of its own is drawn in now, in words: the default for terminals, or the page's. Pure. */
export function defaultThemeWords(appearance: Pick<Appearance, 'terminal'>, page: string, themes: readonly UserTheme[] = []): string {
  return appearance.terminal && themeOf(appearance.terminal, themes) ? nameOf(appearance.terminal, themes) : `as the page: ${nameOf(page, themes)}`;
}

/**
 * What a terminal without a theme of its own is drawn in now and where that comes from, in words: "Nord, by the tag
 * prod", the default for terminals by its name, "as the page: Dark", or "as the page: Nord, the project’s". Pure.
 */
export function themeFromWords(from: TerminalThemeFrom, themes: readonly UserTheme[] = []): string {
  const name = nameOf(from.id, themes);
  if (from.from === 'tag') return `${name}, by the tag ${from.tag ?? ''}`;
  if (from.from === 'project') return `as the page: ${name}, the project’s`;
  if (from.from === 'page') return `as the page: ${name}`;
  return name;
}

/** Gives the terminal its own theme, or (null) takes it away. The page follows the change event; a failure is said. */
export function chooseTerminalTheme(sessionId: string, theme: string | null): void {
  const session = useApp.getState().whole?.sessions.find((s) => s.id === sessionId);
  if (!session || (session.theme ?? null) === theme) return;
  void api.updateSession(sessionId, { theme }).catch((error: unknown) => !isSuperseded(error) && useApp.getState().setNotice(`The theme of "${session.name}" could not be changed: ${(error as Error).message}`));
}

/**
 * A choice of theme: the first line for "none" (its words given), then the light themes and the dark ones, each kind's
 * built-in ones first and the owner's after them. A theme chosen that is not there now is kept as a line of its own,
 * said so, so that the select still shows what is set.
 */
export function ThemeSelect({
  value,
  onChange,
  none,
  kind,
  ...rest
}: {
  value: string | null;
  onChange: (theme: string | null) => void;
  /** The words of the first line, which is no theme; left out, there is no such line. */
  none?: string;
  /** Only the themes of one kind. */
  kind?: ThemeKind;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
}) {
  const themes = useApp((s) => s.themes.themes);
  const gone = value !== null && !themeOf(value, themes);
  return (
    <Select value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : (themeOf(event.target.value, themes)?.id ?? null))} {...rest}>
      {none !== undefined && <option value="">{none}</option>}
      {gone && (
        <option value={value} disabled>
          {nameOf(value, themes)}
        </option>
      )}
      {KINDS.filter((one) => kind === undefined || one.kind === kind).map(({ kind: ofKind, words }) => (
        <optgroup key={ofKind} label={words}>
          {themeChoices(themes, ofKind).map((one) => (
            <option key={one.id} value={one.id}>
              {one.own ? `${one.name} (yours)` : one.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/**
 * The themes a terminal can have, hanging from its title: asked for from the title's menu, the palette or a key
 * (`terminal.theme`). "Same as the default" first, then every theme under its kind's heading, the owner's after the
 * built-in ones; the one in use ticked.
 */
export function TerminalThemeMenu({ sessionId, name }: { sessionId: string; name: string; page?: string }) {
  const own = useApp((s) => s.whole?.sessions.find((x) => x.id === sessionId)?.theme ?? null);
  const themes = useApp((s) => s.themes.themes);
  // What it is drawn in without one of its own, and why: by a tag, the default for terminals, or the page's.
  const without = useTerminalThemeFrom(sessionId, true);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    // A menu takes Escape before what is behind it, wherever the keyboard is.
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  // Asked to open (by the menu's line, a key or the palette).
  const ask = useApp((s) => (s.ask?.kind === 'theme' && s.ask.id === sessionId ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    setOpen(true);
    useApp.getState().asked(ask.tick);
  }, [ask]);

  // Opened: the keyboard goes to the line in use, so the arrows and Enter work from there.
  useEffect(() => {
    if (open) (menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.current?.querySelector('button'))?.focus();
  }, [open]);

  const choose = (theme: string | null): void => {
    setOpen(false);
    chooseTerminalTheme(sessionId, theme);
  };

  return (
    <span className="terminal-theme nodrag" ref={root}>
      {open && (
        <span
          className="ui-menu terminal-theme-menu nowheel"
          role="menu" data-part="menu"
          aria-label={`Theme of ${name}`}
          ref={menu}
          data-testid="terminal-theme-menu"
          onKeyDown={(event) => {
            const items = [...(menu.current?.querySelectorAll('button') ?? [])];
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'ArrowDown') items[(at + 1) % items.length]?.focus();
            else if (event.key === 'ArrowUp') items[(at - 1 + items.length) % items.length]?.focus();
            else if (event.key === 'Home') items[0]?.focus();
            else if (event.key === 'End') items.at(-1)?.focus();
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button type="button" role="menuitemradio" aria-checked={own === null} onClick={() => choose(null)} data-testid="terminal-theme-none">
            Same as the default
            <small>Now {themeFromWords(without, themes)}</small>
          </button>
          {KINDS.map(({ kind, words }) => [
            <span key={kind} className="ui-menu-label" role="presentation">
              {words}
            </span>,
            ...themeChoices(themes, kind).map((one) => (
              <button key={one.id} type="button" role="menuitemradio" aria-checked={own === one.id} onClick={() => choose(one.id)} data-testid={`terminal-theme-${one.id}`}>
                {one.name}
                {one.own && <span className="ui-meta"> · yours</span>}
              </button>
            )),
          ])}
        </span>
      )}
    </span>
  );
}
