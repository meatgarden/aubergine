import type { Canvas } from '@aubergine/shared';
import type { Command } from './commands';

/** What was typed into the palette: `>` in front means "commands only". */
export function parseQuery(query: string): { commandsOnly: boolean; text: string } {
  const trimmed = query.trimStart();
  return trimmed.startsWith('>') ? { commandsOnly: true, text: trimmed.slice(1).trim() } : { commandsOnly: false, text: query.trim() };
}

const wordsOf = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Commands whose title, description or name has every word typed. Matches in
 * the title come first; otherwise the list keeps its order. The command that
 * opens the palette is left out: it is already open.
 */
export function searchCommands(commands: readonly Command[], text: string): Command[] {
  const words = wordsOf(text);
  const listed = commands.filter((command) => command.id !== 'palette.toggle');
  if (words.length === 0) return listed;
  const inTitle: Command[] = [];
  const elsewhere: Command[] = [];
  for (const command of listed) {
    const title = command.title.toLowerCase();
    const all = `${title} ${command.description.toLowerCase()} ${command.id.toLowerCase()}`;
    if (!words.every((word) => all.includes(word))) continue;
    (words.every((word) => title.includes(word)) ? inTitle : elsewhere).push(command);
  }
  return [...inTitle, ...elsewhere];
}

/** Canvases whose name has every word typed, in tab order. */
export function searchCanvases(canvases: readonly Canvas[], text: string): Canvas[] {
  const words = wordsOf(text);
  return canvases.filter((canvas) => words.every((word) => canvas.name.toLowerCase().includes(word)));
}

/**
 * The second step after opening the palette: with nothing typed yet, a digit
 * means "go to that canvas". Returns the canvas, or null when the key is not
 * a digit, something is typed already, or there is no such canvas.
 */
export function canvasForDigit(canvases: readonly Canvas[], query: string, key: string): Canvas | null {
  if (query !== '' || !/^[1-9]$/.test(key)) return null;
  return canvases[Number(key) - 1] ?? null;
}
