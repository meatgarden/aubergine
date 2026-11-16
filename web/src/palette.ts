import type { Canvas, CommandId } from '@aubergine/shared';
import type { Command } from './commands';

/** What was typed into the palette: `>` in front means "commands only", `@` means "search past conversations". */
export function parseQuery(query: string): { commandsOnly: boolean; conversations: boolean; text: string } {
  const trimmed = query.trimStart();
  if (trimmed.startsWith('@')) return { commandsOnly: false, conversations: true, text: trimmed.slice(1).trim() };
  return trimmed.startsWith('>') ? { commandsOnly: true, conversations: false, text: trimmed.slice(1).trim() } : { commandsOnly: false, conversations: false, text: query.trim() };
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
 * goes to that canvas, and `[` and `]` to the previous and the next one. This
 * needs no special chord, so it works in every browser. Returns the command
 * to run, or null when the key is something to type.
 */
export function paletteStep(query: string, key: string): CommandId | null {
  if (query !== '') return null;
  if (/^[1-9]$/.test(key)) return `canvas.go.${key}` as CommandId;
  if (key === '[') return 'canvas.previous';
  if (key === ']') return 'canvas.next';
  return null;
}
