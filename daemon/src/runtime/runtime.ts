import type { RuntimeStatus } from '@aubergine/shared';

export interface RuntimeSession {
  /** Same ID as the Session record. */
  id: string;
  /** Working folder of the foreground process, when known. */
  cwd: string | null;
  /** Name of the foreground command, when known. */
  command: string | null;
  /** When the session last printed anything, when known. */
  activityAt: Date | null;
}

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

export interface CreateOptions extends Partial<TerminalDimensions> {
  id: string;
  /** Starting folder. Defaults to the user's home folder. */
  cwd?: string;
  /** Absolute path of the shell to start, as a login shell. Defaults to the user's own shell. */
  shell?: string | null;
  /** Extra environment variables for the session's shell. */
  env?: Record<string, string>;
}

export interface ExitInfo {
  exitCode: number;
}

/**
 * One viewer's live connection to a session: a byte stream out, keystrokes
 * in. Several viewers may be attached to one session at once, each with its
 * own size. Closing an attachment never ends the session.
 */
export interface Attachment {
  /** Output bytes, in order. Register before awaiting anything else to miss nothing. */
  onData(listener: (chunk: Uint8Array) => void): void;
  /** Fires once, when the attachment ends for any reason. */
  onExit(listener: (info: ExitInfo) => void): void;
  write(data: string): void;
  /** Resizes this viewer. */
  resize(size: TerminalDimensions): void;
  /** Stops and restarts delivery of output, for back-pressure. */
  pause(): void;
  resume(): void;
  close(): void;
}

/**
 * Session runtime seam: owns the running shells. One implementation for now
 * (tmux). Sessions must outlive the daemon process.
 */
export interface SessionRuntime {
  /** Reports whether the runtime can be used on this machine. */
  check(): Promise<RuntimeStatus>;
  create(options: CreateOptions): Promise<RuntimeSession>;
  /** All sessions currently running, including ones started by an earlier daemon process. */
  list(): Promise<RuntimeSession[]>;
  has(id: string): Promise<boolean>;
  /** Ends the session and its shell. Does nothing when the session is already gone. */
  kill(id: string): Promise<void>;
  /** Connects a viewer. Rejects with SessionNotFoundError when the session is gone. */
  attach(id: string, viewer: TerminalDimensions): Promise<Attachment>;
  /**
   * Types a line into the session and presses Enter, as the user would,
   * once its shell is ready to take input. Resolves when it has been typed.
   */
  typeLine(id: string, line: string): Promise<void>;
  /**
   * Looks through the history of the given sessions for lines containing
   * `query` (case does not matter), newest first within a session. Read on
   * demand: nothing is indexed or recorded. No viewer is needed.
   */
  search(ids: readonly string[], query: string, options?: { limit?: number; perSession?: number }): Promise<HistorySearch>;
  /** Scrolls the session back to the most recent place `text` appears, for everyone viewing it. */
  reveal(id: string, text: string): Promise<void>;
  /** The visible screen as plain text. */
  snapshot(id: string): Promise<string>;
  /**
   * The visible screen as plain text, with its size and where the cursor is.
   * Read from the session itself: no viewer is attached, so nothing is
   * resized and nobody watching sees a difference.
   */
  screen(id: string): Promise<TerminalScreen>;
  /**
   * Lines of the session's history and screen, oldest first, as plain text,
   * with wrapped lines joined. `from` is a place as `screen` reports it
   * (`line`); with `count` and `skip` it is so many lines counted back from
   * the end. Also read without a viewer.
   */
  lines(id: string, range: { count: number; skip: number } | { from: number }): Promise<{ lines: string[]; more: boolean; lost: boolean }>;
  /**
   * Types text exactly as it is: no part of it is read as the name of a key.
   * With `paste` it is handed over as a paste, bracketed where the program in
   * the session asked for that.
   */
  type(id: string, text: string, options?: { paste?: boolean }): Promise<void>;
  /** Presses keys from the fixed list, in order. */
  press(id: string, keys: readonly TerminalKey[]): Promise<void>;
  /** The name of the program that has the session's keyboard now. */
  foreground(id: string): Promise<string | null>;
}

/** The keys that can be pressed by name. The same list the API offers. */
export type TerminalKey = 'Enter' | 'Tab' | 'Escape' | 'Backspace' | 'Delete' | 'Up' | 'Down' | 'Left' | 'Right' | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'Space' | 'Ctrl+C' | 'Ctrl+D' | 'Ctrl+Z' | 'Ctrl+L' | 'Ctrl+U' | 'Ctrl+A' | 'Ctrl+E' | 'Ctrl+R';

export interface TerminalScreen {
  text: string;
  columns: number;
  rows: number;
  cursor: { x: number; y: number };
  /** The line the cursor is on, counted from the first line the session still remembers. A place to read from later. */
  line: number;
}

export interface HistoryHit {
  sessionId: string;
  /** The matching line. */
  text: string;
  /** Lines just before and after it, for context. */
  before: string[];
  after: string[];
}

export interface HistorySearch {
  hits: HistoryHit[];
  /** True when there were more matches than `limit`. */
  truncated: boolean;
}

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is not running`);
    this.name = 'SessionNotFoundError';
  }
}
