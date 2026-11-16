import { useEffect, useMemo, useState } from 'react';
import { copyStatus, elementIdFor, elementKind, elementKindNames, latestVersion, previewRun, sourceOf, waitsForPerson, type Element } from '@aubergine/shared';
import { api } from '../api';
import { runCommand } from '../commands';
import { useApp } from '../store';
import { addElement, addInput, changeElement, draftOf, draftProblems, moveElement, removeElement, sameDraft, sampleInputs, versionOfDraft, type Draft } from './editor-model';
import { CopyMark, CopyPanel, ElementReference } from './CopyPanel';
import { ElementFields } from './ElementFields';

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
          <h2>
            Workflow <span className="sheet-note">version {version.number}</span>
          </h2>
          <span>
            <button
              type="button"
              className="quiet"
              disabled={changed}
              title={changed ? 'Save first' : 'Start a run of this workflow'}
              onClick={() => {
                close();
                useApp.getState().startRun({ sessionId: useApp.getState().focus?.sessionId ?? useApp.getState().selected ?? null, workflowId: workflow.id });
              }}
            >
              Run…
            </button>
            <button
              type="button"
              className="quiet"
              disabled={changed}
              title={changed ? 'Save first' : 'Write this workflow as a file into .aubergine/workflows of the repository the selected terminal is in, to share it through Git'}
              onClick={() => void saveToRepository(false)}
              data-testid="save-to-repository"
            >
              Save to the repository…
            </button>
            <button type="button" className="quiet" onClick={() => runCommand('workflows.open')}>
              All workflows…
            </button>
            <button type="button" className="quiet" onClick={tryClose} data-testid="editor-close">
              Close
            </button>
          </span>
        </header>

        <div className="editor-grid">
          <div className="editor-form">
            <label className="wf-field">
              <span>Name</span>
              <input value={draft.name} maxLength={120} onChange={(e) => change({ ...draft, name: e.target.value })} data-testid="workflow-name" />
            </label>
            <label className="wf-field">
              <span>What it is for</span>
              <input value={draft.description} maxLength={2000} onChange={(e) => change({ ...draft, description: e.target.value })} />
            </label>
            <label className="wf-field">
              <span>For every element</span>
              <textarea rows={3} value={draft.standing} placeholder="Rules that hold from start to finish. Added to what the agent is told on every element." onChange={(e) => change({ ...draft, standing: e.target.value })} data-testid="workflow-standing" />
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

            <div className="wf-label">
              Elements <span className="sheet-note">drag to reorder</span>
            </div>
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
                  <span className="editor-grip" aria-hidden="true">
                    ⠿
                  </span>
                  <button type="button" className="editor-element-name" aria-pressed={item.id === element?.id} onClick={() => setSelected(item.id)}>
                    {index + 1}. {item.name || '(no name)'}
                  </button>
                  <CopyMark element={item} shelf={shelf} />
                  <button type="button" className="quiet" aria-label={`Move ${item.name} up`} disabled={index === 0} onClick={() => change(moveElement(draft, index, index - 1))} data-testid="element-up">
                    ↑
                  </button>
                  <button type="button" className="quiet" aria-label={`Move ${item.name} down`} disabled={index === draft.elements.length - 1} onClick={() => change(moveElement(draft, index, index + 1))} data-testid="element-down">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    aria-label={`Remove ${item.name}`}
                    disabled={draft.elements.length === 1}
                    onClick={() => {
                      change(removeElement(draft, item.id));
                      if (selected === item.id) setSelected(null);
                    }}
                    data-testid="element-remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                const next = addElement(draft);
                change(next);
                setSelected(next.elements.at(-1)?.id ?? null);
              }}
              data-testid="element-add"
            >
              + Element
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
                  + {elementKind(kind)?.title ?? kind}
                </button>
              ))}
            {offered.length > 0 && (
              <select
                className="editor-insert"
                aria-label="Insert from shelf"
                value=""
                onChange={(e) => {
                  const item = offered.find((entry) => entry.id === e.target.value);
                  if (!item) return;
                  // A copy, with where it came from and from which version: changing the shelf later does not change this
                  // workflow, and the editor can say when the shelf has moved on.
                  const id = elementIdFor(item.element.name, draft.elements.map((el) => el.id));
                  change({ ...draft, elements: [...draft.elements, { ...item.element, id, origin: { kind: 'shelf', shelfId: item.id }, source: sourceOf(item) }] });
                  setSelected(id);
                }}
                data-testid="insert-from-shelf"
              >
                <option value="">Insert from shelf…</option>
                {offered.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.element.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="editor-detail">
            {element && (
              <>
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
                    title="Keep a copy of this element on the shelf, to use in other workflows or to run by itself"
                    onClick={() => {
                      const { id: _id, origin: _origin, extra: _extra, source: _source, ...fields } = element;
                      void api
                        .createElement(fields)
                        .then((saved) => {
                          useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
                          setSaved(`“${element.name}” is on the shelf.`);
                        })
                        .catch((e: unknown) => setError((e as Error).message));
                    }}
                    data-testid="save-to-shelf"
                  >
                    {copyStatus(element, shelf).shelf ? 'Save to shelf as a new element' : 'Save to shelf'}
                  </button>
                  {(() => {
                    // An element that came from the shelf can go back to it as a new version of what it came from.
                    const from = copyStatus(element, shelf).shelf;
                    if (!from) return null;
                    return (
                      <button
                        type="button"
                        className="quiet"
                        title={`Save what this element says now as version ${from.version + 1} of “${from.element.name}” on the shelf. Other workflows that hold a copy are not changed; they will say a newer version is there.`}
                        onClick={() => {
                          const { id: _id, origin: _origin, extra: _extra, source: _source, ...fields } = element;
                          void api
                            .updateElement(from.id, { ...fields, note: `From the workflow “${draft.name}”`.slice(0, 200) })
                            .then((saved) => {
                              useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
                              // This copy is now an unchanged copy of the version just made.
                              change(changeElement(draft, element.id, { ...element, source: sourceOf(saved as never) }));
                              setSaved(`Saved as version ${saved.version} of “${saved.element.name}” on the shelf.`);
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
                  What an agent will be told on this element
                  {draft.inputs.slice(0, 1).map((input) => (
                    <input key={input.key} className="editor-sample" aria-label={`A sample ${input.label}`} placeholder={`try a ${input.label.toLowerCase()}`} value={typed[input.key] ?? ''} onChange={(e) => setTyped({ ...typed, [input.key]: e.target.value })} />
                  ))}
                </div>
                <pre className="editor-preview" data-testid="editor-preview">
                  {preview ?? 'Fix what is listed below to see this.'}
                </pre>
              </>
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
          <button type="button" onClick={() => void save()} disabled={busy || !changed || problems.length > 0} data-testid="editor-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
