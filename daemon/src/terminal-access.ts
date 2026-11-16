import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  INPUT_KEYS_MAX,
  OUTPUT_LINES_MAX,
  RUN_OUTPUT_MAX_LINES,
  inputProblem,
  type InputRequest,
  type InputResponse,
  type OutputResponse,
  type RunCommandRequest,
  type RunCommandResponse,
  type ScreenResponse,
  type Session,
  type Settings,
  type TerminalSearchResponse,
} from '@aubergine/shared';
import { noInputAudit, type InputAudit } from './input-audit';
import type { SessionRuntime } from './runtime/runtime';
import { BadInputError, ConflictError, type Sessions } from './sessions';

/** A refusal with one of the codes this stage adds, or one of the limits. */
export class TerminalRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: 'not_at_prompt' | 'no_shell_integration' | 'run_in_progress' | 'rate_limited' | 'too_large',
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Who is typing: for the limits, the mark the owner sees, and the audit. */
export interface Typist {
  /** The token's ID, or null for the owner. Limits apply to tokens only. */
  tokenId: string | null;
  name: string;
}

/** What a call did, for the activity log: how much, and a fingerprint of what was typed. Never the text. */
export interface TerminalTrace {
  chars: number;
  fingerprint?: string;
}

const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'dash', 'ksh', 'tcsh', 'csh']);
const MINUTE = 60_000;

/** The first characters of a hash of what was typed: enough to see that two entries are the same text, not enough to learn it. */
export const fingerprintOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);

/** Text as it is given out: what the terminal shows, without anything that is not text. */
function plain(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    // capture-pane gives text without colors. Anything else that is not text (a stray escape, a control character) is dropped.
    if (char === '\n' || char === '\t' || (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f))) out += char;
  }
  return out;
}

/**
 * Reading terminals and typing into them, for the routes. Who may is decided
 * before anything here is called. This class decides what is typed (text as
 * it is, or keys from the fixed list, and nothing else), holds the limits,
 * and knows when a shell is at its prompt.
 */
export class TerminalAccess {
  private readonly windows = new Map<string, { start: number; calls: number; chars: number }>();
  /** Sessions with a run being waited for. */
  private readonly waiting = new Set<string>();
  /** Sessions where a run was typed and never seen to start: the shell may be waiting for more input, not at its prompt. */
  private readonly unsettled = new Map<string, number>();

  constructor(
    private readonly sessions: Sessions,
    private readonly runtime: SessionRuntime,
    private readonly settings: () => Settings['terminal'],
    private readonly audit: InputAudit = noInputAudit,
  ) {}

  private running(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended; restart it first');
    return session;
  }

  /* ---------- Reading ---------- */

  async screen(sessionId: string): Promise<{ answer: ScreenResponse; trace: TerminalTrace }> {
    this.running(sessionId);
    const screen = await this.runtime.screen(sessionId);
    const text = plain(screen.text);
    return { answer: { text, columns: screen.columns, rows: screen.rows, cursor: screen.cursor }, trace: { chars: text.length } };
  }

  async output(sessionId: string, query: { lines: number; cursor?: string | undefined }): Promise<{ answer: OutputResponse; trace: TerminalTrace }> {
    this.running(sessionId);
    const skip = query.cursor === undefined ? 0 : Number(/^back:(\d{1,9})$/.exec(query.cursor)?.[1] ?? Number.NaN);
    if (!Number.isInteger(skip)) throw new BadInputError('The cursor is not one this server gave out');
    const count = Math.min(query.lines, OUTPUT_LINES_MAX);
    const read = await this.runtime.lines(sessionId, { count, skip });
    const text = plain(read.lines.join('\n'));
    // The cursor counts rows back from the end. Output that arrives meanwhile moves the end; a reader going far back should not expect a seamless join.
    return { answer: { text, lines: read.lines.length, nextCursor: read.more ? `back:${skip + count}` : null }, trace: { chars: text.length } };
  }

  /** Searches the history of the sessions this caller may read. The others are not searched, and are not named. */
  async search(query: string, limit: number, mayRead: (session: Session) => boolean): Promise<{ answer: TerminalSearchResponse; trace: TerminalTrace }> {
    const all = this.sessions.all().filter((s) => s.state !== 'exited');
    const allowed = all.filter(mayRead);
    const found = await this.runtime.search(
      allowed.map((s) => s.id),
      query,
      { limit },
    );
    const hits = found.hits.map((hit) => ({ sessionId: hit.sessionId, text: plain(hit.text), before: hit.before.map(plain), after: hit.after.map(plain) }));
    const chars = hits.reduce((sum, hit) => sum + hit.text.length + hit.before.join('').length + hit.after.join('').length, 0);
    return { answer: { hits, truncated: found.truncated, searched: allowed.length, someLeftOut: allowed.length < all.length }, trace: { chars } };
  }

  /* ---------- Limits ---------- */

  /** Counts a call against what one token may type into one session in a minute. The owner is not limited. */
  private spend(who: Typist, sessionId: string, chars: number): void {
    const limits = this.settings();
    if (chars > limits.inputCharsPerCall) throw new TerminalRefusal(413, 'too_large', `That is ${chars} characters; at most ${limits.inputCharsPerCall} may be typed in one call.`);
    if (who.tokenId === null) return;
    const key = `${who.tokenId} ${sessionId}`;
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= MINUTE) {
      window = { start: now, calls: 0, chars: 0 };
      this.windows.set(key, window);
    }
    const retry = Math.max(1, Math.ceil((window.start + MINUTE - now) / 1000));
    if (window.calls + 1 > limits.inputCallsPerMinute) throw new TerminalRefusal(429, 'rate_limited', `Too many input calls to this session with this token. Try again in ${retry} s.`, retry);
    if (window.chars + chars > limits.inputCharsPerMinute) throw new TerminalRefusal(429, 'rate_limited', `Too much text typed into this session with this token in a minute. Try again in ${retry} s.`, retry);
    window.calls += 1;
    window.chars += chars;
  }

  private typed(who: Typist, sessionId: string, kind: string, text: string): void {
    // The owner sees that a program typed, and which; the audit keeps the text only when it was switched on.
    if (who.tokenId !== null) this.sessions.noteTypedBy(sessionId, who.name);
    void this.audit.record({ at: new Date().toISOString(), by: who.tokenId === null ? 'owner-cli' : who.name, tokenId: who.tokenId, sessionId, kind, text });
  }

  /* ---------- Input ---------- */

  /**
   * Types text, or presses keys. The text is checked for one thing only:
   * characters that are not text. Nothing in it is read as anything else.
   */
  async input(sessionId: string, body: InputRequest, who: Typist): Promise<{ answer: InputResponse; trace: TerminalTrace }> {
    this.running(sessionId);
    if (body.keys !== undefined) {
      if (body.keys.length > INPUT_KEYS_MAX) throw new BadInputError(`At most ${INPUT_KEYS_MAX} keys in one call`);
      this.spend(who, sessionId, body.keys.length);
      await this.runtime.press(sessionId, body.keys);
      const names = body.keys.join(' ');
      this.typed(who, sessionId, 'keys', names);
      return { answer: { typed: 0, keys: body.keys.length }, trace: { chars: body.keys.length, fingerprint: fingerprintOf(`keys:${names}`) } };
    }
    const text = body.text ?? '';
    const problem = inputProblem(text, body.paste);
    if (problem) throw new BadInputError(problem);
    this.spend(who, sessionId, text.length);
    await this.runtime.type(sessionId, text, { paste: body.paste });
    if (body.enter) await this.runtime.press(sessionId, ['Enter']);
    this.typed(who, sessionId, body.paste ? 'paste' : 'text', body.enter ? `${text}\n` : text);
    return { answer: { typed: text.length, keys: body.enter ? 1 : 0 }, trace: { chars: text.length, fingerprint: fingerprintOf(text) } };
  }

  /* ---------- Run and wait ---------- */

  /**
   * Types one command at a shell prompt and waits for the shell to say it
   * finished. Refused unless the session is plainly a shell at its prompt:
   * its shell reports so, and the program that has the keyboard is a shell.
   * On timeout the answer says the command is still going. Nothing is ever
   * stopped from here.
   */
  async run(sessionId: string, body: RunCommandRequest, who: Typist, mayRead: boolean): Promise<{ answer: RunCommandResponse; trace: TerminalTrace }> {
    this.running(sessionId);
    const problem = inputProblem(body.command, false);
    if (problem) throw new BadInputError(problem.replace('The text', 'The command'));

    if (this.waiting.has(sessionId)) throw new TerminalRefusal(409, 'run_in_progress', 'Another run is being waited for on this session.');
    if (this.waiting.size >= this.settings().maxWaitingRuns) throw new TerminalRefusal(409, 'run_in_progress', `${this.waiting.size} runs are being waited for already; that is the most allowed at once.`);
    this.waiting.add(sessionId);
    try {
      const before = await this.sessions.shellReport(sessionId);
      if (before === null || before.changedAtMs === undefined) throw new TerminalRefusal(409, 'no_shell_integration', "This session's shell does not report when a command finishes, so a run cannot be waited for. Type with the input route instead.");
      const foreground = (await this.runtime.foreground(sessionId))?.replace(/^-/, '') ?? '';
      // Both must say so: the shell reports it is at its prompt, and the program that has the keyboard is a shell.
      if (before.state !== 'idle' || !SHELLS.has(foreground)) throw new TerminalRefusal(409, 'not_at_prompt', 'This session is not at a shell prompt: a program or an agent has the keyboard. Nothing was typed.');
      // A command typed here before never started (an open quote, perhaps): the shell is waiting for more, not at its prompt.
      if (this.unsettled.get(sessionId) === before.changedAtMs) throw new TerminalRefusal(409, 'not_at_prompt', 'The last command typed here never started: the shell seems to be waiting for more input. Nothing was typed.');
      this.unsettled.delete(sessionId);

      this.spend(who, sessionId, body.command.length);
      const place = (await this.runtime.screen(sessionId)).line;
      const started = Date.now();
      await this.runtime.type(sessionId, body.command);
      await this.runtime.press(sessionId, ['Enter']);
      this.typed(who, sessionId, 'run', `${body.command}\n`);
      const trace: TerminalTrace = { chars: body.command.length, fingerprint: fingerprintOf(body.command) };

      // The shell writes its report when the command starts and again when the next prompt is drawn.
      const deadline = started + body.timeoutSeconds * 1000;
      let seenStart = false;
      for (;;) {
        const now = await this.sessions.shellReport(sessionId);
        if (now && now.changedAtMs !== undefined && now.changedAtMs !== before.changedAtMs) {
          seenStart = true;
          if (now.state === 'idle') {
            const output = mayRead ? await this.outputSince(sessionId, place) : null;
            return { answer: { finished: true, exitCode: now.lastExit, output: output?.text ?? null, outputCut: output?.cut ?? false, durationMs: Date.now() - started }, trace };
          }
        }
        if (Date.now() >= deadline) break;
        await sleep(40);
      }
      // Time is up. It is left alone; if it never started, the session is not trusted to be at a prompt until its shell reports again.
      if (!seenStart) this.unsettled.set(sessionId, before.changedAtMs);
      const output = mayRead ? await this.outputSince(sessionId, place) : null;
      return { answer: { finished: false, exitCode: null, output: output?.text ?? null, outputCut: output?.cut ?? false, durationMs: Date.now() - started }, trace };
    } finally {
      this.waiting.delete(sessionId);
    }
  }

  /** What the terminal showed after the line the command was typed on, up to the prompt that followed. */
  private async outputSince(sessionId: string, place: number): Promise<{ text: string; cut: boolean }> {
    const read = await this.runtime.lines(sessionId, { from: place });
    // The first line is the prompt with the command; the last is the new prompt, where the cursor is.
    let lines = read.lines.slice(1, -1);
    let cut = read.lost;
    if (lines.length > RUN_OUTPUT_MAX_LINES) {
      lines = lines.slice(-RUN_OUTPUT_MAX_LINES);
      cut = true;
    }
    return { text: plain(lines.join('\n')), cut };
  }
}
