import { demoOf } from '@aubergine/shared';
import { runCommand } from './commands';
import { useApp } from './store';
import { showMeAround } from './tour/actions';
import { tourSteps } from './tour/registry';
import './tour/steps';
import { useTour } from './tour/tour-store';

/**
 * Help: the things the tour shows, as one-line reminders. "Show me" points
 * at the thing on the page being looked at, where it is there to point at.
 * The lines come from the tour's steps, so the two cannot drift apart.
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
        <header className="sheet-head">
          <h2>What you can do here</h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>
        <ol className="help-list">
          {tourSteps().map((step) => {
            const there = step.target(context) !== null;
            return (
              <li key={step.id} data-testid="help-item" data-step={step.id}>
                <span>{step.reminder}</span>
                {there && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      close();
                      useTour.getState().point(step.id);
                    }}
                    data-testid="help-show"
                  >
                    Show me
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <div className="dialog-actions">
          <button
            type="button"
            className="quiet"
            onClick={() => {
              close();
              void showMeAround();
            }}
            data-testid="help-tour"
          >
            Take the tour
          </button>
          <button type="button" className="quiet" onClick={() => runCommand('shortcuts.show')} data-testid="help-shortcuts">
            Keyboard shortcuts
          </button>
        </div>
      </div>
    </div>
  );
}
