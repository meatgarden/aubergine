import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { CUSTOM_CSS_FILE, CUSTOM_CSS_MAX_BYTES, customCssStarter, type CustomCss, type CustomCssAnswer } from '@aubergine/shared';

/**
 * The owner's own stylesheet: `custom.css` directly in the data folder. This module is the one place it is read and
 * written. It is read only if it is a regular file: a link is not followed (checked before it is opened, and again by
 * opening it with `O_NOFOLLOW`), and a file larger than `CUSTOM_CSS_MAX_BYTES` is not read. Anything else is "no
 * stylesheet", said once per distinct problem. Nothing in it is looked at: its bytes are served as they are to the
 * signed-in owner, and its hash is the version the page links it by. The one thing written here is the starter, by
 * `aubergine css new`: never over a file that is there, never through a link.
 */

/** The stylesheet as it was read: its bytes, and what the page is told of it. */
export interface StylesheetNow {
  bytes: Buffer;
  found: CustomCss;
}

/** What the file is now: read, not there, or there and not read (with why, in a sentence). */
export type StylesheetReading = { kind: 'read'; stylesheet: StylesheetNow } | { kind: 'none' } | { kind: 'problem'; problem: string };

/** The short hash a page links the stylesheet by: twelve hexadecimal digits of its SHA-256. */
export const versionOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

/** Reads `custom.css` in a folder, afresh. A file that is not there is no stylesheet and no problem. */
export async function readStylesheet(dataDir: string): Promise<StylesheetReading> {
  const file = path.join(dataDir, CUSTOM_CSS_FILE);
  const stats = await lstat(file).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' || error.code === 'ENOTDIR' ? null : error));
  if (stats === null) return { kind: 'none' };
  if (stats instanceof Error) return { kind: 'problem', problem: `${CUSTOM_CSS_FILE}: it could not be looked at. The page is drawn without it.` };
  // A link here could point anywhere on the machine: it is not followed.
  if (stats.isSymbolicLink()) return { kind: 'problem', problem: `${CUSTOM_CSS_FILE}: it is a link, and links are not followed. The page is drawn without it.` };
  // Looked at before it is opened: a pipe would make the open wait, and a folder is not a stylesheet.
  if (!stats.isFile()) return { kind: 'problem', problem: `${CUSTOM_CSS_FILE}: it is not a regular file. The page is drawn without it.` };
  if (stats.size > CUSTOM_CSS_MAX_BYTES) return { kind: 'problem', problem: tooLarge(stats.size) };
  let handle;
  try {
    // O_NOFOLLOW: if the name became a link since it was looked at, the open fails.
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'none' };
    return { kind: 'problem', problem: code === 'ELOOP' ? `${CUSTOM_CSS_FILE}: it is a link, and links are not followed. The page is drawn without it.` : `${CUSTOM_CSS_FILE}: it could not be opened. The page is drawn without it.` };
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) return { kind: 'problem', problem: `${CUSTOM_CSS_FILE}: it is not a regular file. The page is drawn without it.` };
    if (opened.size > CUSTOM_CSS_MAX_BYTES) return { kind: 'problem', problem: tooLarge(opened.size) };
    const bytes = Buffer.alloc(opened.size);
    const { bytesRead } = await handle.read(bytes, 0, opened.size, 0);
    const read = bytes.subarray(0, bytesRead);
    return { kind: 'read', stylesheet: { bytes: read, found: { version: versionOf(read), bytes: read.length } } };
  } catch {
    return { kind: 'problem', problem: `${CUSTOM_CSS_FILE}: it could not be read. The page is drawn without it.` };
  } finally {
    await handle.close();
  }
}

const tooLarge = (size: number): string => `${CUSTOM_CSS_FILE}: it is ${size} bytes, and at most ${CUSTOM_CSS_MAX_BYTES} (${CUSTOM_CSS_MAX_BYTES / 1024} KB) are read. The page is drawn without it.`;

/** What the server asks of the owner's stylesheet: read it again (when the page is sent, when it is served, when asked). */
export interface Stylesheet {
  /** Reads the file again, says a new problem once, and answers what there is now. */
  reload(): Promise<StylesheetNow | null>;
  /** The answer of the route that reads it again: what the page is told, and the problem if there is one. */
  answer(): Promise<CustomCssAnswer>;
}

/** No stylesheet: a server started without a data folder, and the tests that do not look at it. */
export const NO_STYLESHEET: Stylesheet = {
  reload: async () => null,
  answer: async () => ({ stylesheet: null, problem: null }),
};

/** The owner's stylesheet in a data folder. A problem is said once, not on every reading, and again only after it went. */
export class StylesheetFile implements Stylesheet {
  private said: string | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly onWarning: (message: string) => void = () => {},
  ) {}

  get file(): string {
    return path.join(this.dataDir, CUSTOM_CSS_FILE);
  }

  private async reading(): Promise<StylesheetReading> {
    const reading = await readStylesheet(this.dataDir);
    const problem = reading.kind === 'problem' ? reading.problem : null;
    if (problem !== null && problem !== this.said) this.onWarning(problem);
    this.said = problem;
    return reading;
  }

  async reload(): Promise<StylesheetNow | null> {
    const reading = await this.reading();
    return reading.kind === 'read' ? reading.stylesheet : null;
  }

  async answer(): Promise<CustomCssAnswer> {
    const reading = await this.reading();
    return { stylesheet: reading.kind === 'read' ? reading.stylesheet.found : null, problem: reading.kind === 'problem' ? reading.problem : null };
  }
}

/** Why the starter was not written, in a sentence. */
export class StylesheetWriteError extends Error {}

/**
 * Writes the starter stylesheet (`customCssStarter`) as `custom.css` in the data folder: never over a file that is
 * there, a link included (`O_EXCL` refuses any name that is there, and `O_NOFOLLOW` any link), and never anywhere else.
 */
export async function writeStarter(dataDir: string): Promise<string> {
  const file = path.join(dataDir, CUSTOM_CSS_FILE);
  let handle;
  try {
    handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST' || code === 'ELOOP') throw new StylesheetWriteError(`There is already a ${CUSTOM_CSS_FILE} in the data folder (${file}). Nothing was written.`);
    if (code === 'ENOENT') throw new StylesheetWriteError(`The data folder (${dataDir}) is not there. Nothing was written: start the server once, or make the folder.`);
    throw new StylesheetWriteError(`${file} could not be written: ${(error as Error).message}`);
  }
  try {
    await handle.writeFile(customCssStarter(), 'utf8');
  } finally {
    await handle.close();
  }
  return file;
}
