#!/usr/bin/env node
// Receives the webhooks a rule of Aubergine's sends, checks each signature and prints what arrived.
// Node 22, no dependencies. docs/webhooks.md has the rest.
//
//   AUBERGINE_WEBHOOK_SECRET=<the secret of that webhook in config.json> node examples/webhooks/receive.mjs [port]
//
// It listens on this computer only (127.0.0.1). The address to write into config.json is then
// http://127.0.0.1:<port>/ . A message that does not verify is answered 401 and not printed.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/** A message older or newer than this many seconds is refused, so that one that was read on the way cannot be sent again later. */
export const TOLERANCE_SECONDS = 300;
/** The largest message that is read. What Aubergine sends is far smaller. */
export const MAX_BYTES = 8192;

/**
 * Whether a message is one that the holder of `secret` signed, lately.
 * `header` is the value of X-Aubergine-Signature: `t=<seconds>,v1=<hex>`. `body` is the body exactly as it
 * arrived, before anything parsed it. Answers `{ ok: true }` or `{ ok: false, why }`.
 */
export function verify(secret, header, body, now = Date.now()) {
  const found = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(typeof header === 'string' ? header : '');
  if (!found) return { ok: false, why: 'no signature that can be read' };
  const [, seconds, given] = found;
  const expected = createHmac('sha256', secret).update(`${seconds}.${body}`).digest();
  // Compared in constant time: how long a wrong signature takes to refuse says nothing about the right one.
  if (!timingSafeEqual(expected, Buffer.from(given, 'hex'))) return { ok: false, why: 'the signature does not match' };
  // Only after the signature held: the time is part of what was signed.
  if (Math.abs(Math.floor(now / 1000) - Number(seconds)) > TOLERANCE_SECONDS) return { ok: false, why: 'the message is too old, or from a clock that is far off' };
  return { ok: true };
}

function listen(secret, port) {
  const server = createServer((request, response) => {
    const answer = (status) => void response.writeHead(status, { 'content-type': 'text/plain' }).end();
    if (request.method !== 'POST') return answer(405);
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const checked = verify(secret, request.headers['x-aubergine-signature'], body);
      if (!checked.ok) {
        console.error(`refused: ${checked.why}`);
        return answer(401);
      }
      // Answered at once: Aubergine waits five seconds and does not try again.
      answer(204);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        return void console.error('verified, but not JSON');
      }
      // The terminal's name may have been set by the agent in it: it is printed as data, and nothing here acts on it.
      console.log(`verified  ${request.headers['x-aubergine-event']}  ${request.headers['x-aubergine-delivery']}`);
      console.log(JSON.stringify(message, null, 2));
    });
  });
  server.listen(port, '127.0.0.1', () => console.error(`Listening on http://127.0.0.1:${server.address().port}/`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.AUBERGINE_WEBHOOK_SECRET ?? '';
  if (secret.length < 32) {
    console.error('Set AUBERGINE_WEBHOOK_SECRET to the secret of the webhook in config.json (at least 32 characters).');
    process.exit(2);
  }
  listen(secret, Number(process.argv[2] ?? 8787));
}
