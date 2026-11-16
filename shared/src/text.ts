/**
 * Text that an agent or a file may have written, made safe to print in a
 * terminal: a control character is shown as a picture of itself, and a
 * character that reverses the direction of text as its number, so that
 * nothing in it is acted on by the terminal or hides what is there. Line
 * breaks and tabs stay.
 */
export function showControl(text: string): string {
  let out = '';
  for (const char of text.replace(/\r\n/g, '\n')) {
    const code = char.codePointAt(0) as number;
    if (char === '\n' || char === '\t') out += char;
    else if (code < 0x20) out += String.fromCodePoint(0x2400 + code);
    else if (code === 0x7f) out += '\u2421';
    else if ((code >= 0x80 && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0x200e || code === 0x200f) out += `<U+${code.toString(16).toUpperCase().padStart(4, '0')}>`;
    else out += char;
  }
  return out;
}
