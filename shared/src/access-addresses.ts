/**
 * The addresses a server also answers under, and (later) the pages that may
 * show it. Both are lists of origins written by hand in the settings file and
 * read when the server starts. No route writes them: they decide who may reach
 * a shell.
 *
 * `accessProblem` is the whole rule for one entry. It takes nothing on trust:
 * an entry must be an origin and nothing more.
 */

/** Which list an entry is in. */
export type AccessListKind = 'addresses' | 'pages';

/** Names that are this computer's own: never an outside address, and the only ones a page may use plain HTTP on. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** An entry that passed: its origin as a browser writes it in `Origin` (lowercase, IDN as punycode, no default port). */
export interface AccessEntry {
  ok: true;
  origin: string;
  /** What a request's `Host` names when it came in under this origin. */
  host: string;
}

/** An entry that did not pass: a sentence saying what is wrong. */
export interface AccessRefusal {
  ok: false;
  problem: string;
}

/**
 * Whether one entry of `access.addresses` or `access.pages` can be used, and
 * the origin it stands for. An entry must be exactly an origin: a scheme, a
 * host and perhaps a port; no path beyond `/`, no query, no fragment, no user
 * name or password. An address must be `https`. A page must be `https`, or
 * `http` only on this computer's own names.
 */
export function accessProblem(kind: AccessListKind, value: unknown): AccessEntry | AccessRefusal {
  const where = kind === 'addresses' ? 'access.addresses' : 'access.pages';
  const refuse = (problem: string): AccessRefusal => ({ ok: false, problem: `${where}: ${problem}` });
  if (typeof value !== 'string') return refuse('every entry is a text like "https://aubergine.example.net".');
  const shown = JSON.stringify(value.slice(0, 200));
  if (value.trim() === '') return refuse('an entry is empty.');
  if (value !== value.trim() || /[\s\\]/.test(value)) return refuse(`${shown} has a space or a backslash in it.`);
  // Looked at as written, before the URL parser tidies anything away: "https://x/?" and "https://@x" parse cleanly.
  // Not repeated: what is before the @ may be a password.
  if (value.includes('@')) return refuse('an entry has a user name or a password in it; an address never carries one.');
  if (value.includes('?') || value.includes('#')) return refuse(`${shown} has a query or a fragment; write the origin alone, like "https://aubergine.example.net".`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return refuse(`${shown} is not an address.`);
  }
  if (url.username !== '' || url.password !== '') return refuse('an entry has a user name or a password in it; an address never carries one.');
  if (url.pathname !== '/' && url.pathname !== '') return refuse(`${shown} has a path; write the origin alone, like "https://aubergine.example.net".`);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return refuse(`${shown} is not an https address.`);
  if (url.hostname === '') return refuse(`${shown} has no host.`);
  if (url.hostname.endsWith('.')) return refuse(`${shown} ends its host with a dot; write it without.`);
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (kind === 'addresses') {
    if (url.protocol !== 'https:') return refuse(`${shown} is not https. An outside address is reached over HTTPS only.`);
    if (loopback) return refuse(`${shown} is this computer's own name; an outside address is a name the other device uses.`);
  } else if (url.protocol === 'http:' && !(url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
    return refuse(`${shown} is plain http on a host that is not this computer's own; a page elsewhere must be https.`);
  }
  return { ok: true, origin: url.origin, host: url.host };
}

/** The entries of one list that can be used, once each, and a sentence for every one that cannot. */
export function accessEntries(kind: AccessListKind, values: readonly unknown[]): { entries: AccessEntry[]; problems: string[] } {
  const entries: AccessEntry[] = [];
  const problems: string[] = [];
  for (const value of values) {
    const checked = accessProblem(kind, value);
    if (!checked.ok) problems.push(checked.problem);
    else if (!entries.some((entry) => entry.origin === checked.origin)) entries.push(checked);
  }
  return { entries, problems };
}
