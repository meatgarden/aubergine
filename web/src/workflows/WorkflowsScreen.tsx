import { useEffect, useState } from 'react';
import { latestVersion, needWords, usesOf, type Workflow, type WorkflowTemplate } from '@aubergine/shared';
import { runCommand } from '../commands';
import { api } from '../api';
import { useApp } from '../store';
import { toReadWords } from '../review/to-read';
import { Banner, EmptyState, FirstSteps, HowThisWorks, MenuButton, MenuItem, Page, Tabs } from '../ui';
import { PageFlow } from '../page-flow';

/**
 * The workflows there are: make one from a template, change, duplicate,
 * remove, or start one from here.
 */
export function WorkflowsScreen() {
  const open = useApp((s) => s.page === 'workflows');
  const workflows = useApp((s) => s.app?.workflows);
  const runs = useApp((s) => s.app?.runs);
  const shelf = useApp((s) => s.app?.shelf);
  const drafts = useApp((s) => s.app?.drafts);
  const [removingElement, setRemovingElement] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [part, setPart] = useState<'workflows' | 'steps'>('workflows');

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
  const close = (): void => useApp.getState().showPage(null);
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

  const current = shelfList.filter((item) => item.state === 'current');
  const retired = shelfList.filter((item) => item.state === 'retired');
  const usedIn = (shelfId: string): number => usesOf(shelfId, workflows ?? [], shelf ?? []).length;
  const emptyWorkflow = (): Promise<void> => make(() => api.createWorkflow({ name: 'New workflow', elements: [{ name: 'First step', instructions: 'The task: {{task}}\n\nSay here what to do.' }] }));
  const runHere = (what: { workflowId?: string; elementId?: string }): void => {
    const state = useApp.getState();
    state.togglePanel(null);
    state.startRun({ sessionId: state.focus?.sessionId ?? state.selected ?? null, ...what });
  };
  /** A saved step as a card: pressed as a whole it opens; Run is its action; the rest is in its menu. */
  const stepCards = (items: typeof shelfList) => (
    <ul className="ui-cards">
      {items.map((item) => (
        <li key={item.id} className="ui-card is-pressed" role="button" tabIndex={0} onClick={() => useApp.getState().editElement(item.id)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && useApp.getState().editElement(item.id)} data-testid="shelf-row" data-element={item.element.name}>
          <div className="ui-card-text">
            <strong>{item.element.name}</strong>
            <div className="ui-meta">
              {item.state === 'retired' ? `retired${item.replacedBy ? `: use “${shelfList.find((o) => o.id === item.replacedBy)?.element.name ?? 'another'}”` : ''} · ` : ''}
              version {item.version} · {usedIn(item.id) > 0 ? `in ${usedIn(item.id)} workflow${usedIn(item.id) === 1 ? '' : 's'} · ` : ''}
              {item.element.produces !== 'note' ? `produces a ${item.element.produces}` : 'produces a note'}
              {item.element.needs.length > 0 ? ` · needs ${item.element.needs.map(needWords).join('; ')}` : ''}
            </div>
            {removingElement === item.id && (
              <div className="ui-card-confirm" onClick={(e) => e.stopPropagation()}>
                {usedIn(item.id) > 0 && (
                  <span className="ui-meta" data-testid="shelf-remove-used">
                    {usedIn(item.id) === 1 ? 'A workflow holds' : `${usedIn(item.id)} workflows hold`} a copy. The copies stay as they are and will say that their source was removed. To keep it out of new workflows only, retire it instead.
                  </span>
                )}
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
                <button type="button" className="quiet" onClick={() => setRemovingElement(null)}>
                  Keep it
                </button>
              </div>
            )}
          </div>
          <span className="ui-card-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => runHere({ elementId: item.id })} disabled={item.state === 'retired'} title={item.state === 'retired' ? 'A retired step is not run by itself' : undefined} data-testid="shelf-run">
              Run…
            </button>
            <MenuButton more label={`More for ${item.element.name}`} testid="shelf-more">
              <MenuItem onClick={() => useApp.getState().editElement(item.id)} data-testid="shelf-edit">
                Edit
              </MenuItem>
              <MenuItem disabled={busy} onClick={() => void attempt(() => api.copyElement(item.id))}>
                Duplicate
              </MenuItem>
              <MenuItem onClick={() => setRemovingElement(item.id)}>Remove…</MenuItem>
            </MenuButton>
          </span>
        </li>
      ))}
    </ul>
  );
  const templateCards = (
    <ul className="ui-cards">
      {templates.map((template) => (
        <li key={template.name} className="ui-card">
          <div className="ui-card-text">
            <strong>{template.title}</strong>
            <div className="ui-meta">{template.description}</div>
            <div className="ui-steps">{template.content.elements.map((e) => e.name).join(' → ')}</div>
          </div>
          <span className="ui-card-actions">
            <button type="button" disabled={busy} onClick={() => void make(() => api.workflowFromTemplate(template.name))} data-testid="template-use" data-template={template.name}>
              Use
            </button>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Page
      name="workflows"
      title="Workflows"
      line="Recipes of steps an agent goes through one at a time. Start one on a terminal, and it runs on the Board."
      flow={<PageFlow here="workflows" />}
      label="Workflows"
      testid="workflows-screen"
      className="workflows-screen"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      tabs={
        <Tabs
          label="What this page shows"
          value={part}
          onChange={setPart}
          tabs={[
            { value: 'workflows', label: `Workflows${list.length > 0 ? ` ${list.length}` : ''}`, testid: 'workflows-tab' },
            { value: 'steps', label: `Saved steps${current.length > 0 ? ` ${current.length}` : ''}`, testid: 'steps-tab' },
          ]}
        />
      }
      actions={
        part === 'workflows' ? (
          <MenuButton kind="primary" label="New workflow" testid="workflow-new" menuTestid="workflow-new-menu">
            <MenuItem hint="Say what it should do; an agent writes it and you read it first." onClick={() => runCommand('workflow.describe')} data-testid="describe-workflow">
              Describe one in words…
            </MenuItem>
            <MenuItem hint="One step to start from." disabled={busy} onClick={() => void emptyWorkflow()} data-testid="workflow-empty">
              Start empty
            </MenuItem>
          </MenuButton>
        ) : (
          <MenuButton kind="primary" label="New step" testid="step-new" menuTestid="step-new-menu">
            <MenuItem hint="Write it yourself." onClick={() => useApp.getState().editElement('new')} data-testid="shelf-new">
              Write one
            </MenuItem>
            <MenuItem hint="Say what it should do; an agent writes it and you read it first." onClick={() => runCommand('element.describe')} data-testid="describe-element">
              Describe one in words…
            </MenuItem>
          </MenuButton>
        )
      }
    >
        {error && <p className="dialog-error">{error}</p>}
        {(drafts ?? []).length > 0 && waiting > 0 && (
          <Banner action="Review" onAction={() => runCommand('drafts.review')} actionTestid="open-review">
            {toReadWords({ agentDrafts: (drafts ?? []).filter((d) => d.status === 'waiting' && d.sessionId !== null).length, programDrafts: (drafts ?? []).filter((d) => d.status === 'waiting' && d.sessionId === null).length, installs: 0, files: 0 })}
            {(drafts ?? []).length > waiting ? ` ${(drafts ?? []).length - waiting} more ${(drafts ?? []).length - waiting === 1 ? 'is' : 'are'} with an agent.` : ''}
          </Banner>
        )}
        {(drafts ?? []).length > 0 && waiting === 0 && (
          <p className="ui-meta">
            {(drafts ?? []).length} asked of an agent, not handed in yet.{' '}
            <button type="button" className="quiet" onClick={() => runCommand('drafts.review')} data-testid="open-review">
              Review
            </button>
          </p>
        )}
        <HowThisWorks line="A run moves by reports, from the agent or from you.">
          The agent reads the current step, does it, reports it done and is given the next. Nothing in a workflow is run by Aubergine; each step is text for whoever does the work, and a person can move a run with the buttons just as well.
        </HowThisWorks>

        {part === 'workflows' && (
          <section data-testid="workflows-part">
            {list.length === 0 ? (
              <>
                <FirstSteps
                  testid="workflows-empty"
                  title="A workflow is a recipe an agent follows, one step at a time."
                  steps={['Make one: from a recipe below, or empty.', 'Start it on a terminal that runs an agent: that is a run.', 'The agent reports each step done and is given the next; watch it on the Board.']}
                  action={
                    templates.some((t) => t.name === 'fix-a-bug') && (
                      <button type="button" disabled={busy} onClick={() => void make(() => api.workflowFromTemplate('fix-a-bug'))} data-testid="workflows-empty-try">
                        Try “Fix a bug”
                      </button>
                    )
                  }
                />
                <h3>Start from one of these</h3>
                {templateCards}
              </>
            ) : (
              <>
                <ul className="ui-cards">
                  {list.map((workflow) => {
                    const version = latestVersion(workflow);
                    const live = liveOf(workflow);
                    return (
                      <li key={workflow.id} className="ui-card is-pressed" role="button" tabIndex={0} onClick={() => useApp.getState().editWorkflow(workflow.id)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && useApp.getState().editWorkflow(workflow.id)} data-testid="workflow-row" data-workflow={workflow.name}>
                        <div className="ui-card-text">
                          <strong>{workflow.name}</strong>
                          <div className="ui-steps">{version.elements.map((e) => e.name).join(' → ')}</div>
                          <div className="ui-meta">
                            version {version.number}
                            {live > 0 ? ` · ${live} ${live === 1 ? 'run' : 'runs'} going` : ''}
                          </div>
                          {removing === workflow.id && (
                            <div className="ui-card-confirm" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() =>
                                  void attempt(async () => {
                                    await api.removeWorkflow(workflow.id);
                                    useApp.getState().apply({ type: 'workflow.removed', workflowId: workflow.id });
                                    useApp.getState().say(`Removed “${workflow.name}”.`);
                                    setRemoving(null);
                                  })
                                }
                                data-testid="workflow-remove-confirm"
                              >
                                Remove for good
                              </button>
                              <button type="button" className="quiet" onClick={() => setRemoving(null)}>
                                Keep it
                              </button>
                            </div>
                          )}
                        </div>
                        <span className="ui-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => runHere({ workflowId: workflow.id })} data-testid="workflow-run">
                            Run…
                          </button>
                          <MenuButton more label={`More for ${workflow.name}`} testid="workflow-more">
                            <MenuItem onClick={() => useApp.getState().editWorkflow(workflow.id)} data-testid="workflow-edit">
                              Edit
                            </MenuItem>
                            <MenuItem disabled={busy} onClick={() => void attempt(() => api.copyWorkflow(workflow.id))} data-testid="workflow-duplicate">
                              Duplicate
                            </MenuItem>
                            <MenuItem onClick={() => setRemoving(workflow.id)} data-testid="workflow-remove">
                              Remove…
                            </MenuItem>
                          </MenuButton>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <details className="ui-fold" data-testid="templates-fold">
                  <summary>Start from a template</summary>
                  {templateCards}
                </details>
              </>
            )}
          </section>
        )}

        {part === 'steps' && (
          <section data-testid="steps-part">
            {current.length === 0 && retired.length === 0 ? (
              <EmptyState
                action={
                  <button type="button" onClick={() => useApp.getState().editElement('new')} data-testid="steps-empty-new">
                    New step
                  </button>
                }
              >
                Steps you save for reuse will be listed here.
              </EmptyState>
            ) : (
              stepCards(current)
            )}
            {retired.length > 0 && (
              <details className="ui-fold shelf-retired" data-testid="shelf-retired-fold">
                <summary>
                  Retired ({retired.length}) <span className="ui-meta">kept, and still working where they are used; not offered when inserting</span>
                </summary>
                {stepCards(retired)}
              </details>
            )}
          </section>
        )}
    </Page>
  );
}
