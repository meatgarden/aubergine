import { z } from 'zod';
import { MAX_DIRECTORY_BYTES, byOrganization, directoryAddressProblem, readDirectory, readSignedIn, signInWindowAddress, type Directory, type DirectoryServer } from '@aubergine/shared';
import { ApiError, DirectoryAsks, directoryTextAt } from '../api';
import { findByAddress, type LinkedServer } from '../servers';

/**
 * The directories of this browser: addresses of files that list Aubergine servers, so that a person finds the ones
 * of their organization. Only the addresses are kept, in this browser's storage; what a directory says is read when
 * the person opens "Link a server…" or adds one, held in memory while that is open, and kept nowhere.
 *
 * A directory is told nothing: the file is asked for without a cookie or a referrer. The page's own server and the
 * linked servers are told nothing of any directory. Reading one links nothing.
 *
 * A directory may ask who the person is. Its own sign-in window then hands this page a token, which is held in this
 * module's memory only (gone with a reload, never in storage, an address, a log or a sentence) and sent to that
 * directory's address alone. It says who reads the phone book; it is no server's credential.
 */

export interface KeptDirectory {
  /** Where the file is: asked for exactly as kept. */
  address: string;
  addedAt: string;
}

export const DIRECTORIES_KEY = 'aubergine.directories';
/** At most this many: each is asked for when "Link a server…" opens. */
export const MAX_DIRECTORIES = 5;

const Stored = z.object({
  address: z.string().max(500),
  addedAt: z.iso.datetime(),
});

/** The list as stored, read tolerantly: a wrong entry is dropped, of two with one address the first is kept. Never throws. */
export function readDirectories(raw: unknown): KeptDirectory[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const kept: KeptDirectory[] = [];
  for (const entry of parsed.slice(0, MAX_DIRECTORIES * 2)) {
    const found = Stored.safeParse(entry);
    if (!found.success) continue;
    const where = directoryAddressProblem(found.data.address);
    if (!where.ok || where.address !== found.data.address) continue;
    if (kept.some((d) => d.address === where.address)) continue;
    kept.push({ address: where.address, addedAt: found.data.addedAt });
    if (kept.length === MAX_DIRECTORIES) break;
  }
  return kept;
}

/** What was typed as a directory's address, checked before anything is asked. A sentence for what is wrong, or the address. Pure. */
export function checkDirectory(typed: string, kept: readonly KeptDirectory[]): { ok: true; address: string } | { ok: false; problem: string } {
  const where = directoryAddressProblem(typed);
  if (!where.ok) return where;
  if (kept.some((d) => d.address === where.address)) return { ok: false, problem: 'That directory is here already.' };
  if (kept.length >= MAX_DIRECTORIES)
    return {
      ok: false,
      problem: `This browser keeps ${MAX_DIRECTORIES} directories at most. Remove one first.`,
    };
  return where;
}

export const removeDirectory = (kept: readonly KeptDirectory[], address: string): KeptDirectory[] => kept.filter((d) => d.address !== address);

/** The host a directory is read from: what is known about it, beside what it calls itself. */
export const directoryHost = (address: string): string => {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
};

/** What a directory that could not be read says, as one sentence. Pure. */
export function directoryFailureWords(error: unknown, pageOrigin: string): string {
  if (error instanceof ApiError && error.status === 413) return 'That directory is too large to read.';
  if (error instanceof ApiError && error.status !== 0) return `The directory’s address answered ${error.status}, not a file.`;
  return `No answer came. Either the directory is not reachable at that address, or it does not let this page read it: whoever keeps it must send Access-Control-Allow-Origin for ${pageOrigin}.`;
}

/**
 * A directory as it was read just now, or one sentence saying why not. `asks`: it wants to know who the person is
 * first; `signIn` is where its sign-in page is (null: it did not say in a way this page knows), and `again` that a
 * token this page held was no longer taken.
 */
export type DirectoryKnown = { state: 'reading' } | { state: 'read'; directory: Directory } | { state: 'failed'; words: string } | { state: 'asks'; signIn: string | null; again: boolean };

/** The token each directory's own sign-in window handed this page, by the directory's address. Memory only. */
const tokens = new Map<string, string>();

/** Forgets what a directory's sign-in gave: when the directory is removed, and when it no longer takes it. */
export const forgetDirectoryToken = (address: string): void => void tokens.delete(address);
export const holdsDirectoryToken = (address: string): boolean => tokens.has(address);

/** Asks for a directory and reads it. Memory only; never throws. */
export async function fetchDirectory(address: string): Promise<DirectoryKnown> {
  let text: string;
  const token = tokens.get(address) ?? null;
  try {
    text = await directoryTextAt(address, MAX_DIRECTORY_BYTES, token);
  } catch (error) {
    if (error instanceof DirectoryAsks) {
      // A token that was sent and not taken is of no more use.
      tokens.delete(address);
      return { state: 'asks', signIn: error.signIn, again: token !== null };
    }
    return { state: 'failed', words: directoryFailureWords(error, location.origin) };
  }
  const read = readDirectory(text);
  return read.ok ? { state: 'read', directory: read.directory } : { state: 'failed', words: read.problem };
}

/* ---------- Signing in to a directory ---------- */

/** How a try at signing in ended. `blocked`: the browser opened no window. `closed`: the window went before it handed anything over. */
export type SignInEnded = 'signed-in' | 'blocked' | 'closed' | 'refused';

/** What a try says while it waits, and how it ended, as one sentence each. Pure. */
export const SIGN_IN_WAITING = 'Finish signing in in the window that opened.';
export function signInEndedWords(ended: Exclude<SignInEnded, 'signed-in'>): string {
  if (ended === 'blocked') return 'The browser opened no window. Allow pop-ups for this page, and try again.';
  if (ended === 'closed') return 'The window was closed before it signed in.';
  return 'That directory’s sign-in is not one this page can open.';
}

/** How often the window is looked at, and how long a try may take. Timers, so that they go on in a tab that is not showing. */
const LOOK_EVERY_MS = 500;
const SIGN_IN_WITHIN_MS = 10 * 60_000;

/** The name of one try: 24 characters from this browser's randomness. */
function newRequestName(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  while (name.length < 24) for (const byte of crypto.getRandomValues(new Uint8Array(32))) if (byte < 252 && name.length < 24) name += alphabet[byte % 36];
  return name;
}

/**
 * Opens a directory's own sign-in page in a window, and waits for it to hand a token back. Called from the click
 * itself, since a browser opens a window only then. The token is taken only from a message that came from that
 * directory's origin, from the very window that was opened, for this very try; anything else is not listened to.
 * It is kept in memory for that directory's address and is in no sentence, log or address. The window is the one
 * place this page opens another site with a way back to itself: that is what lets it hand the token over.
 */
export function signInToDirectory(address: string, signIn: string): Promise<SignInEnded> {
  const request = newRequestName();
  const href = signInWindowAddress(signIn, location.origin, request);
  let origin: string;
  try {
    origin = new URL(address).origin;
    if (href === null || new URL(signIn).origin !== origin) return Promise.resolve('refused');
  } catch {
    return Promise.resolve('refused');
  }
  const opened = window.open(href, '_blank', 'popup,width=520,height=680');
  if (opened === null) return Promise.resolve('blocked');
  return new Promise((resolve) => {
    const started = Date.now();
    const end = (ended: SignInEnded): void => {
      window.removeEventListener('message', hear);
      window.clearInterval(looking);
      resolve(ended);
    };
    const hear = (event: MessageEvent): void => {
      if (event.origin !== origin || event.source !== opened) return;
      const token = readSignedIn(event.data, request);
      if (token === null) return;
      tokens.set(address, token);
      try {
        opened.close();
      } catch {
        // The window is the directory's: it may close itself.
      }
      end('signed-in');
    };
    const looking = window.setInterval(() => {
      if (opened.closed || Date.now() - started > SIGN_IN_WITHIN_MS) end('closed');
    }, LOOK_EVERY_MS);
    window.addEventListener('message', hear);
  });
}

/** A server of a directory as its row says it: what this browser already knows about that address. */
export interface DirectoryRow {
  server: DirectoryServer;
  host: string;
  /** What it is linked as in this browser, or null. */
  linkedAs: string | null;
  /** It is the server this page came from. */
  own: boolean;
}

/** A directory's rows by organization, each with what this browser knows of it. Pure. */
export function directoryRows(directory: Directory, servers: readonly LinkedServer[], pageOrigin: string): { organization: string | null; rows: DirectoryRow[] }[] {
  return byOrganization(directory).map((group) => ({
    organization: group.organization,
    rows: group.servers.map((server) => ({
      server,
      host: directoryHost(server.address),
      linkedAs: findByAddress(servers, server.address)?.label ?? null,
      own: server.address === pageOrigin,
    })),
  }));
}

/* ---------- This browser's storage ---------- */

export function loadDirectories(): KeptDirectory[] {
  try {
    return readDirectories(localStorage.getItem(DIRECTORIES_KEY));
  } catch {
    return [];
  }
}

/** Writes the list. False where it could not be kept. */
export function saveDirectories(kept: readonly KeptDirectory[]): boolean {
  try {
    if (kept.length === 0) localStorage.removeItem(DIRECTORIES_KEY);
    else localStorage.setItem(DIRECTORIES_KEY, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}
