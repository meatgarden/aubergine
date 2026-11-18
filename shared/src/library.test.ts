import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { FLAG_WORDS, LIBRARY_INDEX_FORMAT, LibraryPath, exportElement, fromWords, gitAddressProblem, historyWords, importElement, libraryKind, libraryKinds, readLibraryIndex, standingOf, type InstalledItem } from './library';
import { Element } from './workflows';

describe('an address for Git', () => {
  it('is https, ssh or file, and nothing Git would read as anything else', () => {
    const fine = ['https://example.invalid/team/library.git', 'https://git@example.invalid/team/library.git', 'ssh://git@example.invalid/team/library.git', 'ssh://git@example.invalid:2222/team/library.git', 'git@example.invalid:team/library.git', 'file:///srv/git/library.git'];
    for (const address of fine) expect(gitAddressProblem(address), address).toBeNull();
    const refused: [string, RegExp][] = [
      ['--upload-pack=touch x', /spaces/],
      ['--upload-pack=x', /as an option/],
      ['-oProxyCommand=x', /as an option/],
      ['ext::sh', /helper program/],
      ['fd::17', /helper program/],
      ['anything::https://example.invalid/x', /helper program/],
      ['http://example.invalid/x.git', /not http/],
      ['git://example.invalid/x.git', /not git/],
      ['ftp://example.invalid/x.git', /not ftp/],
      ['https://user:secret@example.invalid/x.git', /password/],
      ['ssh://-oProxyCommand=x/y', /host/],
      ['ssh:///no-host', /host/],
      ['file://other-host/share/x.git', /full path/],
      ['user@host:--option', /not an address/],
      ['-user@host:path', /as an option/],
      ['/a/plain/path', /not an address/],
      ['relative/path', /not an address/],
      ['https://example.invalid/a b', /spaces/],
      ['https://example.invalid/x\n-oops', /spaces/],
      ['https://example.invalid/\u0007', /control/],
      ['', /not an address/],
      [`https://example.invalid/${'x'.repeat(2100)}`, /too long/],
    ];
    for (const [address, why] of refused) expect(gitAddressProblem(address) ?? 'accepted', address).toMatch(why);
  });
});

describe('the index of a source', () => {
  it('lists what is well formed, skips what is not with a reason, and keeps what it does not know', () => {
    const read = readLibraryIndex(
      JSON.stringify({
        aubergine: 'library',
        format: LIBRARY_INDEX_FORMAT,
        name: 'Team library',
        later: { anything: true },
        items: [
          { id: 'tidy', kind: 'element', name: 'Tidy up', description: 'One line.', version: '1.2.0', path: 'elements/tidy.json', later: 1 },
          { id: 'old', kind: 'element', name: 'Old', version: '3', path: 'old.json', retired: true, replacedBy: 'tidy' },
          { id: 'tidy', kind: 'workflow', name: 'Twice', version: '1', path: 'x.json' },
          { id: 'UPPER', kind: 'element', name: 'x', version: '1', path: 'x.json' },
          { id: 'two-lines', kind: 'element', name: 'x', description: 'one\ntwo', version: '1', path: 'x.json' },
          { id: 'bad-version', kind: 'element', name: 'x', version: 'one two', path: 'x.json' },
        ],
      }),
    );
    expect(read.ok && read.index.name).toBe('Team library');
    expect(read.ok && read.index.items.map((item) => [item.id, item.version, item.retired, item.replacedBy ?? null])).toEqual([
      ['tidy', '1.2.0', false, null],
      ['old', '3', true, 'tidy'],
    ]);
    expect(read.ok && (read.index.items[0] as { later?: number }).later).toBe(1);
    expect(read.ok && read.index.skipped.map((s) => s.id)).toEqual(['tidy', 'UPPER', 'two-lines', 'bad-version']);
    for (const text of ['', 'not json', '[]', '{"aubergine":"workflow","format":1,"items":[]}', '{"aubergine":"library","format":1}']) expect(readLibraryIndex(text).ok, text).toBe(false);
    const later = readLibraryIndex('{"aubergine":"library","format":99,"items":[]}');
    expect(!later.ok && later.reason).toMatch(/format 99, which this version of Aubergine does not know/);
  });

  it('takes a path only as plain names inside the source', () => {
    for (const fine of ['a.json', 'elements/tidy.json', 'a/b/c/d.json', 'with space/and-dash_.json']) expect(LibraryPath.safeParse(fine).success, fine).toBe(true);
    for (const bad of ['', '/etc/passwd', '../x.json', 'a/../b.json', 'a/./b.json', './a.json', 'a//b.json', 'a/', '.hidden/x.json', '~/x.json', 'C:\\x.json', 'a\\b.json', 'a/b.json/..', 'name.', 'x'.repeat(301)]) expect(LibraryPath.safeParse(bad).success, bad).toBe(false);
  });
});

describe('a step as a file', () => {
  it('goes out and comes back the same, without where it came from here', () => {
    const element = Element.parse({ id: 'tidy', name: 'Tidy up', instructions: 'Remove what is not needed.', doneWhen: 'Nothing is left over.', needs: [{ kind: 'command', name: 'git' }], produces: 'checklist', origin: { kind: 'draft', by: 'session' }, source: { shelfId: newId(), version: 2, hash: null }, extra: { later: true } });
    const file = exportElement(element);
    expect(file).toMatchObject({ aubergine: 'element', format: 1, element: { name: 'Tidy up', later: true } });
    expect('source' in (file.element as object)).toBe(false);
    expect('origin' in (file.element as object)).toBe(false);
    const back = importElement(JSON.parse(JSON.stringify(file)));
    expect(back).toMatchObject({ name: 'Tidy up', instructions: 'Remove what is not needed.', doneWhen: 'Nothing is left over.', produces: 'checklist', source: null, origin: { kind: 'local' }, extra: { later: true } });
    expect(exportElement(back)).toEqual(file);
    // A file that claims a source or an origin does not get to keep them.
    expect(importElement({ aubergine: 'element', format: 1, element: { name: 'x', source: { shelfId: newId(), version: 9, hash: null }, origin: { kind: 'local' } } })).toMatchObject({ source: null });
    expect(() => importElement({ aubergine: 'workflow', format: 1, workflow: {} })).toThrow(/not an Aubergine step file/);
    expect(() => importElement({ aubergine: 'element', format: 5, element: { name: 'x' } })).toThrow(/format 5/);
  });
});

describe('what is installed, against what its source has', () => {
  const sourceId = newId();
  const installed = (version: string, digest: string): InstalledItem => ({ id: newId(), projectId: null, kind: 'element', name: 'Tidy', from: { sourceId, kind: 'git', address: 'https://example.invalid/x.git', sourceName: 'Team', itemId: 'tidy', version, commit: 'a'.repeat(40), digest }, installedAt: '2026-04-01T09:00:00.000Z', content: {}, target: {}, atSource: 'current', useInstead: null });
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);

  it('is by the publisher\'s version and the digest of the file, and by nothing else', () => {
    const table: [string, string | null, InstalledItem[], string][] = [
      ['1', A, [], 'available'],
      ['1', A, [installed('1', A)], 'installed'],
      ['2', B, [installed('1', A)], 'update'],
      // The same version and other content is an update too: what is there is not what was installed.
      ['1', B, [installed('1', A)], 'update'],
      // Another version of the same content.
      ['2', A, [installed('1', A)], 'update'],
      // The file could not be read at the last refresh: by the version alone.
      ['1', null, [installed('1', A)], 'installed'],
      // Installed from another source: not this item.
      ['1', A, [{ ...installed('1', A), from: { ...installed('1', A).from, sourceId: newId() } }], 'available'],
    ];
    for (const [version, digest, have, expected] of table) expect(standingOf(sourceId, { id: 'tidy', version, digest }, have).standing, `${version} ${digest?.[0]}`).toBe(expected);
  });

  it('says where something came from, and what to be careful about', () => {
    expect(fromWords(installed('1.2', A).from)).toBe(`Team (https://example.invalid/x.git), item tidy, version 1.2, commit ${'a'.repeat(12)}`);
    expect(fromWords({ ...installed('1', A).from, kind: 'builtin', commit: null })).toBe('the library that comes with Aubergine, item tidy, version 1');
    expect(historyWords('rewritten')).toMatch(/history was rewritten/);
    expect(historyWords('cannot-tell')).toMatch(/could not be told/);
    expect(historyWords('grew')).toBe('');
    expect(historyWords(null)).toBe('');
    for (const words of Object.values(FLAG_WORDS)) expect(words.length).toBeGreaterThan(20);
  });
});

describe('the kinds of item', () => {
  it('are a workflow and a step, each read by its own kind', () => {
    expect(libraryKinds().map((kind) => [kind.kind, kind.title])).toEqual([
      ['workflow', 'A workflow'],
      ['element', 'A step'],
    ]);
    const limits = { maxElements: 50, maxElementChars: 20_000 };
    const element = libraryKind('element')!.read({ aubergine: 'element', format: 1, element: { name: 'Tidy', instructions: 'Tidy {{task}}.', doneWhen: 'Tidy.', needs: [{ kind: 'command', name: 'git' }] } }, limits);
    expect(element.text).toContain('Tidy (task).');
    expect(element.needs).toEqual([{ kind: 'command', name: 'git' }]);
    const workflow = libraryKind('workflow')!.read({ aubergine: 'workflow', format: 1, workflow: { name: 'Two', elements: [{ name: 'A', instructions: 'First.', source: { shelfId: newId(), version: 1, hash: null } }, { name: 'B', instructions: 'Second.' }] } }, limits);
    // All of it: every element's text, one after another.
    expect(workflow.text).toContain('--- Step 1 of 2 ---');
    expect(workflow.text).toContain('First.');
    expect(workflow.text).toContain('--- Step 2 of 2 ---');
    expect(workflow.text).toContain('Second.');
    // Where a publisher's copy came from on their computer means nothing here.
    expect((workflow.content as { elements: { source: unknown }[] }).elements.map((e) => e.source)).toEqual([null, null]);
    expect(() => libraryKind('workflow')!.read({ aubergine: 'element', format: 1, element: { name: 'x' } }, limits)).toThrow();
    expect(() => libraryKind('element')!.read({ aubergine: 'element', format: 1, element: { name: 'x', instructions: 'y'.repeat(30_000) } }, limits)).toThrow();
  });
});
