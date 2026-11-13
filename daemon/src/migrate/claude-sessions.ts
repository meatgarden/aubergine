import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ConversationId } from '@aubergine/shared';

/**
 * What Claude Code records about each of its running processes, one JSON
 * file per process ID. This is an internal detail of Claude Code, not a
 * documented interface: everything here reads defensively, and callers must
 * cope with "nothing known". Nothing is ever written under that folder.
 */

const SessionFile = z.object({
  pid: z.number().int().positive(),
  /** The conversation's ID. Validated as a plain ID because it ends up on a command line. */
  sessionId: ConversationId,
  cwd: z.string().optional(),
  /** Seen: `idle`, `busy`. */
  status: z.string().optional(),
  kind: z.string().optional(),
  /** How the process was started. `cli` is a person's own terminal. */
  entrypoint: z.string().optional(),
  name: z.string().optional(),
  /** When the process started, as `ps` prints it, in UTC. */
  procStart: z.string().optional(),
});

export interface ClaudeSession {
  pid: number;
  conversationId: string;
  cwd: string | null;
  status: string | null;
  entrypoint: string | null;
  name: string | null;
  /** Start of the process, when the file says. */
  processStart: Date | null;
}

/** Where those files live: Claude Code's own folder, which `CLAUDE_CONFIG_DIR` relocates. */
export function claudeSessionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'sessions');
}

/** Reads `Tue Nov 10 17:41:56 2026` (the `ps -o lstart` form) as a UTC time. */
export function parseProcessStart(text: string): Date | null {
  const match = /^\s*\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s*$/.exec(text);
  if (!match) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1] ?? '');
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[6]), month, Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5])));
}

/** Parses one session file. Null for anything that is not a file we understand. */
export function parseSessionFile(text: string): ClaudeSession | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = SessionFile.safeParse(raw);
  if (!parsed.success) return null;
  const file = parsed.data;
  return {
    pid: file.pid,
    conversationId: file.sessionId,
    cwd: file.cwd ?? null,
    status: file.status ?? null,
    entrypoint: file.entrypoint ?? null,
    name: file.name?.trim().slice(0, 120) || null,
    processStart: file.procStart ? parseProcessStart(file.procStart) : null,
  };
}

/** The session file for a process, or null when it is missing, unreadable or for another process. */
export async function readClaudeSession(pid: number, dir: string = claudeSessionsDir()): Promise<ClaudeSession | null> {
  let text: string;
  try {
    text = await readFile(path.join(dir, `${pid}.json`), 'utf8');
  } catch {
    return null;
  }
  const session = parseSessionFile(text);
  return session && session.pid === pid ? session : null;
}

/**
 * Whether the process running now under a session's ID is the one the file
 * describes: process IDs are reused, so the start time has to agree too.
 */
export function isSameProcess(session: ClaudeSession, startedNow: Date | null): boolean {
  if (!session.processStart || !startedNow) return false;
  return Math.abs(session.processStart.getTime() - startedNow.getTime()) <= 2000;
}
