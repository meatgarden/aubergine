import { describe, expect, it } from 'vitest';
import { TOKEN_PREFIX, createInitialState, type AppState } from '@aubergine/shared';
import { StateHub } from './state-hub';
import { LAST_USED_INTERVAL_MS, TokenNotFoundError, Tokens, hashSecret, newSecret } from './tokens';
import type { Store } from './store/store';

function setup(start = Date.parse('2026-03-01T10:00:00.000Z')) {
  let saved: AppState = createInitialState(new Date(start));
  const store: Store = { load: async () => saved, save: async (state) => void (saved = state) };
  const hub = new StateHub(saved, store);
  let now = start;
  const tokens = new Tokens(hub, () => now);
  return { hub, tokens, saved: () => saved, advance: (ms: number) => void (now += ms), now: () => now };
}

describe('API tokens', () => {
  it('makes a secret that is long, random, and recognisable', () => {
    const a = newSecret();
    const b = newSecret();
    expect(a).toMatch(/^aubt_[A-Za-z0-9_-]{43}$/);
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    // 32 random bytes after the prefix.
    expect(Buffer.from(a.slice(TOKEN_PREFIX.length), 'base64url')).toHaveLength(32);
  });

  it('stores a hash and never the secret', async () => {
    const { tokens, hub, saved } = setup();
    const { token, secret } = tokens.create({ name: 'build bot', scopes: ['sessions:write', 'read'] });
    await hub.flush();
    expect(token.hash).toBe(hashSecret(secret));
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toMatchObject({ name: 'build bot', scopes: ['read', 'sessions:write'], lastUsedAt: null, expiresAt: null, revokedAt: null });
    const everything = JSON.stringify(saved());
    expect(everything).toContain(token.hash);
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain(secret.slice(TOKEN_PREFIX.length));
  });

  it('finds the token a secret belongs to, and nothing for anything else', () => {
    const { tokens } = setup();
    const first = tokens.create({ name: 'one', scopes: ['read'] });
    const second = tokens.create({ name: 'two', scopes: ['read'] });
    expect(tokens.authenticate(first.secret)).toMatchObject({ token: { id: first.token.id }, status: 'active' });
    expect(tokens.authenticate(second.secret)?.token.id).toBe(second.token.id);

    const secret = first.secret;
    // One character off, at the end, in the middle and at the start of the random part.
    const flip = (text: string, at: number): string => text.slice(0, at) + (text[at] === 'A' ? 'B' : 'A') + text.slice(at + 1);
    for (const at of [secret.length - 1, 20, TOKEN_PREFIX.length]) expect(tokens.authenticate(flip(secret, at)), `changed at ${at}`).toBeNull();
    expect(tokens.authenticate(secret.slice(0, -1))).toBeNull();
    expect(tokens.authenticate(`${secret}A`)).toBeNull();
    // The right random part under the wrong prefix, or none.
    expect(tokens.authenticate(secret.replace(TOKEN_PREFIX, 'aubx_'))).toBeNull();
    expect(tokens.authenticate(secret.slice(TOKEN_PREFIX.length))).toBeNull();
    expect(tokens.authenticate(secret.toUpperCase())).toBeNull();
    expect(tokens.authenticate('')).toBeNull();
    expect(tokens.authenticate(TOKEN_PREFIX)).toBeNull();
    // The stored hash is not a credential.
    expect(tokens.authenticate(first.token.hash)).toBeNull();
    expect(tokens.authenticate(`${TOKEN_PREFIX}${first.token.hash}`)).toBeNull();
  });

  it('revokes at once, and revoking again changes nothing', () => {
    const { tokens, advance } = setup();
    const { token, secret } = tokens.create({ name: 'one', scopes: ['read'] });
    advance(1000);
    const revoked = tokens.revoke(token.id);
    expect(revoked.revokedAt).toBe('2026-03-01T10:00:01.000Z');
    expect(tokens.authenticate(secret)?.status).toBe('revoked');
    advance(5000);
    expect(tokens.revoke(token.id).revokedAt).toBe('2026-03-01T10:00:01.000Z');
    expect(() => tokens.revoke('01900000-0000-7000-8000-0000000000ff')).toThrow(TokenNotFoundError);
  });

  it('expires on the date given, or after the days given', () => {
    const { tokens, advance } = setup();
    const dated = tokens.create({ name: 'dated', scopes: ['read'], expiresAt: '2026-03-01T10:00:10.000Z' });
    const days = tokens.create({ name: 'days', scopes: ['read'], expiresInDays: 2 });
    expect(days.token.expiresAt).toBe('2026-03-03T10:00:00.000Z');
    expect(tokens.authenticate(dated.secret)?.status).toBe('active');
    advance(9_999);
    expect(tokens.authenticate(dated.secret)?.status).toBe('active');
    advance(1);
    expect(tokens.authenticate(dated.secret)?.status).toBe('expired');
    expect(tokens.authenticate(days.secret)?.status).toBe('active');
    advance(2 * 24 * 60 * 60 * 1000);
    expect(tokens.authenticate(days.secret)?.status).toBe('expired');
  });

  it('writes "last used" at most once a minute', () => {
    const { tokens, hub, advance } = setup();
    const { token } = tokens.create({ name: 'one', scopes: ['read'] });
    let events = 0;
    hub.subscribe((event) => {
      if (event.type === 'token.used') events += 1;
    });
    for (let i = 0; i < 100; i++) {
      tokens.touch(token.id);
      advance(100);
    }
    expect(events).toBe(1);
    expect(hub.state.tokens[0]?.lastUsedAt).toBe('2026-03-01T10:00:00.000Z');
    advance(LAST_USED_INTERVAL_MS);
    tokens.touch(token.id);
    expect(events).toBe(2);
  });

  it('lists the newest first', () => {
    const { tokens, advance } = setup();
    tokens.create({ name: 'old', scopes: ['read'] });
    advance(1000);
    tokens.create({ name: 'new', scopes: ['read'] });
    expect(tokens.list().map((t) => t.name)).toEqual(['new', 'old']);
  });
});
