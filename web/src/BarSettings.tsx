import { useEffect, useRef, useState } from 'react';
import { BAR_PLACES, BAR_PLACE_WORDS, placeBar, useBarPlace } from './bar-place';
import { runCommand } from './commands';
import { hint } from './shortcuts';

/** How long the pointer may be off the button and its menu, crossing the gap between them, before the menu closes. */
const LEAVE_MS = 250;

/**
 * The settings of the bar over the canvas, at its end. Pointed at (or reached with the keyboard), it shows where the
 * bar can stand, one press each; pressed, it opens Settings.
 */
export function BarSettings() {
  const place = useBarPlace();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const leaving = useRef<number | undefined>(undefined);
  const stay = (): void => {
    window.clearTimeout(leaving.current);
    setOpen(true);
  };
  const leave = (): void => {
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => setOpen(false), LEAVE_MS);
  };
  useEffect(() => () => window.clearTimeout(leaving.current), []);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // The menu's own Escape: it goes no further.
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);
  return (
    <span
      className="bar-settings"
      ref={root}
      onPointerEnter={stay}
      onPointerLeave={leave}
      onFocus={stay}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="quiet bar-settings-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        title={hint('settings.show', 'Settings. Point here to move this bar.')}
        onClick={() => {
          setOpen(false);
          runCommand('settings.show');
        }}
        data-testid="bar-settings"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <span className="ui-menu toolbar-menu bar-settings-menu" role="menu" aria-label="Where this bar stands" data-testid="bar-settings-menu">
          <span className="toolbar-menu-heading" role="presentation">
            Move this bar
          </span>
          {BAR_PLACES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="menuitemradio"
              aria-checked={choice === place}
              onClick={() => placeBar(choice)}
              data-testid={`bar-place-${choice}`}
            >
              {BAR_PLACE_WORDS[choice]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
