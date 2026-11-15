/**
 * Telling what a person typed from what the terminal itself sent.
 *
 * A terminal emulator answers the program's questions through the same
 * channel as keystrokes: which terminal it is, where the cursor is, whether
 * its window has focus, what its colors are. Those answers arrive as "input"
 * although nobody touched a key, most of them the moment a view opens. They
 * must not count as the session having been typed into.
 */

const ESC = '\x1b';

/* eslint-disable no-control-regex -- these patterns are about control sequences; the control characters are the point */
/** One report: a control sequence a terminal sends by itself, never a key. */
const REPORTS = [
  // Device attributes, device status, cursor position, window size: ESC [ ... c / n / R / t
  /^\x1b\[[?>=]?[\d;]*[cnRt]/,
  // DEC private mode reports: ESC [ ? ... $ y
  /^\x1b\[\??[\d;]*\$y/,
  // Focus in and focus out.
  /^\x1b\[[IO]/,
  // Operating system command replies (colors and the like): ESC ] ... BEL or ST
  /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/,
  // Device control strings (terminal name, settings): ESC P ... ST
  /^\x1bP[^\x1b]*\x1b\\/,
];
/* eslint-enable no-control-regex */

/**
 * True when `data` consists only of reports from the terminal. Anything else
 * (text, Enter, control keys, arrow keys, a paste) is something the user did.
 */
export function isTerminalReply(data: string): boolean {
  if (data === '' || !data.startsWith(ESC)) return false;
  let rest = data;
  while (rest !== '') {
    const match = REPORTS.map((pattern) => pattern.exec(rest)).find((m) => m !== null);
    if (!match) return false;
    rest = rest.slice(match[0].length);
  }
  return true;
}
