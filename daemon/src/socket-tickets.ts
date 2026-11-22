import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SOCKET_TICKETS_WAITING, SOCKET_TICKET_SECONDS } from '@aubergine/shared';

/**
 * Socket tickets: how a linked page opens a WebSocket. A browser cannot put
 * a header on a WebSocket, so the page asks for a ticket with its credential
 * and puts the ticket in the socket's address.
 *
 * A ticket is held in memory only, as a hash: never in the state, never in
 * an event, never in a log. It works once, for 30 seconds, for the device
 * that asked and the origin it asked from. At most a few dozen wait for one
 * device; the oldest goes first. A ticket that is offered is compared against
 * every waiting one in constant time, and is spent when it matches, whether
 * or not the rest of what it was made for holds.
 */

interface Waiting {
  hash: Buffer;
  deviceId: string;
  origin: string;
  expiresAt: number;
}

const hashOf = (text: string): Buffer => createHash('sha256').update(`ticket:${text}`).digest();
/** Compared against when no ticket waits, so that the work done does not say so. Nothing offered has this hash. */
const NONE_WAITING = hashOf('\u0000none');

export class SocketTickets {
  private waiting: Waiting[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** Makes a ticket for one socket of this device, from this origin. Returned to be sent once, and kept only as a hash. */
  make(deviceId: string, origin: string): { ticket: string; expiresAt: number } {
    const now = this.now();
    this.prune(now);
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = now + SOCKET_TICKET_SECONDS * 1000;
    this.waiting.push({ hash: hashOf(ticket), deviceId, origin, expiresAt });
    const mine = this.waiting.filter((entry) => entry.deviceId === deviceId);
    if (mine.length > SOCKET_TICKETS_WAITING) {
      const dropped = new Set(mine.slice(0, mine.length - SOCKET_TICKETS_WAITING));
      this.waiting = this.waiting.filter((entry) => !dropped.has(entry));
    }
    return { ticket, expiresAt };
  }

  /**
   * Spends a ticket offered from `origin`. The device it was made for, when it was made from that origin and has
   * not run out; null otherwise. Whether the device may still sign in is the caller's to ask, after this.
   */
  spend(offered: string | undefined, origin: string): string | null {
    const now = this.now();
    this.prune(now);
    const given = hashOf(typeof offered === 'string' ? offered : '\u0000');
    let match: Waiting | null = null;
    for (const entry of this.waiting) if (timingSafeEqual(entry.hash, given)) match = entry;
    if (this.waiting.length === 0) timingSafeEqual(NONE_WAITING, given);
    if (!match || typeof offered !== 'string' || offered === '') return null;
    // Spent whatever follows: a ticket that was seen once is never good again.
    this.waiting = this.waiting.filter((entry) => entry !== match);
    return match.origin === origin ? match.deviceId : null;
  }

  /** How many tickets wait now. For tests and for nothing else. */
  waitingCount(): number {
    this.prune(this.now());
    return this.waiting.length;
  }

  private prune(now: number): void {
    this.waiting = this.waiting.filter((entry) => entry.expiresAt > now);
  }
}
