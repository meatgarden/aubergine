import { z } from 'zod';
import { MAX_DIRECTORY_BYTES, byOrganization, directoryAddressProblem, readDirectory, type Directory, type DirectoryServer } from '@aubergine/shared';
import { ApiError, directoryTextAt } from '../api';
import { findByAddress, type LinkedServer } from '../servers';

/**
 * The directories of this browser: addresses of files that list Aubergine servers, so that a person finds the ones
 * of their organization. Only the addresses are kept, in this browser's storage; what a directory says is read when
 * the person opens "Link a server…" or adds one, held in memory while that is open, and kept nowhere.
 *
 * A directory is told nothing: the file is asked for without a cookie, a credential or a referrer. The page's own
 * server and the linked servers are told nothing of any directory. Reading one links nothing.
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

/** A directory as it was read just now, or one sentence saying why not. */
export type DirectoryKnown = { state: 'reading' } | { state: 'read'; directory: Directory } | { state: 'failed'; words: string };

/** Asks for a directory and reads it. Memory only; never throws. */
export async function fetchDirectory(address: string): Promise<DirectoryKnown> {
  let text: string;
  try {
    text = await directoryTextAt(address, MAX_DIRECTORY_BYTES);
  } catch (error) {
    return {
      state: 'failed',
      words: directoryFailureWords(error, location.origin),
    };
  }
  const read = readDirectory(text);
  return read.ok ? { state: 'read', directory: read.directory } : { state: 'failed', words: read.problem };
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
