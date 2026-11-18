import { memo } from 'react';
import { useApp } from '../store';
import { STATUS_MARK, STATUS_WORD, pictureOf, runsBySession, versionOfRun } from './run-model';

/**
 * Where a session's run stands. On a terminal: a line of its own under the title, in words
 * (the workflow, the step and how many there are, what it waits for). On a list row: a few pixels.
 * It listens to its own run only, so a report redraws one strip.
 */
export const RunStrip = memo(function RunStrip({ sessionId, variant }: { sessionId: string; variant: 'node' | 'row' }) {
  const run = useApp((s) => (s.app ? runsBySession(s.app.runs).get(sessionId) : undefined));
  const version = useApp((s) => (s.app && run ? versionOfRun(s.app, run) : null));
  const lastOutputAt = useApp((s) => (run ? (s.app?.sessions.find((x) => x.id === sessionId)?.lastOutputAt ?? null) : null));
  const quietAfter = useApp((s) => s.settings.workflows.quietAfterSeconds);
  if (!run || !version) return null;
  const picture = pictureOf(run, { workflowName: version.name, elements: version.elements }, lastOutputAt, quietAfter);
  const title = [
    `${picture.workflowName}: ${picture.position}`,
    run.status !== 'running' ? STATUS_WORD[run.status] : null,
    run.status === 'blocked' && run.blockedReason ? run.blockedReason : null,
    picture.quiet ? 'quiet: the terminal has printed for a while with no report, so this may be behind' : null,
    'Click for the whole run',
  ]
    .filter(Boolean)
    .join(' · ');

  const open = (event: { stopPropagation(): void }): void => {
    event.stopPropagation();
    useApp.getState().viewRun(run.id);
  };

  if (variant === 'node') {
    // On a terminal the run is said in a line of its own, in words: which workflow, which step of how many, and what it waits for.
    const says = run.status === 'awaiting' ? 'Waiting for you to approve' : run.status === 'blocked' ? `Blocked${run.blockedReason ? `: ${run.blockedReason}` : ''}` : run.status === 'running' ? (picture.quiet ? 'No report for a while, so this may be behind' : null) : STATUS_WORD[run.status];
    return (
      <button type="button" className={`run-banner nodrag status-${run.status}${picture.quiet ? ' is-quiet' : ''}`} title={title} data-testid="run-strip" data-status={run.status} data-element={picture.current?.id ?? ''} data-quiet={picture.quiet ? 'true' : undefined} onClick={open}>
        <span className="run-banner-label">Workflow</span>
        <span className="run-banner-name" data-testid="run-workflow-name">
          {picture.workflowName}
        </span>
        <span className="run-segments" aria-hidden="true">
          {picture.segments.map((segment) => (
            <span key={segment.id} className={`run-segment is-${segment.state}`} />
          ))}
        </span>
        <span className="run-banner-step">
          {picture.current ? `Step ${picture.current.number} of ${picture.total}: ` : ''}
          <strong className="run-element" data-testid="run-element">
            {picture.current ? picture.current.name : STATUS_WORD[run.status]}
          </strong>
        </span>
        {says && picture.current && (
          <span className="run-banner-says" data-testid="run-says">
            {says}
          </span>
        )}
        <span className="run-banner-open">{run.status === 'awaiting' ? 'Review and decide' : 'See all steps'} ›</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`run-strip nodrag is-row status-${run.status}${picture.quiet ? ' is-quiet' : ''}`}
      title={title}
      data-testid="row-run"
      data-status={run.status}
      data-element={picture.current?.id ?? ''}
      data-quiet={picture.quiet ? 'true' : undefined}
      onClick={open}
    >
      {run.status !== 'running' && <span className="run-mark">{STATUS_MARK[run.status]}</span>}
      <span className="run-element">{picture.current ? picture.current.name : STATUS_WORD[run.status]}</span>
      {picture.current && (
        <span className="run-count">
          {picture.current.number}/{picture.total}
        </span>
      )}
      {run.status !== 'running' && <span className="run-status">{STATUS_WORD[run.status]}</span>}
      {picture.quiet && <span className="run-quiet">quiet</span>}
    </button>
  );
});
