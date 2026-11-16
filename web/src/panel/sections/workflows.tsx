import { useEffect, useMemo, useState } from 'react';
import type { RunRecord } from '@aubergine/shared';
import { api } from '../../api';
import { runCommand } from '../../commands';
import { useApp } from '../../store';
import { STATUS_MARK, STATUS_WORD, pictureOfLive, sortRuns } from '../../workflows/run-model';
import { registerSection } from '../registry';

/** The runs still going, on whichever canvas: what each is on, where it stands, whether it needs someone. */
function WorkflowsSection() {
  const runs = useApp((s) => s.app?.runs);
  const app = useApp((s) => s.app);
  const quietAfter = useApp((s) => s.settings.workflows.quietAfterSeconds);
  const sorted = useMemo(() => sortRuns(runs ?? []), [runs]);
  // The last few runs that are over: read from the archive, and again whenever a run leaves the live ones.
  const [ended, setEnded] = useState<RunRecord[]>([]);
  const live = runs?.length ?? 0;
  useEffect(() => {
    let cancelled = false;
    void api
      .listEndedRuns(5)
      .then((page) => !cancelled && setEnded(page.items as RunRecord[]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [live]);

  return (
    <div className="runs-section" data-testid="runs-section">
      {sorted.length === 0 ? (
        <p className="list-empty">No runs are going. Put a terminal on a workflow with “Run workflow…”.</p>
      ) : (
        <ul className="runs-list">
          {sorted.map((run) => {
            const picture = app ? pictureOfLive(app, run, quietAfter) : null;
            const session = run.sessionId ? app?.sessions.find((s) => s.id === run.sessionId) : undefined;
            if (!picture) return null;
            return (
              <li key={run.id}>
                <button
                  type="button"
                  className={`runs-row status-${run.status}`}
                  title={run.status === 'blocked' ? `Blocked: ${run.blockedReason ?? ''}` : `${picture.workflowName}: ${picture.position}`}
                  onClick={() => useApp.getState().viewRun(run.id)}
                  data-testid="runs-row"
                  data-status={run.status}
                  data-element={picture.current?.id ?? ''}
                >
                  <span className="list-state" aria-label={STATUS_WORD[run.status]}>
                    {STATUS_MARK[run.status]}
                  </span>
                  <span className="runs-name">{session?.name ?? 'no session yet'}</span>
                  <span className="runs-where">
                    {picture.workflowName} · {picture.position}
                    {run.status !== 'running' ? ` · ${STATUS_WORD[run.status]}` : ''}
                    {picture.quiet ? ' · quiet' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ended.length > 0 && (
        <>
          <div className="runs-heading">Over lately</div>
          <ul className="runs-list">
            {ended.map(({ run, workflowName }) => (
              <li key={run.id}>
                <button type="button" className="runs-row" onClick={() => useApp.getState().viewRun(run.id)} data-testid="ended-row">
                  <span className="list-state" aria-label={STATUS_WORD[run.status]}>
                    {STATUS_MARK[run.status]}
                  </span>
                  <span className="runs-name">{workflowName}</span>
                  <span className="runs-where">
                    {STATUS_WORD[run.status]} {run.finishedAt ? new Date(run.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="runs-foot">
        <button type="button" className="quiet" onClick={() => runCommand('workflows.open')} data-testid="open-workflows">
          Workflows…
        </button>
      </div>
    </div>
  );
}

registerSection({
  id: 'workflows',
  title: 'Workflows',
  order: 20,
  icon: '⇶',
  useCount: () => useApp((s) => s.app?.runs.length ?? 0) || null,
  useBadges: () => {
    const runs = useApp((s) => s.app?.runs);
    const count = (status: 'blocked' | 'paused'): number => (runs ?? []).filter((r) => r.status === status).length;
    return [
      { key: 'blocked', mark: STATUS_MARK.blocked, count: count('blocked'), title: 'blocked' },
      { key: 'paused', mark: STATUS_MARK.paused, count: count('paused'), title: 'paused' },
    ];
  },
  Component: WorkflowsSection,
});
