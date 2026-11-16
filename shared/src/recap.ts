import { z } from 'zod';
import type { Session } from './entities';
import { outputKind } from './outputs';
import { showControl } from './text';
import type { Run } from './workflows';

/**
 * A recap answers, for one terminal: what was this about, and where does it
 * stand? There are two kinds, kept apart and labelled.
 *
 * The first is made here, by one pure function, from what Aubergine already
 * has about the session: no agent, no model, no file. It is always there.
 *
 * The second is written by the agent itself when the owner asks for one, and
 * kept on the session with its time. It is the agent's words: other people's
 * text wherever it is shown, and "may be out of date" once the terminal has
 * printed since.
 */

export const RECAP_MAX = 2000;
/** A recap an agent wrote: plain text, of a sensible length. */
export const RecapText = z.string().trim().min(1).max(RECAP_MAX);
export const WrittenRecap = z.object({ text: RecapText, at: z.iso.datetime() });
export type WrittenRecap = z.infer<typeof WrittenRecap>;

/** Body of handing in a recap. */
export const WriteRecapRequest = z.object({ text: RecapText.describe('Three to six plain sentences: the goal, what was done, what is left, anything the owner must decide.') });
export type WriteRecapRequest = z.infer<typeof WriteRecapRequest>;

/** What `aubergine recap --write` prints when nothing is handed to it: what is wanted, and how to hand it in. Fixed; nothing stored is in it. */
export const RECAP_WANTED = [
  'Your owner asked for a recap of this session.',
  'Write three to six plain sentences, in this order: what the goal is; what has been done; what is left; anything the owner must decide.',
  'No headings, no lists, no code. Say only what is true now.',
  'Hand it in on standard input:',
  "  aubergine recap --write <<'RECAP'",
  '  ...your sentences...',
  '  RECAP',
  'or from a file: aubergine recap --write --file <file>',
].join('\n');

/** What a run contributes to a recap: its workflow, where it stands, the notes handed in. */
export interface RecapRun {
  run: Run;
  workflowName: string;
  elements: readonly { id: string; name: string; produces?: string }[];
}

export interface Recap {
  name: string;
  folder: string | null;
  state: Session['state'];
  createdAt: string;
  /** The last command and how it ended, as the shell reported it. Null when nothing is known. */
  command: { line: string | null; running: boolean; exit: number | null; at: string | null } | null;
  /** Whether it wants the owner, and for what. */
  attention: { state: 'waiting' | 'done' | 'working'; message: string | null } | null;
  /** The run it is on, or the last one it finished. */
  run: { workflowName: string; over: boolean; status: Run['status']; position: string; notes: { element: string; note: string }[]; blockedReason: string | null } | null;
  /** A list its agent handed in, and how far the owner is through it. */
  list: { total: number; ticked: number } | null;
  /** The newest entries of its note log, oldest first. */
  notes: { at: string; author: string; text: string }[];
  agent: boolean;
  /** What its agent wrote when asked, and whether the terminal has printed since. */
  written: (WrittenRecap & { stale: boolean }) | null;
}

const NOTES = 3;
const cut = (text: string, max: number): string => {
  const line = showControl(text).replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * The recap of a session from what is already known about it. `live` is the
 * run it is on; `ended` the latest of its runs that is over. Pure: the same
 * session and runs give the same recap.
 */
export function recapOf(session: Session, runs: { live: RecapRun | null; ended: RecapRun | null }): Recap {
  const status = session.status;
  const known = status.state !== null || status.lastExit !== null || status.lastFinishedAt !== null;
  const picked = runs.live ?? runs.ended;
  let run: Recap['run'] = null;
  let list: Recap['list'] = null;
  if (picked) {
    const names = new Map(picked.elements.map((element) => [element.id, element]));
    const index = picked.elements.findIndex((element) => element.id === picked.run.currentElementId);
    const position = index >= 0 ? `${picked.elements[index]?.name ?? ''} · ${index + 1} of ${picked.elements.length}` : picked.run.status;
    run = {
      workflowName: picked.workflowName,
      over: runs.live === null,
      status: picked.run.status,
      position,
      notes: picked.run.elements.filter((element) => element.note.trim() !== '').map((element) => ({ element: names.get(element.elementId)?.name ?? element.elementId, note: element.note })),
      blockedReason: picked.run.blockedReason,
    };
    for (let i = picked.run.elements.length - 1; i >= 0 && list === null; i -= 1) {
      const element = picked.run.elements[i];
      if (!element || element.output === null || element.output === undefined) continue;
      const total = outputKind(names.get(element.elementId)?.produces ?? 'note')?.items(element.output) ?? 0;
      if (total > 0) list = { total, ticked: new Set(element.ticks.map((tick) => tick.item).filter((item) => item < total)).size };
    }
  }
  const written = session.recap ?? null;
  return {
    name: session.name,
    folder: session.cwd,
    state: session.state,
    createdAt: session.createdAt,
    command: known ? { line: status.commandLine, running: status.state === 'busy', exit: status.lastExit, at: status.state === 'busy' ? status.startedAt : status.lastFinishedAt } : null,
    attention: session.attention.state === 'none' ? null : { state: session.attention.state, message: session.attention.message },
    run,
    list,
    notes: session.noteLog.slice(-NOTES).map((entry) => ({ at: entry.at, author: entry.author, text: entry.text })),
    agent: session.agent !== null,
    // Out of date once the terminal has printed after it was written.
    written: written ? { ...written, stale: session.lastOutputAt !== null && session.lastOutputAt > written.at } : null,
  };
}

/** How long ago, in a few words: `3 days`, `2 hours`, `a moment`. */
export function ago(from: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(from)) / 60_000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'a moment';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/**
 * The recap in four or five lines of plain text. Everything a person or an
 * agent wrote is shown through `showControl` and cut to a line.
 */
export function recapLines(recap: Recap, now: Date): string[] {
  const lines: string[] = [];
  const state = recap.state === 'parked' ? ', parked' : recap.state === 'exited' ? ', its shell has ended' : '';
  lines.push(`${cut(recap.name, 80)}${recap.folder ? ` in ${cut(recap.folder, 120)}` : ''}: started ${ago(recap.createdAt, now)} ago${state}.`);
  if (recap.attention?.state === 'waiting') lines.push(`Waiting for you${recap.attention.message ? `: ${cut(recap.attention.message, 160)}` : '.'}`);
  else if (recap.attention?.state === 'done') lines.push(`Its agent says it has finished${recap.attention.message ? `: ${cut(recap.attention.message, 160)}` : '.'}`);
  if (recap.run) {
    const where = recap.run.over ? `${recap.run.status} (${cut(recap.run.workflowName, 60)})` : `${cut(recap.run.position, 80)} of "${cut(recap.run.workflowName, 60)}"${recap.run.status !== 'running' ? `, ${recap.run.status}` : ''}`;
    const last = recap.run.notes.at(-1);
    // Joined as sentences, whatever each part ends with.
    const parts = [`${recap.run.over ? 'Last workflow' : 'On a workflow'}: ${where}`, recap.run.blockedReason ? `Blocked: ${cut(recap.run.blockedReason, 120)}` : '', last ? `Last note (${cut(last.element, 40)}): ${cut(last.note, 160)}` : ''];
    lines.push(parts.filter(Boolean).map((part, index, all) => (index < all.length - 1 ? part.replace(/[.\s]+$/, '') : part)).join('. '));
  }
  if (recap.list) lines.push(`A list was handed in: ${recap.list.ticked} of ${recap.list.total} ticked.`);
  if (recap.command) {
    if (recap.command.running) lines.push(`Running now${recap.command.line ? `: ${cut(recap.command.line, 120)}` : '.'}`);
    else if (recap.command.exit !== null) lines.push(`Its last command ${recap.command.exit === 0 ? 'ended well' : `failed (exit ${recap.command.exit})`}${recap.command.at ? `, ${ago(recap.command.at, now)} ago` : ''}.`);
  }
  const note = recap.notes.at(-1);
  if (note) lines.push(`Last note (${note.author === 'agent' ? 'its agent' : 'you'}, ${ago(note.at, now)} ago): ${cut(note.text, 200)}`);
  return lines.slice(0, 6);
}

/**
 * What a terminal that is not on the canvas yet was about, as far as is known without asking anyone: for an
 * agent, the first and the last thing its owner said in its conversation. Lines of plain text; empty when
 * nothing is known. What the owner typed is shown through `showControl`, on one line.
 */
export function outsideRecap(agent: { firstPrompt?: string | null; lastPrompt?: string | null } | null | undefined): string[] {
  if (!agent) return [];
  const lines: string[] = [];
  if (agent.firstPrompt) lines.push(`began with: ${cut(agent.firstPrompt, 160)}`);
  if (agent.lastPrompt && agent.lastPrompt !== agent.firstPrompt) lines.push(`last asked: ${cut(agent.lastPrompt, 160)}`);
  return lines;
}
