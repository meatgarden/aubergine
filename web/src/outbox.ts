import type { TerminalClientMessage } from '@aubergine/shared';

const MAX_HELD = 2000;

/**
 * Decides what happens to messages for a terminal socket that is not open.
 * Before the first connection, keystrokes are held and sent in order once it
 * opens, so nothing typed right after a page load is lost. After a lost
 * connection they are dropped: the terminal shows "Reconnecting…", and
 * replaying stale keystrokes into a shell later would be worse than losing
 * them. Resize messages are never held; the current size is sent on open.
 */
export class Outbox {
  private held: TerminalClientMessage[] = [];
  private everOpen = false;

  constructor(private readonly transmit: (message: TerminalClientMessage) => void) {}

  send(message: TerminalClientMessage, isOpen: boolean): void {
    if (isOpen) {
      this.transmit(message);
    } else if (!this.everOpen && message.t === 'input' && this.held.length < MAX_HELD) {
      this.held.push(message);
    }
  }

  /** Call when the socket opens, after sending the current size. */
  opened(): void {
    this.everOpen = true;
    const held = this.held;
    this.held = [];
    for (const message of held) this.transmit(message);
  }
}
