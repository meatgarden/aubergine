import { THEMES, THEME_WORDS } from '@aubergine/shared';
import { NotifySwitch } from './AttentionQueue';
import { useApp } from './store';
import { chooseTheme, useThemeShown } from './theme';
import { ScreenHead } from './ui';

/**
 * Settings: the one place for what a person changes about the page itself. How it looks, and whether the desktop
 * is told when a terminal starts waiting. Everything else is written in the settings file by hand.
 */
export function SettingsDialog() {
  const open = useApp((s) => s.panel === 'settings');
  const theme = useApp((s) => s.settings.theme);
  const shown = useThemeShown();
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
          <h3>Notifications</h3>
          <p className="help-setting">
            <NotifySwitch />
          </p>
        </section>
      </div>
    </div>
  );
}
