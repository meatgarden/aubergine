import type { PageName } from '@aubergine/shared';
import { useApp } from './store';

/**
 * How the four pages fit together, in the order work goes through them: a workflow is found in the Library, kept in
 * Workflows, lined up in the Queue, and watched on the Board while it runs. Drawn under each page's name, the same on
 * all four, the page being looked at marked; each opens its page.
 */
const FLOW: readonly { page: PageName; name: string; says: string }[] = [
  { page: 'library', name: 'Library', says: 'find a workflow' },
  { page: 'workflows', name: 'Workflows', says: 'your recipes' },
  { page: 'queue', name: 'Queue', says: 'waiting to start' },
  { page: 'board', name: 'Board', says: 'running now' },
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
    </nav>
  );
}
