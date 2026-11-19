import { z } from 'zod';
import { showControl } from './text';

/**
 * What a terminal says about itself: the links that belong to its work, where each came from, and what was found
 * about its folder. A link is an address with a kind and a short label; no address is ever drawn as text. What kind
 * an address is, and what to call it, is told from the address alone, by the one table below: nothing is fetched to
 * find out.
 */

/** The kinds a link can be. `link` is anything the table does not know. */
export const LINK_KINDS = ['pull-request', 'issue', 'branch', 'commit', 'repository', 'ticket', 'chat', 'design', 'document', 'run', 'link'] as const;
export const LinkKind = z.enum(LINK_KINDS);
export type LinkKind = z.infer<typeof LinkKind>;

/** The three quiet headings links are grouped under where there are many. */
export const LINK_GROUPS = [
  ['work', 'Work'],
  ['reference', 'Reference'],
  ['conversation', 'Conversation'],
] as const;
export type LinkGroup = (typeof LINK_GROUPS)[number][0];

/** What a kind is called, the two letters that stand for it on a chip, and the group it is listed under. Work comes first, in this order. */
export const KIND_WORDS: Record<LinkKind, { name: string; mark: string; group: LinkGroup; order: number }> = {
  ticket: { name: 'Ticket', mark: 'TK', group: 'work', order: 1 },
  'pull-request': { name: 'Pull request', mark: 'PR', group: 'work', order: 2 },
  branch: { name: 'Branch', mark: 'BR', group: 'work', order: 3 },
  issue: { name: 'Issue', mark: 'IS', group: 'work', order: 4 },
  commit: { name: 'Commit', mark: 'CM', group: 'work', order: 5 },
  run: { name: 'Run or build', mark: 'RN', group: 'work', order: 6 },
  design: { name: 'Design', mark: 'DS', group: 'reference', order: 7 },
  document: { name: 'Document', mark: 'DC', group: 'reference', order: 8 },
  repository: { name: 'Repository', mark: 'RP', group: 'reference', order: 9 },
  link: { name: 'Link', mark: 'LK', group: 'reference', order: 10 },
  chat: { name: 'Chat', mark: 'CH', group: 'conversation', order: 11 },
};

export const LINK_URL_MAX = 2000;
export const LINK_LABEL_MAX = 80;
/** How many links a terminal keeps, and how many seen ones are remembered. */
export const LINKS_MAX = 60;
export const SEEN_MAX = 20;

/** Who wrote something about a terminal: its owner, the agent in it (or a program with a token), or the server by looking. */
export const DescribedBy = z.enum(['owner', 'agent', 'found']);
export type DescribedBy = z.infer<typeof DescribedBy>;

/** A label: one line of plain words. */
export const LinkLabel = z
  .string()
  .trim()
  .min(1)
  .max(LINK_LABEL_MAX)
  .refine((value) => showControl(value) === value && !/[\r\n]/.test(value), 'A label is one line of plain text.');

/** Why a text cannot be a link, in one sentence; null when it can. Only http and https addresses are links. */
export function addressProblem(text: string): string | null {
  const value = text.trim();
  if (value === '') return 'An address is needed: it begins with https:// or http://.';
  if (value.length > LINK_URL_MAX) return `An address can be at most ${LINK_URL_MAX} characters.`;
  if (/\s/.test(value) || showControl(value) !== value) return 'An address has no spaces and no control characters.';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'That is not an address: a link begins with https:// or http:// and names a host.';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only addresses that begin with https:// or http:// can be links.';
  if (url.hostname === '') return 'That address names no host.';
  if (url.username !== '' || url.password !== '') return 'An address with a name or a password in it is not kept as a link.';
  return null;
}

/** An address that can be a link: kept exactly as it was given, apart from the space around it. */
export const LinkUrl = z
  .string()
  .trim()
  .max(LINK_URL_MAX)
  .refine((value) => addressProblem(value) === null, 'Only addresses that begin with https:// or http://, with no name or password in them, can be links.')
  .describe('The address, kept and opened exactly as given. Only http and https.');

export const SessionLink = z.object({
  id: z.string().min(1).max(64),
  url: LinkUrl,
  kind: LinkKind.describe('What it is, told from the address unless someone said otherwise.'),
  label: LinkLabel.describe('A few plain words for it.'),
  source: DescribedBy.describe('Who added it: the owner, the agent (or a program), or the server by looking.'),
  /** For one a program added: the name it goes by. */
  by: z.string().max(80).optional(),
  at: z.iso.datetime().describe('When it was added.'),
  /** The owner set its label or its kind: nobody else changes them after that. */
  ownerSet: z.boolean().optional(),
  /** What someone else would call it, kept beside the owner's own words until the owner uses it or it is replaced. */
  suggested: z.object({ label: LinkLabel, kind: LinkKind, at: z.iso.datetime() }).optional(),
  /** It was seen in what the terminal showed: terminal content, so not given to a caller who may not read that terminal. */
  fromTerminal: z.boolean().optional(),
});
export type SessionLink = z.infer<typeof SessionLink>;

/** A pull request as a signed-in local tool told it. Never fetched by the server itself. */
export const FoundPullRequest = z.object({
  url: LinkUrl,
  number: z.number().int().min(1).max(99_999_999),
  title: z.string().max(300),
  state: z.enum(['open', 'merged', 'closed', 'draft']),
});
export type FoundPullRequest = z.infer<typeof FoundPullRequest>;

/** What the server found about a terminal's folder by looking, and when. */
export const Found = z.object({
  branch: z.string().max(250).nullable().default(null),
  /** The repository as `owner/name`, or its folder's name where it has no remote that says. */
  repository: z.string().max(200).nullable().default(null),
  /** Its page, where the remote's address gives one without a name or a password in it. */
  repositoryUrl: LinkUrl.nullable().default(null),
  pullRequest: FoundPullRequest.nullable().default(null),
  at: z.iso.datetime(),
});
export type Found = z.infer<typeof Found>;

/** Who last wrote a terminal's name and its summary, and when. Nothing here means nobody did: the name is the one it was given when made. */
export const Written = z.object({
  name: z.object({ by: DescribedBy, at: z.iso.datetime() }).optional(),
  summary: z.object({ by: DescribedBy, at: z.iso.datetime() }).optional(),
});
export type Written = z.infer<typeof Written>;

/** What the agent would have written where the owner's own words stand: kept as a suggestion, never put in their place by itself. */
export const Suggested = z.object({
  name: z.object({ value: z.string().max(80), at: z.iso.datetime() }).optional(),
  summary: z.object({ value: z.string().max(20_000), at: z.iso.datetime() }).optional(),
});
export type Suggested = z.infer<typeof Suggested>;

// ---------- The table: what kind an address is, and what to call it ----------

interface Told {
  kind: LinkKind;
  label: string;
}

/** A host a row of the table is for: the host itself, or any host that ends with a registered suffix (never "contains"). */
type HostRule = { host: string } | { suffix: string };

interface TableRow {
  hosts: readonly HostRule[];
  /** Given the parts of the path, what the address is; null where this row does not know it. */
  tell: (parts: string[], url: URL) => Told | null;
}

const hostIs = (rule: HostRule, host: string): boolean => ('host' in rule ? host === rule.host || host === `www.${rule.host}` : host.endsWith(`.${rule.suffix}`) && host.length > rule.suffix.length + 1);

/** A part of a path as words: decoded, with the marks that stand for spaces turned into spaces. */
function words(part: string | undefined): string {
  if (!part) return '';
  let text = part;
  try {
    text = decodeURIComponent(part);
  } catch {
    // Kept as it is.
  }
  return showControl(text.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, LINK_LABEL_MAX);
}

const short = (text: string, most = 40): string => (text.length <= most ? text : `${text.slice(0, most - 1).trimEnd()}…`);
const isNumber = (part: string | undefined): part is string => part !== undefined && /^\d{1,9}$/.test(part);
/** A ticket's key: letters, a dash, a number. Read from the path only, never from what follows a question mark. */
const TICKET_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/;

/** A code host laid out as owner/name/…: pull requests, issues, branches, commits, runs, and the repository itself. */
function codeHost(parts: string[]): Told | null {
  // Some hosts put "-" before the kind of thing: it says nothing.
  const p = parts.filter((part) => part !== '-');
  const [owner, name, what, id, more] = p;
  if (!owner || !name) return null;
  const repo = decodeOr(`${owner}/${name}`);
  if ((what === 'pull' || what === 'pulls' || what === 'merge_requests' || what === 'pull-requests') && isNumber(id)) return { kind: 'pull-request', label: `PR ${id}` };
  if ((what === 'issues' || what === 'issue') && isNumber(id)) return { kind: 'issue', label: `Issue ${id}` };
  if ((what === 'tree' || what === 'branch' || what === 'branches') && id) return { kind: 'branch', label: decodeOr(p.slice(3).join('/')).slice(0, LINK_LABEL_MAX) };
  if ((what === 'commit' || what === 'commits') && id && /^[0-9a-f]{7,40}$/i.test(id)) return { kind: 'commit', label: `Commit ${id.slice(0, 7)}` };
  if (what === 'actions' && id === 'runs' && isNumber(more)) return { kind: 'run', label: `Run ${more}` };
  if ((what === 'pipelines' || what === 'jobs' || what === 'runs' || what === 'builds') && isNumber(id)) return { kind: 'run', label: `Run ${id}` };
  if (what === undefined) return { kind: 'repository', label: short(repo) };
  return null;
}

function decodeOr(text: string): string {
  try {
    return showControl(decodeURIComponent(text));
  } catch {
    return showControl(text);
  }
}

/** An issue tracker: the key is in the path, after "browse" or "issue", or is a part of the path by itself. */
function tracker(parts: string[]): Told | null {
  if (parts[0] === 'wiki') return wiki(parts.slice(1));
  const at = parts.findIndex((part) => part === 'browse' || part === 'issue' || part === 'issues');
  const key = (at >= 0 ? parts[at + 1] : undefined) ?? parts.find((part) => TICKET_KEY.test(part.toUpperCase()));
  if (key && TICKET_KEY.test(key.toUpperCase())) return { kind: 'ticket', label: key.toUpperCase() };
  return null;
}

/** A wiki page: its title is the last part of the path that is words. */
function wiki(parts: string[]): Told | null {
  const title = [...parts].reverse().find((part) => /[A-Za-z]{3}/.test(part) && !/^(spaces|pages|display|viewpage\.action|overview)$/.test(part));
  return { kind: 'document', label: short(words(title)) || 'Document' };
}

/** A design tool: the file's name follows its id. */
function design(parts: string[]): Told | null {
  const [what, , name] = parts;
  if (what !== 'file' && what !== 'design' && what !== 'proto' && what !== 'board') return null;
  return { kind: 'design', label: short(words(name)) || 'Design file' };
}

/** A chat: a thread or a message, by the shape of the path. The channel's own name is not in such an address. */
function chat(parts: string[], url: URL): Told | null {
  if (parts[0] === 'archives' && parts[1]) return { kind: 'chat', label: parts[2] && url.searchParams.has('thread_ts') ? 'Chat thread' : parts[2] ? 'Chat message' : 'Chat channel' };
  if (parts[0] === 'channels' && parts[1]) return { kind: 'chat', label: parts[3] ? 'Chat message' : 'Chat channel' };
  if (parts.length > 0) return { kind: 'chat', label: 'Chat' };
  return null;
}

/** A page of notes whose address ends in its title and a long id: the title without the id. */
function titledPage(parts: string[]): Told | null {
  const last = parts.at(-1);
  if (!last) return null;
  const title = words(last.replace(/-?[0-9a-f]{32}$/i, ''));
  return { kind: 'document', label: short(title) || 'Document' };
}

/** A document of an office suite: the address says which sort and nothing of its title. */
function officeDocument(parts: string[]): Told | null {
  const sort = { document: 'Document', spreadsheets: 'Spreadsheet', presentation: 'Slides', forms: 'Form', file: 'File', drive: 'Folder' }[parts[0] ?? ''];
  return sort ? { kind: 'document', label: sort } : null;
}

/**
 * The table. Easy to add to: a row is the hosts it is for and how to tell what an address there is. A host is
 * compared exactly, or by a registered suffix (`something.example.net`); never by whether it contains a word.
 */
const TABLE: readonly TableRow[] = [
  { hosts: [{ host: 'github.com' }, { host: 'gitlab.com' }, { host: 'bitbucket.org' }, { host: 'codeberg.org' }], tell: codeHost },
  { hosts: [{ suffix: 'atlassian.net' }, { host: 'linear.app' }, { suffix: 'youtrack.cloud' }], tell: tracker },
  { hosts: [{ suffix: 'slack.com' }, { host: 'discord.com' }], tell: chat },
  { hosts: [{ host: 'figma.com' }], tell: design },
  { hosts: [{ host: 'notion.so' }, { suffix: 'notion.site' }], tell: titledPage },
  { hosts: [{ host: 'docs.google.com' }, { host: 'drive.google.com' }], tell: officeDocument },
  // Hosts that are nobody's (reserved for examples): the demo's stand-ins use them, so that nothing it shows points at a real project.
  { hosts: [{ host: 'code.example.com' }], tell: codeHost },
  { hosts: [{ host: 'tickets.example.com' }], tell: tracker },
  { hosts: [{ host: 'chat.example.com' }], tell: chat },
  { hosts: [{ host: 'design.example.com' }], tell: design },
  { hosts: [{ host: 'docs.example.com' }], tell: titledPage },
];

/** Anything the table does not know: the host and the last part of the path. */
function plain(url: URL, parts: string[]): Told {
  const host = url.hostname.replace(/^www\./, '');
  const last = words(parts.at(-1)?.replace(/\.[a-z0-9]{1,5}$/i, ''));
  return { kind: 'link', label: short(last ? `${host} · ${last}` : host, 48) };
}

/** What kind an address is and what to call it, from the address alone. An address that cannot be a link is a plain one called by what it says. */
export function tellLink(address: string): Told {
  if (addressProblem(address) !== null) return { kind: 'link', label: short(showControl(address.trim()), 48) || 'Link' };
  const url = new URL(address.trim());
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  for (const row of TABLE) {
    if (!row.hosts.some((rule) => hostIs(rule, host))) continue;
    const told = row.tell(parts, url);
    if (told && told.label.trim() !== '') return told;
  }
  return plain(url, parts);
}

/** Whether the table knows what an address is: such a one, seen in a terminal, is kept without being asked. */
export const isRecognised = (address: string): boolean => tellLink(address).kind !== 'link';

/** Whether an address seen in a terminal may be kept by itself: of a kind the table knows, and carrying nothing after a question mark or a hash, where a secret might be. */
export function keptBySeeing(address: string): boolean {
  if (addressProblem(address) !== null || !isRecognised(address)) return false;
  const url = new URL(address.trim());
  return url.search === '' && url.hash === '';
}

// ---------- Addresses in text ----------

/** An address in running text: up to the first space or bracket, without the full stop or comma that ends a sentence. */
const IN_TEXT = /https?:\/\/[^\s<>"'`\\^{}|]+/g;

function trimmed(found: string): string {
  let address = found.replace(/[.,;:!?'"]+$/, '');
  // A closing bracket belongs to the sentence unless the address opened one.
  while (/[)\]]$/.test(address) && (address.match(/[([]/g)?.length ?? 0) < (address.match(/[)\]]/g)?.length ?? 0)) address = address.slice(0, -1);
  return address;
}

/** A text as the pieces it is made of: plain words, and the addresses in it that can be links. The pieces put together are the text. */
export function splitAddresses(text: string): ({ text: string } | { address: string })[] {
  const pieces: ({ text: string } | { address: string })[] = [];
  let from = 0;
  for (const match of text.matchAll(IN_TEXT)) {
    const address = trimmed(match[0]);
    if (addressProblem(address) !== null) continue;
    const at = match.index;
    if (at > from) pieces.push({ text: text.slice(from, at) });
    pieces.push({ address });
    from = at + address.length;
  }
  if (from < text.length) pieces.push({ text: text.slice(from) });
  return pieces;
}

/** The distinct addresses in a text that can be links, in the order they appear. */
export function addressesIn(text: string): string[] {
  const seen = new Set<string>();
  for (const piece of splitAddresses(text)) if ('address' in piece) seen.add(piece.address);
  return [...seen];
}

/** The last `SEEN_MAX` distinct addresses, newest last: what was remembered, with what was seen since. */
export function rememberSeen(remembered: readonly string[], seenNow: readonly string[]): string[] {
  const all = [...remembered.filter((address) => !seenNow.includes(address)), ...seenNow.filter((address, index) => seenNow.indexOf(address) === index)];
  return all.slice(-SEEN_MAX);
}

// ---------- Links of a terminal ----------

/** The links in the order they are drawn: by kind (ticket, pull request and branch first), then oldest first. */
export function sortedLinks<T extends Pick<SessionLink, 'kind' | 'at'>>(links: readonly T[]): T[] {
  return [...links].sort((a, b) => KIND_WORDS[a.kind].order - KIND_WORDS[b.kind].order || a.at.localeCompare(b.at));
}

/** The links under their headings, for where there are many; a group with none is left out. */
export function groupedLinks<T extends Pick<SessionLink, 'kind' | 'at'>>(links: readonly T[]): { group: LinkGroup; title: string; links: T[] }[] {
  const sorted = sortedLinks(links);
  return LINK_GROUPS.map(([group, title]) => ({ group, title, links: sorted.filter((link) => KIND_WORDS[link.kind].group === group) })).filter((entry) => entry.links.length > 0);
}

/** More links than this are drawn under the three headings. */
export const GROUP_LINKS_OVER = 4;
/** How many links' marks a terminal's title shows. */
export const TITLE_LINKS = 3;

/** A label for a chip: cut in the middle where it is long, so that both its start and its end can be read. */
export function middleCut(label: string, most = 28): string {
  if (label.length <= most) return label;
  const keep = most - 1;
  return `${label.slice(0, Math.ceil(keep / 2)).trimEnd()}…${label.slice(label.length - Math.floor(keep / 2)).trimStart()}`;
}

export interface LinkInput {
  url: string;
  label?: string | undefined;
  kind?: LinkKind | undefined;
}

/**
 * Adds a link, or says again what one is. The owner's own words win: where the owner set a link's label or kind,
 * what anyone else says about that address is kept beside it as a suggestion and changes nothing. Returns the new
 * list, or a sentence saying why not.
 */
export function addLink(links: readonly SessionLink[], input: LinkInput, who: { source: DescribedBy; by?: string | undefined; fromTerminal?: boolean }, now: string, newId: () => string): { links: SessionLink[]; link: SessionLink } | { problem: string } {
  const problem = addressProblem(input.url);
  if (problem) return { problem };
  const url = input.url.trim();
  const told = tellLink(url);
  const label = input.label?.trim() ? input.label.trim() : told.label;
  if (!LinkLabel.safeParse(label).success) return { problem: `A label is one line of plain text, at most ${LINK_LABEL_MAX} characters.` };
  const kind = input.kind ?? told.kind;
  const existing = links.find((link) => link.url === url);
  if (existing) {
    // What is found by looking never changes what somebody wrote.
    if (who.source === 'found') return { links: [...links], link: existing };
    if (who.source !== 'owner' && existing.ownerSet) {
      if (existing.label === label && existing.kind === kind) return { links: [...links], link: existing };
      const link = { ...existing, suggested: { label, kind, at: now } };
      return { links: links.map((other) => (other === existing ? link : other)), link };
    }
    const { suggested: _suggested, ...kept } = existing;
    const link: SessionLink = { ...kept, label, kind, ...(who.source === 'owner' ? { ownerSet: true as const } : {}) };
    // Said again by someone who writes: it is theirs now, and no longer only something that was seen.
    if (existing.source === 'found') Object.assign(link, { source: who.source, fromTerminal: undefined, ...(who.by ? { by: who.by } : {}) });
    return { links: links.map((other) => (other === existing ? link : other)), link };
  }
  if (links.length >= LINKS_MAX) return { problem: `A terminal keeps at most ${LINKS_MAX} links. Remove one first.` };
  const link: SessionLink = { id: newId(), url, kind, label, source: who.source, at: now, ...(who.by ? { by: who.by } : {}), ...(who.source === 'owner' && (input.label?.trim() || input.kind) ? { ownerSet: true as const } : {}), ...(who.fromTerminal ? { fromTerminal: true as const } : {}) };
  return { links: [...links, link], link };
}

/** Changes a link's label or kind. The owner's change is the owner's; anyone else's, on a link the owner set, is kept as a suggestion. */
export function changeLink(links: readonly SessionLink[], id: string, change: { label?: string | undefined; kind?: LinkKind | undefined }, who: DescribedBy, now: string): { links: SessionLink[]; link: SessionLink } | { problem: string } {
  const existing = links.find((link) => link.id === id);
  if (!existing) return { problem: 'There is no such link on this terminal.' };
  const label = change.label?.trim() ? change.label.trim() : existing.label;
  if (!LinkLabel.safeParse(label).success) return { problem: `A label is one line of plain text, at most ${LINK_LABEL_MAX} characters.` };
  const kind = change.kind ?? existing.kind;
  let link: SessionLink;
  if (who !== 'owner' && existing.ownerSet) link = { ...existing, suggested: { label, kind, at: now } };
  else {
    const { suggested: _suggested, ...kept } = existing;
    link = { ...kept, label, kind, ...(who === 'owner' ? { ownerSet: true as const } : {}) };
  }
  return { links: links.map((other) => (other === existing ? link : other)), link };
}

/** Removes a link. What the owner added or set is the owner's to remove. */
export function removeLink(links: readonly SessionLink[], id: string, who: DescribedBy): { links: SessionLink[] } | { problem: string } {
  const existing = links.find((link) => link.id === id);
  if (!existing) return { problem: 'There is no such link on this terminal.' };
  if (who !== 'owner' && (existing.source === 'owner' || existing.ownerSet)) return { problem: 'That link is the owner’s: only the owner removes it.' };
  return { links: links.filter((link) => link !== existing) };
}

/** Puts what was suggested for a link in place of what it says: the owner's decision. */
export function useSuggestedLink(links: readonly SessionLink[], id: string): SessionLink[] {
  return links.map((link) => {
    if (link.id !== id || !link.suggested) return link;
    const { suggested, ...kept } = link;
    return { ...kept, label: suggested.label, kind: suggested.kind };
  });
}

// ---------- Whether a terminal is described ----------

/** A summary older than this much work is taken to be out of date. */
export const SUMMARY_STALE_MS = 60 * 60 * 1000;

/**
 * What is missing from a terminal's description of itself: a name someone gave it, and a summary that is there and
 * was written within the last hour of its work. Worked out, never stored.
 */
export function undescribed(session: { note: string; written?: Written | undefined; lastInputAt: string | null; lastOutputAt: string | null }): ('name' | 'summary')[] {
  const missing: ('name' | 'summary')[] = [];
  if (!session.written?.name) missing.push('name');
  const worked = [session.lastInputAt, session.lastOutputAt].filter((time): time is string => typeof time === 'string').sort().at(-1) ?? null;
  const wrote = session.written?.summary?.at ?? null;
  const stale = wrote !== null && worked !== null && Date.parse(worked) - Date.parse(wrote) > SUMMARY_STALE_MS;
  if (session.note.trim() === '' || stale) missing.push('summary');
  return missing;
}

/** What an agent is told when it begins, in three short lines. Fixed text: nothing stored is in it. */
export const DESCRIBE_STEPS: readonly { say: string; command: string }[] = [
  { say: 'Name this terminal after the work', command: 'aubergine describe --name "<a few words>"' },
  { say: 'Keep its summary true, in a few lines', command: 'aubergine describe --summary "<what you are doing>"' },
  { say: 'Add every ticket, thread, design, document, branch and pull request you are given or make', command: 'aubergine link add https://tickets.example.com/browse/ABC-123' },
];
export const DESCRIBE_LINES: readonly string[] = DESCRIBE_STEPS.map((step) => `${step.say}: ${step.command}`);

/** What an agent is told when it stops with its terminal not described: what is missing, and how to set it. Said once in a turn. */
export function describeReminder(missing: readonly ('name' | 'summary')[]): string {
  const lines = [
    ...(missing.includes('name') ? ['This terminal still has the name it was made with. Name it after the work: aubergine describe --name "<a few words>".'] : []),
    ...(missing.includes('summary') ? ['Its summary is empty or older than the last hour of work. Say what you are doing in a few lines: aubergine describe --summary "<what you are doing>".'] : []),
  ];
  return `${lines.join(' ')} Then stop again: this is said once.`;
}

/** A conversation's id cut short for a fact: its first eight characters. The whole is copied. */
export const shortId = (id: string): string => (id.length <= 10 ? id : `${id.slice(0, 8)}…`);
