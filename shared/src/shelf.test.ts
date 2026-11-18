import { describe, expect, it } from 'vitest';
import { SHELF_VERSIONS_KEPT, type ShelfElement, type ShelfVersion } from './drafts';
import { newId } from './ids';
import { COPY_MARK, carrySources, contentOf, copyStatus, copyWords, decideUpdate, elementHash, elementLines, elementReference, elementReferencePage, keptVersions, sourceOf, threeTexts, usesOf, versionsInUse, withFirstVersion, type CopyState } from './shelf';
import { Element, exportWorkflow, importWorkflow, type Workflow } from './workflows';

const at = '2026-04-01T09:00:00.000Z';
const element = (more: Partial<Element> = {}): Element => Element.parse({ id: 'tidy', name: 'Tidy up', instructions: 'Remove what is not needed.', doneWhen: 'Nothing is left over.', ...more });
/** A shelf element with this many versions; each says a little more than the one before. */
function onShelf(versions = 1, more: Partial<ShelfElement> = {}): ShelfElement {
  const all: ShelfVersion[] = Array.from({ length: versions }, (_, index) => ({ version: index + 1, element: element({ instructions: `Remove what is not needed.${' And check.'.repeat(index)}` }), at, by: { kind: 'person' }, note: index === 0 ? '' : `change ${index}` }));
  return { id: newId(), projectId: null, element: all.at(-1)!.element, createdAt: at, updatedAt: at, version: versions, versions: all, state: 'current', replacedBy: null, ...more };
}
const workflowOf = (elements: Element[], more: Partial<Workflow> = {}): Workflow => ({
  id: newId(),
  projectId: newId(),
  name: 'Ship a change',
  description: '',
  labels: {},
  origin: { kind: 'local' },
  createdAt: at,
  updatedAt: at,
  listed: true,
  versions: [{ number: 1, createdAt: at, name: 'Ship a change', description: '', standing: '', inputs: [], elements, extra: {} }],
  ...more,
});

describe('a mark of what an element says', () => {
  it('is the same for the same content, whatever else differs, and different when any part of the content does', () => {
    const base = element();
    expect(elementHash(base)).toMatch(/^[0-9a-f]{16}$/);
    expect(elementHash({ ...base, id: 'other', origin: { kind: 'template', name: 'x' }, source: { shelfId: newId(), version: 3, hash: null }, extra: { later: true } } as Element)).toBe(elementHash(base));
    const others = [
      { ...base, name: 'Tidy up.' },
      { ...base, instructions: 'Remove what is not needed. ' },
      { ...base, doneWhen: '' },
      { ...base, produces: 'checklist' },
      { ...base, kind: 'other' },
      { ...base, needs: [{ kind: 'command' as const, name: 'git' }] },
      { ...base, needs: [{ kind: 'command' as const, name: 'git', note: 'any version' }] },
    ];
    expect(new Set([base, ...others].map(elementHash)).size).toBe(others.length + 1);
  });
});

describe('what can be told about a copy', () => {
  it('for every case: unchanged, changed here, a newer version on the shelf, both, cannot tell, source gone, not a copy', () => {
    const table: [string, { shelfVersions: number; copiedFrom: number | null; changedHere: boolean; onShelf: boolean }, CopyState][] = [
      ['copied from the newest, untouched', { shelfVersions: 1, copiedFrom: 1, changedHere: false, onShelf: true }, 'unchanged'],
      ['copied from the newest, edited in the workflow', { shelfVersions: 1, copiedFrom: 1, changedHere: true, onShelf: true }, 'changed'],
      ['untouched, and the shelf has moved on', { shelfVersions: 3, copiedFrom: 1, changedHere: false, onShelf: true }, 'behind'],
      ['edited, and the shelf has moved on', { shelfVersions: 3, copiedFrom: 2, changedHere: true, onShelf: true }, 'both'],
      ['copied from the newest of several', { shelfVersions: 3, copiedFrom: 3, changedHere: false, onShelf: true }, 'unchanged'],
      ['from before versions were kept, untouched', { shelfVersions: 4, copiedFrom: null, changedHere: false, onShelf: true }, 'unknown'],
      ['from before versions were kept, edited', { shelfVersions: 4, copiedFrom: null, changedHere: true, onShelf: true }, 'unknown'],
      ['its shelf element was removed', { shelfVersions: 2, copiedFrom: 1, changedHere: false, onShelf: false }, 'gone'],
    ];
    for (const [what, given, expected] of table) {
      const item = onShelf(given.shelfVersions);
      const from = given.copiedFrom === null ? null : item.versions[given.copiedFrom - 1]!;
      const copied = from ? from.element : item.versions[0]!.element;
      const copy: Element = {
        ...copied,
        id: 'copy',
        ...(given.changedHere ? { instructions: `${copied.instructions} Edited here.` } : {}),
        source: from ? { shelfId: item.id, version: from.version, hash: elementHash(from.element) } : { shelfId: item.id, version: null, hash: null },
      };
      const status = copyStatus(copy, given.onShelf ? [item] : []);
      expect(status.state, what).toBe(expected);
      expect(copyWords(status), what).not.toBe('');
      expect(COPY_MARK[status.state], what).not.toBe('');
      // A copy nothing can be told about is never said to have a newer version waiting.
      if (expected === 'unknown') expect(copyWords(status)).toMatch(/cannot be told/);
    }
    expect(copyStatus(element(), [onShelf()]).state).toBe('none');
    expect(copyWords(copyStatus(element(), []))).toBe('');
  });

  it('says so when the source is retired, and which element to use when one was named', () => {
    const better = onShelf(1, { element: element({ name: 'Tidy up, carefully' }) });
    const old = onShelf(1, { state: 'retired', replacedBy: better.id });
    const copy = { ...old.element, source: sourceOf(old) };
    const status = copyStatus(copy, [old, better]);
    expect(status).toMatchObject({ state: 'unchanged', retired: true });
    expect(copyWords(status)).toMatch(/It is retired: use "Tidy up, carefully"\.$/);
    expect(copyWords(copyStatus(copy, [{ ...old, replacedBy: null }]))).toMatch(/It is retired\.$/);
  });
});

describe('deciding about a newer version', () => {
  const item = onShelf(3);
  const first = item.versions[0]!;
  const untouched: Element = { ...first.element, id: 'in-the-workflow', origin: { kind: 'shelf', shelfId: item.id }, source: { shelfId: item.id, version: 1, hash: elementHash(first.element) } };
  const edited: Element = { ...untouched, instructions: 'My own words.' };

  it('taking it puts the shelf\'s content in place of the copy\'s, and keeps the element\'s ID', () => {
    for (const copy of [untouched, edited]) {
      const taken = decideUpdate(copy, item, 'take');
      expect(contentOf(taken)).toEqual(contentOf(item.element));
      expect(taken.id).toBe('in-the-workflow');
      expect(copyStatus(taken, [item]).state).toBe('unchanged');
      expect(taken.source).toEqual({ shelfId: item.id, version: 3, hash: elementHash(item.element) });
    }
  });

  it('keeping one\'s own leaves every word, and the copy is then one that was changed here, with nothing newer waiting', () => {
    for (const copy of [untouched, edited]) {
      const kept = decideUpdate(copy, item, 'keep');
      expect(contentOf(kept)).toEqual(contentOf(copy));
      expect(copyStatus(kept, [item]).state).toBe('changed');
    }
  });

  it('gives the three texts to pick between, and never one made from two of them', () => {
    const texts = threeTexts(edited, item);
    expect(texts.copied).toEqual(contentOf(first.element));
    expect(texts.mine.instructions).toBe('My own words.');
    expect(texts.shelf).toEqual(contentOf(item.element));
    expect(elementLines(texts.shelf)[0]).toBe('Name: Tidy up');
    // The version it was copied from is no longer kept: two texts, and that one says so by being absent.
    expect(threeTexts({ ...edited, source: { shelfId: item.id, version: 9, hash: null } }, item).copied).toBeNull();
    for (const decision of ['take', 'keep'] as const) expect([texts.mine.instructions, texts.shelf.instructions]).toContain(decideUpdate(edited, item, decision).instructions);
  });
});

describe('who says where a copy came from', () => {
  it('for anyone but the owner an element keeps the mark it had, and a new one has none', () => {
    const mark = { shelfId: newId(), version: 2, hash: '0123456789abcdef' };
    const before = [element({ id: 'a', source: mark }), element({ id: 'b' })];
    const claimed = { shelfId: mark.shelfId, version: 9, hash: 'ffffffffffffffff' };
    const incoming = [
      { id: 'a', name: 'Changed by a program', source: claimed },
      { id: 'b', name: 'B', source: claimed },
      { id: undefined, name: 'New', source: claimed },
      { id: 'c', name: 'Also new' },
    ];
    expect(carrySources(incoming, before).map((e) => e.source)).toEqual([mark, null, null, null]);
    expect(carrySources(incoming, []).map((e) => e.source)).toEqual([null, null, null, null]);
  });
});

describe('where a shelf element is used', () => {
  it('lists the workflows that hold a copy, what can be told of each copy, and the versions of the workflow that hold one', () => {
    const item = onShelf(2);
    const other = onShelf(1);
    const behind: Element = { ...item.versions[0]!.element, id: 'old-copy', source: { shelfId: item.id, version: 1, hash: elementHash(item.versions[0]!.element) } };
    const current: Element = { ...item.element, id: 'new-copy', source: sourceOf(item) };
    const using = workflowOf([element({ id: 'own' }), behind, current], { name: 'Uses it' });
    using.versions = [{ ...using.versions[0]!, elements: [element({ id: 'own' })] }, { ...using.versions[0]!, number: 2 }, { ...using.versions[0]!, number: 3 }];
    const not = workflowOf([element({ id: 'own' }), { ...other.element, id: 'x', source: sourceOf(other) }], { name: 'Does not' });
    const hidden = workflowOf([current], { name: 'Made to run one element', listed: false });
    expect(usesOf(item.id, [not, using, hidden], [item, other])).toEqual([
      {
        workflowId: using.id,
        workflowName: 'Uses it',
        workflowVersion: 3,
        copies: [
          { elementId: 'old-copy', name: 'Tidy up', state: 'behind', copiedVersion: 1 },
          { elementId: 'new-copy', name: 'Tidy up', state: 'unchanged', copiedVersion: 2 },
        ],
        inVersions: [2, 3],
      },
    ]);
    expect([...versionsInUse(item.id, [not, using, hidden])].sort()).toEqual([1, 2]);
    expect(usesOf(newId(), [not, using], [item, other])).toEqual([]);
  });
});

describe('the versions that are kept', () => {
  it('are the newest thirty, and any a copy was made from', () => {
    const item = onShelf(SHELF_VERSIONS_KEPT + 12);
    const kept = keptVersions(item.versions, new Set([2, 5]));
    expect(kept.map((v) => v.version)).toEqual([2, 5, ...Array.from({ length: SHELF_VERSIONS_KEPT }, (_, i) => i + 13)]);
    expect(keptVersions(item.versions.slice(0, 3), new Set())).toHaveLength(3);
  });

  it('what an element said before versions were kept is its version 1', () => {
    const { versions: _versions, ...old } = onShelf(1);
    const withFirst = withFirstVersion({ ...old, versions: [] });
    expect(withFirst.versions).toEqual([{ version: 1, element: old.element, at: old.updatedAt, by: { kind: 'person' }, note: '' }]);
    expect(withFirstVersion(withFirst)).toBe(withFirst);
  });
});

describe('a workflow file', () => {
  it('keeps where each copy came from through export and import, and reads a file without any such mark as before', () => {
    const item = onShelf(2);
    const copy: Element = { ...item.element, id: 'copy', source: sourceOf(item) };
    const workflow = workflowOf([element({ id: 'own' }), copy]);
    const file = exportWorkflow(workflow) as { workflow: { elements: Record<string, unknown>[] } };
    // Written only for the element that is a copy.
    expect(file.workflow.elements.map((e) => 'source' in e)).toEqual([false, true]);
    const back = importWorkflow(JSON.parse(JSON.stringify(file)));
    expect(back.content.elements.map((e) => e.source)).toEqual([null, copy.source]);
    expect(copyStatus(back.content.elements[1]!, [item]).state).toBe('unchanged');
    // On a computer whose shelf does not have it: the source is said to be missing, and nothing else is claimed.
    expect(copyStatus(back.content.elements[1]!, []).state).toBe('gone');
    // Without marks, and with one that cannot be read: no source, and the file is still a workflow.
    const plain = JSON.parse(JSON.stringify(file)) as typeof file;
    delete plain.workflow.elements[1]!.source;
    expect(importWorkflow(plain).content.elements.map((e) => e.source)).toEqual([null, null]);
    const odd = JSON.parse(JSON.stringify(file)) as typeof file;
    odd.workflow.elements[1]!.source = { shelfId: 'not an ID', version: 'two' };
    expect(importWorkflow(odd).content.elements.map((e) => e.source)).toEqual([null, null]);
    // And a second round trip gives the same file.
    const again = exportWorkflow({ ...workflow, versions: [{ ...workflow.versions[0]!, ...back.content }] });
    expect(again).toEqual(file);
  });
});

describe('what is in an element', () => {
  it('is read from the schemas: every field has words, and the page lists them all', () => {
    const { element: fields, shelf } = elementReference();
    expect(fields.map((f) => f.field)).toEqual(['name', 'instructions', 'doneWhen', 'needs', 'produces', 'kind', 'ask', 'lookAt', 'origin', 'source', 'id', 'extra']);
    expect(Object.keys(Element.shape).sort()).toEqual(fields.map((f) => f.field).sort());
    expect(shelf.map((f) => f.field)).toEqual(['version', 'versions', 'state', 'replacedBy']);
    for (const field of [...fields, ...shelf]) expect(field.what.length, field.field).toBeGreaterThan(30);
    expect(fields.filter((f) => f.written === 'by you').map((f) => f.field)).toEqual(['name', 'instructions', 'doneWhen', 'needs', 'produces', 'ask', 'lookAt']);
    const page = elementReferencePage();
    for (const field of [...fields, ...shelf]) expect(page).toContain(`| \`${field.field}\` |`);
    expect(page.startsWith('# What is in an element')).toBe(true);
  });
});
