import { useState } from 'react';
import { ago, recapFacts, recapLines, recapOf, recordOfRun, showControl, type AppState, type Recap, type RecapRun, type RunRecord, untoldWords } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
import { useEndedRuns } from './workflows/ended-runs';

/**
 * The recap of a terminal: what it was about and where it stands. Two parts,
 * kept apart and labelled: what Aubergine itself knows, always there; and
 * what the terminal's agent wrote when asked, shown as the agent's words.
 */

/** The recap of a session from the page's state and the runs that ended lately. Null when the session is gone. */
export function recapFor(app: AppState, sessionId: string, ended: readonly RunRecord[]): Recap | null {
  const session = app.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const live = app.runs.find((run) => run.sessionId === sessionId);
  const record = live ? recordOfRun(live, app.workflows.find((w) => w.id === live.workflowId)) : null;
  const last = ended.find((entry) => entry.run.sessionId === sessionId);
  const toRecap = (entry: RunRecord | null): RecapRun | null => (entry ? { run: entry.run, workflowName: entry.workflowName, elements: entry.elements } : null);
  return recapOf(session, { live: toRecap(record), ended: toRecap(last ?? null) });
}

/** The recap as a few lines of text, for a tooltip: worked out when it is asked for, not for every row that is drawn. */
export function recapTitle(sessionId: string): string {
  const app = useApp.getState().app;
  const recap = app ? recapFor(app, sessionId, useEndedRuns.getState().items) : null;
  if (!recap) return '';
  const now = new Date();
  const written = recap.written ? ['', `Its agent wrote, ${ago(recap.written.at, now)} ago${recap.written.stale ? ' (may be out of date)' : ''}:`, showControl(recap.written.text)] : [];
  return [...recapLines(recap, now), ...written].join('\n');
}

export function RecapBlock({ sessionId, canAsk = true, omit = [] }: { sessionId: string; canAsk?: boolean; /** Facts that are not said here because they are in view beside this: the last log entry, where the log itself is under it. */ omit?: readonly string[] }) {
  const ended = useEndedRuns((e) => e.items);
  // Worked out again when the session itself changes, not when anything else does.
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const runs = useApp((s) => s.app?.runs);
  const app = useApp.getState().app;
  const [asking, setAsking] = useState<'idle' | 'asked' | 'failed'>('idle');
  const [why, setWhy] = useState('');
  if (!app || !session) return null;
  void runs;
  const recap = recapFor(app, sessionId, ended);
  if (!recap) return null;
  const now = new Date();

  const untold = session.untold;
  const ask = (): void => {
    setAsking('idle');
    void api.askRecap(sessionId).then(
      (answer) => setAsking(answer.asked ? 'asked' : 'failed'),
      (error: unknown) => {
        setWhy((error as Error).message);
        setAsking('failed');
      },
    );
  };

  return (
    <section className="recap" aria-label="What is known about this terminal" data-testid="recap">
      {/* What is known, as facts: a label and what it is. A folder and a command are short here, whole in their tooltips. */}
      <dl className="ui-facts" data-testid="recap-lines">
        {recapFacts(recap, now)
          .filter((fact) => !omit.includes(fact.key))
          .map((fact) => (
          <div key={fact.key} data-fact={fact.key}>
            <dt>{fact.label}</dt>
            <dd title={fact.title}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {recap.written && (
        <div className="recap-written" data-testid="recap-written" data-stale={recap.written.stale ? 'true' : undefined}>
          <h3>
            Recap from its agent <span className="recap-source">{ago(recap.written.at, now)} ago</span>
            {recap.written.stale && (
              <span className="recap-stale" title="The terminal has printed since this was written" data-testid="recap-stale">
                may be out of date
              </span>
            )}
          </h3>
          {/* The agent's words: plain text, control characters shown, nothing made into a link or a tag. */}
          <p className="recap-text">{showControl(recap.written.text)}</p>
        </div>
      )}
      {canAsk && recap.agent && recap.state !== 'exited' && (
        <div className="recap-ask">
          <button type="button" className="quiet" onClick={ask} title="Types one fixed sentence into the terminal, asking its agent to write a recap. Nothing of yours is in the sentence." data-testid="recap-ask">
            {recap.written ? 'Ask its agent for a new recap' : 'Ask its agent for a recap'}
          </button>
          {asking === 'asked' && <span className="sheet-note" data-testid="recap-asked">Asked. It appears here when the agent hands it in.</span>}
          {asking === 'failed' && (
            <span className="dialog-error" data-testid="recap-not-asked">
              {why || (untold ? untoldWords(untold) : 'It could not be asked: the terminal is not running.')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
