import { NEEDS_MAX, outputKind, outputKindNames, waitsForPerson, type Element, type Need } from '@aubergine/shared';
import { elementView } from './registries';

const NEED_KINDS: [Need['kind'], string][] = [
  ['mcp', 'MCP server'],
  ['command', 'Command'],
  ['access', 'Access'],
  ['other', 'Other'],
];

/**
 * Everything that can be edited about one element: its name, the fields of
 * its kind, what it needs and what it produces. The workflow editor, the
 * shelf and the review screen all edit an element with this.
 */
export function ElementFields({ element, onChange }: { element: Element; onChange: (element: Element) => void }) {
  const Editor = elementView(element.kind)?.Editor;
  const setNeed = (index: number, change: Partial<Need>): void => onChange({ ...element, needs: element.needs.map((need, n) => (n === index ? { ...need, ...change } : need)) });
  return (
    <>
      <label className="wf-field">
        <span>Step</span>
        <input value={element.name} maxLength={120} onChange={(e) => onChange({ ...element, name: e.target.value })} data-testid="element-name" />
      </label>
      {Editor ? <Editor element={element} onChange={onChange} /> : <p className="sheet-note">This element is of a kind this version cannot edit: {element.kind}. It is kept as it is.</p>}
      {/* What an agent needs, and what it hands in, are not asked of an element a person decides. */}
      {!waitsForPerson(element.kind) && (
        <>
      <div className="wf-label">
        It needs <span className="sheet-note">tools whoever does it must have; shown before a run, checked by nobody</span>
      </div>
      <ul className="editor-needs">
        {element.needs.map((need, index) => (
          <li key={index} data-testid="element-need">
            <select aria-label="Kind of need" value={need.kind} onChange={(e) => setNeed(index, { kind: e.target.value as Need['kind'] })}>
              {NEED_KINDS.map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <input aria-label="What is needed" value={need.name} maxLength={120} placeholder="for example: team chat" onChange={(e) => setNeed(index, { name: e.target.value })} />
            <button type="button" className="quiet" aria-label={`Remove the need ${need.name}`} onClick={() => onChange({ ...element, needs: element.needs.filter((_, n) => n !== index) })}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="editor-row">
        <button type="button" className="quiet" disabled={element.needs.length >= NEEDS_MAX} onClick={() => onChange({ ...element, needs: [...element.needs, { kind: 'mcp', name: '' }] })} data-testid="need-add">
          + Need
        </button>
        <label className="wf-inline">
          <span>It produces</span>
          <select value={element.produces} onChange={(e) => onChange({ ...element, produces: e.target.value })} data-testid="element-produces">
            {[...new Set([...outputKindNames(), element.produces])].map((kind) => (
              <option key={kind} value={kind}>
                {outputKind(kind)?.title.toLowerCase() ?? kind}
              </option>
            ))}
          </select>
        </label>
      </div>
        </>
      )}
    </>
  );
}
