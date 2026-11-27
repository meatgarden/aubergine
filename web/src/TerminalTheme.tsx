import { useEffect, useRef, useState } from 'react';
import { COLOR_THEMES, colorTheme, type Appearance, type ColorThemeId } from '@aubergine/shared';
import { api, isSuperseded } from './api';
import { useApp } from './store';
import { Select } from './ui';

/**
 * A terminal's own color theme: chosen from its title's menu or its details, cleared to go back to the default for
 * terminals. Which theme a terminal is drawn in is `terminalThemeOf` in shared/, and nothing here decides it.
 */

const nameOf = (id: ColorThemeId): string => colorTheme(id)?.name ?? id;
const KINDS = [
  { kind: 'light', words: 'Light' },
  { kind: 'dark', words: 'Dark' },
] as const;

/** What a terminal without a theme of its own is drawn in now, in words: the default for terminals, or the page's. Pure. */
export function defaultThemeWords(appearance: Pick<Appearance, 'terminal'>, page: ColorThemeId): string {
  return appearance.terminal ? nameOf(appearance.terminal) : `as the page: ${nameOf(page)}`;
}

/** Gives the terminal its own theme, or (null) takes it away. The page follows the change event; a failure is said. */
export function chooseTerminalTheme(sessionId: string, theme: ColorThemeId | null): void {
  const session = useApp.getState().whole?.sessions.find((s) => s.id === sessionId);
  if (!session || (session.theme ?? null) === theme) return;
  void api.updateSession(sessionId, { theme }).catch((error: unknown) => !isSuperseded(error) && useApp.getState().setNotice(`The theme of "${session.name}" could not be changed: ${(error as Error).message}`));
}

/** A choice of theme: the first line for "none" (its words given), then the light themes and the dark ones. */
export function ThemeSelect({ value, onChange, none, ...rest }: { value: ColorThemeId | null; onChange: (theme: ColorThemeId | null) => void; none: string; id?: string; 'aria-label'?: string; 'aria-describedby'?: string; 'data-testid'?: string }) {
  return (
    <Select value={value ?? ''} onChange={(event) => onChange(colorTheme(event.target.value)?.id ?? null)} {...rest}>
      <option value="">{none}</option>
      {KINDS.map(({ kind, words }) => (
        <optgroup key={kind} label={words}>
          {COLOR_THEMES.filter((one) => one.kind === kind).map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/**
 * The themes a terminal can have, hanging from its title: asked for from the title's menu, the palette or a key
 * (`terminal.theme`). "Same as the default" first, then the ten under their two headings; the one in use ticked.
 */
export function TerminalThemeMenu({ sessionId, name, page }: { sessionId: string; name: string; page: ColorThemeId }) {
  const own = useApp((s) => s.whole?.sessions.find((x) => x.id === sessionId)?.theme ?? null);
  const appearance = useApp((s) => s.settings.appearance);
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

  const choose = (theme: ColorThemeId | null): void => {
    setOpen(false);
    chooseTerminalTheme(sessionId, theme);
  };

  return (
    <span className="terminal-theme nodrag" ref={root}>
      {open && (
        <span
          className="ui-menu terminal-theme-menu nowheel"
          role="menu"
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
            <small>Now {defaultThemeWords(appearance, page)}</small>
          </button>
          {KINDS.map(({ kind, words }) => [
            <span key={kind} className="ui-menu-label" role="presentation">
              {words}
            </span>,
            ...COLOR_THEMES.filter((one) => one.kind === kind).map((one) => (
              <button key={one.id} type="button" role="menuitemradio" aria-checked={own === one.id} onClick={() => choose(one.id)} data-testid={`terminal-theme-${one.id}`}>
                {one.name}
              </button>
            )),
          ])}
        </span>
      )}
    </span>
  );
}
