import { useEffect, useState } from 'react';
import { previewRun, validateContent, versionOfProposal, type Element } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { ElementFields } from './ElementFields';

const BLANK: Element = { id: 'new-element', kind: 'instructions', name: 'New element', instructions: '', doneWhen: '', needs: [], produces: 'note', origin: { kind: 'local' }, extra: {} };

/** One element of the shelf, or a new one: the same fields as in a workflow, beside what an agent would be told. */
export function ShelfEditor() {
  const editing = useApp((s) => s.editingElement);
  const item = useApp((s) => (editing && editing !== 'new' ? (s.app?.shelf.find((e) => e.id === editing) ?? null) : null));
  const limits = useApp((s) => s.settings.workflows);
  const [element, setElement] = useState<Element | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setElement(editing === 'new' ? BLANK : (item?.element ?? null));
    setError(null);
  }, [editing, item === null]); // eslint-disable-line react-hooks/exhaustive-deps -- a fresh copy when another is opened, not on every save

  if (!editing || !element) return null;
  const close = (): void => useApp.getState().editElement(null);
  const version = versionOfProposal({ workflow: null, element });
  const problems = !element.name.trim() ? ['The element needs a name.'] : version ? validateContent(version, limits) : [];
  const badNeed = element.needs.some((need) => need.name.trim() === '');

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { id: _id, origin: _origin, extra: _extra, ...fields } = element;
      const saved = editing === 'new' ? await api.createElement(fields) : await api.updateElement(editing, fields);
      useApp.getState().apply({ type: 'shelf.changed', item: saved as never });
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
          <h2>{editing === 'new' ? 'New element' : 'Element on the shelf'}</h2>
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
        </header>
        <div className="editor-grid">
          <div className="editor-form">
            <ElementFields element={element} onChange={setElement} />
          </div>
          <div className="editor-detail">
            <div className="wf-label">What an agent will be told when it is run by itself</div>
            <pre className="editor-preview" data-testid="shelf-preview">
              {version && problems.length === 0 ? previewRun(version, { task: '(task)' }) : 'Fix what is listed below to see this.'}
            </pre>
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
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button type="button" disabled={busy || problems.length > 0 || badNeed} onClick={() => void save()} data-testid="shelf-save">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
