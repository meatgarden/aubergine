// Tests of what the examples share: the parser of server-sent events, the tracker that tells
// "started waiting" from "is waiting", and following a stream across a drop and a refusal,
// against a server this file starts on a port of its own. Made-up values throughout.
//   node --test examples/events/sse.test.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';
import { Refused, delayFor, follow, oneLine, reasonOf, settings, sseParser, waitingTracker } from './sse.mjs';

/** Everything a parser makes of these chunks. */
function parsed(chunks) {
  const events = [];
  const parser = sseParser((event) => events.push(event));
  for (const chunk of chunks) parser.feed(chunk);
  return events;
}
const dataOf = (chunks) => parsed(chunks).map((event) => event.data);

describe('the parser', () => {
  test('one event per empty line', () => {
    assert.deepEqual(dataOf(['data: {"a":1}\n\ndata: {"b":2}\n\n']), ['{"a":1}', '{"b":2}']);
  });

  test('an event cut anywhere is the same event', () => {
    const whole = ': connected\n\ndata: {"type":"session.attention","n":1}\n\n: still here\n\ndata: second\n\n';
    const expected = dataOf([whole]);
    assert.deepEqual(expected, ['{"type":"session.attention","n":1}', 'second']);
    for (let at = 1; at < whole.length; at += 1) assert.deepEqual(dataOf([whole.slice(0, at), whole.slice(at)]), expected, `cut at ${at}`);
    assert.deepEqual(dataOf([...whole]), expected, 'one character at a time');
  });

  test('nothing is told before the empty line arrives', () => {
    const events = [];
    const parser = sseParser((event) => events.push(event));
    parser.feed('data: half');
    parser.feed('\n');
    assert.equal(events.length, 0);
    parser.feed('\n');
    assert.equal(events.length, 1);
  });

  test('comments and keep-alive lines are nothing', () => {
    assert.deepEqual(parsed([': connected\n\n: still here\n\n:\n\n']), []);
    assert.deepEqual(dataOf([': a comment\ndata: x\n: another\n\n']), ['x']);
  });

  test('several data lines are joined with a newline', () => {
    assert.deepEqual(dataOf(['data: one\ndata: two\ndata:\ndata: four\n\n']), ['one\ntwo\n\nfour']);
  });

  test('one space after the colon is taken off, and no more', () => {
    assert.deepEqual(dataOf(['data:none\n\ndata:  two\n\ndata\n\n']), ['none', ' two', '']);
  });

  test('CRLF and a lone CR end a line too', () => {
    assert.deepEqual(dataOf(['data: a\r\ndata: b\r\n\r\ndata: c\r\rdata: d\n\n']), ['a\nb', 'c', 'd']);
  });

  test('a CRLF cut between its two halves is one line end, not two', () => {
    assert.deepEqual(dataOf(['data: a\r', '\ndata: b\r', '\n\r', '\n']), ['a\nb']);
  });

  test('the name and the ID of an event, and fields that are not known', () => {
    assert.deepEqual(parsed(['event: change\nid: 7\nretry: 1000\nwhatever: x\ndata: y\n\ndata: z\n\n']), [
      { event: 'change', data: 'y', id: '7' },
      { event: 'message', data: 'z', id: '7' },
    ]);
  });

  test('an event with no data is nothing, and a byte-order mark at the start is skipped', () => {
    assert.deepEqual(dataOf(['\uFEFFevent: empty\n\ndata: x\n\n']), ['x']);
  });
});

const A = '019a0000-0000-7000-8000-00000000000a';
const B = '019a0000-0000-7000-8000-00000000000b';
const attention = (sessionId, state, message = null) => ({ type: 'session.attention', sessionId, attention: { state, message, at: '2026-11-28T10:00:00.000Z' } });

describe('started waiting', () => {
  test('once per wait, and again after it ended', () => {
    const tracker = waitingTracker();
    assert.equal(tracker.change(attention(A, 'working')), null);
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    // The same state told again, as when only its message changes: still the same wait.
    assert.equal(tracker.change(attention(A, 'waiting', 'Which branch?')), null);
    assert.equal(tracker.change(attention(A, 'waiting', 'Which branch?')), null);
    assert.equal(tracker.change(attention(A, 'none')), null);
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    assert.equal(tracker.change(attention(A, 'done')), null);
    assert.equal(tracker.change(attention(A, 'waiting')), A);
  });

  test('each terminal by itself, and other changes are nothing', () => {
    const tracker = waitingTracker();
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    assert.equal(tracker.change(attention(B, 'waiting')), B);
    assert.equal(tracker.change({ type: 'session.status', sessionId: A, status: { state: 'idle', lastExit: 1 } }), null);
    assert.equal(tracker.change({ type: 'session.renamed', sessionId: A, name: 'waiting' }), null);
    assert.equal(tracker.change(attention(A, 'waiting')), null);
    assert.equal(tracker.change({ type: 'run.moved', run: { id: B, status: 'awaiting' } }), null);
  });

  test('a terminal that is first heard of while waiting started now, as far as can be told', () => {
    const tracker = waitingTracker();
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    assert.equal(tracker.change({ type: 'session.created', session: { id: B, attention: { state: 'none' } } }), null);
    assert.equal(tracker.change(attention(B, 'waiting')), B);
  });

  test('what a list says at the start is remembered and not acted on', () => {
    const tracker = waitingTracker();
    assert.deepEqual(tracker.seed([{ id: A, attention: { state: 'waiting' } }, { id: B, attention: { state: 'working' } }]), []);
    assert.equal(tracker.change(attention(A, 'waiting')), null);
    assert.equal(tracker.change(attention(B, 'waiting')), B);
  });

  test('after a drop, the list says who began to wait meanwhile, once', () => {
    const tracker = waitingTracker();
    tracker.seed([{ id: A, attention: { state: 'waiting' } }, { id: B, attention: { state: 'none' } }]);
    const now = [{ id: A, attention: { state: 'waiting' } }, { id: B, attention: { state: 'waiting' } }];
    assert.deepEqual(tracker.seed(now, { report: true }), [B]);
    assert.deepEqual(tracker.seed(now, { report: true }), []);
    assert.equal(tracker.change(attention(B, 'waiting')), null);
  });

  test('a terminal that is gone is forgotten', () => {
    const tracker = waitingTracker();
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    tracker.change({ type: 'session.closed', sessionId: A });
    assert.equal(tracker.change(attention(A, 'waiting')), A);
    tracker.seed([]);
    assert.equal(tracker.change(attention(A, 'waiting')), A);
  });
});

describe('the settings', () => {
  const SECRET = 'aubt_made_up_for_this_test';

  test('the usual address, and the token as given', () => {
    assert.deepEqual(settings({ AUBERGINE_TOKEN: SECRET }), { origin: 'http://127.0.0.1:4600', token: SECRET });
    assert.equal(settings({ AUBERGINE_TOKEN: SECRET, AUBERGINE_URL: 'http://127.0.0.1:4999/some/path?x=1' }).origin, 'http://127.0.0.1:4999');
  });

  test('what is wrong is said without the token', () => {
    const wrong = [
      {},
      { AUBERGINE_TOKEN: `${SECRET} x` },
      { AUBERGINE_TOKEN: `${SECRET}\n` },
      { AUBERGINE_TOKEN: SECRET, AUBERGINE_URL: 'not an address' },
      { AUBERGINE_TOKEN: SECRET, AUBERGINE_URL: 'file:///tmp/x' },
      { AUBERGINE_TOKEN: SECRET, AUBERGINE_URL: `http://user:${SECRET}@127.0.0.1:4600` },
    ];
    for (const env of wrong) {
      assert.throws(
        () => settings(env),
        (error) => !error.message.includes(SECRET),
      );
    }
  });
});

describe('small things', () => {
  test('the wait grows and stops growing', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(delayFor), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  test('one line stays one line', () => {
    assert.equal(oneLine('a\nb\u001b[2Jc\u202e'), 'a\\u000ab\\u001b[2Jc\\u202e');
  });
});

describe('following a server', () => {
  const SECRET = 'aubt_made_up_for_this_test';
  const servers = [];
  after(() => {
    for (const server of servers) {
      server.closeAllConnections();
      server.close();
    }
  });
  /** A server on a port of its own; `handler` answers each request. */
  async function serve(handler) {
    const server = createServer(handler);
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${server.address().port}`, token: SECRET };
  }

  test('changes arrive in order, the token is in the header only, and a drop is followed by another connection', async () => {
    const seen = [];
    let connections = 0;
    const server = await serve((request, response) => {
      seen.push({ url: request.url, authorization: request.headers.authorization });
      connections += 1;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': connected\n\n');
      if (connections === 1) {
        response.write('data: {"type":"one"}\n\ndata: {"ty');
        setTimeout(() => response.write('pe":"two"}\n\ndata: not json\n\ndata: {"no":"type"}\n\n'), 10);
        // Cut in the middle of an event: that half is never told.
        setTimeout(() => response.end('data: {"type":"hal'), 30);
      } else {
        response.write('data: {"type":"three"}\n\n');
      }
    });
    const stop = new AbortController();
    const changes = [];
    const notes = [];
    let opened = 0;
    await follow(server, {
      signal: stop.signal,
      onOpen: () => {
        opened += 1;
      },
      onNote: (sentence) => notes.push(sentence),
      onChange: (change) => {
        changes.push(change.type);
        if (change.type === 'three') stop.abort();
      },
    });
    assert.deepEqual(changes, ['one', 'two', 'three']);
    assert.equal(opened, 2);
    assert.deepEqual(seen, [
      { url: '/v1/events', authorization: `Bearer ${SECRET}` },
      { url: '/v1/events', authorization: `Bearer ${SECRET}` },
    ]);
    assert.ok(notes.some((note) => note.includes('trying again in 1s')));
    assert.ok(!notes.join('\n').includes(SECRET));
  });

  const EPOCH = '01a21f7a-5e66-70dd-85e5-a6a169683cba';
  const hello = (resumed, id) => `event: hello\nid: ${id}\ndata: ${JSON.stringify({ type: 'hello', epoch: EPOCH, revision: 9, version: '0.0.0', resumed })}\n\n`;
  const change = (type, id) => `id: ${id}\ndata: ${JSON.stringify({ type })}\n\n`;

  test('after a drop it sends the last id back, takes what is sent again as changes, and does not read the state again', async () => {
    const asked = [];
    const server = await serve((request, response) => {
      asked.push(request.headers['last-event-id'] ?? null);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': connected\n\n');
      if (asked.length === 1) {
        // Cut in the middle of the third: its id was read, the event was not, so it is not where this stands.
        response.write(`${hello(false, `${EPOCH}.4`)}${change('one', `${EPOCH}.5`)}${change('two', `${EPOCH}.7`)}id: ${EPOCH}.8\ndata: {"type":"hal`);
        setTimeout(() => response.end(), 20);
      } else if (asked.length === 2) {
        response.write(`${hello(true, `${EPOCH}.7`)}${change('three', `${EPOCH}.8`)}${change('four', `${EPOCH}.9`)}`);
        setTimeout(() => response.end(), 20);
      } else {
        response.write(`${hello(true, `${EPOCH}.9`)}${change('five', `${EPOCH}.12`)}`);
      }
    });
    const stop = new AbortController();
    const changes = [];
    const notes = [];
    let opened = 0;
    const last = await follow(server, {
      signal: stop.signal,
      onOpen: () => {
        opened += 1;
      },
      onNote: (sentence) => notes.push(sentence),
      onChange: (found) => {
        changes.push(found.type);
        // Stopped from inside the last change: it was taken, so its id is where this stands.
        if (found.type === 'five') setTimeout(() => stop.abort(), 0);
      },
    });
    // `hello` is not a change, nothing came twice, nothing is missing.
    assert.deepEqual(changes, ['one', 'two', 'three', 'four', 'five']);
    assert.deepEqual(asked, [null, `${EPOCH}.7`, `${EPOCH}.9`]);
    // The state was read once, at the start. The server said what was missed; no list was needed.
    assert.equal(opened, 1);
    assert.equal(last, `${EPOCH}.12`);
    assert.equal(notes.filter((note) => note === 'going on from where it stopped').length, 2);
  });

  test('a drop right after hello asks from where hello said, and one before any event from nowhere', async () => {
    const asked = [];
    const server = await serve((request, response) => {
      asked.push(request.headers['last-event-id'] ?? null);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      if (asked.length === 1) return response.end(': connected\n\n');
      if (asked.length === 2) return response.end(`: connected\n\n${hello(false, `${EPOCH}.4`)}`);
      response.write(`${hello(true, `${EPOCH}.4`)}${change('one', `${EPOCH}.5`)}`);
    });
    const stop = new AbortController();
    let opened = 0;
    const changes = [];
    await follow(server, {
      signal: stop.signal,
      onOpen: () => {
        opened += 1;
      },
      onChange: (found) => {
        changes.push(found.type);
        stop.abort();
      },
    });
    assert.deepEqual(asked, [null, null, `${EPOCH}.4`]);
    assert.deepEqual(changes, ['one']);
    // Read on each connection that had nothing to go on from; not on the one that went on.
    assert.equal(opened, 2);
  });

  for (const reason of ['restarted', 'too-old', 'unreadable']) {
    test(`reset (${reason}) is not a change: the state is read again before anything later is handed over`, async () => {
      const asked = [];
      const server = await serve((request, response) => {
        asked.push(request.headers['last-event-id'] ?? null);
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        if (asked.length === 1) return response.end(`${hello(false, `${EPOCH}.4`)}${change('one', `${EPOCH}.5`)}`);
        // Another run of the server: it cannot go on from an id of the one before.
        response.write(`: connected\n\nevent: reset\ndata: ${JSON.stringify({ type: 'reset', reason })}\n\n${hello(false, 'another-run.2')}${change('two', 'another-run.3')}`);
      });
      const stop = new AbortController();
      const order = [];
      const notes = [];
      const last = await follow(server, {
        signal: stop.signal,
        // Reading takes a while: nothing is handed over until it is done.
        onOpen: async () => {
          order.push('read');
          await new Promise((resolve) => setTimeout(resolve, 30));
          order.push('read done');
        },
        onNote: (sentence) => notes.push(sentence),
        onChange: (found) => {
          order.push(found.type);
          if (found.type === 'two') setTimeout(() => stop.abort(), 0);
        },
      });
      assert.deepEqual(order, ['read', 'read done', 'one', 'read', 'read done', 'two']);
      assert.deepEqual(asked, [null, `${EPOCH}.5`]);
      assert.equal(last, 'another-run.3');
      assert.equal(notes.filter((note) => note.endsWith('what happened meanwhile is not sent again, reading the state again')).length, 1);
    });
  }

  test('a reading of the state that fails after a reset is tried again: the id is kept until hello', async () => {
    const asked = [];
    const server = await serve((request, response) => {
      asked.push(request.headers['last-event-id'] ?? null);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(`event: reset\ndata: {"type":"reset","reason":"restarted"}\n\n${hello(false, 'new.1')}${change('one', 'new.2')}`);
    });
    const stop = new AbortController();
    let reads = 0;
    const changes = [];
    await follow(server, {
      signal: stop.signal,
      lastEventId: 'old.7',
      onOpen: () => {
        reads += 1;
        if (reads === 1) throw new Error('the list could not be read');
      },
      onChange: (found) => {
        changes.push(found.type);
        stop.abort();
      },
    });
    // The first time the list failed before `hello` was taken: the same id was sent again, and `reset` said again.
    assert.deepEqual(asked, ['old.7', 'old.7']);
    assert.equal(reads, 2);
    assert.deepEqual(changes, ['one']);
  });

  test('starts from an id it is given, and refuses one a header cannot carry', async () => {
    const asked = [];
    const server = await serve((request, response) => {
      asked.push(request.headers['last-event-id'] ?? null);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(`${hello(true, `${EPOCH}.4`)}${change('one', `${EPOCH}.5`)}`);
    });
    const stop = new AbortController();
    let opened = 0;
    await follow(server, { signal: stop.signal, lastEventId: `${EPOCH}.4`, onOpen: () => void (opened += 1), onChange: () => stop.abort() });
    assert.deepEqual(asked, [`${EPOCH}.4`]);
    assert.equal(opened, 0);
    for (const wrong of ['a b', 'a\nb', 'é', 'x'.repeat(201)]) await assert.rejects(follow(server, { lastEventId: wrong, onChange: () => {} }), /not an id/);
    assert.equal(asked.length, 1);
  });

  test('a waiting that began and ended while nobody listened is told when it is sent again, once', async () => {
    const SESSION = '01a21f7a-5e66-70dd-85e5-a6a169683cbb';
    const attention = (state, id) => `id: ${id}\ndata: ${JSON.stringify({ type: 'session.attention', sessionId: SESSION, attention: { state } })}\n\n`;
    let connections = 0;
    const server = await serve((_request, response) => {
      connections += 1;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      if (connections === 1) return response.end(`${hello(false, `${EPOCH}.1`)}${attention('working', `${EPOCH}.2`)}`);
      // Sent again: it started waiting, was answered, and waits again with another message, twice told.
      response.write(`${hello(true, `${EPOCH}.2`)}${attention('waiting', `${EPOCH}.3`)}${attention('working', `${EPOCH}.4`)}${attention('waiting', `${EPOCH}.5`)}${attention('waiting', `${EPOCH}.6`)}${change('end', `${EPOCH}.7`)}`);
    });
    const stop = new AbortController();
    const tracker = waitingTracker();
    const began = [];
    let lists = 0;
    await follow(server, {
      signal: stop.signal,
      onOpen: () => {
        lists += 1;
        for (const id of tracker.seed([{ id: SESSION, attention: { state: 'none' } }], { report: lists > 1 })) began.push(`list ${id}`);
      },
      onChange: (found) => {
        const id = tracker.change(found);
        if (id !== null) began.push(id);
        if (found.type === 'end') stop.abort();
      },
    });
    assert.equal(lists, 1);
    assert.deepEqual(began, [SESSION, SESSION]);
  });

  for (const status of [401, 403]) {
    test(`${status} ends it with a sentence, at once, without the token`, async () => {
      let asked = 0;
      const server = await serve((_request, response) => {
        asked += 1;
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'refused', message: `no: ${SECRET}` } }));
      });
      const notes = [];
      await assert.rejects(
        follow(server, { onChange: () => {}, onNote: (sentence) => notes.push(sentence) }),
        (error) => error instanceof Refused && error.status === status && !error.message.includes(SECRET) && /token/.test(error.message),
      );
      assert.equal(asked, 1);
      assert.ok(!notes.join('\n').includes(SECRET));
    });
  }

  test('a server that is not there is said in a few words, and stopping ends the wait', async () => {
    const server = await serve(() => {});
    const gone = { ...server };
    await new Promise((resolve) => servers.pop().close(resolve));
    const stop = new AbortController();
    const notes = [];
    await follow(gone, {
      signal: stop.signal,
      onChange: () => {},
      onNote: (sentence) => {
        notes.push(sentence);
        stop.abort();
      },
    });
    assert.deepEqual(notes, ['not connected (nothing is listening there); trying again in 1s']);
    assert.equal(reasonOf(new Error('x')), 'x');
  });
});
