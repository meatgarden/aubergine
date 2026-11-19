import { demoOf } from '@aubergine/shared';
import { runCommand } from './commands';
import { useApp } from './store';
import { showMeAround } from './tour/actions';
import { HELP_GROUPS, helpLines } from './tour/registry';
import './tour/steps';
import { useTour } from './tour/tour-store';
import { ScreenHead } from './ui';

/**
 * Help: short groups, one line a thing, each with "Show me" where the thing is on the page being looked at. The tour and
 * the shortcuts are two buttons at the top. The lines come from the tour's registry, so the two cannot drift apart.
 */
export function HelpPanel() {
  const open = useApp((s) => s.panel === 'help');
  const app = useApp((s) => s.app);
  if (!open || !app) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const context = { app, state: useApp.getState(), demo: demoOf(app), signals: new Set<string>() };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog sheet help-panel" role="dialog" aria-label="Help" data-testid="help-panel">
        <ScreenHead title="Help" onClose={close} />
        <div className="help-top">
          <button
            type="button"
            onClick={() => {
              close();
              void showMeAround();
            }}
            data-testid="help-tour"
          >
            Take the tour
          </button>
          <button type="button" onClick={() => runCommand('shortcuts.show')} data-testid="help-shortcuts">
            Keyboard shortcuts
          </button>
        </div>
        {HELP_GROUPS.map(([group, heading]) => (
          <section key={group} className="help-group" data-testid="help-group" data-group={group}>
            <h3 className="ui-section-title">{heading}</h3>
            <ul className="help-list">
              {helpLines()
                .filter((line) => line.group === group)
                .map((line) => {
                  const there = line.target(context) !== null;
                  return (
                    <li key={line.id} data-testid="help-item" data-step={line.id}>
                      <span>{line.reminder}</span>
                      {there && (
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            close();
                            // What it points at is brought into view first: a line about the list opens the side panel.
                            line.arrive?.(context);
                            useTour.getState().point(line.id);
                          }}
                          data-testid="help-show"
                        >
                          Show me
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
