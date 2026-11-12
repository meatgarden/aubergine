/**
 * Decodes the payload of an OSC 52 "set clipboard" sequence: `<targets>;<base64>`.
 * Returns the text to copy, or null for anything else (including the `?`
 * query form: programs in a terminal are never allowed to read the clipboard).
 */
export function decodeOsc52(payload: string): string | null {
  const separator = payload.indexOf(';');
  if (separator < 0) return null;
  const encoded = payload.slice(separator + 1);
  if (encoded === '' || encoded === '?') return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
