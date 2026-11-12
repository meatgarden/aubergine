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
  /** The visible screen as plain text. */
  snapshot(id: string): Promise<string>;
}

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session ${sessionId} is not running`);
    this.name = 'SessionNotFoundError';
  }
}
