import { describe, expect, it } from 'vitest';
import { RuleEvent } from './tasks';
import { Settings } from './settings';
import { WebhookBody, webhookAddressProblem, webhookEntries, webhookProblem, webhookSignature, webhookSignatureHeader, webhookText, webhooksShown } from './webhooks';

const SECRET = 'made-up-secret-0123456789-abcdefghij';
const entry = (more: object = {}): object => ({ name: 'ops', address: 'https://hooks.example.test/in/PATHKEY-1?key=QUERYKEY-2', secret: SECRET, ...more });

describe('webhookProblem', () => {
  it('takes an https address, or http only on this computer\'s own names, with a path and a query', () => {
    for (const address of ['https://hooks.example.test', 'https://hooks.example.test/', 'https://hooks.example.test:8443/a/b?c=d&e=f', 'https://xn--bcher-kva.example/in', 'https://192.0.2.7/in', 'http://127.0.0.1:8787/in', 'http://localhost:8787/', 'http://[::1]:8787/in', 'https://localhost/in']) {
      const checked = webhookProblem(entry({ address }));
      expect(checked, address).toMatchObject({ ok: true, name: 'ops', address, secret: SECRET });
    }
    expect(webhookProblem(entry())).toEqual({ ok: true, name: 'ops', address: 'https://hooks.example.test/in/PATHKEY-1?key=QUERYKEY-2', secret: SECRET, host: 'hooks.example.test' });
    expect(webhookProblem(entry({ address: 'http://127.0.0.1:8787/in' }))).toMatchObject({ host: '127.0.0.1:8787' });
    // Another way of writing this computer's own number is still this computer: the host is what the address parses to.
    expect(webhookProblem(entry({ address: 'http://2130706433/in' }))).toMatchObject({ ok: true, host: '127.0.0.1' });
  });

  it('refuses everything else with a sentence that repeats neither the address nor the secret', () => {
    const bad: [object | unknown, RegExp][] = [
      // A user name or a password in the address.
      [entry({ address: 'https://user:PASSWORD-9@hooks.example.test/in' }), /a user name or a password/],
      [entry({ address: 'https://user@hooks.example.test/in' }), /a user name or a password/],
      [entry({ address: 'https://@hooks.example.test/in' }), /a user name or a password/],
      // Plain http anywhere but this computer's own names; a name that only looks like one.
      [entry({ address: 'http://hooks.example.test/in' }), /plain http on a host that is not this computer’s own/],
      [entry({ address: 'http://localhost.example.test/in' }), /plain http/],
      [entry({ address: 'http://127.0.0.1.example.test/in' }), /plain http/],
      [entry({ address: 'http://127.0.0.2/in' }), /plain http/],
      [entry({ address: 'http://0.0.0.0/in' }), /plain http/],
      // A fragment, another scheme, no address at all.
      [entry({ address: 'https://hooks.example.test/in#PATHKEY-1' }), /a fragment/],
      [entry({ address: 'ftp://hooks.example.test/in' }), /not an https address/],
      [entry({ address: 'file:///etc/passwd' }), /not an https address/],
      [entry({ address: 'javascript:alert(1)' }), /not an https address/],
      [entry({ address: 'https:hooks.example.test/in' }), /not an https address/],
      [entry({ address: 'hooks.example.test/in' }), /not an address/],
      [entry({ address: 'https://hooks.example.test./in' }), /ends its host with a dot/],
      [entry({ address: ' https://hooks.example.test/in' }), /a space, a backslash or a control character/],
      [entry({ address: 'https://hooks.example.test/in\r\nX-Injected: 1' }), /a space, a backslash or a control character/],
      [entry({ address: 'https://hooks.example.test\\@evil.example.test/' }), /a space, a backslash or a control character/],
      [entry({ address: `https://hooks.example.test/${'a'.repeat(2000)}` }), /longer than 2000/],
      [entry({ address: '' }), /"address" is missing/],
      [entry({ address: 7 }), /"address" is missing/],
      // A secret that is short, missing, or not text.
      [entry({ secret: 'short-secret-PATHKEY-1' }), /"secret" is shorter than 32 characters/],
      [entry({ secret: undefined }), /"secret" is shorter than 32/],
      [entry({ secret: 12345678901234567890123456789012 }), /"secret" is shorter than 32/],
      [entry({ secret: `${SECRET}\n` }), /has a control character/],
      // A name that is not a short word: control characters, a space, a path, nothing.
      [entry({ name: 'ops\u0007' }), /entry 1: its "name" is not a short word/],
      [entry({ name: 'ops‮' }), /its "name" is not a short word/],
      [entry({ name: 'my ops' }), /its "name" is not a short word/],
      [entry({ name: '../ops' }), /its "name" is not a short word/],
      [entry({ name: '' }), /its "name" is not a short word/],
      [entry({ name: 'a'.repeat(41) }), /its "name" is not a short word/],
      [entry({ name: undefined }), /its "name" is not a short word/],
      ['https://hooks.example.test/in', /is not an object with "name", "address" and "secret"/],
      [null, /is not an object/],
      [[entry()], /is not an object/],
    ];
    for (const [value, says] of bad) {
      const checked = webhookProblem(value);
      expect(checked.ok, JSON.stringify(value)).toBe(false);
      if (checked.ok) continue;
      expect(checked.problem, JSON.stringify(value)).toMatch(says);
      expect(checked.problem).toMatch(/^webhooks: /);
      for (const never of [SECRET, 'PATHKEY', 'QUERYKEY', 'PASSWORD', 'hooks.example.test', 'evil']) expect(checked.problem, JSON.stringify(value)).not.toContain(never);
    }
  });

  it('refuses both of two entries with one name, whatever the case, and keeps the rest', () => {
    const { entries, problems } = webhookEntries([entry(), entry({ name: 'chat' }), entry({ name: 'OPS', address: 'https://other.example.test/in' }), entry({ name: 'bad', secret: 'x' })]);
    expect(entries.map((one) => one.name)).toEqual(['chat']);
    expect(problems).toEqual(['webhooks: “ops”: two entries have this name, so neither is used.', 'webhooks: “OPS”: two entries have this name, so neither is used.', 'webhooks: “bad”: its "secret" is shorter than 32 characters. Make a long random one; the receiver checks each message with it.']);
    // What may be shown of an entry: its name and its host.
    expect(webhooksShown(entries)).toEqual([{ name: 'chat', host: 'hooks.example.test' }]);
    expect(webhookAddressProblem('https://hooks.example.test/in')).toBeNull();
  });

  it('is a setting that never fails the file: a list that is not a list is taken as empty', () => {
    expect(Settings.parse({}).webhooks).toEqual([]);
    expect(Settings.parse({ webhooks: 'https://hooks.example.test/in' }).webhooks).toEqual([]);
    expect(Settings.parse({ webhooks: [entry(), 7] }).webhooks).toHaveLength(2);
    expect(Settings.parse({ webhooks: Array.from({ length: 21 }, () => entry()) }).webhooks).toEqual([]);
  });
});

describe('what a webhook is sent', () => {
  it('is signed with HMAC-SHA256 of "<seconds>.<body>": the vector of the documentation', async () => {
    const body = '{"id":"example"}';
    expect(await webhookSignature('whsec_test_0123456789abcdefghijklmnop', 1764288000, body)).toBe('e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7');
    expect(await webhookSignatureHeader('whsec_test_0123456789abcdefghijklmnop', 1764288000, body)).toBe('t=1764288000,v1=e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7');
    // Another secret, another time or another body is another signature.
    for (const other of [await webhookSignature('whsec_test_0123456789abcdefghijklmnoq', 1764288000, body), await webhookSignature('whsec_test_0123456789abcdefghijklmnop', 1764288001, body), await webhookSignature('whsec_test_0123456789abcdefghijklmnop', 1764288000, `${body} `)]) expect(other).not.toBe('e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7');
  });

  it('says a line of fixed words for every event, with a name only for a terminal and a schedule, cleaned of what is not plain text', () => {
    for (const event of RuleEvent.options) expect(webhookText(event, {}), event).toMatch(/^[A-Z][a-z ]+$/);
    expect(webhookText('terminal.waiting', { terminal: 'api\u0007‮\nX' })).toBe('The terminal “apiX” is waiting for you');
    expect(webhookText('schedule.failed', { schedule: 'Nightly' })).toBe('The schedule “Nightly” could not run or was missed');
    // A task and a question have a name of nobody's that is sent: their words are fixed whatever is handed in.
    expect(webhookText('task.failed', { terminal: 'x', schedule: 'y' })).toBe('A task failed');
    expect(webhookText('ask.added', { terminal: 'x' })).toBe('Something is asked of you');
  });

  it('has a declared body that takes no field beside its own, each with words for the documentation', () => {
    const id = '01a21f88-60f2-71d5-8796-de3627a910d9';
    const body = { id, event: 'task.done', at: '2026-11-28T10:00:00.000Z', text: 'A task is done', project: { id, name: 'Default' }, rule: { id } };
    expect(WebhookBody.safeParse(body).success).toBe(true);
    for (const more of [{ commandLine: 'x' }, { note: 'x' }, { message: 'x' }, { cwd: '/x' }, { task: { id, title: 'x' } }]) expect(WebhookBody.safeParse({ ...body, ...more }).success, JSON.stringify(more)).toBe(false);
    for (const [name, field] of Object.entries(WebhookBody.shape)) expect(field.description, name).toBeTruthy();
  });
});
