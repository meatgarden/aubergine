import { z } from 'zod';
import { accessProblem } from './access-addresses';
import { PlainName } from './workflows';

/**
 * A directory: a list of Aubergine servers, written by whoever looks after them, so that a person finds the ones of
 * their organization without being sent each address by hand. It is a JSON file at an address, read by a browser
 * when the person asks.
 *
 * A directory is a phone book and nothing more. It holds no code and no credential, and reading one links nothing:
 * a server is still linked with a code made at that server. What a directory calls itself, a server or an
 * organization is its own claim.
 *
 * `readDirectory` is the whole rule of what a file is; `directoryAddressProblem` the whole rule of where one may be.
 */

/** The version of the format, in the file's `aubergineDirectory`. */
export const DIRECTORY_FORMAT = 1;
/** A file larger than this is refused before it is read as JSON. */
export const MAX_DIRECTORY_BYTES = 256 * 1024;
/** A file that lists more servers than this is refused. */
export const MAX_DIRECTORY_SERVERS = 500;

const DirectoryName = PlainName.max(80);
/** One line said about a server: what it is for, who to ask for a code. */
const DirectoryNote = PlainName.max(200);

export interface DirectoryServer {
  /** What the directory calls it. */
  label: string;
  /** Its origin, by the rule a page links a server by. */
  address: string;
  /** The organization the directory says it belongs to, or null where it says none. */
  organization: string | null;
  note: string | null;
}

export interface Directory {
  /** What the directory calls itself. */
  name: string;
  servers: DirectoryServer[];
}

const FileServer = z.object({
  label: DirectoryName.describe('What the server is called.'),
  address: z.string().max(300).describe('Where the server is opened: an origin, like https://aubergine.example.net.'),
  organization: DirectoryName.optional().describe('The organization it belongs to.'),
  note: DirectoryNote.optional().describe('One line about it: what it is for, or who gives a code.'),
});

const File = z.object({
  aubergineDirectory: z.number().describe('The version of this format.'),
  name: DirectoryName.describe('What the directory is called.'),
  servers: z.array(z.unknown()).describe('The servers it lists.'),
});

export type DirectoryRead = { ok: true; directory: Directory } | { ok: false; problem: string };

/**
 * Reads the text of a directory file. A file that is wrong in any way is refused whole, with a sentence; fields it
 * does not know are left out. Never throws.
 */
export function readDirectory(text: unknown): DirectoryRead {
  const refuse = (problem: string): DirectoryRead => ({ ok: false, problem });
  if (typeof text !== 'string') return refuse('That is not a directory of Aubergine servers.');
  // Characters, not bytes: a file within the bound in bytes is within it in characters too.
  if (text.length > MAX_DIRECTORY_BYTES) return refuse('That directory is too large to read.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse('That is not a directory of Aubergine servers: it is not JSON.');
  }
  const file = File.safeParse(parsed);
  if (!file.success) return refuse('That is not a directory of Aubergine servers: it needs "aubergineDirectory", a "name" of one plain line and a list of "servers".');
  if (file.data.aubergineDirectory !== DIRECTORY_FORMAT) return refuse('That directory is written in another version of the format than this page reads.');
  if (file.data.servers.length > MAX_DIRECTORY_SERVERS) return refuse(`That directory lists more than ${MAX_DIRECTORY_SERVERS} servers.`);
  const servers: DirectoryServer[] = [];
  for (const [index, entry] of file.data.servers.entries()) {
    const nth = `Server ${index + 1} of that directory`;
    const server = FileServer.safeParse(entry);
    if (!server.success) return refuse(`${nth} is not understood: it needs a "label" of one plain line and an "address".`);
    const where = accessProblem('pages', server.data.address.replace(/\/$/, ''));
    if (!where.ok) return refuse(`${nth} has an address that is not one: write it as the server is opened, like https://aubergine.example.net.`);
    if (servers.some((s) => s.address === where.origin)) return refuse(`${nth} has the address of one before it.`);
    servers.push({
      label: server.data.label,
      address: where.origin,
      organization: server.data.organization ?? null,
      note: server.data.note ?? null,
    });
  }
  return { ok: true, directory: { name: file.data.name, servers } };
}

/**
 * Where a directory may be: an https address of a file (plain http only on this computer's own names), with no user
 * name, password, query or fragment. Answers the address as it is asked for.
 */
export function directoryAddressProblem(value: unknown): { ok: true; address: string } | { ok: false; problem: string } {
  const problem = 'Write the address of the directory file, like https://example.net/aubergine-directory.json: https, with no user name and nothing after a ? or a #.';
  if (typeof value !== 'string') return { ok: false, problem };
  const typed = value.trim();
  // Looked at as written, before the URL parser tidies anything away.
  if (typed === '' || typed.length > 500 || /[\s\\@?#]/.test(typed)) return { ok: false, problem };
  let url: URL;
  try {
    url = new URL(typed);
  } catch {
    return { ok: false, problem };
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.hostname === '') return { ok: false, problem };
  const own = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && own)) return { ok: false, problem };
  return { ok: true, address: url.href };
}

export interface DirectoryGroup {
  /** The organization, or null for the servers the directory names none for. */
  organization: string | null;
  servers: DirectoryServer[];
}

/**
 * A directory's servers by organization: organizations in the order the file first names them, the servers of each
 * in the file's order, and those of no organization last. Pure.
 */
export function byOrganization(directory: Directory): DirectoryGroup[] {
  const groups: DirectoryGroup[] = [];
  for (const server of directory.servers) {
    const group = groups.find((g) => g.organization === server.organization);
    if (group) group.servers.push(server);
    else groups.push({ organization: server.organization, servers: [server] });
  }
  return [...groups.filter((g) => g.organization !== null), ...groups.filter((g) => g.organization === null)];
}
