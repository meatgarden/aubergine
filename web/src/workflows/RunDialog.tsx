import { useEffect, useMemo, useState } from 'react';
import { NeedMarks } from './NeedMarks';
import { inputProblems, kickoffLine, latestVersion, needsOf, previewRun, versionOfProposal, type RepositoryOffer, type WorkflowContent } from '@aubergine/shared';
import { api } from '../api';
import { canvasActions } from '../canvas-actions';
import { runCommand } from '../commands';
import { useApp } from '../store';
import { sampleInputs } from './editor-model';
import { agentSeen, notSeenWords, runOfSession } from './run-model';
import { WhereFields, proposedFolder, type Where } from '../environment/WhereFields';
import { ScreenHead } from '../ui';

/** How a repository workflow is told apart from one of the owner's in the list of choices. */
const REPO = 'repo:';

/**
 * "Run workflow…": choose a workflow, fill in what it asks for, read what the
 * agent will be told, start. On a terminal that is there already, or on a
 * new Claude Code session that is told about the run in its first prompt.
 */
export function RunDialog() {
  const starting = useApp((s) => s.startingRun);
  const workflows = useApp((s) => s.app?.workflows);
  const sessions = useApp((s) => s.app?.sessions);
  /** The terminal chosen in the dialog; `undefined` until chosen, then it is the one the dialog was opened with. */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const pickedId = picked === undefined ? (starting?.sessionId ?? null) : picked;
  const session = useApp((s) => (pickedId ? (s.app?.sessions.find((x) => x.id === pickedId) ?? null) : null));
  const existing = useApp((s) => (pickedId ? runOfSession(s.app, pickedId) : null));
  const shelf = useApp((s) => s.app?.shelf);
  const [elementId, setElementId] = useState<string | null>(null);
  // One element by itself: the one named, or the one chosen here when none was.
  const shelfItem = starting?.elementId !== undefined ? ((shelf ?? []).find((e) => e.id === (elementId ?? starting.elementId)) ?? (starting.elementId === '' ? ([...(shelf ?? [])].sort((a, b) => a.element.name.localeCompare(b.element.name))[0] ?? null) : null)) : null;
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  /** For a run on a new agent session: where that session works. */
  const [where, setWhere] = useState<Where>({ folder: '', kind: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the repository the terminal is in offers, read when the dialog opens. */
  const [offer, setOffer] = useState<RepositoryOffer | null>(null);
  /** The content of the repository workflow that is chosen, as it was accepted. */
  const [fromFile, setFromFile] = useState<{ file: string; content: WorkflowContent } | null>(null);

  const startingSession = pickedId;
  useEffect(() => {
    setOffer(null);
    if (!startingSession) return;
    let cancelled = false;
    void api
      .getSessionRepositoryWorkflows(startingSession)
      .then((found) => !cancelled && setOffer(found as RepositoryOffer))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [startingSession]);
  // A repository workflow is chosen as `repo:<file>`: read what it says, for the inputs and the preview.
  const chosenFile = workflowId?.startsWith(REPO) ? workflowId.slice(REPO.length) : null;
  const offerRoot = offer?.root ?? null;
  useEffect(() => {
    setFromFile(null);
    if (!chosenFile || !offerRoot) return;
    let cancelled = false;
    void api
      .getRepositoryWorkflow(offerRoot, chosenFile)
      .then((detail) => !cancelled && detail.content && setFromFile({ file: chosenFile, content: detail.content as WorkflowContent }))
      .catch((e: unknown) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [chosenFile, offerRoot]);

  const list = useMemo(() => [...(workflows ?? [])].filter((w) => w.listed).sort((a, b) => a.name.localeCompare(b.name)), [workflows]);
  useEffect(() => {
    if (!starting) return;
    setPicked(undefined);
    setWorkflowId(starting.workflowId ?? null);
    setElementId(null);
    setInputs({});
    setReplace(false);
    setError(null);
    setBusy(false);
    setWhere({ folder: proposedFolder(), kind: null });
  }, [starting]);

  // With no workflows of the owner's own, the first one the repository offers that can be run is chosen.
  const firstAccepted = (offer?.workflows ?? []).find((w) => w.state === 'accepted' && w.name !== null)?.file ?? null;
  useEffect(() => {
    if (starting && starting.elementId === undefined && workflowId === null && list.length === 0 && firstAccepted) setWorkflowId(`${REPO}${firstAccepted}`);
  }, [starting, workflowId, list.length, firstAccepted]);

  if (!starting) return null;
  const close = (): void => useApp.getState().startRun(null);
  const alone = starting.elementId !== undefined;
  const offered = (offer?.workflows ?? []).filter((w) => w.name !== null);
  const toReview = offered.filter((w) => w.state !== 'accepted').length;
  const workflow = alone || chosenFile ? null : (list.find((w) => w.id === workflowId) ?? list[0] ?? null);
  // One element by itself is shown, and asked about, as the workflow of one that it will be run as.
  const aloneVersion = shelfItem ? versionOfProposal({ workflow: null, element: shelfItem.element }) : null;
  const usesTask = shelfItem ? `${shelfItem.element.instructions}\n${shelfItem.element.doneWhen}`.includes('{{task}}') : false;
  const version = alone ? (aloneVersion ? { ...aloneVersion, inputs: usesTask ? aloneVersion.inputs.map((i) => ({ ...i, required: true })) : [] } : null) : chosenFile ? (fromFile ? { ...fromFile.content, number: 1, createdAt: '' } : null) : workflow ? latestVersion(workflow) : null;
  const needs = version ? needsOf(version.elements) : [];
  const given = version ? Object.fromEntries(version.inputs.flatMap((input) => ((inputs[input.key] ?? '').trim() ? [[input.key, (inputs[input.key] as string).trim()]] : []))) : {};
  const problems = version ? inputProblems(version, given) : [];
  // The first field that is needed and still empty: said by its name on the form, not by its key.
  const missing = version?.inputs.find((input) => input.required && (given[input.key] ?? '').trim() === '');
  const onNewAgent = pickedId === null;
  const terminals = (sessions ?? []).filter((x) => x.state !== 'exited' || x.id === pickedId).sort((a, b) => a.name.localeCompare(b.name));
  const seen = terminals.filter((x) => agentSeen(x));
  const notSeen = terminals.filter((x) => !agentSeen(x));
  const noAgentWords = session && !onNewAgent ? notSeenWords(session) : null;
  const pickTerminal = (id: string | null): void => {
    setPicked(id);
    setReplace(false);
    // A workflow from a repository belongs to the repository of the terminal it was offered for.
    if (workflowId?.startsWith(REPO)) setWorkflowId(null);
  };
  const blockedByRun = existing !== null && !replace;

  const start = async (): Promise<void> => {
    if (!version || (!workflow && !shelfItem && !fromFile)) return;
    setBusy(true);
    setError(null);
    try {
      let sessionId = pickedId;
      if (sessionId === null) {
        // A new agent session is told about the run in its first prompt; nothing needs typing afterwards.
        const folder = where.folder.trim();
        sessionId = (await canvasActions.get()?.addTerminal('claude-code', [kickoffLine()], undefined, { ...(folder ? { cwd: folder } : {}), ...(where.kind ? { environment: where.kind } : {}) })) ?? null;
        if (sessionId === null) throw new Error('The terminal could not be started.');
      }
      const started = fromFile && chosenFile
        ? await api.runRepositoryWorkflow(sessionId, { file: fromFile.file, inputs: given, replace, kickoff: !onNewAgent })
        : shelfItem
        ? await api.runElement(shelfItem.id, { sessionId, inputs: given, replace, kickoff: !onNewAgent })
        : await api.startRun(sessionId, { workflowId: (workflow as { id: string }).id, inputs: given, replace, kickoff: !onNewAgent });
      const store = useApp.getState();
      store.apply({ type: 'run.started', run: started.run as never });
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
        <ScreenHead title={<>{alone ? `Run “${shelfItem?.element.name ?? 'a step'}” by itself${onNewAgent ? ' on a new Claude Code terminal' : ` on “${session?.name ?? 'this terminal'}”`}` : onNewAgent ? 'New Claude Code terminal on a workflow' : `Run a workflow on “${session?.name ?? 'this terminal'}”`}</>} onClose={close} />

        {!alone && list.length === 0 && offered.length === 0 ? (
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
          version && (
            <>
              <div className="run-dialog-grid">
                <div className="run-dialog-form">
                  <label className="wf-field">
                    <span>Terminal</span>
                    <select value={pickedId ?? ''} onChange={(e) => pickTerminal(e.target.value || null)} data-testid="run-terminal">
                      <option value="">A new Claude Code terminal</option>
                      {seen.length > 0 && (
                        <optgroup label="An agent is seen">
                          {seen.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {notSeen.length > 0 && (
                        <optgroup label="No agent seen">
                          {notSeen.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  {!alone && (
                    <>
                      <label className="wf-field">
                        <span>Workflow</span>
                        <select value={chosenFile ? `${REPO}${chosenFile}` : (workflow?.id ?? '')} onChange={(e) => setWorkflowId(e.target.value)} autoFocus data-testid="run-workflow">
                          {list.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                          {offered.length > 0 && (
                            <optgroup label={`From the repository ${offer?.folder ?? ''}`}>
                              {offered.map((w) => (
                                // Only content you accepted can be run; the rest is listed so that you know it is there.
                                <option key={w.file} value={`${REPO}${w.file}`} disabled={w.state !== 'accepted'}>
                                  {w.name}
                                  {w.state === 'accepted' ? '' : w.state === 'changed' ? ' (changed: review it again first)' : ' (review it first)'}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </label>
                      {toReview > 0 && (
                        <p className="sheet-note" data-testid="run-to-review">
                          {toReview === 1 ? 'One workflow' : `${toReview} workflows`} from the repository cannot be run until you have read {toReview === 1 ? 'it' : 'them'}.{' '}
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => {
                              close();
                              runCommand('drafts.review');
                            }}
                          >
                            Review…
                          </button>
                        </p>
                      )}
                      <p className="sheet-note">{version.elements.map((e) => e.name).join(' → ')}</p>
                    </>
                  )}
                  {alone && starting.elementId === '' && shelfItem && (
                    <label className="wf-field">
                      <span>Step</span>
                      <select value={shelfItem.id} onChange={(e) => setElementId(e.target.value)} autoFocus data-testid="run-element">
                        {[...(shelf ?? [])]
                          .sort((a, b) => a.element.name.localeCompare(b.element.name))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.element.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {needs.length > 0 && (
                    <p className="run-needs" data-testid="run-needs">
                      <span className="wf-label">Whoever does this needs</span>
                      <NeedMarks needs={needs} sessionId={pickedId} isAgent={session?.agent != null} />
                    </p>
                  )}
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
                  {onNewAgent && <WhereFields where={where} onChange={setWhere} />}
                  {existing && (
                    <label className="wf-check">
                      <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                      <span>This terminal is already on a run. Stop that run and start this one.</span>
                    </label>
                  )}
                  {noAgentWords && (
                    <p className="sheet-note" data-testid="run-no-agent">
                      {noAgentWords} Or start the run here and give the agent the line shown with it.{' '}
                      <button type="button" className="quiet" onClick={() => pickTerminal(null)} data-testid="run-use-new">
                        Use a new Claude Code terminal
                      </button>
                    </p>
                  )}
                </div>
                <details className="ui-fold run-dialog-preview" data-testid="run-preview-fold">
                  <summary>
                    What the agent will be told first <span className="ui-meta">read it before you start, if you like</span>
                  </summary>
                  <pre data-testid="run-preview">{previewRun(version, sampleInputs(version.inputs, given))}</pre>
                </details>
              </div>
              {error && <p className="dialog-error">{error}</p>}
              <div className="dialog-actions">
                {problems.length > 0 && <span className="sheet-note run-dialog-problem" title={problems[0]}>{missing ? `Fill in “${missing.label}” to start.` : problems[0]}</span>}
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={() => void start()} disabled={busy || problems.length > 0 || blockedByRun} title={problems[0] ?? (blockedByRun ? 'This terminal is on a run already.' : undefined)} aria-busy={busy || undefined} data-testid="run-start">
                  {onNewAgent ? 'Start the terminal and the run' : 'Start'}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
