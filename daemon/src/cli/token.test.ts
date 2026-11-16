import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_SETTINGS, publicPaths } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileActivityLog } from '../activity';
import { TmuxRuntime } from '../runtime/tmux-runtime';
import { buildServer } from '../server';
import { Sessions } from '../sessions';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { destroyTmuxServer, testSocketName } from '../test-support';
import { loadOrCreateToken } from '../token';
import { UsageError, expiryFromOption, formatTokens, parseCommand, resolveToken } from './commands';

const run = promisify(execFile);
const SOCKET = testSocketName('cli-token');
const COMMAND = fileURLToPath(new URL('../../../bin/aubergine.mjs', import.meta.url));

describe('parsing the token commands', () => {
  it('reads a name, scopes given any of three ways, and an expiry', () => {
    expect(parseCommand(['token', 'list'])).toEqual({ name: 'token-list' });
    expect(parseCommand(['token'])).toEqual({ name: 'token-list' });
    expect(parseCommand(['token', 'revoke', 'build', 'bot'])).toEqual({ name: 'token-revoke', query: 'build bot' });
    expect(parseCommand(['token', 'create', 'build', 'bot', '--scope', 'read', '--scope=sessions:write', '--scope', 'notes:write,read', '--expires', '30d'])).toEqual({
      name: 'token-create',
      tokenName: 'build bot',
      scopes: ['read', 'sessions:write', 'notes:write'],
      expires: '30d',
    });
    expect(parseCommand(['token', 'create', 'x', '--scope', 'read'])).toMatchObject({ expires: null });
  });

  it('says what is missing', () => {
    expect(() => parseCommand(['token', 'create', '--scope', 'read'])).toThrow(/needs a name/);
    expect(() => parseCommand(['token', 'create', 'x'])).toThrow(/at least one --scope/);
    expect(() => parseCommand(['token', 'create', 'x', '--scope'])).toThrow(/--scope needs a scope/);
    expect(() => parseCommand(['token', 'create', 'x', '--scope', 'read', '--forever'])).toThrow(/does not know --forever/);
    expect(() => parseCommand(['token', 'revoke'])).toThrow(UsageError);
    expect(() => parseCommand(['token', 'rotate', 'x'])).toThrow(UsageError);
  });

  it('understands an expiry as days or as a date', () => {
    const now = new Date('2026-03-01T12:00:00.000Z');
    expect(expiryFromOption(null, now)).toEqual({});
    expect(expiryFromOption('30d', now)).toEqual({ expiresInDays: 30 });
    expect(expiryFromOption('7', now)).toEqual({ expiresInDays: 7 });
    expect(expiryFromOption('2026-12-31T00:00:00.000Z', now)).toEqual({ expiresAt: '2026-12-31T00:00:00.000Z' });
    expect(Object.keys(expiryFromOption('2026-12-31', now))).toEqual(['expiresAt']);
    expect(() => expiryFromOption('0d', now)).toThrow(/at least one day/);
    expect(() => expiryFromOption('2020-01-01', now)).toThrow(/in the past/);
    expect(() => expiryFromOption('soon', now)).toThrow(/does not understand "soon"/);
  });

  it('finds a token by name or ID, and lists them without anything secret', () => {
    const tokens = [
      { id: '01900000-0000-7000-8000-0000000000a1', name: 'Build bot', scopes: ['read', 'sessions:write'], lastUsedAt: '2026-03-01T09:00:00.000Z', expiresAt: null, revokedAt: null },
      { id: '01900000-0000-7000-8000-0000000000b2', name: 'reader', scopes: ['read'], lastUsedAt: null, expiresAt: '2026-02-01T00:00:00.000Z', revokedAt: null },
      { id: '01900000-0000-7000-8000-0000000000c3', name: 'reader', scopes: ['read'], lastUsedAt: null, expiresAt: null, revokedAt: '2026-02-02T00:00:00.000Z' },
    ];
    expect(resolveToken(tokens, 'build bot')).toBe(tokens[0]);
    // A revoked token of the same name does not make the live one ambiguous.
    expect(resolveToken(tokens, 'reader')).toBe(tokens[1]);
    expect(resolveToken(tokens, '01900000-0000-7000-8000-0000000000c3')).toBe(tokens[2]);
    expect(() => resolveToken(tokens, 'nobody')).toThrow(/No token named "nobody"/);
    expect(() => resolveToken([tokens[0]!, { ...tokens[0]!, id: '01900000-0000-7000-8000-0000000000d4' }], 'Build bot')).toThrow(/2 tokens are named/);

    const table = formatTokens(tokens, Date.parse('2026-03-01T12:00:00.000Z')).split('\n');
    expect(table[0]).toMatch(/^NAME +STATE +SCOPES +LAST USED +EXPIRES +ID$/);
    expect(table[1]).toMatch(/^Build bot +active +read,sessions:write +2026-03-01 +never +01900000/);
    expect(table[2]).toMatch(/^reader +expired +read +never +2026-02-01/);
    expect(table[3]).toMatch(/^reader +revoked/);
    expect(formatTokens([])).toContain('No API tokens');
  });
});

// The real command against a real server, with a data folder, port and tmux socket of the test's own.
describe('aubergine token', () => {
  const runtime = new TmuxRuntime({ socket: SOCKET });
  let dir: string;
  let app: FastifyInstance;
  let hub: StateHub;
  let port: number;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await runtime.killServer();
    dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-token-')));
    const data = path.join(dir, 'data');
    const token = await loadOrCreateToken(data);
    const store = new JsonStore(data);
    hub = new StateHub(await store.load(), store);
    app = await buildServer({ hub, sessions: new Sessions(hub, runtime), runtime, settings: async () => DEFAULT_SETTINGS, token, devOrigin: null, webDist: path.join(dir, 'no-web'), activity: new FileActivityLog(data, 1024 * 1024) });
    await app.listen({ host: '127.0.0.1', port: 0 });
    port = (app.server.address() as AddressInfo).port;
    const { TMUX: _tmux, ...outside } = process.env;
    env = { ...outside, AUBERGINE_PORT: String(port), AUBERGINE_DATA_DIR: data, AUBERGINE_TMUX_SOCKET: SOCKET };
  });

  afterAll(async () => {
    await hub.flush();
    await app.close();
    await destroyTmuxServer(runtime, SOCKET);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const aubergine = async (...args: string[]): Promise<{ code: number; out: string; err: string }> => {
    try {
      const result = await run(process.execPath, [COMMAND, ...args], { env, cwd: dir, timeout: 30_000 });
      return { code: 0, out: result.stdout, err: result.stderr };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string };
      return { code: failed.code ?? -1, out: failed.stdout ?? '', err: failed.stderr ?? '' };
    }
  };
  const get = (secret: string, url: string): Promise<Response> => fetch(`http://127.0.0.1:${port}${url}`, { headers: { authorization: `Bearer ${secret}` } });

  it('makes a token: the secret alone on standard output, the words about it on standard error', async () => {
    const created = await aubergine('token', 'create', 'build bot', '--scope', 'read', '--scope', 'sessions:write', '--expires', '30d');
    expect(created.code).toBe(0);
    const secret = created.out.trim();
    // Nothing but the secret, so that it can be captured by a script.
    expect(created.out).toBe(`${secret}\n`);
    expect(secret).toMatch(/^aubt_[A-Za-z0-9_-]{43}$/);
    expect(created.err).toContain('Made the token "build bot" (read, sessions:write, expires ');
    expect(created.err).toContain('shown this once');
    expect(created.err).not.toContain(secret);

    // It works, with the scopes asked for.
    expect((await get(secret, publicPaths.canvases)).status).toBe(200);
    const who = (await (await get(secret, publicPaths.root)).json()) as { caller: { name: string; scopes: string[] } };
    expect(who.caller).toMatchObject({ name: 'build bot', scopes: ['read', 'sessions:write'] });

    // The secret is in neither file of the data folder.
    await hub.flush();
    for (const file of ['state.json', 'activity.log']) {
      expect(await readFile(path.join(dir, 'data', file), 'utf8')).not.toContain(secret);
    }

    const listed = await aubergine('token', 'list');
    expect(listed.out).toMatch(/build bot +active +read,sessions:write/);
    expect(listed.out + listed.err).not.toContain(secret);
    expect(listed.out).not.toContain(hub.state.tokens[0]!.hash);

    const revoked = await aubergine('token', 'revoke', 'Build Bot');
    expect(revoked.out).toContain('Revoked "build bot". It stops working at once.');
    expect((await get(secret, publicPaths.canvases)).status).toBe(401);
    expect((await aubergine('token', 'list')).out).toMatch(/build bot +revoked/);
    expect((await aubergine('token', 'revoke', hub.state.tokens[0]!.id)).out).toContain('was already revoked');
  }, 60_000);

  it('passes on what the server refuses, and makes nothing', async () => {
    const before = hub.state.tokens.length;
    const reserved = await aubergine('token', 'create', 'typist', '--scope', 'terminal:input');
    expect(reserved.code).toBe(1);
    expect(reserved.out).toBe('');
    const unknown = await aubergine('token', 'create', 'x', '--scope', 'everything');
    expect(unknown.code).toBe(1);
    expect((await aubergine('token', 'revoke', 'nobody')).err).toContain('No token named "nobody"');
    expect(hub.state.tokens).toHaveLength(before);
  }, 60_000);

  it('cannot be done with a token instead of being the owner', async () => {
    const made = await aubergine('token', 'create', 'all', '--scope', 'read,canvases:write,sessions:write,notes:write');
    const secret = made.out.trim();
    const attempt = await fetch(`http://127.0.0.1:${port}${publicPaths.tokens}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'child', scopes: ['read'] }),
    });
    expect(attempt.status).toBe(403);
    expect((await get(secret, publicPaths.tokens)).status).toBe(403);
    expect(hub.state.tokens.some((t) => t.name === 'child')).toBe(false);
  }, 60_000);
});
