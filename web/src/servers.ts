import { z } from 'zod';
import { DEVICE_PREFIX, Id, LINK_NAME, PlainName, accessProblem, type Settings } from '@aubergine/shared';

/**
 * The linked servers of this browser: other Aubergines whose projects this page shows, each with the credential its
 * page device was given when it was linked. They are this browser's, kept in its storage for this page's address, and
 * nothing about them is ever sent to the server that served the page. Everything here is pure but the two functions
 * at the end, which read and write the one key.
 */

export interface LinkedServer {
  /** This browser's own short name for it, in the page's addresses (`/s/<id>/…`). Names nothing else. */
  id: string;
  /** What it is called here: one line of plain text, chosen by whoever linked it. */
  label: string;
  /** Its origin: where the browser sends its requests, and the only place its credential is sent. */
  address: string;
  /** The page device's secret, as that server gave it once. Sent as a bearer to `address` and nowhere else. */
  credential: string;
  /** That device's ID there: for revoking it on unlinking. */
  deviceId: string;
  addedAt: string;
}

export const SERVERS_KEY = 'aubergine.servers';
/** At most this many: the list is read on every load, and each is asked about when the project menu opens. */
export const MAX_SERVERS = 20;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

export const ServerLabel = PlainName.max(80);

/**
 * Where a server may be, for this page to link it: an origin and nothing more, https, or plain http only on this
 * computer's own names. The same rule a server applies to `access.pages`, said about a server here.
 */
export function serverAddressProblem(value: unknown): { ok: true; origin: string } | { ok: false; problem: string } {
  const typed = typeof value === 'string' ? value.trim().replace(/\/$/, '') : value;
  const checked = accessProblem('pages', typed);
  if (checked.ok) return { ok: true, origin: checked.origin };
  return { ok: false, problem: 'Write the address as the other Aubergine is opened, like https://aubergine.example.net: https, with nothing after the name and no user name. Plain http works only for 127.0.0.1 and localhost.' };
}

const Stored = z.object({
  id: z.string().regex(LINK_NAME),
  label: ServerLabel,
  address: z.string().max(300),
  credential: z.string().min(DEVICE_PREFIX.length + 1).max(300).startsWith(DEVICE_PREFIX).regex(/^[\x21-\x7e]+$/),
  deviceId: Id,
  addedAt: z.iso.datetime(),
});

/**
 * The list as stored, read tolerantly: anything that is not a list is no list; an entry that is wrong in any way is
 * dropped; of two entries with one ID or one address the first is kept. Never throws.
 */
export function readServers(raw: unknown): LinkedServer[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const servers: LinkedServer[] = [];
  for (const entry of parsed.slice(0, MAX_SERVERS * 2)) {
    const found = Stored.safeParse(entry);
    if (!found.success) continue;
    const where = serverAddressProblem(found.data.address);
    if (!where.ok || where.origin !== found.data.address) continue;
    if (servers.some((s) => s.id === found.data.id || s.address === found.data.address)) continue;
    servers.push({ id: found.data.id, label: found.data.label, address: found.data.address, credential: found.data.credential, deviceId: found.data.deviceId, addedAt: found.data.addedAt });
    if (servers.length === MAX_SERVERS) break;
  }
  return servers;
}

export const findServer = (servers: readonly LinkedServer[], id: string | null | undefined): LinkedServer | null => servers.find((s) => s.id === id) ?? null;
export const findByAddress = (servers: readonly LinkedServer[], address: string): LinkedServer | null => servers.find((s) => s.address === address) ?? null;

/** A new short name, unlike any in the list: eight characters drawn evenly from 36. */
export function newLinkId(servers: readonly LinkedServer[], random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  for (;;) {
    let id = '';
    while (id.length < ID_LENGTH) {
      for (const byte of random(new Uint8Array(16))) {
        // 252 is the largest multiple of 36 under 256: the rest is thrown away, so that no character comes up more often.
        if (byte < 252 && id.length < ID_LENGTH) id += ALPHABET[byte % 36];
      }
    }
    if (!servers.some((s) => s.id === id)) return id;
  }
}

/** The list with one more. Refused (the list as it was) where the entry does not pass, or its ID or address is in it already, or the list is full. */
export function addServer(servers: readonly LinkedServer[], entry: LinkedServer): LinkedServer[] {
  if (servers.length >= MAX_SERVERS) return [...servers];
  const both = readServers([...servers, entry]);
  return both.length === servers.length + 1 ? both : [...servers];
}

export const removeServer = (servers: readonly LinkedServer[], id: string): LinkedServer[] => servers.filter((s) => s.id !== id);

/** The list with one renamed. A name that does not pass leaves it as it was. */
export function renameServer(servers: readonly LinkedServer[], id: string, label: string): LinkedServer[] {
  const name = ServerLabel.safeParse(label);
  if (!name.success) return [...servers];
  return servers.map((s) => (s.id === id ? { ...s, label: name.data } : s));
}

/** The host of a server, as it is shown beside its label: what is known about it, not what it is called. */
export const hostOf = (server: Pick<LinkedServer, 'address'>): string => {
  try {
    return new URL(server.address).host;
  } catch {
    return server.address;
  }
};

/**
 * The settings that are about the page itself, not about terminals or agents: how it looks (the theme, and the
 * terminals' font) and the keys. Whatever server is shown, these are the own server's.
 */
export const PAGE_SETTINGS = ['theme', 'appearance', 'font', 'shortcuts', 'shortcutsInAppWindow'] as const satisfies readonly (keyof Settings)[];

/** The settings the page is drawn with: the server shown's, with the page's own taken from the own server. Pure. */
export function withPageSettings(shownSettings: Settings, own: Settings | null): Settings {
  if (own === null || own === shownSettings) return shownSettings;
  return { ...shownSettings, theme: own.theme, appearance: own.appearance, font: own.font, shortcuts: own.shortcuts, shortcutsInAppWindow: own.shortcutsInAppWindow };
}

/* ---------- This browser's storage ---------- */

/** Whether this browser lets the page keep anything: without that a server cannot be linked here. */
export function storageUsable(): boolean {
  try {
    const probe = `${SERVERS_KEY}.probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadServers(): LinkedServer[] {
  try {
    return readServers(localStorage.getItem(SERVERS_KEY));
  } catch {
    return [];
  }
}

/** Writes the list. False where it could not be kept. */
export function saveServers(servers: readonly LinkedServer[]): boolean {
  try {
    if (servers.length === 0) localStorage.removeItem(SERVERS_KEY);
    else localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
    return true;
  } catch {
    return false;
  }
}
