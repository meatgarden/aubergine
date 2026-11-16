import { useEffect, useMemo, useState } from 'react';
import { inputProblems, kickoffLine, latestVersion, previewRun } from '@aubergine/shared';
import { api } from '../api';
import { canvasActions } from '../canvas-actions';
import { runCommand } from '../commands';
import { useApp } from '../store';
import { sampleInputs } from './editor-model';
import { runOfSession } from './run-model';

/**
 * "Run workflow…": choose a workflow, fill in what it asks for, read what the
 * agent will be told, start. On a terminal that is there already, or on a
 * new Claude Code session that is told about the run in its first prompt.
 */
export function RunDialog() {
  const starting = useApp((s) => s.startingRun);
  const workflows = useApp((s) => s.app?.workflows);
  const session = useApp((s) => (starting?.sessionId ? (s.app?.sessions.find((x) => x.id === starting.sessionId) ?? null) : null));
  const existing = useApp((s) => (starting?.sessionId ? runOfSession(s.app, starting.sessionId) : null));
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => [...(workflows ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [workflows]);
  useEffect(() => {
    if (!starting) return;
    setWorkflowId(starting.workflowId ?? null);
    setInputs({});
    setReplace(false);
    setError(null);
    setBusy(false);
  }, [starting]);

  if (!starting) return null;
  const close = (): void => useApp.getState().startRun(null);
  const workflow = list.find((w) => w.id === workflowId) ?? list[0] ?? null;
  const version = workflow ? latestVersion(workflow) : null;
  const given = version ? Object.fromEntries(version.inputs.flatMap((input) => ((inputs[input.key] ?? '').trim() ? [[input.key, (inputs[input.key] as string).trim()]] : []))) : {};
  const problems = version ? inputProblems(version, given) : [];
  const onNewAgent = starting.sessionId === null;
  const blockedByRun = existing !== null && !replace;

  const start = async (): Promise<void> => {
    if (!workflow || !version) return;
    setBusy(true);
    setError(null);
    try {
      let sessionId = starting.sessionId;
      if (sessionId === null) {
        // A new agent session is told about the run in its first prompt; nothing needs typing afterwards.
        sessionId = (await canvasActions.get()?.addTerminal('claude-code', [kickoffLine()])) ?? null;
        if (sessionId === null) throw new Error('The terminal could not be started.');
      }
      const started = await api.startRun(sessionId, { workflowId: workflow.id, inputs: given, replace, kickoff: !onNewAgent });
      const store = useApp.getState();
      store.apply({ type: 'run.started', run: started.run });
      store.startRun(null);
      // In a plain shell nothing was typed: show the run, where the buttons and the line for an agent are.
      if (!onNewAgent && !started.kickoffTyped) store.viewRun(started.run.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

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
      <div className="dialog sheet run-dialog" role="dialog" aria-label="Run a workflow" data-testid="run-dialog">
        <header className="sheet-head">
          <h2>{onNewAgent ? 'New Claude Code session on a workflow' : `Run a workflow on “${session?.name ?? 'this terminal'}”`}</h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>

        {list.length === 0 ? (
          <>
            <p>There are no workflows yet. Make one from a template first.</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  close();
                  runCommand('workflows.open');
                }}
              >
                Workflows…
              </button>
            </div>
          </>
        ) : (
          workflow &&
          version && (
            <>
              <div className="run-dialog-grid">
                <div className="run-dialog-form">
                  <label className="wf-field">
                    <span>Workflow</span>
                    <select value={workflow.id} onChange={(e) => setWorkflowId(e.target.value)} autoFocus data-testid="run-workflow">
                      {list.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="sheet-note">{version.elements.map((e) => e.name).join(' → ')}</p>
                  {version.inputs.map((input) => (
                    <label key={input.key} className="wf-field">
                      <span>
                        {input.label}
                        {input.required ? '' : ' (optional)'}
                      </span>
                      <textarea
                        rows={input.key === 'task' ? 4 : 2}
                        value={inputs[input.key] ?? ''}
                        placeholder={input.description}
                        onChange={(e) => setInputs({ ...inputs, [input.key]: e.target.value })}
                        data-testid={`run-input-${input.key}`}
                      />
                    </label>
                  ))}
                  {existing && (
                    <label className="wf-check">
                      <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                      <span>This terminal is already on a run. Stop that run and start this one.</span>
                    </label>
                  )}
                  {session && !onNewAgent && (session.agent === null || session.status.state === 'idle') && (
                    <p className="sheet-note">No agent is running in this terminal, so nothing will be typed into it. You can move the run with the buttons, or start an agent and give it the line shown with the run.</p>
                  )}
                </div>
                <div className="run-dialog-preview">
                  <span className="wf-label">What the agent will be told first</span>
                  <pre data-testid="run-preview">{previewRun(version, sampleInputs(version.inputs, given))}</pre>
                </div>
              </div>
              {error && <p className="dialog-error">{error}</p>}
              <div className="dialog-actions">
                {problems.length > 0 && <span className="sheet-note run-dialog-problem">{problems[0]}</span>}
                <button type="button" className="quiet" onClick={close}>
                  Cancel
                </button>
                <button type="button" onClick={() => void start()} disabled={busy || problems.length > 0 || blockedByRun} data-testid="run-start">
                  {onNewAgent ? 'Start the session and the run' : 'Start'}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
