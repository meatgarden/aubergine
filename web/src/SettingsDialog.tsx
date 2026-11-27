import { useEffect } from 'react';
import { AppearancePart } from './appearance/AppearancePart';
import { NotifySwitch } from './AttentionQueue';
import { api, isSuperseded } from './api';
import { keepBarOpen, useBarKeptOpen } from './bar-open';
import { BAR_PLACES, BAR_PLACE_WORDS, placeBar, placeFrom, useBarPlace } from './bar-place';
import { setOpenNew } from './desktop';
import { DevicesPart } from './devices/Devices';
import { atThisComputer, useApp } from './store';
import { findServer, hostOf, loadServers } from './servers';
import { ScreenHead, Select } from './ui';

/**
 * Settings: the one place for what a person changes about the page itself. How it looks (light or dark, the color
 * theme of each, a terminal's text and cursor), whether a new terminal
 * also opens on the desktop (only at the computer Aubergine runs on), whether the desktop is told when a terminal starts
 * waiting, and the devices signed in with a code. Everything else is written in the settings file by hand.
 */
export function SettingsDialog() {
  const open = useApp((s) => s.panel === 'settings');
  const openNew = useApp((s) => s.settings.desktop.openNew);
  const remind = useApp((s) => s.settings.describe.remind);
  const barOpen = useBarKeptOpen();
  const barAt = useBarPlace();
  const here = useApp(atThisComputer);
  const at = useApp((s) => s.settingsAt);
  // A linked server shown: what is not about the page itself is about that server.
  const server = useApp((s) => s.server);
  const shownServer = server === null ? null : findServer(loadServers(), server);
  // Asked to show a part (Devices or Appearance, from its command): brought into view once, and what is done there first has the keyboard.
  useEffect(() => {
    if (!open || at === null) return;
    // A moment later: what opened Settings (the palette, a menu) gives the keyboard back as it closes.
    const timer = window.setTimeout(() => {
      useApp.setState({ settingsAt: null });
      const part = document.querySelector<HTMLElement>(`[data-testid="settings-${at}"]`);
      part?.scrollIntoView({ block: 'nearest' });
      // The part may say what is done there first (Appearance: the theme drawn now); else its first button.
      (part?.querySelector<HTMLElement>('[data-autofocus]') ?? part?.querySelector<HTMLElement>('button'))?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, at]);
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
        {shownServer && (
          <p data-testid="settings-server">
            The appearance, the bar and notifications are this page’s own. Everything else here is about “{shownServer.label}” at {hostOf(shownServer)}, the server shown.
          </p>
        )}
        <AppearancePart />
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
          <p className="ui-meta">At the bottom right the map stands over it. This browser remembers it.</p>
        </section>
        {here && (
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
        )}
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
                    (error: unknown) => !isSuperseded(error) && useApp.getState().setNotice(`The setting was not changed: ${(error as Error).message}`),
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
        <DevicesPart />
      </div>
    </div>
  );
}
