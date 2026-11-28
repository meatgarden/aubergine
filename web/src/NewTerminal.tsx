import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { runCommand } from './commands';
import { hint, keysOf } from './shortcuts';

/**
 * Whether a terminal is being made now: the canvas sets it while it asks the server, and "New terminal" is busy until
 * the answer is here, wherever the button stands.
 */
let adding = false;
const listeners = new Set<() => void>();
export function setAdding(next: boolean): void {
  if (adding === next) return;
  adding = next;
  for (const listener of listeners) listener();
}
function useAdding(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => adding,
  );
}

/**
 * The one button for the commonest thing, a new terminal, and beside it a menu of everything else that can be made,
 * each said in words. It stands at the top of the list of terminals, as wide as its words, with nothing between it and the terminals. On the rail the panel folds to it is a plus, and
 * it opens out to the whole button while the pointer or the keyboard is on it, or while its menu is open. The menu is
 * placed against the window: the list scrolls, and the rail is narrow.
 */
export function NewTerminal({ compact = false }: { compact?: boolean }) {
  const busy = useAdding();
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as globalThis.Node)) setMenu(null);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // The menu's own Escape: it goes no further, so that it does not also leave a terminal or close something behind.
      event.stopPropagation();
      setMenu(null);
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  const item = (command: Parameters<typeof runCommand>[0], label: string, says: string, testid?: string, withKey = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      title={hint(command)}
      data-testid={testid}
      onClick={() => {
        setMenu(null);
        runCommand(command);
      }}
    >
      {label}
      {withKey && keysOf(command)[0] && <kbd className="toolbar-menu-key">{keysOf(command)[0]}</kbd>}
      <small>{says}</small>
    </button>
  );
  const control = (
    // The accent control "New terminal" always was, with its arrow: as wide as its words at the top of the list, a plus on the rail.
    <span className={compact ? 'toolbar-new new-terminal' : 'toolbar-new new-terminal in-list'} ref={root} data-testid="new-terminal">
      <button type="button" onClick={() => runCommand('terminal.new')} disabled={busy} aria-busy={busy} aria-label={compact ? 'New terminal' : undefined} title={hint('terminal.new')} data-testid="toolbar-new-terminal">
        {compact && (
          <span className="new-terminal-plus" aria-hidden="true">
            +
          </span>
        )}
        <span className="new-terminal-words">New terminal</span>
      </button>
      <button
        type="button"
        className="toolbar-new-more"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        aria-label="More to make: an agent, a terminal somewhere else, a frame"
        title="More to make: an agent, a terminal somewhere else, a frame"
        onClick={() => {
          const box = (root.current ?? document.body).getBoundingClientRect();
          setMenu(menu ? null : { left: Math.max(4, Math.min(box.left, window.innerWidth - 324)), top: box.bottom + 6 });
        }}
        data-testid="toolbar-new-more"
      >
        {compact ? (
          '▾'
        ) : (
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        )}
      </button>
      {menu && (
        <span className="toolbar-menu new-terminal-menu" role="menu" data-part="menu" style={{ left: menu.left, top: menu.top }} data-testid="toolbar-new-menu">
          {/* The first line is what the button does, with its key. */}
          {item('terminal.new', 'Shell', 'A plain terminal on this canvas.', 'toolbar-new-shell', true)}
          {item('terminal.newIn', 'Shell in a folder or a working copy…', 'Somewhere you choose, or kept apart on its own branch.', 'toolbar-new-in')}
          <span className="toolbar-menu-heading" role="presentation">
            Agents
          </span>
          {item('agent.new', 'Claude Code', 'An agent that reports to this canvas.', 'toolbar-new-agent')}
          {item('agent.newWithTools', 'Claude Code with Aubergine tools…', 'Choose what it may do here first.', 'agent-with-tools')}
          {item('workflow.runOnAgent', 'Claude Code on a workflow…', 'Choose the workflow first.', 'agent-on-workflow')}
          <span className="ui-menu-divider" role="separator" />
          {item('frame.new', 'Frame', 'A box to group terminals in.', 'toolbar-new-frame')}
        </span>
      )}
    </span>
  );
  // On the rail: a place as large as the rail's own buttons, from which the whole control opens out over what is beside it.
  return compact ? <span className="new-terminal-rail">{control}</span> : control;
}
