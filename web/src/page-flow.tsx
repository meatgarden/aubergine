import type { PageName } from '@aubergine/shared';
import { runCommand } from './commands';
import { hint } from './shortcuts';
import { useApp } from './store';

/**
 * How the pages fit together, in the order work goes through them: a workflow is found in the Library, kept in
 * Workflows, and run in Runs, from waiting to start to done. Drawn under each page's name, the same on every page,
 * the page being looked at marked; each opens its page.
 */
const FLOW: readonly { page: PageName; name: string; says: string }[] = [
  { page: 'library', name: 'Library', says: 'find a workflow' },
  { page: 'workflows', name: 'Workflows', says: 'your recipes' },
  { page: 'runs', name: 'Runs', says: 'from waiting to done' },
];

export function PageFlow({ here }: { here: PageName }) {
  return (
    <nav className="page-flow" aria-label="How these pages fit together" data-testid="page-flow">
      <ol>
        {FLOW.map((step, i) => (
          <li key={step.page}>
            {i > 0 && (
              <span className="page-flow-arrow" aria-hidden="true">
                →
              </span>
            )}
            <button
              type="button"
              className="quiet page-flow-step"
              aria-current={step.page === here ? 'page' : undefined}
              onClick={() => step.page !== here && useApp.getState().showPage(step.page)}
              data-testid="page-flow-step"
              data-page={step.page}
            >
              <span className="page-flow-name">{step.name}</span>
              <span className="page-flow-says">{step.says}</span>
            </button>
          </li>
        ))}
      </ol>
      {/* The page's own short tour, from its first step. */}
      <button type="button" className="quiet page-flow-tour" title={hint('tour.page', 'A few steps pointing at what is on this page')} onClick={() => runCommand('tour.page')} data-testid="page-tour">
        Show me around
      </button>
    </nav>
  );
}
