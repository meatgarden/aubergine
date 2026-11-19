import { useEffect, useState } from 'react';
import { kickoffLine, renderRun, type RunDetail } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { reportRun } from './actions';
import { ApprovalControls } from './ApprovalControls';
import { runViewList } from './registries';
import { STATUS_MARK, STATUS_WORD, pictureOf, versionOfRun } from './run-model';

/**
 * One run: where it stands, every element, and the buttons that move it.
 * What it shows of the run comes from the registered views; this dialog only
 * frames them. A run that is over is fetched from the archive and shown
 * without buttons.
 */
export function RunViewDialog() {
  const runId = useApp((s) => s.viewingRun);
  const live = useApp((s) => (runId ? (s.app?.runs.find((r) => r.id === runId) ?? null) : null));
  const version = useApp((s) => (s.app && live ? versionOfRun(s.app, live) : null));
  const session = useApp((s) => {
    const id = live?.sessionId;
    return id ? (s.app?.sessions.find((x) => x.id === id) ?? null) : null;
  });
  const quietAfter = useApp((s) => s.settings.workflows.quietAfterSeconds);
  const [ended, setEnded] = useState<RunDetail | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A run that is not (or no longer) among the live ones: read it from the archive.
  useEffect(() => {
    setEnded(null);
    if (!runId || live) return;
    let cancelled = false;
    void api
      .getRun(runId)
      .then((detail) => !cancelled && setEnded(detail as RunDetail))
      .catch(() => !cancelled && useApp.getState().viewRun(null));
    return () => {
      cancelled = true;
    };
  }, [runId, live === null]); // eslint-disable-line react-hooks/exhaustive-deps -- only whether it is live matters, not each move
  // A run that is over was changed (an item ticked): show what the server answered.
  useEffect(() => {
    const onRead = (event: Event): void => {
      const detail = (event as CustomEvent<RunDetail>).detail;
      if (detail.run.id === runId) setEnded(detail);
    };
    window.addEventListener('aubergine:run-read', onRead);
    return () => window.removeEventListener('aubergine:run-read', onRead);
  }, [runId]);
  useEffect(() => {
    setNote('');
    setStopping(false);
  }, [runId, live?.currentElementId]);
  useEffect(() => {
    if (!runId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [runId]);

  if (!runId) return null;
  const close = (): void => useApp.getState().viewRun(null);
  const picture =
    live && version
      ? pictureOf(live, { workflowName: version.name, elements: version.elements }, session?.lastOutputAt ?? null, quietAfter)
      : ended
        ? pictureOf(ended.run, ended, null, quietAfter)
        : null;
  const views = runViewList();
  const View = (views.find((v) => v.id === view) ?? views[0])?.Component;
  const run = picture?.run;

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
      <div className="dialog sheet run-view" role="dialog" aria-label="Run" data-testid="run-view" data-status={run?.status}>
        {!picture || !run ? (
          <p>Loading…</p>
        ) : (
          <>
            <header className="sheet-head">
              <h2>
                {picture.workflowName}
                <span className={`run-view-status status-${run.status}`} data-testid="run-view-status">
                  {STATUS_MARK[run.status]} {picture.current && run.status !== 'stopped' ? `${picture.position} · ${STATUS_WORD[run.status]}` : picture.position}
                </span>
              </h2>
              <span>
                {session && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      close();
                      useApp.getState().showSession(session.id);
                    }}
                  >
                    Go to “{session.name}”
                  </button>
                )}
                <button type="button" className="quiet" onClick={close} data-testid="run-view-close">
                  Close
                </button>
              </span>
            </header>
            {run.status === 'blocked' && (
              <p className="run-view-alert" role="alert">
                Blocked on “{picture.current?.name}”: {run.blockedReason}
              </p>
            )}
            {picture.quiet && <p className="run-view-alert">Quiet for a while: the terminal has printed without saying a step is done, so the step shown may be out of date.</p>}
            {Object.keys(run.inputs).length > 0 && (
              <p className="sheet-note">
                {Object.entries(run.inputs)
                  .map(([key, value]) => `${key.replace(/^./, (c) => c.toUpperCase())}: ${value}`)
                  .join(' · ')}
              </p>
            )}
            {views.length > 1 && (
              <div className="run-view-tabs" role="tablist">
                {views.map((v, index) => (
                  <button key={v.id} type="button" role="tab" aria-selected={view === v.id || (view === null && index === 0)} onClick={() => setView(v.id)}>
                    {v.title}
                  </button>
                ))}
              </div>
            )}
            {View && (
              <View
                picture={picture}
                elements={version?.elements ?? []}
                live={live !== null}
                now={now}
                text={live && version ? renderRun(version, live) : (ended?.text ?? '')}
                kickoff={live && version ? kickoffLine() : ''}
              />
            )}
            {live && run.status === 'awaiting' && (
              <div className="run-view-approval" data-testid="run-view-approval">
                <p role="alert">
                  <strong>Waiting for you.</strong> This run stops at “{picture.current?.name}” until you approve it or send it back. Read what was done above first.
                </p>
                <ApprovalControls run={run} elements={picture.segments} />
              </div>
            )}
            {live && (
              <div className="run-view-actions">
                {(run.status === 'running' || run.status === 'blocked') && picture.current && (
                  <>
                    <input value={note} maxLength={2000} placeholder="A note for whoever comes next (optional)" aria-label="Note" onChange={(e) => setNote(e.target.value)} />
                    <button
                      type="button"
                      onClick={() => void reportRun(run.id, { type: 'done', elementId: picture.current?.id ?? '', ...(note.trim() ? { note: note.trim() } : {}) })}
                      data-testid="run-done"
                    >
                      Mark “{picture.current.name}” done
                    </button>
                  </>
                )}
                <span className="list-spring" />
                {run.status === 'paused' ? (
                  <button type="button" onClick={() => void reportRun(run.id, { type: 'resume' })} data-testid="run-resume">
                    Resume
                  </button>
                ) : (
                  run.status !== 'queued' && (
                    <button type="button" className="quiet" onClick={() => void reportRun(run.id, { type: 'pause' })} data-testid="run-pause">
                      Pause
                    </button>
                  )
                )}
                {stopping ? (
                  <button type="button" className="danger" onClick={() => void reportRun(run.id, { type: 'stop' })} data-testid="run-stop-confirm">
                    Stop the run for good
                  </button>
                ) : (
                  <button type="button" className="quiet" onClick={() => setStopping(true)} data-testid="run-stop">
                    Stop…
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
