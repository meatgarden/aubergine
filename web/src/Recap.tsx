import { useState, type ReactNode } from 'react';
import { RECAP_FACT_GROUPS, ago, recapFacts, recapLines, recapOf, recordOfRun, showControl, type AppState, type Recap, type RecapFactGroup, type RecapRun, type RunRecord, untoldWords } from '@aubergine/shared';
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

/** A fact that is a chip or something to copy, from whoever draws the recap, with the group it belongs to. */
export interface MoreFact {
  key: string;
  label: string;
  value: ReactNode;
  group: Exclude<RecapFactGroup, 'time'>;
}

/** A fact as it is drawn: a label and a value, in a group. */
interface Drawn {
  key: string;
  label: string;
  value: ReactNode;
  title?: string;
  group: RecapFactGroup;
  at?: string;
}

export function RecapBlock({ sessionId, canAsk = true, omit = [], more = [] }: { sessionId: string; canAsk?: boolean; /** Facts that are not said here because they are in view beside this: the last log entry, where the log itself is under it. */ omit?: readonly string[]; more?: readonly MoreFact[] }) {
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
  // What Aubergine knows and what whoever draws this adds, each in its group, the groups in their order.
  const all: Drawn[] = [...recapFacts(recap, now).filter((fact) => !omit.includes(fact.key)), ...more];
  const ordered = RECAP_FACT_GROUPS.flatMap((group) => all.filter((fact) => fact.group === group));
  const facts = ordered.filter((fact) => fact.group !== 'time');
  const times = ordered.filter((fact) => fact.group === 'time');

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
      {/*
        What is known, as facts: a label and what it is, in groups (the run, the place, what it is about) with room
        between them and no headings. A folder and a command are short here, whole in their tooltips. The times are
        one quiet line at the end.
      */}
      {facts.length > 0 && (
        <dl className="ui-facts" data-testid="recap-lines">
          {facts.map((fact, index) => (
            <div key={fact.key} data-fact={fact.key} data-group={fact.group} className={index > 0 && facts[index - 1]?.group !== fact.group ? 'ui-facts-group' : undefined}>
              <dt>{fact.label}</dt>
              <dd title={fact.title}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {times.length > 0 && (
        <p className="recap-times" data-testid="recap-times">
          {times.map((fact, index) => (
            <span key={fact.key} data-fact={fact.key}>
              {index > 0 && ' · '}
              {index === 0 ? fact.label : fact.label.toLowerCase()}{' '}
              <time dateTime={fact.at} title={fact.title}>
                {fact.value}
              </time>
            </span>
          ))}
        </p>
      )}
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
