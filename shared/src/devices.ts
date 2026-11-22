import { z } from 'zod';
import { Id } from './ids';
import { PlainName } from './workflows';

/**
 * Devices: browsers the owner signed in on from an outside address. Each has
 * a credential of its own, made by pairing with a code the owner asked for.
 * The secret exists once, in the cookie the device was given; only a hash of
 * it is kept. A device is the owner: it may do everything the owner may.
 *
 * Devices are the server's, not a project's: like API tokens they are shared
 * with every project, and unlike them they are never listed on the sharing
 * page, never seen by a token and never by a session.
 */

/** Every device's secret starts with this, so that one found in a file or a log can be recognised for what it is. */
export const DEVICE_PREFIX = 'aubd_';

/** A device not used for this many days stops working. Not a setting. */
export const DEVICE_UNUSED_DAYS = 90;

/** How long a pairing code works, and how many may wait at a time. */
export const PAIRING_CODE_MINUTES = 3;
export const PAIRING_CODES_WAITING = 3;

const Timestamp = z.iso.datetime();

/** `browser`: a browser signed in with a cookie. `page`: the page of another Aubergine that shows this server, signed in with a bearer credential from its own origin. */
export const DeviceKind = z.enum(['browser', 'page']);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const DeviceName = PlainName.max(80);

/** A device as it is stored. `hash` is the SHA-256 of the secret; the secret itself is never stored. */
export const Device = z.object({
  id: Id,
  name: DeviceName,
  kind: DeviceKind,
  /** For a page: the origin it was paired from. Null for a browser. */
  origin: z.string().max(300).nullable().default(null),
  hash: z.string(),
  createdAt: Timestamp,
  /** Recorded at most about once a minute, not on every request. */
  lastUsedAt: Timestamp.nullable().default(null),
  revokedAt: Timestamp.nullable().default(null),
});
export type Device = z.infer<typeof Device>;

export type DeviceStatus = 'active' | 'revoked' | 'unused';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a device may still sign in: not revoked, and used (or made) within the last `DEVICE_UNUSED_DAYS` days. */
export function deviceStatus(device: Pick<Device, 'revokedAt' | 'lastUsedAt' | 'createdAt'>, now: number = Date.now()): DeviceStatus {
  if (device.revokedAt !== null) return 'revoked';
  const last = Date.parse(device.lastUsedAt ?? device.createdAt);
  if (!Number.isFinite(last) || now - last > DEVICE_UNUSED_DAYS * DAY_MS) return 'unused';
  return 'active';
}

/** A device as the owner sees it: everything but the hash, its state, and whether it is the one asking. */
export const DeviceView = Device.omit({ hash: true }).extend({
  status: z.enum(['active', 'revoked', 'unused']),
  /** True for the device the request came from. */
  current: z.boolean(),
});
export type DeviceView = z.infer<typeof DeviceView>;

export const viewOfDevice = (device: Device, now: number, currentId: string | null): DeviceView => {
  const { hash: _hash, ...view } = device;
  return { ...view, status: deviceStatus(device, now), current: device.id === currentId };
};

export const DeviceList = z.object({ devices: z.array(DeviceView) });
export type DeviceList = z.infer<typeof DeviceList>;

/**
 * Asking for a pairing code. `browser`: a browser at an outside address, which is given a cookie. `page`: the page of
 * another Aubergine, at `origin`, which is given a credential to send itself; the origin must be in `access.pages`.
 */
export const PairingCodeRequest = z.discriminatedUnion('kind', [
  z.object({
    name: DeviceName.describe('What the device will be called: "Phone".'),
    kind: z.literal('browser').describe('A browser at an outside address.'),
  }),
  z.object({
    name: DeviceName.describe('What the linked page will be called: "Laptop".'),
    kind: z.literal('page').describe('The page of another Aubergine, which shows this server.'),
    origin: z.string().max(300).describe('The origin of that page, exactly as written in access.pages.'),
  }),
]);
export type PairingCodeRequest = z.infer<typeof PairingCodeRequest>;

/** A pairing code. Shown once; it works once, until `expiresAt`. */
export const PairingCodeAnswer = z.object({
  code: z.string(),
  expiresAt: Timestamp,
  /** The outside addresses this server answers under: where the code is used. Empty: none is written in the settings. */
  addresses: z.array(z.string()),
});
export type PairingCodeAnswer = z.infer<typeof PairingCodeAnswer>;

/** What a new browser sends to become a device. */
export const PairRequest = z.object({ code: z.string().max(64) });
export type PairRequest = z.infer<typeof PairRequest>;

/**
 * What a linked page is answered when its code was right: its credential, to send as `Authorization: Bearer` from
 * its own origin and from nowhere else. The credential exists once, in this answer; the server keeps its hash.
 */
export const PairedPage = z.object({
  credential: z.string(),
  device: z.object({ id: Id, name: DeviceName }),
  protocolVersion: z.number().int(),
});
export type PairedPage = z.infer<typeof PairedPage>;

/** How long a socket ticket works, and how many may wait for one device. */
export const SOCKET_TICKET_SECONDS = 30;
export const SOCKET_TICKETS_WAITING = 50;

/** A ticket for one WebSocket of a linked page, which cannot put a header on one: it goes in the address as `?ticket=`, and works once. */
export const SocketTicket = z.object({ ticket: z.string(), expiresAt: Timestamp });
export type SocketTicket = z.infer<typeof SocketTicket>;

/** The answer to revoking: the device as it now is. */
export const RevokedDevice = z.object({ device: DeviceView });
export type RevokedDevice = z.infer<typeof RevokedDevice>;

/* ---------- Pairing codes ---------- */

/** The 32 characters a code is made of: no I, L, O or U, which look like others or spell words. */
export const PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAIRING_CODE_LENGTH = 10;

/** A code as it is shown: two groups of five. */
export const showPairingCode = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`;

/** A code as typed, made comparable: either case, with or without the dash. Null when it cannot be a code at all. */
export function readPairingCode(typed: string): string | null {
  const plain = typed.trim().toUpperCase().replace(/^(.{5})-(.{5})$/, '$1$2');
  if (plain.length !== PAIRING_CODE_LENGTH) return null;
  for (const char of plain) if (!PAIRING_ALPHABET.includes(char)) return null;
  return plain;
}
