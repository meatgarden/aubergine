import { memo } from 'react';
import { COPY_BRANCH_PREFIX, countsWords } from '@aubergine/shared';
import { useApp } from '../store';

/**
 * On a terminal that works somewhere prepared for it: its branch and how much changed there, with the kind's own
 * words for how far it keeps the agent apart. Click for the files. It listens to its own environment only.
 */
export const EnvironmentChip = memo(function EnvironmentChip({ sessionId }: { sessionId: string }) {
  const environment = useApp((s) => s.app?.environments.find((e) => e.sessionId === sessionId));
  if (!environment) return null;
  const branch = environment.branch ? (environment.branch.startsWith(COPY_BRANCH_PREFIX) ? environment.branch.slice(COPY_BRANCH_PREFIX.length) : environment.branch) : environment.title;
  const changed = environment.changes ? environment.changes.changed + environment.changes.added + environment.changes.removed : null;
  return (
    <button
      type="button"
      className={`copy-chip nodrag${environment.broken ? ' is-broken' : ''}`}
      title={[`${environment.title}. ${environment.words}`, environment.branch ? `Branch ${environment.branch}` : '', environment.broken ?? (environment.changes ? countsWords(environment.changes) : ''), 'Click for what changed'].filter(Boolean).join(' · ')}
      onClick={(event) => {
        event.stopPropagation();
        useApp.getState().viewEnvironment(environment.id);
      }}
      data-testid="copy-chip"
      data-changed={changed ?? ''}
    >
      <span aria-hidden="true">⑂</span>
      <span className="copy-chip-branch">{branch}</span>
      {environment.broken ? <span className="copy-chip-count">broken</span> : changed !== null && changed > 0 && <span className="copy-chip-count">{changed}</span>}
    </button>
  );
});
