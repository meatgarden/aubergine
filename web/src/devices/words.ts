import { DEVICE_UNUSED_DAYS, deviceStatus, type ActivityEntry, type Device } from '@aubergine/shared';

/** What the page says about devices, codes and who did what: pure, so that it is tested without a page. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago, in a few words: "just now", "5 min ago", "3 h ago", "12 days ago", "over a year ago". */
export function ago(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'at a time not known';
  const past = Math.max(0, now - then);
  if (past < MINUTE) return 'just now';
  if (past < HOUR) return `${Math.floor(past / MINUTE)} min ago`;
  if (past < DAY) return `${Math.floor(past / HOUR)} h ago`;
  const days = Math.floor(past / DAY);
  if (days === 1) return 'yesterday';
  if (days < 365) return `${days} days ago`;
  return 'over a year ago';
}

export interface DeviceWords {
  name: string;
  /** What is known about it, each said apart: when it was added, when it was last used, where a page is. */
  known: string[];
  /** Its state, only when it is not active. */
  chip: string | null;
  /** The browser that asked. */
  thisDevice: boolean;
}

/** The host of a page's origin, for what is known about it; null where it cannot be read as an address. */
function hostOf(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host || null;
  } catch {
    return null;
  }
}

/** The words of one row of the list of devices. */
export function deviceWords(device: Pick<Device, 'name' | 'kind' | 'origin' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>, now: number, thisDevice: boolean): DeviceWords {
  const status = deviceStatus(device, now);
  const host = device.kind === 'page' ? hostOf(device.origin) : null;
  return {
    name: device.name,
    known: [`added ${ago(device.createdAt, now)}`, device.lastUsedAt ? `last used ${ago(device.lastUsedAt, now)}` : 'never used', ...(host ? [host] : [])],
    chip: status === 'revoked' ? 'revoked' : status === 'unused' ? `unused for ${DEVICE_UNUSED_DAYS} days` : null,
    thisDevice,
  };
}

/** Newest first, the ones that still work before the others. */
export function devicesInOrder<T extends Pick<Device, 'createdAt' | 'lastUsedAt' | 'revokedAt'>>(devices: readonly T[], now: number): T[] {
  const active = (d: T): number => (deviceStatus(d, now) === 'active' ? 0 : 1);
  return [...devices].sort((a, b) => active(a) - active(b) || b.createdAt.localeCompare(a.createdAt));
}

/** How long a code still works, said each second: "Works for 2:45 more", until it has run out. */
export function countdownWords(expiresAt: string, now: number): { words: string; over: boolean } {
  const left = Math.ceil((Date.parse(expiresAt) - now) / 1000);
  if (!Number.isFinite(left) || left <= 0) return { words: 'This code has run out', over: true };
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, '0');
  return { words: `Works once, for ${minutes}:${seconds} more`, over: false };
}

/** The address a new browser opens to sign in: an outside address, with the code after the `#`. */
export const signInAddress = (address: string, code: string): string => `${address.replace(/\/+$/, '')}/#pair=${code}`;

/** What the activity screen says a line was done by. */
export function callerWords(
  entry: Pick<ActivityEntry, 'caller' | 'tokenName' | 'byDeviceId' | 'fromSessionId'>,
  deviceName: (id: string) => string | null,
  sessionName: (id: string) => string | null,
): string {
  switch (entry.caller) {
    case 'owner-cli':
      return `you, from the command line${entry.fromSessionId ? ` (it says: inside “${sessionName(entry.fromSessionId) ?? 'a terminal that is gone'}”)` : ''}`;
    case 'owner':
      return 'Owner';
    case 'device': {
      const name = entry.byDeviceId ? deviceName(entry.byDeviceId) : null;
      return name ? `Owner, on ${name}` : 'A device';
    }
    case 'pairing':
      return 'Sign-in with a code';
    case 'rule':
      return entry.tokenName || 'A rule';
    case 'schedule':
      return entry.tokenName || 'A schedule';
    default:
      return entry.tokenName;
  }
}

/** The device a line is about, where it is about one: "device “Phone”". */
export function aboutDevice(entry: Pick<ActivityEntry, 'deviceId' | 'deviceName'>, deviceName: (id: string) => string | null): string | null {
  const name = entry.deviceName ?? (entry.deviceId ? deviceName(entry.deviceId) : null);
  if (name) return `device “${name}”`;
  return entry.deviceId ? 'a device' : null;
}
