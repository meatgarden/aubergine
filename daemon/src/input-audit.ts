import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** One thing typed into a terminal through the API, kept in full. Only when the owner switched the audit on. */
export interface TypedRecord {
  at: string;
  /** Who: the token's name, or `owner-cli` for the owner's own command. */
  by: string;
  tokenId: string | null;
  sessionId: string;
  /** `text`, `paste`, `keys` or `run`. */
  kind: string;
  /** What was typed: the text itself, or the names of the keys. */
  text: string;
}

/**
 * The full audit of typed text. Separate from the activity log, which never
 * holds what was typed. Callers know only this interface.
 */
export interface InputAudit {
  record(entry: TypedRecord): Promise<void>;
}

/** Keeps nothing. What there is unless the owner asks for the audit. */
export const noInputAudit: InputAudit = { record: async () => {} };

export const INPUT_AUDIT_FILE = 'input.log';

/** One JSON line per call, appended to `input.log` in the data folder, readable only by the owner. It holds what was typed, in full. */
export class FileInputAudit implements InputAudit {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    dir: string,
    private readonly enabled: () => boolean,
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    this.file = path.join(dir, INPUT_AUDIT_FILE);
  }

  record(entry: TypedRecord): Promise<void> {
    if (!this.enabled()) return Promise.resolve();
    const line = `${JSON.stringify(entry)}\n`;
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        await appendFile(this.file, line, { mode: 0o600 });
      })
      .catch((error: unknown) => {
        this.onError(error);
      });
    return this.queue;
  }
}
