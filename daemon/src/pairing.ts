import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PAIRING_ALPHABET, PAIRING_CODES_WAITING, PAIRING_CODE_LENGTH, PAIRING_CODE_MINUTES, readPairingCode, showPairingCode, type DeviceKind } from '@aubergine/shared';

/**
 * Pairing codes: what turns a browser at an outside address into a device.
 *
 * A code is held in memory only, as a hash: never in the state, never in an
 * event, never in a log. It works once and for a few minutes, and at most a
 * few wait at a time. Wrong guesses are counted for the whole server, since
 * behind something that carries HTTPS every caller looks the same: a few
 * wrong codes withdraw every code that waits, and too many tries in a minute
 * are refused before anything is compared.
 *
 * Every failure is the same failure: a wrong code, one already used, one
 * that ran out, a code when none waits, something that is not a code at all.
 * Each is compared against every waiting code (or a stand-in when none waits)
 * in constant time, and answered alike.
 */

/** Wrong codes, while any waits, after which every waiting code is withdrawn. */
export const WRONG_CODES_ALLOWED = 5;
/** Tries in a minute, right or wrong, beyond which the server answers 429 without looking. */
export const TRIES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

interface Waiting {
  hash: Buffer;
  name: string;
  kind: DeviceKind;
  madeAt: number;
  expiresAt: number;
}

/** What a try at a code came to. `wrong` is every failure alike; `limited` is said before anything was compared. */
export type PairingTry = { result: 'right'; name: string; kind: DeviceKind } | { result: 'wrong' } | { result: 'limited'; retryAfterSeconds: number };

const hashOf = (text: string): Buffer => createHash('sha256').update(`pairing:${text}`).digest();
/** Compared against when no code waits, so that the work done does not say so. Nothing typed has this hash. */
const NONE_WAITING = hashOf('\u0000none');

export class Pairing {
  private waiting: Waiting[] = [];
  private wrong = 0;
  private tries: number[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** Makes a code for a device of this name and kind. The code is returned to be shown, and kept only as a hash. */
  make(name: string, kind: DeviceKind): { code: string; expiresAt: number } {
    const now = this.now();
    this.prune(now);
    let code = '';
    for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
    const expiresAt = now + PAIRING_CODE_MINUTES * MINUTE_MS;
    this.waiting.push({ hash: hashOf(code), name, kind, madeAt: now, expiresAt });
    // A fourth withdraws the oldest.
    while (this.waiting.length > PAIRING_CODES_WAITING) this.waiting.shift();
    return { code: showPairingCode(code), expiresAt };
  }

  /** How many codes wait now. For tests and for nothing else. */
  waitingCount(): number {
    this.prune(this.now());
    return this.waiting.length;
  }

  /**
   * Tries a code. `accept: false` does every comparison and spends nothing: a right code stays, and the answer is
   * `wrong` all the same. `kinds` are the kinds of device that may be made here; a right code of another kind is
   * refused like a wrong one, and stays.
   */
  try(typed: unknown, options: { accept: boolean; kinds: readonly DeviceKind[] }): PairingTry {
    const now = this.now();
    this.tries = this.tries.filter((at) => at > now - MINUTE_MS);
    if (this.tries.length >= TRIES_PER_MINUTE) {
      const oldest = this.tries[0] ?? now;
      return { result: 'limited', retryAfterSeconds: Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1000)) };
    }
    this.tries.push(now);
    this.prune(now);
    // What was typed, made comparable; something that is not a code is hashed as it came, and matches nothing.
    const plain = typeof typed === 'string' ? (readPairingCode(typed) ?? `\u0000${typed}`) : '\u0000';
    const given = hashOf(plain);
    let match: Waiting | null = null;
    for (const code of this.waiting) if (timingSafeEqual(code.hash, given)) match = code;
    if (this.waiting.length === 0) timingSafeEqual(NONE_WAITING, given);
    if (match && options.accept && options.kinds.includes(match.kind)) {
      this.waiting = this.waiting.filter((code) => code !== match);
      if (this.waiting.length === 0) this.wrong = 0;
      return { result: 'right', name: match.name, kind: match.kind };
    }
    if (!match && this.waiting.length > 0) {
      this.wrong += 1;
      if (this.wrong >= WRONG_CODES_ALLOWED) this.withdrawAll();
    }
    return { result: 'wrong' };
  }

  /** Every waiting code stops working. */
  withdrawAll(): void {
    this.waiting = [];
    this.wrong = 0;
  }

  private prune(now: number): void {
    this.waiting = this.waiting.filter((code) => code.expiresAt > now);
    // Nothing waits: nothing to guess at, and the count starts again with the next code.
    if (this.waiting.length === 0) this.wrong = 0;
  }
}
