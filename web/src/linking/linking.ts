import { PROTOCOL_VERSION, openProjects, readPairingCode, type ProjectRow } from '@aubergine/shared';
import { ApiError, NotUnderstood, ownApi, pairWith, projectsAt, revokeAt, type LinkedTarget } from '../api';
import { addServer, findByAddress, findServer, loadServers, newLinkId, removeServer, saveServers, ServerLabel, serverAddressProblem, type LinkedServer } from '../servers';
import { useApp } from '../store';

/**
 * Linking another Aubergine to this page, and unlinking it. The browser does it all itself: it sends the code to
 * that server, keeps the credential it is given, and sends that credential to that server alone. The own server is
 * told nothing of any of it.
 */

export const targetOf = (server: LinkedServer): LinkedTarget => ({ id: server.id, address: server.address, credential: server.credential });

/** Said where the other server runs another version: before anything of it is shown. */
export const OTHER_VERSION = 'That server runs another version of Aubergine than this page, and both must be the same. Nothing was linked.';

/** Said where no answer came at all: either it is not there, or the browser held the answer back because that server does not list this page. */
export const noAnswerWords = (origin: string): string =>
  `No answer came. Either the server is not reachable at that address, or it does not list this page: write ${origin} under access.pages in its config.json, and start it again.`;

/** What a failed try at linking says, as one sentence. Pure. */
export function linkFailureWords(error: unknown, origin: string): string {
  if (error instanceof NotUnderstood) return OTHER_VERSION;
  if (error instanceof ApiError) {
    if (error.status === 429) return `Too many tries at a code there. Try again in ${error.retryAfterSeconds ?? 60} s.`;
    if (error.status === 0) return noAnswerWords(origin);
    // The other server's own sentence: for a wrong code, one answer whatever was wrong.
    if (error.status === 401 || error.status === 403) return error.message;
    return `That server answered: ${error.message}`;
  }
  return noAnswerWords(origin);
}

/** The fields of the dialog, checked before anything is sent. A sentence for the first that is wrong, or what to send. */
export function checkLink(fields: { address: string; label: string; code: string }, pageOrigin: string, servers: readonly LinkedServer[]): { ok: true; origin: string; label: string; code: string } | { ok: false; problem: string } {
  const where = serverAddressProblem(fields.address);
  if (!where.ok) return { ok: false, problem: where.problem };
  if (where.origin === pageOrigin) return { ok: false, problem: 'That is the address of this page’s own server. Write the address of the other Aubergine.' };
  const known = findByAddress(servers, where.origin);
  if (known) return { ok: false, problem: `That server is linked already, as “${known.label}”.` };
  const label = ServerLabel.safeParse(fields.label);
  if (!label.success) return { ok: false, problem: 'Give it a name here: one line of plain text.' };
  const code = readPairingCode(fields.code);
  if (code === null) return { ok: false, problem: 'A code is ten letters and digits, as the other server printed it.' };
  return { ok: true, origin: where.origin, label: label.data, code };
}

/**
 * Links a server: sends the code there, refuses another version (and asks that server to revoke the device it just
 * made), keeps the server in this browser and shows it. Answers a sentence for what went wrong, or null.
 */
export async function linkServer(fields: { address: string; label: string; code: string }): Promise<string | null> {
  const servers = loadServers();
  const checked = checkLink(fields, location.origin, servers);
  if (!checked.ok) return checked.problem;
  let paired;
  try {
    paired = await pairWith(checked.origin, checked.code);
  } catch (error) {
    return linkFailureWords(error, location.origin);
  }
  const target: LinkedTarget = { id: '', address: checked.origin, credential: paired.credential };
  if (paired.protocolVersion !== PROTOCOL_VERSION) {
    void revokeAt(target, paired.device.id);
    return OTHER_VERSION;
  }
  const entry: LinkedServer = { id: newLinkId(servers), label: checked.label, address: checked.origin, credential: paired.credential, deviceId: paired.device.id, addedAt: new Date().toISOString() };
  const next = addServer(loadServers(), entry);
  if (next.length === servers.length || !saveServers(next)) {
    void revokeAt(target, paired.device.id);
    return 'This browser could not keep the server, so it was not linked, and its device there was revoked.';
  }
  useApp.getState().linkServer(false);
  useApp.getState().showServer(entry.id);
  return null;
}

/**
 * Unlinks a server: the own server is shown first if it was the one shown, the server leaves this browser, and that
 * server is asked to revoke the device. Says what was done.
 */
export async function unlinkServer(id: string): Promise<void> {
  const servers = loadServers();
  const entry = findServer(servers, id);
  const store = useApp.getState();
  store.askToUnlink(null);
  if (!entry) return;
  if (store.server === id) store.showServer(null);
  saveServers(removeServer(servers, id));
  const told = await revokeAt(targetOf(entry), entry.deviceId);
  useApp
    .getState()
    .say(told ? `“${entry.label}” is unlinked, and its device there is revoked.` : `“${entry.label}” is unlinked from this browser, but could not be told: its device is still listed there, and can be revoked in that server’s Settings → Devices.`);
}

/** This page's own device at the server shown was revoked from the page itself: that is unlinking it, done there already. */
export function revokedHere(): void {
  const id = useApp.getState().server;
  if (id === null) return;
  const entry = findServer(loadServers(), id);
  useApp.getState().showServer(null);
  saveServers(removeServer(loadServers(), id));
  useApp.getState().say(`“${entry?.label ?? 'The server'}” is unlinked: this page’s device there was revoked.`);
}

/* ---------- The project menu ---------- */

/** What the menu knows about a server's projects: being read, read, or one plain line saying why not. */
export type ProjectsKnown = { state: 'reading' } | { state: 'read'; projects: ProjectRow[] } | { state: 'failed'; words: string };

/** The line a server that is not shown gets in place of its projects, when they could not be read. Pure. */
export function projectsFailureWords(error: unknown): string {
  if (error instanceof NotUnderstood) return 'Runs another version of Aubergine: not shown here.';
  if (error instanceof ApiError && error.status === 401) return 'No longer takes this page’s sign-in. Link it again, or unlink it.';
  return 'Could not be reached just now.';
}

/** Reads the projects of a server that is not shown: the own one, or a linked one. Memory only. */
export async function readProjects(server: LinkedServer | null): Promise<ProjectsKnown> {
  try {
    const projects = server === null ? await ownApi.projects() : await projectsAt(targetOf(server));
    // Open ones, in their order: what the switcher of that server would list.
    return { state: 'read', projects: openProjects({ projects }) as ProjectRow[] };
  } catch (error) {
    return { state: 'failed', words: projectsFailureWords(error) };
  }
}
