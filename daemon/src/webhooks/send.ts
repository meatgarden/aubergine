import { WEBHOOK_BODY_MAX_BYTES, WEBHOOK_TIMEOUT_MS, webhookAddressProblem } from '@aubergine/shared';

/**
 * Sending a webhook: the one place the server starts a request to a network
 * because something happened. Everything else knows only `WebhookSender`:
 * the server is given the real one, every test a stand-in that keeps what it
 * was asked to send.
 *
 * One attempt, never a second. The answer's status is read and nothing more
 * of it. A redirect is not followed. Nothing here writes a log line, and what
 * comes back never holds the address: an error of the network may name it,
 * so no error's words leave this module.
 */

export interface WebhookDelivery {
  address: string;
  /** The headers that say what this is and sign it. `Content-Type` is the sender's own. */
  headers: Readonly<Record<string, string>>;
  /** The message, as the bytes that were signed. */
  body: string;
}

/** How one attempt ended. */
export type WebhookResult =
  /** The receiver answered. Only the status is known: the body was not read. A redirect is an answer, and was not followed. */
  | { kind: 'answered'; status: number }
  /** Nothing was sent: the address or the message is not one this module sends. */
  | { kind: 'refused'; why: 'address' | 'too-large' }
  /** No answer within the time allowed. */
  | { kind: 'timed-out' }
  /** The request could not be made or was cut off: no such host, refused, a certificate that does not hold. */
  | { kind: 'failed' };

export interface WebhookSender {
  send(delivery: WebhookDelivery): Promise<WebhookResult>;
}

/** A server that was given no sender sends nothing, and says so. */
export const NO_SENDER: WebhookSender = { send: async () => ({ kind: 'failed' }) };

export interface FetchSenderOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** The real sender: one `POST` with `fetch`. */
export class FetchWebhookSender implements WebhookSender {
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: FetchSenderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
    this.fetch = options.fetch ?? fetch;
  }

  async send(delivery: WebhookDelivery): Promise<WebhookResult> {
    // Checked where it was taken in, and again here where it is used.
    if (webhookAddressProblem(delivery.address) !== null) return { kind: 'refused', why: 'address' };
    if (Buffer.byteLength(delivery.body, 'utf8') > WEBHOOK_BODY_MAX_BYTES) return { kind: 'refused', why: 'too-large' };
    const stop = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetch(delivery.address, {
        method: 'POST',
        headers: { ...delivery.headers, 'Content-Type': 'application/json' },
        body: delivery.body,
        // Never followed: a receiver cannot send the message, or this server, anywhere else. The 3xx is the answer.
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: stop.signal,
      });
      // The status is all that is wanted: the rest of the answer is let go of unread.
      void response.body?.cancel().catch(() => {});
      return { kind: 'answered', status: response.status };
    } catch {
      // What went wrong is not passed on: an error of the network may name the address.
      return timedOut ? { kind: 'timed-out' } : { kind: 'failed' };
    } finally {
      clearTimeout(timer);
    }
  }
}
