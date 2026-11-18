import { useMemo, useState } from 'react';
import { START_MANY_MAX, inputProblems, latestVersion, untoldWords } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { runsBySession } from '../workflows/run-model';
import { agentInFront } from './board-model';
import { ScreenHead } from '../ui';

/**
 * One workflow on several terminals at once: pick the workflow, tick the
 * terminals, give one task for all or one each. Every terminal gets a run of
 * its own, started the way a single run is; the answer says, terminal by
 * terminal, whether it started and if not, why.
 */
export function RunManyDialog({ onClose }: { onClose: () => void }) {
  const app = useApp((s) => s.app);
  const list = useMemo(() => [...(app?.workflows ?? [])].filter((w) => w.listed).sort((a, b) => a.name.localeCompare(b.name)), [app?.workflows]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [each, setEach] = useState(false);
  const [own, setOwn] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ sessionId: string; started: boolean; reason: string | null; typed: boolean }[] | null>(null);

  const workflow = list.find((w) => w.id === workflowId) ?? list[0] ?? null;
  const version = workflow ? latestVersion(workflow) : null;
  // What "one each" asks per terminal: the first thing the workflow asks for, which is the task.
  const first = version?.inputs[0] ?? null;
  const onRun = app ? runsBySession(app.runs) : new Map<string, never>();
  const canvasOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const canvas of app?.canvases ?? []) for (const node of canvas.layout.nodes) names.set(node.sessionId, canvas.name);
    return names;
  }, [app?.canvases]);
  const terminals = useMemo(() => [...(app?.sessions ?? [])].filter((s) => s.state !== 'parked' && canvasOf.has(s.id)).sort((a, b) => (canvasOf.get(a.id) ?? '').localeCompare(canvasOf.get(b.id) ?? '') || a.name.localeCompare(b.name)), [app?.sessions, canvasOf]);

  const givenFor = (sessionId: string): Record<string, string> => {
    const all = Object.fromEntries((version?.inputs ?? []).flatMap((input) => ((inputs[input.key] ?? '').trim() ? [[input.key, (inputs[input.key] as string).trim()]] : [])));
    return each && first ? { ...all, ...((own[sessionId] ?? '').trim() ? { [first.key]: (own[sessionId] as string).trim() } : {}) } : all;
  };
  const problems = version ? [...new Set(ticked.flatMap((sessionId) => inputProblems(version, givenFor(sessionId))))] : [];
  const nameOf = (sessionId: string): string => app?.sessions.find((s) => s.id === sessionId)?.name ?? 'a terminal';

  const start = async (): Promise<void> => {
    if (!workflow) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await api.startRuns(workflow.id, { sessionIds: ticked, inputs: givenFor(''), ...(each ? { inputsBySession: Object.fromEntries(ticked.map((sessionId) => [sessionId, givenFor(sessionId)])) } : {}), replace });
      for (const result of answer.results) if (result.run) useApp.getState().apply({ type: 'run.started', run: result.run.run as never });
      setResults(answer.results.map((r) => ({ sessionId: r.sessionId, started: r.started, reason: r.reason, typed: r.run?.kickoffTyped ?? false })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="dialog sheet run-many" role="dialog" aria-label="Start on several terminals" data-testid="run-many">
        <ScreenHead title="Start on several terminals" onClose={onClose} closeTestid="run-many-close" />
        {results ? (
          <>
            <ul className="run-many-results" data-testid="run-many-results">
              {results.map((result) => (
                <li key={result.sessionId} data-started={result.started}>
                  <strong>{nameOf(result.sessionId)}</strong>: {result.started ? (result.typed ? 'started, and the agent was told.' : 'started. Nothing was typed there: no agent was seen in front. It reads the run with `aubergine workflow status`.') : `not started. ${result.reason ?? ''}`}
                </li>
              ))}
            </ul>
            <div className="editor-row">
              <button type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : list.length === 0 ? (
          <p className="list-empty">There is no workflow yet. Make one in Workflows first.</p>
        ) : (
          <>
            <label className="wf-field">
              <span>Workflow</span>
              <select value={workflow?.id ?? ''} onChange={(e) => setWorkflowId(e.target.value)} data-testid="run-many-workflow">
                {list.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            {(version?.inputs ?? []).map((input) => (
              <label key={input.key} className="wf-field">
                <span>
                  {input.label}
                  {each && input.key === first?.key ? ' (for a terminal that has none of its own)' : ''}
                </span>
                <input value={inputs[input.key] ?? ''} placeholder={input.description} onChange={(e) => setInputs({ ...inputs, [input.key]: e.target.value })} data-testid={`run-many-input-${input.key}`} />
              </label>
            ))}
            {first && (
              <label className="wf-inline">
                <input type="checkbox" checked={each} onChange={(e) => setEach(e.target.checked)} data-testid="run-many-each" />
                <span>Give each terminal its own “{first.label}”</span>
              </label>
            )}
            <div className="wf-label">
              Terminals <span className="sheet-note">each gets a run of its own; at most {START_MANY_MAX}</span>
            </div>
            <ul className="run-many-terminals">
              {terminals.map((session) => {
                const front = agentInFront(session);
                const run = onRun.get(session.id);
                const on = ticked.includes(session.id);
                return (
                  <li key={session.id} data-testid="run-many-terminal" data-session={session.id}>
                    <label className="wf-inline">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && ticked.length >= START_MANY_MAX}
                        onChange={(e) => setTicked(e.target.checked ? [...ticked, session.id] : ticked.filter((id) => id !== session.id))}
                        data-testid="run-many-tick"
                      />
                      <span>
                        <strong>{session.name}</strong> on {canvasOf.get(session.id)}
                      </span>
                    </label>
                    <span className="sheet-note">
                      {front.words}
                      {session.untold ? ` · ${untoldWords(session.untold)}` : ''}
                      {run ? ' · already on a run' : ''}
                    </span>
                    {each && on && first && <input value={own[session.id] ?? ''} placeholder={`${first.label} for ${session.name}`} aria-label={`${first.label} for ${session.name}`} onChange={(e) => setOwn({ ...own, [session.id]: e.target.value })} data-testid="run-many-own" />}
                  </li>
                );
              })}
            </ul>
            <label className="wf-inline">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>Where a terminal is already on a run, stop that run and start this</span>
            </label>
            {ticked.length > 0 && problems.length > 0 && <p className="dialog-error">{problems.join(' ')}</p>}
            {error && <p className="dialog-error">{error}</p>}
            <div className="editor-row">
              <button type="button" disabled={busy || ticked.length === 0 || problems.length > 0} onClick={() => void start()} data-testid="run-many-start">
                Start on {ticked.length} {ticked.length === 1 ? 'terminal' : 'terminals'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
