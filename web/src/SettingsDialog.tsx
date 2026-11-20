import { THEMES, THEME_WORDS } from '@aubergine/shared';
import { NotifySwitch } from './AttentionQueue';
import { api } from './api';
import { keepBarOpen, useBarKeptOpen } from './bar-open';
import { BAR_PLACES, BAR_PLACE_WORDS, placeBar, placeFrom, useBarPlace } from './bar-place';
import { setOpenNew } from './desktop';
import { useApp } from './store';
import { chooseTheme, useThemeShown } from './theme';
import { ScreenHead, Select } from './ui';

/**
 * Settings: the one place for what a person changes about the page itself. How it looks, whether a new terminal
 * also opens on the desktop, and whether the desktop is told when a terminal starts waiting. Everything else is written in the settings file by hand.
 */
export function SettingsDialog() {
  const open = useApp((s) => s.panel === 'settings');
  const theme = useApp((s) => s.settings.theme);
  const shown = useThemeShown();
  const openNew = useApp((s) => s.settings.desktop.openNew);
  const remind = useApp((s) => s.settings.describe.remind);
  const barOpen = useBarKeptOpen();
  const barAt = useBarPlace();
  if (!open) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet settings-dialog" role="dialog" aria-label="Settings" data-testid="settings-dialog">
        <ScreenHead title="Settings" onClose={close} closeTestid="settings-close" />
        <section>
          <h3>Appearance</h3>
          <div className="ui-segmented" role="radiogroup" aria-label="Theme" data-testid="theme-switch">
            {THEMES.map((choice) => (
              <button key={choice} type="button" role="radio" aria-checked={choice === theme} aria-pressed={choice === theme} onClick={() => chooseTheme(choice)} data-testid={`theme-${choice}`}>
                {THEME_WORDS[choice]}
              </button>
            ))}
          </div>
          <p className="ui-meta" data-testid="theme-says">
            {theme === 'system' ? `The system is set to ${shown} now; the page follows it when that changes.` : 'It changes at once, and is the same in every browser you open this in.'}
          </p>
        </section>
        <section>
          <h3>Canvas</h3>
          <p className="help-setting">
            <label className="ui-check">
              <input type="checkbox" checked={barOpen} onChange={(e) => keepBarOpen(e.target.checked)} data-testid="settings-bar-open" />
              <span>Keep the whole bar over the canvas open</span>
            </label>
          </p>
          <p className="ui-meta">Otherwise it shows only Go to…, and the rest when you point at it or reach it with the keyboard. This browser remembers it.</p>
          <p className="help-setting settings-line">
            <label htmlFor="settings-bar-place">Where the bar stands</label>
            <Select id="settings-bar-place" value={barAt} onChange={(e) => placeBar(placeFrom(e.target.value))} data-testid="settings-bar-place">
              {BAR_PLACES.map((place) => (
                <option key={place} value={place}>
                  {BAR_PLACE_WORDS[place]}
                </option>
              ))}
            </Select>
          </p>
          <p className="ui-meta">The bottom right corner is the map&rsquo;s. This browser remembers it.</p>
        </section>
        <section>
          <h3>New terminals</h3>
          <p className="help-setting">
            <label className="ui-check" title="Which application, or a command of your own, is written in the settings file.">
              <input type="checkbox" checked={openNew} onChange={(e) => void setOpenNew(e.target.checked)} data-testid="settings-desktop-new" />
              <span>Also open each new terminal in a window of your terminal application</span>
            </label>
          </p>
          <p className="ui-meta">The window shows the same terminal as the canvas, and the two share one size.</p>
        </section>
        <section>
          <h3>Agents</h3>
          <p className="help-setting">
            <label className="ui-check">
              <input
                type="checkbox"
                checked={remind}
                onChange={(e) => {
                  const next = e.target.checked;
                  void api.setDescribing(next).then(
                    (now) => useApp.getState().setDescribeRemind(now.remind),
                    (error: unknown) => useApp.getState().setNotice(`The setting was not changed: ${(error as Error).message}`),
                  );
                }}
                data-testid="settings-describe-remind"
              />
              <span>Remind agents to describe their terminal</span>
            </label>
          </p>
          <p className="ui-meta">An agent Aubergine starts is told to name its terminal, keep its summary true and add its links; where it stops without a name or a summary it is told once more.</p>
        </section>
        <section>
          <h3>Notifications</h3>
          <p className="help-setting">
            <NotifySwitch />
          </p>
        </section>
      </div>
    </div>
  );
}
