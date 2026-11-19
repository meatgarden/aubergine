import { useEffect } from 'react';
import { useApp } from './store';

/** How long a line stays before it goes by itself. With a way to take it back, longer. */
const STAYS_MS = 4000;
const STAYS_WITH_UNDO_MS = 8000;

/**
 * What just happened, in one place and one way: a short line at the foot of the window that goes by itself, with
 * Undo where the action has one. Anything that was done and shows nowhere else by itself says so with `say`.
 */
export function Toast() {
  const said = useApp((s) => s.said);
  useEffect(() => {
    if (!said) return;
    const tick = said.tick;
    const timer = window.setTimeout(() => useApp.getState().said?.tick === tick && useApp.getState().say(null), said.undo ? STAYS_WITH_UNDO_MS : STAYS_MS);
    return () => window.clearTimeout(timer);
  }, [said]);
  if (!said) return null;
  return (
    <div className="ui-toast" role="status" aria-live="polite" key={said.tick} data-testid="toast">
      <span>{said.text}</span>
      {said.undo && (
        <button
          type="button"
          onClick={() => {
            said.undo?.run();
            useApp.getState().say(null);
          }}
          data-testid="toast-undo"
        >
          {said.undo.label}
        </button>
      )}
    </div>
  );
}
