import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GRANTABLE_SCOPES, TOKEN_PREFIX, newId, tokenStatus, type ApiToken, type CreateTokenRequest, type TokenStatus, TERMINAL_SCOPES } from '@aubergine/shared';
import type { StateHub } from './state-hub';

export class TokenNotFoundError extends Error {}

/** How often, at most, a token's "last used" time is written. */
export const LAST_USED_INTERVAL_MS = 60_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The hash that is stored in place of a secret. The secret is long and random, so a plain hash is enough. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** A new secret: the prefix that marks it as an Aubergine token, then 32 random bytes. */
export function newSecret(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/**
 * API tokens: making them, finding the one a secret belongs to, revoking
 * them. Changes go through the hub as events, like every change of state.
 */
export class Tokens {
  private readonly touchedAt = new Map<string, number>();

  constructor(
    private readonly hub: StateHub,
    private readonly now: () => number = Date.now,
  ) {}

  list(): ApiToken[] {
    return [...this.hub.state.tokens].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Makes a token. The secret in the answer exists nowhere else: it is not stored and cannot be shown again. */
  create(input: Omit<CreateTokenRequest, 'reviewWorkflowChanges'> & { reviewWorkflowChanges?: boolean; /** The agent session it is made for. Never from a request body. */ sessionId?: string }): { token: ApiToken; secret: string } {
    const terminal = input.scopes.some((scope) => (TERMINAL_SCOPES as readonly string[]).includes(scope));
    const secret = newSecret();
    const now = this.now();
    const expiresAt = input.expiresAt ?? (input.expiresInDays !== undefined ? new Date(now + input.expiresInDays * DAY_MS).toISOString() : null);
    const token: ApiToken = {
      id: newId(),
      name: input.name,
      // Always in the same order, smallest first, however they were given.
      scopes: GRANTABLE_SCOPES.filter((scope) => input.scopes.includes(scope)),
      hash: hashSecret(secret),
      createdAt: new Date(now).toISOString(),
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      // On unless the owner switched it off: what a new token writes about workflows is read first.
      reviewWorkflowChanges: input.reviewWorkflowChanges ?? true,
      // A reach means something only with a terminal scope; without one the token reaches no terminal.
      reach: terminal ? (input.reach ?? null) : null,
      sessionId: input.sessionId ?? null,
    };
    this.hub.emit({ type: 'token.created', token });
    return { token, secret };
  }

  /** Revokes a token. It fails on its very next call. Revoking twice changes nothing. */
  revoke(tokenId: string): ApiToken {
    const token = this.hub.state.tokens.find((t) => t.id === tokenId);
    if (!token) throw new TokenNotFoundError(`No token ${tokenId}`);
    if (token.revokedAt === null) this.hub.emit({ type: 'token.revoked', tokenId, at: new Date(this.now()).toISOString() });
    return this.hub.state.tokens.find((t) => t.id === tokenId) ?? token;
  }

  /**
   * The token a secret belongs to, with whether it may still be used; null
   * when the secret is no token's. Every stored hash is compared, each in
   * constant time, so the time taken says nothing about which one matched or
   * how close a wrong secret came.
   */
  authenticate(secret: string): { token: ApiToken; status: TokenStatus } | null {
    if (!secret.startsWith(TOKEN_PREFIX)) return null;
    const given = Buffer.from(hashSecret(secret), 'hex');
    let found: ApiToken | null = null;
    for (const token of this.hub.state.tokens) {
      const stored = Buffer.from(token.hash, 'hex');
      if (stored.length === given.length && timingSafeEqual(stored, given)) found = token;
    }
    return found ? { token: found, status: tokenStatus(found, this.now()) } : null;
  }

  /** Notes that a token was used just now. Written at most once a minute per token, not on every call. */
  touch(tokenId: string): void {
    const now = this.now();
    if (now - (this.touchedAt.get(tokenId) ?? 0) < LAST_USED_INTERVAL_MS) return;
    this.touchedAt.set(tokenId, now);
    this.hub.emit({ type: 'token.used', tokenId, at: new Date(now).toISOString() });
  }
}
