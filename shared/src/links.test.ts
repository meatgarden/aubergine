import { describe, expect, it } from 'vitest';
import { LINK_KINDS, SEEN_MAX, SUMMARY_STALE_MS, addLink, addressProblem, addressesIn, changeLink, groupedLinks, keptBySeeing, middleCut, rememberSeen, removeLink, sortedLinks, splitAddresses, tellLink, undescribed, useSuggestedLink, type LinkKind, type SessionLink } from './links';

/** Addresses shaped like real ones, of made-up projects, and what each is told to be. */
const TOLD: Record<Exclude<LinkKind, 'link'>, [string, string][]> = {
  'pull-request': [
    ['https://github.com/acme-co/widgets/pull/54', 'PR 54'],
    ['https://github.com/acme-co/widgets/pull/54/files', 'PR 54'],
    ['https://www.github.com/acme-co/widgets/pull/7#issuecomment-1', 'PR 7'],
    ['https://gitlab.com/acme-co/widgets/-/merge_requests/12', 'PR 12'],
    ['https://gitlab.com/acme-co/widgets/merge_requests/3', 'PR 3'],
    ['https://bitbucket.org/acme-co/widgets/pull-requests/99', 'PR 99'],
    ['https://codeberg.org/acme-co/widgets/pulls/5', 'PR 5'],
    ['https://github.com/acme-co/widgets/pull/1?diff=split', 'PR 1'],
    ['http://github.com/acme-co/widgets/pull/8', 'PR 8'],
    ['https://code.example.com/demo/project/pull/7', 'PR 7'],
    ['https://github.com/acme-co/widgets.js/pull/123456', 'PR 123456'],
    ['https://GitHub.com/acme-co/widgets/pull/2', 'PR 2'],
  ],
  issue: [
    ['https://github.com/acme-co/widgets/issues/12', 'Issue 12'],
    ['https://gitlab.com/acme-co/widgets/-/issues/4', 'Issue 4'],
    ['https://codeberg.org/acme-co/widgets/issues/88', 'Issue 88'],
    ['https://bitbucket.org/acme-co/widgets/issues/3', 'Issue 3'],
    ['https://github.com/acme-co/widgets/issues/12#issuecomment-9', 'Issue 12'],
    ['https://github.com/acme-co/widgets/issues/1?q=is%3Aopen', 'Issue 1'],
    ['https://code.example.com/demo/project/issues/2', 'Issue 2'],
    ['https://gitlab.com/acme-co/widgets/issues/40', 'Issue 40'],
    ['https://www.gitlab.com/acme-co/widgets/-/issues/41', 'Issue 41'],
    ['https://github.com/a/b/issues/999999', 'Issue 999999'],
    ['http://codeberg.org/acme-co/widgets/issues/6', 'Issue 6'],
    ['https://github.com/acme-co/widgets/issues/77/', 'Issue 77'],
  ],
  branch: [
    ['https://github.com/acme-co/widgets/tree/fix-login', 'fix-login'],
    ['https://github.com/acme-co/widgets/tree/feature/links', 'feature/links'],
    ['https://gitlab.com/acme-co/widgets/-/tree/main', 'main'],
    ['https://code.example.com/demo/project/tree/fix-double-redirect', 'fix-double-redirect'],
    ['https://codeberg.org/acme-co/widgets/tree/release%2F1.2', 'release/1.2'],
    ['https://github.com/acme-co/widgets/tree/a-b_c.d', 'a-b_c.d'],
    ['https://bitbucket.org/acme-co/widgets/branch/fix-login', 'fix-login'],
    ['https://github.com/acme-co/widgets/tree/main/', 'main'],
    ['https://gitlab.com/acme-co/widgets/tree/develop', 'develop'],
    ['https://github.com/acme-co/widgets/tree/user/me/try', 'user/me/try'],
    ['http://github.com/acme-co/widgets/tree/x', 'x'],
    ['https://github.com/acme-co/widgets/tree/v2', 'v2'],
  ],
  commit: [
    ['https://github.com/acme-co/widgets/commit/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', 'Commit 1a2b3c4'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4', 'Commit 1a2b3c4'],
    ['https://gitlab.com/acme-co/widgets/-/commit/abcdef0123', 'Commit abcdef0'],
    ['https://bitbucket.org/acme-co/widgets/commits/abcdef0123456', 'Commit abcdef0'],
    ['https://codeberg.org/acme-co/widgets/commit/0000000', 'Commit 0000000'],
    ['https://code.example.com/demo/project/commit/deadbeef', 'Commit deadbee'],
    ['https://github.com/acme-co/widgets/commit/ABCDEF1', 'Commit ABCDEF1'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4#diff-1', 'Commit 1a2b3c4'],
    ['https://github.com/acme-co/widgets/commit/1a2b3c4?w=1', 'Commit 1a2b3c4'],
    ['https://gitlab.com/acme-co/widgets/commit/9f9f9f9f', 'Commit 9f9f9f9'],
    ['http://github.com/acme-co/widgets/commit/1234567', 'Commit 1234567'],
    ['https://github.com/acme-co/widgets/commit/fedcba9876543210', 'Commit fedcba9'],
  ],
  repository: [
    ['https://github.com/acme-co/widgets', 'acme-co/widgets'],
    ['https://github.com/acme-co/widgets/', 'acme-co/widgets'],
    ['https://gitlab.com/acme/tools', 'acme/tools'],
    ['https://bitbucket.org/acme/tools', 'acme/tools'],
    ['https://codeberg.org/acme/tools', 'acme/tools'],
    ['https://code.example.com/demo/project', 'demo/project'],
    ['https://www.github.com/acme/tools', 'acme/tools'],
    ['http://github.com/acme/tools', 'acme/tools'],
    ['https://github.com/acme/tools#readme', 'acme/tools'],
    ['https://github.com/acme/tools?tab=readme', 'acme/tools'],
    ['https://GITHUB.com/acme/tools', 'acme/tools'],
    ['https://gitlab.com/acme/tools/', 'acme/tools'],
  ],
  ticket: [
    ['https://acme.atlassian.net/browse/ABC-123', 'ABC-123'],
    ['https://acme.atlassian.net/browse/abc-123', 'ABC-123'],
    ['https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ZZZ-9', 'Link'],
    ['https://linear.app/acme/issue/ENG-42/fix-the-login', 'ENG-42'],
    ['https://linear.app/acme/issue/ENG-42', 'ENG-42'],
    ['https://acme.youtrack.cloud/issue/WEB-7', 'WEB-7'],
    ['https://tickets.example.com/browse/DEMO-12', 'DEMO-12'],
    ['https://acme.atlassian.net/browse/AB2-1', 'AB2-1'],
    ['https://team.acme.atlassian.net/browse/OPS-1000', 'OPS-1000'],
    ['https://acme.atlassian.net/browse/ABC-123?focusedCommentId=5', 'ABC-123'],
    ['http://acme.atlassian.net/browse/ABC-1', 'ABC-1'],
    ['https://acme.atlassian.net/browse/ABC-123/', 'ABC-123'],
  ],
  chat: [
    ['https://acme.slack.com/archives/C0123ABCD/p1700000000000100', 'Chat message'],
    ['https://acme.slack.com/archives/C0123ABCD/p1700000000000100?thread_ts=1700000000.000100&cid=C0123ABCD', 'Chat thread'],
    ['https://acme.slack.com/archives/C0123ABCD', 'Chat channel'],
    ['https://discord.com/channels/123456/789012', 'Chat channel'],
    ['https://discord.com/channels/123456/789012/345678', 'Chat message'],
    ['https://chat.example.com/archives/C1/p2', 'Chat message'],
    ['https://app.slack.com/client/T01/C02', 'Chat'],
    ['https://acme-co.slack.com/archives/G0123/p1', 'Chat message'],
    ['http://acme.slack.com/archives/C0123ABCD/p1', 'Chat message'],
    ['https://acme.enterprise.slack.com/archives/C9/p9', 'Chat message'],
    ['https://www.discord.com/channels/1/2', 'Chat channel'],
    ['https://acme.slack.com/archives/C0123ABCD/', 'Chat channel'],
  ],
  design: [
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign', 'Canvas redesign'],
    ['https://www.figma.com/design/AbCdEf123/Canvas-redesign?node-id=1-2', 'Canvas redesign'],
    ['https://figma.com/file/AbCdEf123/Sign%20in%20flow', 'Sign in flow'],
    ['https://www.figma.com/proto/AbCdEf123/Onboarding', 'Onboarding'],
    ['https://www.figma.com/board/AbCdEf123/Ideas_for_Q3', 'Ideas for Q3'],
    ['https://www.figma.com/file/AbCdEf123', 'Design file'],
    ['https://design.example.com/file/1/Tabs-and-panel', 'Tabs and panel'],
    ['https://www.figma.com/design/x/A', 'A'],
    ['http://figma.com/file/x/Name', 'Name'],
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign/', 'Canvas redesign'],
    ['https://www.figma.com/design/AbCdEf123/Canvas--redesign', 'Canvas redesign'],
    ['https://www.figma.com/file/AbCdEf123/Canvas-redesign#frame', 'Canvas redesign'],
  ],
  document: [
    ['https://www.notion.so/acme/Remote-access-plan-0123456789abcdef0123456789abcdef', 'Remote access plan'],
    ['https://acme.notion.site/Remote-access-plan-0123456789abcdef0123456789abcdef', 'Remote access plan'],
    ['https://www.notion.so/0123456789abcdef0123456789abcdef', 'Document'],
    ['https://docs.google.com/document/d/1AbCdEfGhIjK/edit', 'Document'],
    ['https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit#gid=0', 'Spreadsheet'],
    ['https://docs.google.com/presentation/d/1AbCdEfGhIjK/edit', 'Slides'],
    ['https://drive.google.com/file/d/1AbCdEfGhIjK/view', 'File'],
    ['https://acme.atlassian.net/wiki/spaces/ENG/pages/12345/Release+checklist', 'Release checklist'],
    ['https://docs.example.com/Launch-notes', 'Launch notes'],
    ['https://www.notion.so/acme/Plan', 'Plan'],
    ['https://drive.google.com/drive/folders/1AbCdEf', 'Folder'],
    ['https://docs.google.com/forms/d/1AbCdEf/edit', 'Form'],
  ],
  run: [
    ['https://github.com/acme-co/widgets/actions/runs/123456789', 'Run 123456789'],
    ['https://github.com/acme-co/widgets/actions/runs/123456789/job/1', 'Run 123456789'],
    ['https://gitlab.com/acme-co/widgets/-/pipelines/4567', 'Run 4567'],
    ['https://gitlab.com/acme-co/widgets/-/jobs/89', 'Run 89'],
    ['https://gitlab.com/acme-co/widgets/pipelines/1', 'Run 1'],
    ['https://code.example.com/demo/project/actions/runs/3', 'Run 3'],
    ['https://codeberg.org/acme-co/widgets/actions/runs/12', 'Run 12'],
    ['https://github.com/acme-co/widgets/actions/runs/5?check_suite_focus=true', 'Run 5'],
    ['https://bitbucket.org/acme-co/widgets/builds/7', 'Run 7'],
    ['http://github.com/acme-co/widgets/actions/runs/9', 'Run 9'],
    ['https://www.github.com/acme-co/widgets/actions/runs/10', 'Run 10'],
    ['https://github.com/acme-co/widgets/actions/runs/11/', 'Run 11'],
  ],
};

describe('what an address is, told from the address alone', () => {
  for (const kind of LINK_KINDS) {
    if (kind === 'link') continue;
    it(`${kind}: a dozen addresses`, () => {
      expect(TOLD[kind]).toHaveLength(12);
      for (const [address, label] of TOLD[kind]) {
        // One row in the ticket list is made to mislead: its key is after the question mark, and is not read.
        if (label === 'Link') expect(tellLink(address).kind, address).toBe('link');
        else expect(tellLink(address), address).toEqual({ kind, label });
      }
    });
  }

  it('anything else is a link, called by its host and the last part of its path', () => {
    expect(tellLink('https://example.org/guides/getting-started.html')).toEqual({ kind: 'link', label: 'example.org · getting started' });
    expect(tellLink('https://www.example.org/')).toEqual({ kind: 'link', label: 'example.org' });
    expect(tellLink('https://github.com/acme-co')).toEqual({ kind: 'link', label: 'github.com · acme co' });
    expect(tellLink('https://github.com/acme-co/widgets/wiki/Home').kind).toBe('link');
  });

  it('is not misled: a host is compared exactly or by a registered suffix, and a key is read from the path only', () => {
    for (const address of [
      // A host that only looks like a known one.
      'https://github.com.evil.example/acme-co/widgets/pull/54',
      'https://notgithub.com/acme-co/widgets/pull/54',
      'https://evil.example/github.com/acme-co/widgets/pull/54',
      'https://atlassian.net.evil.example/browse/ABC-123',
      'https://fakeatlassian.net/browse/ABC-123',
      'https://atlassian.net/browse/ABC-123',
      'https://slack.com.evil.example/archives/C1/p2',
      'https://figma.com.evil.example/file/x/Name',
      'https://evil.example/?next=https://github.com/acme-co/widgets/pull/54',
      // A ticket's key in what follows the question mark, or the hash.
      'https://acme.atlassian.net/secure/Dashboard.jspa?selectedIssue=ABC-123',
      'https://acme.atlassian.net/issues/?jql=key%3DABC-123',
      'https://linear.app/acme/inbox#ENG-42',
    ])
      expect(tellLink(address).kind, address).toBe('link');
    // A name before the host does not make it another host; such an address is not a link at all.
    expect(addressProblem('https://github.com@evil.example/acme-co/widgets/pull/54')).toMatch(/name or a password/);
    // A label never carries a control character, whatever the address holds.
    expect(tellLink('https://www.figma.com/file/x/Na%1B%5B31mme').label.includes(String.fromCharCode(27))).toBe(false);
    expect(tellLink('https://www.figma.com/file/x/%E2%80%AEevil').label.includes(String.fromCharCode(0x202e))).toBe(false);
  });
});

describe('only http and https addresses are links', () => {
  it('refuses anything else with one sentence', () => {
    for (const text of ['', 'not an address', 'ftp://example.org/file', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'mailto:someone@example.org', 'ssh://git@example.org/x', 'https://', 'https://exa mple.org', 'https://user:secret@example.org/x', `https://example.org/${'a'.repeat(2100)}`, 'https://example.org/\u0007']) {
      const problem = addressProblem(text);
      expect(problem, text).toMatch(/^[A-Z].*\.$/);
      expect(problem?.includes('\n')).toBe(false);
      const added = addLink([], { url: text }, { source: 'owner' }, '2026-01-01T00:00:00.000Z', () => 'x');
      expect('problem' in added, text).toBe(true);
    }
    expect(addressProblem('https://example.org/a?b=c#d')).toBeNull();
    expect(addressProblem('  http://localhost:3000/x  ')).toBeNull();
  });
});

const at = (n: number): string => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();
let made = 0;
const id = (): string => `link-${(made += 1)}`;

describe('the links of a terminal', () => {
  it("the owner's value wins: what an agent says of the same address is kept as a suggestion", () => {
    const first = addLink([], { url: 'https://acme.atlassian.net/browse/ABC-1' }, { source: 'agent' }, at(1), id);
    if ('problem' in first) throw new Error(first.problem);
    expect(first.link).toMatchObject({ kind: 'ticket', label: 'ABC-1', source: 'agent' });
    // The owner changes its label: it is the owner's now.
    const owned = changeLink(first.links, first.link.id, { label: 'The login ticket' }, 'owner', at(2));
    if ('problem' in owned) throw new Error(owned.problem);
    expect(owned.link).toMatchObject({ label: 'The login ticket', ownerSet: true });
    // The agent says again what it is: nothing changes, and what it said is beside the owner's words.
    const again = addLink(owned.links, { url: 'https://acme.atlassian.net/browse/ABC-1', label: 'ABC-1 login', kind: 'issue' }, { source: 'agent' }, at(3), id);
    if ('problem' in again) throw new Error(again.problem);
    expect(again.links).toHaveLength(1);
    expect(again.link).toMatchObject({ label: 'The login ticket', kind: 'ticket', suggested: { label: 'ABC-1 login', kind: 'issue' } });
    const changed = changeLink(again.links, first.link.id, { label: 'Mine' }, 'agent', at(4));
    if ('problem' in changed) throw new Error(changed.problem);
    expect(changed.link.label).toBe('The login ticket');
    expect(changed.link.suggested?.label).toBe('Mine');
    // What is found by looking changes nothing that somebody wrote.
    const found = addLink(changed.links, { url: 'https://acme.atlassian.net/browse/ABC-1' }, { source: 'found', fromTerminal: true }, at(5), id);
    if ('problem' in found) throw new Error(found.problem);
    expect(found.links).toEqual(changed.links);
    // The agent may not remove it; the owner may. The owner may also use what was suggested.
    expect(removeLink(changed.links, first.link.id, 'agent')).toEqual({ problem: 'That link is the owner’s: only the owner removes it.' });
    expect(useSuggestedLink(changed.links, first.link.id)[0]).toMatchObject({ label: 'Mine', kind: 'ticket' });
    expect(useSuggestedLink(changed.links, first.link.id)[0]?.suggested).toBeUndefined();
    expect(removeLink(changed.links, first.link.id, 'owner')).toEqual({ links: [] });
  });

  it('an agent changes and removes what it added, and a link that was only found becomes its own when it says so', () => {
    const seen = addLink([], { url: 'https://github.com/acme-co/widgets/pull/54' }, { source: 'found', fromTerminal: true }, at(1), id);
    if ('problem' in seen) throw new Error(seen.problem);
    expect(seen.link).toMatchObject({ source: 'found', fromTerminal: true, label: 'PR 54' });
    const said = addLink(seen.links, { url: 'https://github.com/acme-co/widgets/pull/54', label: 'The fix' }, { source: 'agent', by: 'build script' }, at(2), id);
    if ('problem' in said) throw new Error(said.problem);
    expect(said.link).toMatchObject({ source: 'agent', by: 'build script', label: 'The fix' });
    expect(said.link.fromTerminal).toBeUndefined();
    expect(removeLink(said.links, said.link.id, 'agent')).toEqual({ links: [] });
    expect(removeLink(said.links, 'nothing', 'owner')).toEqual({ problem: 'There is no such link on this terminal.' });
  });

  it('are sorted with the ticket, the pull request and the branch first, and grouped under three headings', () => {
    const links = (['document', 'chat', 'branch', 'link', 'pull-request', 'ticket', 'design', 'repository', 'commit', 'run', 'issue'] as LinkKind[]).map((kind, index) => ({ kind, at: at(index) }));
    expect(sortedLinks(links).map((link) => link.kind)).toEqual(['ticket', 'pull-request', 'branch', 'issue', 'commit', 'run', 'design', 'document', 'repository', 'link', 'chat']);
    expect(groupedLinks(links).map((group) => [group.title, group.links.length])).toEqual([
      ['Work', 6],
      ['Reference', 4],
      ['Conversation', 1],
    ]);
    expect(groupedLinks([{ kind: 'chat' as LinkKind, at: at(1) }]).map((group) => group.title)).toEqual(['Conversation']);
  });

  it('a label that is long is cut in the middle', () => {
    expect(middleCut('short')).toBe('short');
    const cut = middleCut('feature/a-very-long-branch-name-for-the-sign-in-redirect');
    expect(cut.length).toBeLessThanOrEqual(28);
    expect(cut.startsWith('feature/a-ver')).toBe(true);
    expect(cut.endsWith('redirect')).toBe(true);
    expect(cut).toContain('…');
  });
});

describe('addresses in text', () => {
  it('are found without the punctuation of the sentence, and the pieces put together are the text', () => {
    const text = 'See https://acme.atlassian.net/browse/ABC-1, then (https://example.org/a_(b)) and https://example.org/x. Not ftp://example.org/y or https://user:pw@example.org/z';
    const pieces = splitAddresses(text);
    expect(pieces.map((piece) => ('address' in piece ? piece.address : piece.text)).join('')).toBe(text);
    expect(addressesIn(text)).toEqual(['https://acme.atlassian.net/browse/ABC-1', 'https://example.org/a_(b)', 'https://example.org/x']);
    expect(addressesIn('nothing here')).toEqual([]);
    expect(addressesIn('twice https://example.org/x and https://example.org/x')).toEqual(['https://example.org/x']);
  });

  it('seen addresses are capped at twenty and not repeated, newest last', () => {
    const many = Array.from({ length: 30 }, (_, n) => `https://example.org/${n}`);
    const kept = rememberSeen([], many);
    expect(kept).toHaveLength(SEEN_MAX);
    expect(kept.at(-1)).toBe('https://example.org/29');
    expect(kept[0]).toBe('https://example.org/10');
    // Seen again: it moves to the end, and is there once.
    const again = rememberSeen(kept, ['https://example.org/12', 'https://example.org/12']);
    expect(again).toHaveLength(SEEN_MAX);
    expect(again.filter((address) => address === 'https://example.org/12')).toHaveLength(1);
    expect(again.at(-1)).toBe('https://example.org/12');
  });

  it('one seen in a terminal is kept by itself only when its kind is known and nothing follows a question mark or a hash', () => {
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54')).toBe(true);
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54?token=abc')).toBe(false);
    expect(keptBySeeing('https://github.com/acme-co/widgets/pull/54#x')).toBe(false);
    expect(keptBySeeing('https://example.org/anything')).toBe(false);
    expect(keptBySeeing('ftp://github.com/acme-co/widgets/pull/54')).toBe(false);
  });
});

describe('whether a terminal is described', () => {
  const base = { note: '', written: {}, lastInputAt: null, lastOutputAt: null };
  it('needs a name someone gave it and a summary written within the last hour of its work', () => {
    expect(undescribed(base)).toEqual(['name', 'summary']);
    expect(undescribed({ ...base, written: { name: { by: 'agent', at: at(1) } } })).toEqual(['summary']);
    const described = { note: 'Fixing the login.', written: { name: { by: 'owner' as const, at: at(1) }, summary: { by: 'agent' as const, at: at(2) } }, lastInputAt: at(30), lastOutputAt: at(40) };
    expect(undescribed(described)).toEqual([]);
    // More than an hour of work since it was written: it is taken to be out of date.
    const later = new Date(Date.parse(at(2)) + SUMMARY_STALE_MS + 60_000).toISOString();
    expect(undescribed({ ...described, lastOutputAt: later })).toEqual(['summary']);
    // A summary nobody is on record as writing is not called old.
    expect(undescribed({ ...described, written: { name: described.written.name }, lastOutputAt: later })).toEqual([]);
  });
});

/** A link as it is stored, for a place that needs one. */
export const sampleLink = (over: Partial<SessionLink> = {}): SessionLink => ({ id: 'l1', url: 'https://example.org/x', kind: 'link', label: 'example.org · x', source: 'owner', at: at(1), ...over });
