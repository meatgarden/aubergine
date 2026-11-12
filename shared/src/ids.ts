import { z } from 'zod';

/** Every record ID in the system is a UUIDv7: globally unique and time-ordered. */
export const Id = z.uuidv7();
export type Id = z.infer<typeof Id>;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Generates a UUIDv7 (48-bit millisecond timestamp followed by random bits). */
export function newId(now: number = Date.now()): Id {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => HEX[b] ?? '00');
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10, 16).join(''),
  ].join('-');
}
