import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FetchWebhookSender, NO_SENDER } from './send';

/**
 * The real sender, against a server this test starts on this computer, on a
 * port the system picks. No test here, or anywhere, reaches a network.
 */

interface Got {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}
let server: Server;
let base: string;
let got: Got[] = [];
let respond: (request: IncomingMessage, response: ServerResponse) => void;
/** How much of its answer the receiver managed to write before it was let go of. */
let written = 0;

beforeEach(async () => {
  got = [];
  written = 0;
  respond = (_request, response) => void response.writeHead(204).end();
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      got.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
      respond(request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const delivery = (more: object = {}) => ({ address: `${base}/in/PATHKEY?key=QUERYKEY`, headers: { 'X-Aubergine-Event': 'task.done', 'X-Aubergine-Delivery': 'made-up', 'X-Aubergine-Signature': 't=1,v1=00' }, body: '{"id":"made-up"}', ...more });

describe('the real sender', () => {
  it('posts the message once as JSON, with the headers it was given and nothing that says who sent it', async () => {
    expect(await new FetchWebhookSender().send(delivery())).toEqual({ kind: 'answered', status: 204 });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ method: 'POST', url: '/in/PATHKEY?key=QUERYKEY', body: '{"id":"made-up"}' });
    expect(got[0]!.headers).toMatchObject({ 'content-type': 'application/json', 'x-aubergine-event': 'task.done', 'x-aubergine-delivery': 'made-up', 'x-aubergine-signature': 't=1,v1=00' });
    // No cookie, no credential, no page it came from.
    for (const never of ['cookie', 'authorization', 'referer', 'origin']) expect(got[0]!.headers[never], never).toBeUndefined();
  });

  it('says an error of the receiver as its status and does not try again', async () => {
    respond = (_request, response) => void response.writeHead(500).end('no');
    expect(await new FetchWebhookSender().send(delivery())).toEqual({ kind: 'answered', status: 500 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(got).toHaveLength(1);
  });

  it('does not follow a redirect: the 3xx is the answer, and the other place is never asked', async () => {
    let elsewhere = 0;
    const other = createServer((_request, response) => {
      elsewhere += 1;
      response.writeHead(200).end();
    });
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    try {
      for (const status of [301, 302, 307, 308]) {
        respond = (_request, response) => void response.writeHead(status, { location: `http://127.0.0.1:${(other.address() as AddressInfo).port}/elsewhere` }).end();
        expect(await new FetchWebhookSender().send(delivery()), String(status)).toEqual({ kind: 'answered', status });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(elsewhere).toBe(0);
      expect(got).toHaveLength(4);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it('gives up on a receiver that does not answer, in the time it has', async () => {
    respond = () => {};
    const began = Date.now();
    // Whoever asks is handed a promise at once: waiting for the receiver is the promise's, never the caller's.
    const going = new FetchWebhookSender({ timeoutMs: 300 }).send(delivery());
    expect(Date.now() - began).toBeLessThan(100);
    expect(await going).toEqual({ kind: 'timed-out' });
    expect(Date.now() - began).toBeLessThan(3000);
    expect(got).toHaveLength(1);
  });

  it('does not read a large answer: the status is all it takes', async () => {
    respond = (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      const chunk = Buffer.alloc(64 * 1024, 'x');
      // A receiver that would send 64 MB if anyone read it.
      const more = (): void => {
        while (written < 64 * 1024 * 1024 && !response.destroyed) {
          written += chunk.length;
          if (!response.write(chunk)) return void response.once('drain', more);
        }
        response.end();
      };
      response.on('error', () => {});
      more();
    };
    const began = Date.now();
    expect(await new FetchWebhookSender().send(delivery())).toEqual({ kind: 'answered', status: 200 });
    expect(Date.now() - began).toBeLessThan(3000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The receiver could not hand over more than what fits in the buffers between the two.
    expect(written).toBeLessThan(16 * 1024 * 1024);
  });

  it('says that a receiver that is not there could not be reached, in no words of the network', async () => {
    const port = (server.address() as AddressInfo).port;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    const result = await new FetchWebhookSender().send(delivery({ address: `http://127.0.0.1:${port}/in/PATHKEY` }));
    expect(result).toEqual({ kind: 'failed' });
    expect(JSON.stringify(result)).not.toContain('PATHKEY');
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  it('sends nothing to an address that is not one, or a message that is too large; and a server without a sender sends nothing', async () => {
    let asked = 0;
    const counting = new FetchWebhookSender({ fetch: (async () => { asked += 1; return new Response(null, { status: 204 }); }) as typeof fetch });
    for (const address of ['http://hooks.example.test/in', 'https://user:pass@hooks.example.test/in', 'file:///etc/passwd', 'https://hooks.example.test/in#x', '']) expect(await counting.send(delivery({ address })), address).toEqual({ kind: 'refused', why: 'address' });
    expect(await counting.send(delivery({ body: 'x'.repeat(4097) }))).toEqual({ kind: 'refused', why: 'too-large' });
    expect(asked).toBe(0);
    expect(await counting.send(delivery({ body: 'x'.repeat(4096) }))).toEqual({ kind: 'answered', status: 204 });
    expect(asked).toBe(1);
    expect(await NO_SENDER.send(delivery())).toEqual({ kind: 'refused', why: 'no-sender' });
    expect(got).toEqual([]);
  });
});
