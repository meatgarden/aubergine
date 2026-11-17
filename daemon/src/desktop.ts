import type { DesktopSettingsAnswer, OpenedOnDesktop } from '@aubergine/shared';
import type { DesktopOpener } from './desktop/open';
import { ConflictError, type Sessions } from './sessions';
import { SettingsUnreadableError } from './settings';
import type { StateHub } from './state-hub';
import { TerminalRefusal } from './terminal-access';

/**
 * Opening a terminal on the owner's desktop, as the routes see it: which
 * sessions may be opened, how often, and tidying up after a session. What
 * is started, and how, is the opener's (`desktop/open.ts`).
 *
 * This starts a program on the owner's computer. It is asked for by the
 * owner alone: no token, no session, no schedule and no task reaches it.
 */

/** How many windows may be asked for in a minute. A page that asks for more is refused, not queued. */
export const DESKTOP_OPENS_PER_MINUTE = 12;

export interface DesktopOptions {
  /** Null where this server has none: opening then says so. */
  opener: DesktopOpener | null;
  /** Writes `desktop.openNew` into the settings file, and nothing else. */
  setOpenNew: ((value: boolean) => Promise<void>) | null;
  openNew: () => Promise<boolean>;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export class Desktop {
  private readonly unsubscribe: () => void;
  private opened: number[] = [];

  constructor(
    private readonly hub: StateHub,
    private readonly sessions: Sessions,
    private readonly options: DesktopOptions,
  ) {
    // A session that ended or was removed leaves no script behind.
    this.unsubscribe = hub.subscribe((event) => {
      if (event.type === 'session.closed' || event.type === 'session.exited') void options.opener?.forget(event.sessionId).catch(options.onError ?? (() => {}));
    });
  }

  close(): void {
    this.unsubscribe();
  }

  /** After a start of the server: scripts of sessions that are no longer running are removed. */
  async sweep(): Promise<void> {
    await this.options.opener?.sweep(new Set(this.hub.state.sessions.filter((s) => s.state !== 'exited').map((s) => s.id))).catch(this.options.onError ?? (() => {}));
  }

  /** Opens a running session in the owner's terminal application. Says what it did, or why it could not. */
  async open(sessionId: string): Promise<OpenedOnDesktop> {
    const session = this.sessions.get(sessionId);
    if (session.state === 'exited') throw new ConflictError('This shell has ended: there is nothing to show. Restart it first.');
    const opener = this.options.opener;
    if (opener === null) return { opened: false, says: 'This server cannot open a terminal on the desktop.' };
    const now = (this.options.now ?? Date.now)();
    this.opened = this.opened.filter((at) => at > now - 60_000);
    if (this.opened.length >= DESKTOP_OPENS_PER_MINUTE) {
      const wait = Math.max(1, Math.ceil(((this.opened[0] ?? now) + 60_000 - now) / 1000));
      throw new TerminalRefusal(429, 'rate_limited', `${this.opened.length} windows were asked for in the last minute, which is the most allowed. Try again in ${wait} s.`, wait);
    }
    this.opened.push(now);
    const did = await opener.open(sessionId);
    return { opened: did.ok, says: did.says };
  }

  /** For a terminal that was just made: the same, and a failure is a sentence, never a failed creation. */
  async openNew(sessionId: string): Promise<OpenedOnDesktop> {
    try {
      return await this.open(sessionId);
    } catch (error) {
      if (!(error instanceof ConflictError || error instanceof TerminalRefusal)) this.options.onError?.(error);
      return { opened: false, says: (error as Error).message };
    }
  }

  async settings(): Promise<DesktopSettingsAnswer> {
    return { openNew: await this.options.openNew() };
  }

  /** The one setting the page changes. Which application, and a command line of the owner's, are written by hand in the settings file. */
  async setOpenNew(value: boolean): Promise<DesktopSettingsAnswer> {
    if (this.options.setOpenNew === null) throw new ConflictError('This server has no settings file to write.');
    try {
      await this.options.setOpenNew(value);
    } catch (error) {
      if (error instanceof SettingsUnreadableError) throw new ConflictError(error.message);
      throw error;
    }
    return this.settings();
  }
}
