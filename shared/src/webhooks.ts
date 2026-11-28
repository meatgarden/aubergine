import { z } from 'zod';
import { Id } from './ids';
import type { RuleEvent } from './tasks';

/**
 * Webhooks: an address the server sends a small signed message to when a
 * rule of the owner's fires. The addresses are written by hand in the
 * settings file, each under a name, and read when the server starts. No
 * route, command or token writes them, and a rule names one by its name
 * only: nobody but the owner at that file says where a request goes.
 *
 * `webhookProblem` is the whole rule for one entry. What it says about an
 * entry that is wrong never repeats the address or the secret: the path of an
 * address may itself be a key.
 */

/** Names that are this computer's own: the only ones a webhook may use plain HTTP on. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const WEBHOOKS_MAX = 20;
export const WEBHOOK_SECRET_MIN = 32;
export const WEBHOOK_SECRET_MAX = 256;
export const WEBHOOK_ADDRESS_MAX = 2000;
/** The longest message a webhook is sent, in bytes. What is built is far smaller; this is the sender's own bound. */
export const WEBHOOK_BODY_MAX_BYTES = 4096;
/** How long the whole request may take before it is given up. */
export const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * After this many attempts of one rule in a row that did not end with the receiver's yes, the rule's webhook is not
 * tried again until the rule is changed or the server starts again: a receiver that is gone is not knocked at for ever.
 */
export const WEBHOOK_FAILURES_MAX = 5;

/** A webhook's name: a short word of letters, digits, dots, dashes and underscores. It is written on command lines and in sentences. */
export const WEBHOOK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const WebhookName = z.string().regex(WEBHOOK_NAME, 'A webhook’s name is a short word: letters, digits, dots, dashes and underscores, at most 40.');

/** An entry that passed. The address and the secret stay in the server's memory and go nowhere but to the sender. */
export interface WebhookEntry {
  ok: true;
  name: string;
  address: string;
  secret: string;
  /** The host of the address, with its port where it has one: the most of an address that is ever shown. */
  host: string;
}
export interface WebhookRefusal {
  ok: false;
  /** The name, where the entry had one that can be said. */
  name: string | null;
  problem: string;
}

/** What may be shown of a webhook: its name and its address's host. Never the path, the query or the secret. */
export const WebhookShown = z.object({ name: z.string().max(40), host: z.string().max(300) });
export type WebhookShown = z.infer<typeof WebhookShown>;

/** What is wrong with an address a webhook is sent to, in words that do not repeat it; null when it can be used. */
export function webhookAddressProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return 'its "address" is missing; it is a text like "https://example.net/hooks/aubergine".';
  if (value.length > WEBHOOK_ADDRESS_MAX) return `its address is longer than ${WEBHOOK_ADDRESS_MAX} characters.`;
  // Looked at as written, before the URL parser tidies anything away.
  if (value !== value.trim() || /[\s\\\p{Cc}]/u.test(value)) return 'its address has a space, a backslash or a control character in it.';
  if (value.includes('#')) return 'its address has a fragment (a part after #); a fragment is never sent, so it is not written.';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'its address is not an address.';
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !value.includes('://')) return 'its address is not an https address.';
  // The part between the scheme and the path, as it was written: a parser may drop an empty user name.
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?]/)[0] ?? '';
  if (url.username !== '' || url.password !== '' || authority.includes('@')) return 'its address has a user name or a password in it; an address never carries one.';
  if (url.hostname === '') return 'its address has no host.';
  if (url.hostname.endsWith('.')) return 'its address ends its host with a dot; write it without.';
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) return 'its address is plain http on a host that is not this computer’s own; a webhook elsewhere is https.';
  return null;
}

/**
 * Whether one entry of `webhooks` can be used. An entry is `{ name, address, secret }`: a name that is a short word,
 * an `https` address (or `http` only on this computer's own names) with no user name, password or fragment, and a
 * secret of at least 32 characters. Nothing it says repeats the address or the secret.
 */
export function webhookProblem(value: unknown, index = 0): WebhookEntry | WebhookRefusal {
  const entry = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const named = entry !== null && typeof entry.name === 'string' && WEBHOOK_NAME.test(entry.name) ? entry.name : null;
  const where = named !== null ? `webhooks: “${named}”:` : `webhooks: entry ${index + 1}:`;
  const refuse = (problem: string): WebhookRefusal => ({ ok: false, name: named, problem: `${where} ${problem}` });
  if (entry === null) return refuse('is not an object with "name", "address" and "secret".');
  if (named === null) return refuse('its "name" is not a short word (letters, digits, dots, dashes and underscores, at most 40).');
  const address = webhookAddressProblem(entry.address);
  if (address !== null) return refuse(address);
  const secret = entry.secret;
  if (typeof secret !== 'string' || secret.length < WEBHOOK_SECRET_MIN) return refuse(`its "secret" is shorter than ${WEBHOOK_SECRET_MIN} characters. Make a long random one; the receiver checks each message with it.`);
  if (secret.length > WEBHOOK_SECRET_MAX || /[\p{Cc}]/u.test(secret)) return refuse(`its "secret" is longer than ${WEBHOOK_SECRET_MAX} characters or has a control character in it.`);
  return { ok: true, name: named, address: entry.address as string, secret, host: new URL(entry.address as string).host };
}

/** The entries that can be used, and a sentence for every one that cannot. Two entries with one name are both refused: which was meant cannot be told. */
export function webhookEntries(values: readonly unknown[]): { entries: WebhookEntry[]; problems: string[] } {
  const checked = values.map((value, index) => webhookProblem(value, index));
  const count = new Map<string, number>();
  for (const one of checked) if (one.ok) count.set(one.name.toLowerCase(), (count.get(one.name.toLowerCase()) ?? 0) + 1);
  const entries: WebhookEntry[] = [];
  const problems: string[] = [];
  for (const one of checked) {
    if (!one.ok) problems.push(one.problem);
    else if ((count.get(one.name.toLowerCase()) ?? 0) > 1) problems.push(`webhooks: “${one.name}”: two entries have this name, so neither is used.`);
    else entries.push(one);
  }
  return { entries, problems: [...new Set(problems)] };
}

/** What is shown of the entries that can be used. */
export const webhooksShown = (entries: readonly WebhookEntry[]): WebhookShown[] => entries.map((entry) => ({ name: entry.name, host: entry.host }));

/* ---------- What is sent ---------- */

const Named = (what: string) => z.strictObject({ id: Id.describe(`The ID of ${what}.`), name: z.string().max(120).describe(`The name of ${what}, as it was when this was sent. One line of plain text.`) });

/**
 * The message a webhook is sent: IDs, names, the event and the time. Nothing a terminal showed is in it: no command
 * line, no exit code, no note, no message, no question an agent asked, no title or text of a task, no folder.
 */
export const WebhookBody = z.strictObject({
  id: Id.describe('The ID of this delivery. New for every message; the same as the `X-Aubergine-Delivery` header.'),
  event: z.string().describe('What happened: one of the events a rule can hear, such as `terminal.waiting` or `task.done`. The same as the `X-Aubergine-Event` header.'),
  at: z.iso.datetime().describe('When the message was made, as an ISO time.'),
  text: z.string().max(300).describe('One line a person can read: fixed words and, for a terminal or a schedule, its name. It is there so that a chat tool’s incoming webhook shows something. Never what a terminal showed, a task said or an agent asked.'),
  project: Named('the project it happened in').describe('The project it happened in.'),
  terminal: Named('the terminal').optional().describe('For what happens to a terminal: that terminal. Its name may have been set by the agent in it.'),
  task: z.strictObject({ id: Id.describe('The ID of the task.') }).optional().describe('For what happens to a task, and for a schedule that fired: the task. Its ID only.'),
  schedule: Named('the schedule').optional().describe('For what happens to a schedule: that schedule.'),
  rule: z.strictObject({ id: Id.describe('The ID of the rule.') }).describe('The rule that sent this.'),
});
export type WebhookBody = z.infer<typeof WebhookBody>;

/** A name as it is sent: one line, no control characters, nothing that reverses direction, not long. */
export const sentName = (name: string): string =>
  name
    .replace(/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, '')
    .slice(0, 120)
    // A character of two halves that the cut went through is left out whole.
    .replace(/[\ud800-\udbff]$/, '');

/** The fixed words for what happened to a terminal: the one place they are written, for a rule's sentence and for a webhook's `text` alike. */
export function terminalSentence(name: string, event: 'terminal.waiting' | 'terminal.finished' | 'command.failed'): string {
  const said = sentName(name);
  return event === 'terminal.waiting' ? `The terminal “${said}” is waiting for you` : event === 'terminal.finished' ? `The terminal “${said}” finished` : `A command failed in the terminal “${said}”`;
}

/**
 * The line a webhook says: fixed words, and the name of the terminal or the schedule it is about. A task's title, why
 * it failed and what was asked of the owner are other people's text and are not in it.
 */
export function webhookText(event: RuleEvent, names: { terminal?: string | undefined; schedule?: string | undefined }): string {
  switch (event) {
    case 'terminal.waiting':
    case 'terminal.finished':
    case 'command.failed':
      return names.terminal === undefined ? { 'terminal.waiting': 'A terminal is waiting for you', 'terminal.finished': 'A terminal finished', 'command.failed': 'A command failed in a terminal' }[event] : terminalSentence(names.terminal, event);
    case 'task.done':
      return 'A task is done';
    case 'task.failed':
      return 'A task failed';
    case 'task.needs-owner':
      return 'A task needs you';
    case 'ask.added':
      return 'Something is asked of you';
    case 'schedule.fired':
      return names.schedule === undefined ? 'A schedule fired' : `The schedule “${sentName(names.schedule)}” fired`;
    case 'schedule.failed':
      return names.schedule === undefined ? 'A schedule could not run or was missed' : `The schedule “${sentName(names.schedule)}” could not run or was missed`;
  }
}

/* ---------- Signing ---------- */

export const WEBHOOK_HEADERS = { event: 'X-Aubergine-Event', delivery: 'X-Aubergine-Delivery', signature: 'X-Aubergine-Signature' } as const;

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The signature of one message: the HMAC-SHA256, in hex, of `<seconds>.<body>` with the webhook's secret, where
 * `<seconds>` is the time of signing in whole seconds since 1970 and `<body>` the bytes that are sent.
 */
export async function webhookSignature(secret: string, seconds: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${seconds}.${body}`)));
}

/** The value of `X-Aubergine-Signature`: `t=<seconds>,v1=<signature>`. */
export const webhookSignatureHeader = async (secret: string, seconds: number, body: string): Promise<string> => `t=${seconds},v1=${await webhookSignature(secret, seconds, body)}`;
