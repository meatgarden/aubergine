import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { TOLERANCE_SECONDS, verify } from './receive.mjs';

// The vector of docs/webhooks.md.
const SECRET = 'whsec_test_0123456789abcdefghijklmnop';
const BODY = '{"id":"example"}';
const SECONDS = 1764288000;
const SIGNATURE = 'e0fcfedc41eb6677a9530db744d9d71f42da3d22972749a661965fc08ab59ac7';
const HEADER = `t=${SECONDS},v1=${SIGNATURE}`;
const THEN = SECONDS * 1000;

test('the vector of the documentation verifies', () => {
  assert.equal(createHmac('sha256', SECRET).update(`${SECONDS}.${BODY}`).digest('hex'), SIGNATURE);
  assert.deepEqual(verify(SECRET, HEADER, BODY, THEN), { ok: true });
});

test('another secret, another body and another time do not', () => {
  assert.equal(verify(`${SECRET}x`, HEADER, BODY, THEN).ok, false);
  assert.equal(verify(SECRET, HEADER, `${BODY} `, THEN).ok, false);
  assert.equal(verify(SECRET, `t=${SECONDS + 1},v1=${SIGNATURE}`, BODY, THEN).ok, false);
});

test('a header that is missing, cut short or not of this form is refused and nothing throws', () => {
  for (const header of [undefined, '', 'v1=abc', `t=${SECONDS}`, `t=${SECONDS},v1=${SIGNATURE.slice(2)}`, `t=${SECONDS},v1=${SIGNATURE.toUpperCase()}`, `t=x,v1=${SIGNATURE}`, [HEADER, HEADER]]) assert.deepEqual(verify(SECRET, header, BODY, THEN), { ok: false, why: 'no signature that can be read' });
});

test('a message that verifies but is old, or from the future, is refused', () => {
  assert.deepEqual(verify(SECRET, HEADER, BODY, THEN + TOLERANCE_SECONDS * 1000), { ok: true });
  assert.equal(verify(SECRET, HEADER, BODY, THEN + (TOLERANCE_SECONDS + 1) * 1000).why, 'the message is too old, or from a clock that is far off');
  assert.equal(verify(SECRET, HEADER, BODY, THEN - (TOLERANCE_SECONDS + 1) * 1000).ok, false);
});
