import { useEffect, useState } from 'react';
import { latestVersion, needWords, type Workflow, type WorkflowTemplate } from '@aubergine/shared';
import { runCommand } from '../commands';
import { api } from '../api';
import { useApp } from '../store';

/**
 * The workflows there are: make one from a template, change, duplicate,
 * remove, or start one from here.
 */
export function WorkflowsScreen() {
  const open = useApp((s) => s.panel === 'workflows');
  const workflows = useApp((s) => s.app?.workflows);
  const runs = useApp((s) => s.app?.runs);
  const shelf = useApp((s) => s.app?.shelf);
  const drafts = useApp((s) => s.app?.drafts);
  const [removingElement, setRemovingElement] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setRemoving(null);
      return;
    }
    void api
      .listWorkflowTemplates()
      .then((page) => setTemplates(page.items as WorkflowTemplate[]))
      .catch((e: unknown) => setError((e as Error).message));
  }, [open]);

  if (!open) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const list = [...(workflows ?? [])].filter((w) => w.listed).sort((a, b) => a.name.localeCompare(b.name));
  const shelfList = [...(shelf ?? [])].sort((a, b) => a.element.name.localeCompare(b.element.name));
  const waiting = (drafts ?? []).filter((d) => d.status === 'waiting').length;
  const liveOf = (workflow: Workflow): number => (runs ?? []).filter((r) => r.workflowId === workflow.id).length;

  const attempt = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** Makes a workflow and opens it in the editor: a template is a starting point. */
  const make = (work: () => Promise<{ id: string }>): Promise<void> =>
    attempt(async () => {
      const made = await work();
      const store = useApp.getState();
      store.togglePanel(null);
      store.editWorkflow(made.id);
    });

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
      <div className="dialog sheet workflows-screen" role="dialog" aria-label="Workflows" data-testid="workflows-screen">
        <header className="sheet-head">
          <h2>Workflows</h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>
        <p className="sheet-note">
          A workflow is a list of elements an agent goes through one at a time: it reads the current one, does it, reports it done and is given the next. Nothing in a
          workflow is run by Aubergine; each element is text for whoever does the work, and a person can move a run with the buttons just as well.
        </p>
        {error && <p className="dialog-error">{error}</p>}
        <div className="workflows-ask">
          <button type="button" onClick={() => runCommand('workflow.describe')} data-testid="describe-workflow">
            Describe a workflow…
          </button>
          <button type="button" onClick={() => runCommand('element.describe')} data-testid="describe-element">
            Describe an element…
          </button>
          <button type="button" className={waiting > 0 ? '' : 'quiet'} onClick={() => runCommand('drafts.review')} data-testid="open-review">
            Review{(drafts ?? []).length > 0 ? ` (${waiting} to read${(drafts ?? []).length > waiting ? `, ${(drafts ?? []).length - waiting} with an agent` : ''})` : ''}
          </button>
        </div>

        <h3>Your workflows</h3>
        {list.length === 0 ? (
          <p className="sheet-note">None yet. Start from a template below.</p>
        ) : (
          <table className="token-table workflow-table">
            <tbody>
              {list.map((workflow) => {
                const version = latestVersion(workflow);
                const live = liveOf(workflow);
                return (
                  <tr key={workflow.id} data-testid="workflow-row" data-workflow={workflow.name}>
                    <td>
                      <strong>{workflow.name}</strong>
                      <div className="sheet-note">{version.elements.map((e) => e.name).join(' → ')}</div>
                    </td>
                    <td className="sheet-note">
                      version {version.number}
                      {live > 0 ? ` · ${live} ${live === 1 ? 'run' : 'runs'} going` : ''}
                    </td>
                    <td className="workflow-actions">
                      <button type="button" onClick={() => useApp.getState().editWorkflow(workflow.id)} data-testid="workflow-edit">
                        Edit
                      </button>
                      <button type="button" className="quiet" disabled={busy} onClick={() => void attempt(() => api.copyWorkflow(workflow.id))} data-testid="workflow-duplicate">
                        Duplicate
                      </button>
                      {removing === workflow.id ? (
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            void attempt(async () => {
                              await api.removeWorkflow(workflow.id);
                              useApp.getState().apply({ type: 'workflow.removed', workflowId: workflow.id });
                              setRemoving(null);
                            })
                          }
                          data-testid="workflow-remove-confirm"
                        >
                          Remove for good
                        </button>
                      ) : (
                        <button type="button" className="quiet" onClick={() => setRemoving(workflow.id)} data-testid="workflow-remove">
                          Remove…
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h3>The shelf</h3>
        <p className="sheet-note">Elements kept for reuse: insert one into a workflow from its editor, or run one by itself.</p>
        {shelfList.length > 0 && (
          <table className="token-table workflow-table">
            <tbody>
              {shelfList.map((item) => (
                <tr key={item.id} data-testid="shelf-row" data-element={item.element.name}>
                  <td>
                    <strong>{item.element.name}</strong>
                    <div className="sheet-note">
                      {item.element.produces !== 'note' ? `produces a ${item.element.produces}` : 'produces a note'}
                      {item.element.needs.length > 0 ? ` · needs ${item.element.needs.map(needWords).join('; ')}` : ''}
                    </div>
                  </td>
                  <td className="workflow-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const state = useApp.getState();
                        state.togglePanel(null);
                        state.startRun({ sessionId: state.focus?.sessionId ?? state.selected ?? null, elementId: item.id });
                      }}
                      data-testid="shelf-run"
                    >
                      Run…
                    </button>
                    <button type="button" className="quiet" onClick={() => useApp.getState().editElement(item.id)} data-testid="shelf-edit">
                      Edit
                    </button>
                    <button type="button" className="quiet" disabled={busy} onClick={() => void attempt(() => api.copyElement(item.id))}>
                      Duplicate
                    </button>
                    {removingElement === item.id ? (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void attempt(async () => {
                            await api.removeElement(item.id);
                            useApp.getState().apply({ type: 'shelf.removed', elementId: item.id });
                            setRemovingElement(null);
                          })
                        }
                      >
                        Take off for good
                      </button>
                    ) : (
                      <button type="button" className="quiet" onClick={() => setRemovingElement(item.id)}>
                        Remove…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="quiet" onClick={() => useApp.getState().editElement('new')} data-testid="shelf-new">
          + New element
        </button>

        <h3>Start from a template</h3>
        <ul className="template-list">
          {templates.map((template) => (
            <li key={template.name}>
              <div>
                <strong>{template.title}</strong>
                <div className="sheet-note">
                  {template.description} {template.content.elements.map((e) => e.name).join(' → ')}
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => void make(() => api.workflowFromTemplate(template.name))} data-testid="template-use" data-template={template.name}>
                Use
              </button>
            </li>
          ))}
          <li>
            <div>
              <strong>An empty workflow</strong>
              <div className="sheet-note">One element to start from.</div>
            </div>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void make(() => api.createWorkflow({ name: 'New workflow', elements: [{ name: 'First element', instructions: 'The task: {{task}}\n\nSay here what to do.' }] }))}
            >
              Create
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
