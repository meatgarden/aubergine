import { useEffect, useState } from 'react';
import { COPY_MARK, ago, previewRun, showControl, validateContent, versionOfProposal, type Element, type ShelfUsage, type ShelfVersion } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { DiffText } from '../review/DiffText';
import { ElementReference } from './CopyPanel';
import { ElementFields } from './ElementFields';

const BLANK: Element = { id: 'new-element', kind: 'instructions', name: 'New step', instructions: '', ask: '', lookAt: '', doneWhen: '', needs: [], produces: 'note', origin: { kind: 'local' }, source: null, extra: {} };

/** One element of the shelf, or a new one: the same fields as in a workflow, beside what an agent would be told. */
export function ShelfEditor() {
  const editing = useApp((s) => s.editingElement);
  const item = useApp((s) => (editing && editing !== 'new' ? (s.app?.shelf.find((e) => e.id === editing) ?? null) : null));
  const limits = useApp((s) => s.settings.workflows);
  const [element, setElement] = useState<Element | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [versions, setVersions] = useState<ShelfVersion[] | null>(null);
  const [usage, setUsage] = useState<ShelfUsage['uses'] | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [replacedBy, setReplacedBy] = useState('');
  const others = useApp((s) => s.app?.shelf);
  const version = item?.version ?? null;

  // Its versions and where it is used: read when it is opened and again when it is saved.
  useEffect(() => {
    setVersions(null);
    setUsage(null);
    setCompare(null);
    if (!editing || editing === 'new') return;
    let cancelled = false;
    void api.elementVersions(editing).then((page) => !cancelled && setVersions(page.items as ShelfVersion[]), () => undefined);
    void api.elementUsage(editing).then((found) => !cancelled && setUsage(found.uses), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [editing, version]);

  useEffect(() => {
    setElement(editing === 'new' ? BLANK : (item?.element ?? null));
    setNote('');
    setError(null);
  }, [editing, item === null]); // eslint-disable-line react-hooks/exhaustive-deps -- a fresh copy when another is opened, not on every save

  if (!editing || !element) return null;
  const close = (): void => useApp.getState().editElement(null);
  const proposal = versionOfProposal({ workflow: null, element });
  const problems = !element.name.trim() ? ['The step needs a name.'] : proposal ? validateContent(proposal, limits) : [];
  const badNeed = element.needs.some((need) => need.name.trim() === '');

  /** Something the owner does to it that is not a new version: retiring it, bringing it back. */
  const act = async (what: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      useApp.getState().apply({ type: 'shelf.changed', item: (await what()) as never });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { id: _id, origin: _origin, extra: _extra, source: _source, ...fields } = element;
      // Saving one that is on the shelf adds a version: what it said before stays, and no copy in a workflow is changed.
      const saved = editing === 'new' ? await api.createElement(fields) : await api.updateElement(editing, { ...fields, ...(note.trim() ? { note: note.trim() } : {}) });
      useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
      useApp.getState().say(`Saved the step “${element.name}”.`);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet workflow-editor" role="dialog" aria-label="Element" data-testid="shelf-editor">
        <header className="sheet-head">
          <h2>
            {editing === 'new' ? 'New step' : 'Saved step'}
            {item && (
              <span className="sheet-note" data-testid="shelf-version">
                {' '}
                version {item.version}
                {item.state === 'retired' ? ' · retired' : ''}
              </span>
            )}
          </h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>
        <div className="editor-grid">
          <div className="editor-form">
            <ElementFields element={element} onChange={setElement} />
            {item && (
              <label className="wf-field">
                <span>What changed, in a line (kept with the new version)</span>
                <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="shelf-note" />
              </label>
            )}
            <ElementReference />
          </div>
          <div className="editor-detail">
            <div className="wf-label">What an agent will be told when it is run by itself</div>
            <pre className="editor-preview" data-testid="shelf-preview">
              {proposal && problems.length === 0 ? previewRun(proposal, { task: '(task)' }) : 'Fix what is listed below to see this.'}
            </pre>
            {item && (
              <>
                <div className="wf-label">Where it is used</div>
                {usage === null ? (
                  <p className="sheet-note">Reading…</p>
                ) : usage.length === 0 ? (
                  <p className="sheet-note" data-testid="shelf-usage-none">
                    No workflow holds a copy of it.
                  </p>
                ) : (
                  <ul className="shelf-usage" data-testid="shelf-usage">
                    {usage.map((use) => (
                      <li key={use.workflowId} data-testid="shelf-use">
                        <button type="button" className="quiet" onClick={() => (close(), useApp.getState().editWorkflow(use.workflowId))}>
                          {showControl(use.workflowName)}
                        </button>{' '}
                        <span className="sheet-note">
                          version {use.workflowVersion}:{' '}
                          {use.copies.length === 0 ? 'only in older versions' : use.copies.map((copy) => `${copy.name} (${COPY_MARK[copy.state]}${copy.copiedVersion ? `, copied from version ${copy.copiedVersion}` : ''})`).join('; ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="sheet-note">Saving here changes no workflow: each copy stays as it is and says that a newer version is saved.</p>

                <div className="wf-label">Versions</div>
                <ul className="shelf-versions" data-testid="shelf-versions">
                  {(versions ?? []).map((v, index) => {
                    const before = versions?.[index + 1];
                    return (
                      <li key={v.version} data-testid="shelf-version-row">
                        <strong>Version {v.version}</strong>{' '}
                        <span className="sheet-note">
                          {ago(v.at, new Date())} ago, by {v.by.kind === 'person' ? 'you' : v.by.kind === 'token' ? `the program “${showControl(v.by.name ?? '')}”` : 'an agent'}
                          {v.note ? `: ${showControl(v.note)}` : ''}
                        </span>
                        {before && (
                          <button type="button" className="quiet" aria-expanded={compare === v.version} onClick={() => setCompare(compare === v.version ? null : v.version)} data-testid="shelf-version-compare">
                            {compare === v.version ? 'Hide' : 'What changed'}
                          </button>
                        )}
                        {before && compare === v.version && <DiffText before={`${before.element.name}\n${before.element.doneWhen}\n\n${before.element.instructions}`} after={`${v.element.name}\n${v.element.doneWhen}\n\n${v.element.instructions}`} testId="shelf-version-diff" />}
                      </li>
                    );
                  })}
                </ul>

                <div className="wf-label">Retire</div>
                {item.state === 'retired' ? (
                  <p className="editor-row">
                    <span className="sheet-note" data-testid="shelf-retired">
                      Retired{item.replacedBy ? `: use “${others?.find((o) => o.id === item.replacedBy)?.element.name ?? 'another'}”` : ''}. It still works wherever a copy of it is.
                    </span>
                    <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.restoreElement(item.id))} data-testid="shelf-restore">
                      Bring it back
                    </button>
                  </p>
                ) : (
                  <p className="editor-row">
                    <select aria-label="Use this one in its place" value={replacedBy} onChange={(e) => setReplacedBy(e.target.value)} data-testid="shelf-replaced-by">
                      <option value="">Nothing named to use in its place</option>
                      {(others ?? [])
                        .filter((o) => o.id !== item.id && o.state === 'current')
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            Use “{o.element.name}” in its place
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="quiet"
                      disabled={busy}
                      title="Kept, and still working wherever a copy of it is; no longer offered when inserting, and not run by itself"
                      onClick={() => void act(() => api.retireElement(item.id, replacedBy || null))}
                      data-testid="shelf-retire"
                    >
                      Retire
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {(problems.length > 0 || badNeed) && (
          <ul className="editor-problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
            {badNeed && <li>Every need has to say what is needed.</li>}
          </ul>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy || problems.length > 0 || badNeed} title={problems[0] ?? (badNeed ? 'A need has no name yet.' : undefined)} aria-busy={busy || undefined} onClick={() => void save()} data-testid="shelf-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
