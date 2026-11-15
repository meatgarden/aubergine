import { COMMANDS, type Command } from './commands';
import { activeShortcuts, keysOf, platform, windowMode } from './shortcuts';
import { useApp } from './store';

const GROUPS: Command['group'][] = ['Terminals', 'Canvases', 'View', 'Panels'];

/**
 * Every command with the keys it has right now, on this system and in this
 * kind of window, and whatever is wrong with the keys in the settings file.
 * Made from the command list and the active bindings, never written by hand.
 */
export function ShortcutSheet() {
  const open = useApp((s) => s.panel === 'shortcuts');
  const settings = useApp((s) => s.settings);
  if (!open) return null;
  const { bindings, problems } = activeShortcuts(settings);
  const insideTerminals = new Set(bindings.filter((b) => b.layer === 'always').map((b) => b.command));
  const close = (): void => useApp.getState().togglePanel(null);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog sheet" role="dialog" aria-label="Shortcuts" data-testid="shortcut-sheet">
        <header className="sheet-head">
          <h2>Shortcuts</h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>
        <p className="sheet-note">
          Keys marked <span className="sheet-mark">●</span> work everywhere, inside a terminal too. The others work while no terminal or
          text field has the keyboard. Everything is also in the palette. These are the keys for{' '}
          {platform() === 'mac' ? 'macOS' : 'Linux and Windows'} in {windowMode() === 'app' ? 'an app window' : 'a browser tab'}; change
          them under <code>shortcuts</code> in <code>config.json</code>.
        </p>
        {problems.length > 0 && (
          <div className="sheet-problems" role="alert" data-testid="shortcut-problems">
            <strong>Problems with the keys in config.json</strong>
            <ul>
              {problems.map((problem, i) => (
                <li key={i}>{problem.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="sheet-groups">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3>{group}</h3>
              <table>
                <tbody>
                  {COMMANDS.filter((command) => command.group === group).map((command) => {
                    const keys = keysOf(command.id, settings);
                    return (
                      <tr key={command.id} data-testid="sheet-row" data-command={command.id}>
                        <td className="sheet-keys">
                          {keys.length === 0 ? <span className="sheet-none">palette</span> : keys.map((key) => <kbd key={key}>{key}</kbd>)}
                          {insideTerminals.has(command.id) && <span className="sheet-mark" title="Works inside a terminal too">●</span>}
                        </td>
                        <td title={`${command.description} (${command.id})`}>{command.title}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
