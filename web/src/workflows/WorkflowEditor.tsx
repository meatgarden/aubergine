import { useEffect, useMemo, useState } from 'react';
import { copyStatus, elementIdFor, elementKind, elementKindNames, latestVersion, previewRun, sourceOf, waitsForPerson, type Element } from '@aubergine/shared';
import { api } from '../api';
import { runCommand } from '../commands';
import { useApp } from '../store';
import { addElement, addInput, changeElement, draftOf, draftProblems, moveElement, removeElement, sameDraft, sampleInputs, versionOfDraft, type Draft } from './editor-model';
import { CopyMark, CopyPanel, ElementReference } from './CopyPanel';
import { ElementFields } from './ElementFields';
import { MenuButton, MenuItem } from '../ui';

/**
 * The editor of one workflow: its name, what holds for every element, what a
 * run is given, and the elements in order. Beside it, what an agent will be
 * told on the element being edited: the very text a run prints.
 */
export function WorkflowEditor() {
  const workflowId = useApp((s) => s.editingWorkflow);
  const workflow = useApp((s) => (workflowId ? (s.app?.workflows.find((w) => w.id === workflowId) ?? null) : null));
  const limits = useApp((s) => s.settings.workflows);
  const shelfItems = useApp((s) => s.app?.shelf);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [replaceFile, setReplaceFile] = useState(false);

  const version = workflow ? latestVersion(workflow) : null;
  // A fresh draft when another workflow is opened, and when this one is first known.
  useEffect(() => {
    setDraft(version ? draftOf(version) : null);
    setSelected(version?.elements[0]?.id ?? null);
    setSaved(null);
    setError(null);
    setLeaving(false);
    setTyped({});
  }, [workflowId, version === null]); // eslint-disable-line react-hooks/exhaustive-deps -- not on every save: the draft is what is being edited

  const shelf = useMemo(() => [...(shelfItems ?? [])].sort((a, b) => a.element.name.localeCompare(b.element.name)), [shelfItems]);
  // A retired element is not offered when inserting.
  const offered = useMemo(() => shelf.filter((item) => item.state === 'current'), [shelf]);
  const problems = useMemo(() => (draft ? draftProblems(draft, limits) : []), [draft, limits]);

  if (!workflowId) return null;
  const close = (): void => useApp.getState().editWorkflow(null);
  if (!workflow || !version || !draft) {
    return (
      <div className="dialog-backdrop">
        <div className="dialog" role="dialog" aria-label="Workflow">
          <p>Loading…</p>
          <div className="dialog-actions">
            <button type="button" className="quiet" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const changed = !sameDraft(draft, draftOf(version));
  const change = (next: Draft): void => {
    setDraft(next);
    setSaved(null);
  };
  const tryClose = (): void => (changed && !leaving ? setLeaving(true) : close());
  const element = draft.elements.find((e) => e.id === selected) ?? draft.elements[0] ?? null;
  const preview = element && problems.length === 0 ? previewRun(versionOfDraft(draft), sampleInputs(draft.inputs, typed), element.id) : null;

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.updateWorkflow(workflow.id, draft);
      setSaved(`Saved as version ${result.version}. Runs already going keep to the version they started on.`);
      setLeaving(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Writes the saved workflow into the repository of the terminal that is selected. Only ever when this button is pressed. */
  const saveToRepository = async (overwrite: boolean): Promise<void> => {
    const state = useApp.getState();
    const sessionId = state.focus?.sessionId ?? state.selected;
    setError(null);
    setReplaceFile(false);
    if (!sessionId) {
      setError('Select a terminal first: the file goes into the repository that terminal is in.');
      return;
    }
    try {
      const written = await api.saveToRepository(sessionId, workflow.id, overwrite);
      setSaved(`${written.overwritten ? 'Replaced' : 'Wrote'} ${written.path}. It is not committed: that is yours to do.`);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      // A file of that name is there: nothing was written. Replacing it is a second, deliberate press.
      if (message.includes('already a file')) setReplaceFile(true);
    }
  };

  /** A copy of a saved step, with where it came from and from which version, put at a place in the list. */
  const insertSaved = (shelfId: string, at: number): void => {
    const item = offered.find((entry) => entry.id === shelfId);
    if (!item) return;
    const id = elementIdFor(item.element.name, draft.elements.map((el) => el.id));
    change({ ...draft, elements: [...draft.elements.slice(0, at), { ...item.element, id, origin: { kind: 'shelf', shelfId: item.id }, source: sourceOf(item) }, ...draft.elements.slice(at)] });
    setSelected(id);
  };

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          tryClose();
        }
      }}
    >
      <div className="dialog sheet workflow-editor" role="dialog" aria-label={`Workflow ${workflow.name}`} data-testid="workflow-editor">
        <header className="sheet-head">
          <div>
            <h2>Edit workflow</h2>
            <p className="ui-meta">Version {version.number}. Saving makes a new version; runs that are going keep the one they started on.</p>
          </div>
          <span className="ui-head-actions">
            <MenuButton more label="More for this workflow" testid="workflow-editor-more">
              <MenuItem
                disabled={changed}
                hint={changed ? 'Save first.' : 'Start a run of this workflow.'}
                onClick={() => {
                  close();
                  useApp.getState().startRun({ sessionId: useApp.getState().focus?.sessionId ?? useApp.getState().selected ?? null, workflowId: workflow.id });
                }}
              >
                Run…
              </MenuItem>
              <MenuItem disabled={changed} hint={changed ? 'Save first.' : 'Write it as a file into .aubergine/workflows of the repository the selected terminal is in, to share it through Git.'} onClick={() => void saveToRepository(false)} data-testid="save-to-repository">
                Save to the repository…
              </MenuItem>
              <MenuItem onClick={() => runCommand('workflows.open')}>All workflows…</MenuItem>
            </MenuButton>
            <button type="button" className="quiet" onClick={tryClose} data-testid="editor-close">
              Close
            </button>
          </span>
        </header>

        <div className="editor-column">
          <label className="wf-field">
            <span>Name</span>
            <input value={draft.name} maxLength={120} onChange={(e) => change({ ...draft, name: e.target.value })} data-testid="workflow-name" />
          </label>
          <details className="ui-fold" data-testid="workflow-more-about">
            <summary>
              More about this workflow{' '}
              <span className="ui-meta">
                {draft.description.trim() ? 'described' : 'no description'} · {draft.inputs.length} {draft.inputs.length === 1 ? 'thing' : 'things'} a run is given{draft.standing.trim() ? ' · rules for every step' : ''}
              </span>
            </summary>
            <label className="wf-field">
              <span>What it is for</span>
              <input value={draft.description} maxLength={2000} onChange={(e) => change({ ...draft, description: e.target.value })} />
            </label>
            <label className="wf-field">
              <span>For every step</span>
              <textarea rows={3} value={draft.standing} placeholder="Rules that hold from start to finish. Added to what the agent is told on every step." onChange={(e) => change({ ...draft, standing: e.target.value })} data-testid="workflow-standing" />
            </label>

            <div className="wf-label">
              What a run is given <span className="sheet-note">write {'{{key}}'} in any text to use it</span>
            </div>
            <ul className="editor-inputs">
              {draft.inputs.map((input, index) => (
                <li key={index}>
                  <input aria-label="Key" value={input.key} maxLength={40} onChange={(e) => change({ ...draft, inputs: draft.inputs.map((i, n) => (n === index ? { ...i, key: e.target.value } : i)) })} />
                  <input aria-label="Label" value={input.label} maxLength={120} onChange={(e) => change({ ...draft, inputs: draft.inputs.map((i, n) => (n === index ? { ...i, label: e.target.value } : i)) })} />
                  <label className="wf-check">
                    <input type="checkbox" checked={input.required} onChange={(e) => change({ ...draft, inputs: draft.inputs.map((i, n) => (n === index ? { ...i, required: e.target.checked } : i)) })} />
                    <span>needed</span>
                  </label>
                  <button type="button" className="quiet" aria-label={`Remove the input ${input.label}`} onClick={() => change({ ...draft, inputs: draft.inputs.filter((_, n) => n !== index) })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="quiet" onClick={() => change(addInput(draft))}>
              + Input
            </button>

          </details>

          <h3>
            Steps <span className="ui-meta">in the order an agent goes through them; press one to change it</span>
          </h3>
            <ol className="editor-elements" data-testid="editor-elements">
              {draft.elements.map((item, index) => (
                <li
                  key={item.id}
                  className={`editor-element${item.id === element?.id ? ' is-selected' : ''}${dragging === index ? ' is-dragging' : ''}`}
                  draggable
                  data-testid="editor-element"
                  data-element={item.id}
                  onDragStart={(e) => {
                    setDragging(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.id);
                  }}
                  onDragOver={(e) => {
                    if (dragging === null) return;
                    e.preventDefault();
                    // The list rearranges under the pointer, so what is seen is what will be saved.
                    if (dragging !== index) {
                      change(moveElement(draft, dragging, index));
                      setDragging(index);
                    }
                  }}
                  onDrop={(e) => e.preventDefault()}
                  onDragEnd={() => setDragging(null)}
                >
                  <div className="editor-step-head">
                    <span className="editor-grip" aria-hidden="true" title="Drag to move this step">
                      ⠿
                    </span>
                    <button type="button" className="editor-element-name" aria-expanded={item.id === selected} title={item.id === selected ? undefined : 'Open this step to change it'} onClick={() => setSelected(item.id)}>
                      {index + 1}. {item.name || '(no name)'}
                    </button>
                    <CopyMark element={item} shelf={shelf} />
                    <MenuButton more label={`More for step ${index + 1}, ${item.name}`} testid="element-more">
                      <MenuItem aria-label={`Move ${item.name} up`} disabled={index === 0} onClick={() => change(moveElement(draft, index, index - 1))} data-testid="element-up">
                        Move up
                      </MenuItem>
                      <MenuItem aria-label={`Move ${item.name} down`} disabled={index === draft.elements.length - 1} onClick={() => change(moveElement(draft, index, index + 1))} data-testid="element-down">
                        Move down
                      </MenuItem>
                      {offered.length > 0 && (
                        <label className="ui-menu-line">
                          <span>Insert a saved step before</span>
                          <select aria-label={`Insert a saved step before ${item.name}`} value="" onChange={(e) => insertSaved(e.target.value, index)} data-testid="insert-before">
                            <option value="">Choose…</option>
                            {offered.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.element.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <MenuItem
                        onClick={() => {
                          const id = elementIdFor(item.name, draft.elements.map((el) => el.id));
                          change({ ...draft, elements: [...draft.elements.slice(0, index + 1), { ...item, id }, ...draft.elements.slice(index + 1)] });
                          setSelected(id);
                        }}
                        data-testid="element-duplicate"
                      >
                        Duplicate
                      </MenuItem>
                      <MenuItem
                        aria-label={`Remove ${item.name}`}
                        disabled={draft.elements.length === 1}
                        onClick={() => {
                          change(removeElement(draft, item.id));
                          if (selected === item.id) setSelected(null);
                        }}
                        data-testid="element-remove"
                      >
                        Remove
                      </MenuItem>
                    </MenuButton>
                  </div>
                  {/* Open: changed in place, under its own name. */}
                  {item.id === selected && element && (
                    <div className="editor-step-body" draggable onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <CopyPanel
                      element={element}
                      shelf={shelf}
                      onDecide={(next, said) => {
                        change(changeElement(draft, element.id, next));
                        setSaved(said);
                      }}
                    />
                    <ElementFields element={element} onChange={(next: Element) => change(changeElement(draft, element.id, next))} />
                    <ElementReference />
                    <div className="editor-row">
                      <button
                        type="button"
                        className="quiet"
                        title="Keep a copy of this step among the saved steps, to use in other workflows or to run by itself"
                        onClick={() => {
                          const { id: _id, origin: _origin, extra: _extra, source: _source, ...fields } = element;
                          void api
                            .createElement(fields)
                            .then((saved) => {
                              useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
                              setSaved(`“${element.name}” is among the saved steps.`);
                            })
                            .catch((e: unknown) => setError((e as Error).message));
                        }}
                        data-testid="save-to-shelf"
                      >
                        {copyStatus(element, shelf).shelf ? 'Save as a new saved step' : 'Save among the saved steps'}
                      </button>
                      {(() => {
                        // An element that came from the shelf can go back to it as a new version of what it came from.
                        const from = copyStatus(element, shelf).shelf;
                        if (!from) return null;
                        return (
                          <button
                            type="button"
                            className="quiet"
                            title={`Save what this step says now as version ${from.version + 1} of “${from.element.name}” among the saved steps. Other workflows that hold a copy are not changed; they will say a newer version is there.`}
                            onClick={() => {
                              const { id: _id, origin: _origin, extra: _extra, source: _source, ...fields } = element;
                              void api
                                .updateElement(from.id, { ...fields, note: `From the workflow “${draft.name}”`.slice(0, 200) })
                                .then((saved) => {
                                  useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
                                  // This copy is now an unchanged copy of the version just made.
                                  change(changeElement(draft, element.id, { ...element, source: sourceOf(saved as never) }));
                                  setSaved(`Saved as version ${saved.version} of “${saved.element.name}” among the saved steps.`);
                                })
                                .catch((e: unknown) => setError((e as Error).message));
                            }}
                            data-testid="save-as-version"
                          >
                            Save to shelf as a new version of “{from.element.name}”
                          </button>
                        );
                      })()}
                    </div>
                    <div className="wf-label">
                      What an agent will be told on this step
                      {draft.inputs.slice(0, 1).map((input) => (
                        <input key={input.key} className="editor-sample" aria-label={`A sample ${input.label}`} placeholder={`try a ${input.label.toLowerCase()}`} value={typed[input.key] ?? ''} onChange={(e) => setTyped({ ...typed, [input.key]: e.target.value })} />
                      ))}
                    </div>
                    <pre className="editor-preview" data-testid="editor-preview">
                      {preview ?? 'Fix what is listed below to see this.'}
                    </pre>

                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="editor-add">
              <button
                type="button"
                onClick={() => {
                  const next = addElement(draft);
                  change(next);
                  setSelected(next.elements.at(-1)?.id ?? null);
                }}
                data-testid="element-add"
              >
                Add a step
              </button>
              {/* Every other kind there is, by what it is called: no kind is named here. */}
              {elementKindNames()
                .filter((kind) => waitsForPerson(kind))
                .map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="quiet"
                    title="A place where the run stops until you have approved it or sent it back"
                    onClick={() => {
                      const next = addElement(draft, elementKind(kind)?.title ?? kind, kind);
                      change(next);
                      setSelected(next.elements.at(-1)?.id ?? null);
                    }}
                    data-testid={`element-add-${kind}`}
                  >
                    Add {(elementKind(kind)?.title ?? kind).toLowerCase()}
                  </button>
                ))}
              {offered.length > 0 && (
                <select
                  className="editor-insert"
                  aria-label="Add a saved step"
                  value=""
                  onChange={(e) => insertSaved(e.target.value, draft.elements.length)}
                  data-testid="insert-from-shelf"
                >
                  <option value="">Add a saved step…</option>
                  {offered.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.element.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
        </div>

        {problems.length > 0 && (
          <ul className="editor-problems" data-testid="editor-problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {error && <p className="dialog-error">{error}</p>}
        {replaceFile && (
          <p className="editor-repository">
            <button type="button" className="danger" onClick={() => void saveToRepository(true)} data-testid="replace-in-repository">
              Replace the file in the repository
            </button>
          </p>
        )}
        <div className="dialog-actions">
          <span className="sheet-note editor-saved" data-testid="editor-saved">
            {leaving ? 'There are changes that are not saved.' : (saved ?? (changed ? 'Not saved yet. Saving makes a new version.' : ''))}
          </span>
          {leaving && (
            <button type="button" className="danger" onClick={close}>
              Close without saving
            </button>
          )}
          <button type="button" onClick={tryClose} data-testid="editor-cancel">
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy || !changed || problems.length > 0} data-testid="editor-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
