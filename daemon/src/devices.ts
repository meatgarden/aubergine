import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DEVICE_PREFIX, deviceStatus, newId, type Device, type DeviceKind, type DeviceStatus } from '@aubergine/shared';
import type { StateHub } from './state-hub';
import { LAST_USED_INTERVAL_MS, hashSecret } from './tokens';

export class DeviceNotFoundError extends Error {}

/** A new device's secret: the prefix that marks it, then 32 random bytes. */
export function newDeviceSecret(): string {
  return `${DEVICE_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** A hash no secret has, compared against when there is no device at all, so that the work done does not say so. */
const NOBODY = Buffer.from(hashSecret(`${DEVICE_PREFIX}nobody`), 'hex');

/**
 * Devices: making one when a pairing code was right, finding the one a
 * secret belongs to, noting that it was used, revoking it. Changes go
 * through the hub as events, like every change of state. Only a hash of a
 * secret is ever stored; the secret leaves the server once, in a cookie.
 */
export class Devices {
  private readonly touchedAt = new Map<string, number>();

  constructor(
    private readonly hub: StateHub,
    private readonly now: () => number = Date.now,
  ) {}

  list(): Device[] {
    // Newest first; made in the same moment, the later ID (they are ordered by time) first.
    return [...this.hub.state.devices].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  find(deviceId: string): Device | undefined {
    return this.hub.state.devices.find((d) => d.id === deviceId);
  }

  /** Makes a device. The secret in the answer exists nowhere else: it is not stored and cannot be shown again. */
  create(input: { name: string; kind: DeviceKind; origin?: string | null; person?: string | null }): { device: Device; secret: string } {
    const secret = newDeviceSecret();
    const device: Device = {
      id: newId(),
      name: input.name,
      kind: input.kind,
      origin: input.origin ?? null,
      hash: hashSecret(secret),
      person: input.person ?? null,
      createdAt: new Date(this.now()).toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.hub.emit({ type: 'device.added', device });
    return { device, secret };
  }

  /** Revokes a device. Revoking twice changes nothing. */
  revoke(deviceId: string): Device {
    const device = this.find(deviceId);
    if (!device) throw new DeviceNotFoundError(`No device ${deviceId}`);
    if (device.revokedAt === null) this.hub.emit({ type: 'device.revoked', deviceId, at: new Date(this.now()).toISOString() });
    return this.find(deviceId) ?? device;
  }

  /**
   * The device a secret belongs to, with whether it may still sign in; null
   * when the secret is no device's. Every stored hash is compared, each in
   * constant time, so the time taken says nothing about which one matched.
   */
  authenticate(secret: string | undefined): { device: Device; status: DeviceStatus } | null {
    const given = Buffer.from(hashSecret(secret ?? ''), 'hex');
    let found: Device | null = null;
    // Compared once against a hash nobody has, so that a server with no devices does the same work as one with some.
    timingSafeEqual(NOBODY, given);
    for (const device of this.hub.state.devices) {
      const stored = Buffer.from(device.hash, 'hex');
      if (stored.length === given.length && timingSafeEqual(stored, given)) found = device;
    }
    if (!found || secret === undefined || !secret.startsWith(DEVICE_PREFIX)) return null;
    return { device: found, status: deviceStatus(found, this.now()) };
  }

  /** Notes that a device was used just now. Written at most once a minute per device. True when it was written. */
  touch(deviceId: string): boolean {
    const now = this.now();
    if (now - (this.touchedAt.get(deviceId) ?? Number.NEGATIVE_INFINITY) < LAST_USED_INTERVAL_MS) return false;
    this.touchedAt.set(deviceId, now);
    this.hub.emit({ type: 'device.used', deviceId, at: new Date(now).toISOString() });
    return true;
  }
}
