import { memo } from 'react';
import { useApp } from '../store';
import { STATUS_MARK, STATUS_WORD, pictureOf, runsBySession, versionOfRun } from './run-model';

/**
 * Where a session's run stands, in a few pixels: one mark per element and the
 * name of the current one. On the node's title bar and on the list row.
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

  return (
    <button
      type="button"
      className={`run-strip nodrag is-${variant} status-${run.status}${picture.quiet ? ' is-quiet' : ''}`}
      title={title}
      data-testid={variant === 'node' ? 'run-strip' : 'row-run'}
      data-status={run.status}
      data-element={picture.current?.id ?? ''}
      data-quiet={picture.quiet ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        useApp.getState().viewRun(run.id);
      }}
    >
      {variant === 'node' && (
        <span className="run-segments" aria-hidden="true">
          {picture.segments.map((segment) => (
            <span key={segment.id} className={`run-segment is-${segment.state}`} />
          ))}
        </span>
      )}
      {run.status !== 'running' && <span className="run-mark">{STATUS_MARK[run.status]}</span>}
      <span className="run-element" data-testid={variant === 'node' ? 'run-element' : undefined}>
        {picture.current ? picture.current.name : STATUS_WORD[run.status]}
      </span>
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
