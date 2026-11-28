import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_CSS_MAX_BYTES, CUSTOM_CSS_PATH, CreatedToken, CustomCssAnswer, PART_HOOKS, Settings, StateResponse, TOKEN_HOOKS, customCssStarter, newId, paths, publicPaths } from '@aubergine/shared';
import { sessionToken } from './auth';
import { parseCssCommand, runCssCommand } from './cli/css';
import { StylesheetFile, readStylesheet, versionOf, writeStarter } from './custom-css';
import { PAGE_POLICY, buildServer, cookieName } from './server';
import { TmuxRuntime } from './runtime/tmux-runtime';
import { Sessions } from './sessions';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { destroyTmuxServer, testSocketName } from './test-support';
import { loadOrCreateToken } from './token';

/**
 * The owner's own stylesheet: the one module that reads it, the address it is served at to the owner alone, the page
 * that links it last, the policy that keeps what it names to this server, and `aubergine css`. Every file is in a
 * temporary folder of the test's own.
 */

const SOCKET = testSocketName('custom-css');
const runtime = new TmuxRuntime({ socket: SOCKET });
const OUTSIDE = 'https://aubergine.example.test';
const OUTSIDE_HOST = 'aubergine.example.test';
const RULE = '[data-part="terminal-title"] { background: #5c1f24; }\n';
const PAGE_HTML = '<!doctype html><html lang="en">\n  <head>\n    <title>Aubergine</title>\n    <script type="module" crossorigin src="/assets/app.js"></script>\n    <link rel="stylesheet" crossorigin href="/assets/app.css">\n  </head>\n  <body></body>\n</html>\n';

let dir: string;
let token: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let customCssOn = true;
let warnings: string[] = [];

async function start(options: { web?: boolean } = {}): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const sessions = new Sessions(hub, runtime, {});
  const web = path.join(dir, 'web');
  await mkdir(path.join(web, 'assets'), { recursive: true });
  await writeFile(path.join(web, 'index.html'), PAGE_HTML);
  app = await buildServer({
    hub,
    sessions,
    runtime,
    settings: async () => Settings.parse({ access: { addresses: [OUTSIDE] }, appearance: { customCss: customCssOn } }),
    token,
    devOrigin: null,
    webDist: options.web === false ? path.join(dir, 'no-such-folder') : web,
    stylesheet: new StylesheetFile(dir, (message) => warnings.push(message)),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-css-'));
  token = await loadOrCreateToken(dir);
  customCssOn = true;
  warnings = [];
});

afterEach(async () => {
  await app?.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

afterAll(async () => {
  await destroyTmuxServer(runtime, SOCKET);
});

const here = (): string => `http://127.0.0.1:${port}`;
const ownerCookie = (): string => `${cookieName(port)}=${token}`;
async function send(method: 'GET' | 'POST', url: string, headers: Record<string, string> = {}, body?: object) {
  return app.inject({ method, url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body }) });
}
const asOwner = (url: string) => send('GET', url, { cookie: ownerCookie(), 'sec-fetch-site': 'same-origin' });
const linkIn = (html: string): string | null => /<link rel="stylesheet" href="([^"]+)" data-custom-css>/.exec(html)?.[1] ?? null;

describe('the reader', () => {
  it('reads a regular file, and gives its size and a short hash of its content', async () => {
    await writeFile(path.join(dir, 'custom.css'), RULE);
    const read = await readStylesheet(dir);
    expect(read.kind).toBe('read');
    if (read.kind !== 'read') return;
    expect(read.stylesheet.bytes.toString('utf8')).toBe(RULE);
    expect(read.stylesheet.found).toEqual({ version: versionOf(Buffer.from(RULE)), bytes: Buffer.byteLength(RULE) });
    expect(read.stylesheet.found.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is no stylesheet and no problem when the file is not there', async () => {
    expect(await readStylesheet(dir)).toEqual({ kind: 'none' });
    expect(await readStylesheet(path.join(dir, 'not-there'))).toEqual({ kind: 'none' });
  });

  it('follows no link, reads no folder and no pipe, and nothing larger than the bound', async () => {
    const elsewhere = path.join(dir, 'elsewhere.css');
    await writeFile(elsewhere, RULE);
    await symlink(elsewhere, path.join(dir, 'custom.css'));
    expect(await readStylesheet(dir)).toEqual({ kind: 'problem', problem: expect.stringMatching(/a link, and links are not followed/) });
    await rm(path.join(dir, 'custom.css'));
    await mkdir(path.join(dir, 'custom.css'));
    expect(await readStylesheet(dir)).toEqual({ kind: 'problem', problem: expect.stringMatching(/not a regular file/) });
    await rm(path.join(dir, 'custom.css'), { recursive: true });
    execFileSync('mkfifo', [path.join(dir, 'custom.css')]);
    expect(await readStylesheet(dir)).toEqual({ kind: 'problem', problem: expect.stringMatching(/not a regular file/) });
    await rm(path.join(dir, 'custom.css'));
    await writeFile(path.join(dir, 'custom.css'), 'a'.repeat(CUSTOM_CSS_MAX_BYTES + 1));
    expect(await readStylesheet(dir)).toEqual({ kind: 'problem', problem: expect.stringMatching(/at most 262144 \(256 KB\) are read/) });
    await writeFile(path.join(dir, 'custom.css'), 'a'.repeat(CUSTOM_CSS_MAX_BYTES));
    expect((await readStylesheet(dir)).kind).toBe('read');
  });

  it('says a problem once, and again only after it went', async () => {
    const said: string[] = [];
    const file = new StylesheetFile(dir, (message) => said.push(message));
    await mkdir(path.join(dir, 'custom.css'));
    await file.reload();
    await file.reload();
    expect(await file.answer()).toEqual({ stylesheet: null, problem: expect.stringMatching(/not a regular file/) });
    expect(said).toHaveLength(1);
    await rm(path.join(dir, 'custom.css'), { recursive: true });
    await file.reload();
    await mkdir(path.join(dir, 'custom.css'));
    await file.reload();
    expect(said).toHaveLength(2);
  });
});

describe('the address it is served at', () => {
  it('gives the owner the file as it is, as CSS that is not sniffed and not kept', async () => {
    await writeFile(path.join(dir, 'custom.css'), RULE);
    await start();
    const answer = await asOwner(`${CUSTOM_CSS_PATH}?v=abc`);
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toBe(RULE);
    expect(answer.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['cache-control']).toBe('no-cache');
  });

  it('is 404 for the owner when there is no file, or one that is not read', async () => {
    await start();
    expect((await asOwner(CUSTOM_CSS_PATH)).statusCode).toBe(404);
    await mkdir(path.join(dir, 'custom.css'));
    expect((await asOwner(CUSTOM_CSS_PATH)).statusCode).toBe(404);
  });

  it('gives nothing without the owner’s sign-in: no cookie, an API token, a session’s token, the access token as a bearer, from outside', async () => {
    await writeFile(path.join(dir, 'custom.css'), RULE);
    await start();
    const made = await send('POST', publicPaths.tokens, { cookie: ownerCookie(), origin: here(), 'sec-fetch-site': 'same-origin' }, { name: 'everything', scopes: ['read', 'sessions:write', 'terminal:read', 'terminal:input'], reach: { kind: 'all' }, reviewWorkflowChanges: true });
    const secret = CreatedToken.parse(JSON.parse(made.body)).secret;
    for (const headers of <Record<string, string>[]>[{}, { authorization: `Bearer ${secret}` }, { authorization: `Bearer ${sessionToken(token, newId())}` }, { authorization: `Bearer ${token}` }, { cookie: `${cookieName(port)}=wrong` }]) {
      const answer = await send('GET', CUSTOM_CSS_PATH, headers);
      expect(answer.statusCode, JSON.stringify(headers)).toBe(401);
      expect(answer.body).not.toContain('terminal-title');
    }
    // From outside, the access token's cookie signs in nobody.
    const outside = await app.inject({ method: 'GET', url: CUSTOM_CSS_PATH, headers: { host: OUTSIDE_HOST, cookie: ownerCookie() } });
    expect(outside.statusCode).toBe(401);
    // Through the /v1 route to read it again: no token, whatever its scopes.
    const read = await send('POST', '/v1/settings/stylesheet/read', { authorization: `Bearer ${secret}` }, {});
    expect(read.statusCode).toBe(403);
  });
});

describe('the page', () => {
  it('links the stylesheet as the last thing in its head, by a hash of its content, and nothing of what it says', async () => {
    await writeFile(path.join(dir, 'custom.css'), RULE);
    await start();
    const page = await asOwner('/');
    expect(page.statusCode).toBe(200);
    const href = linkIn(page.body);
    expect(href).toBe(`${CUSTOM_CSS_PATH}?v=${versionOf(Buffer.from(RULE))}`);
    // After the app's own stylesheet, and nothing after it in the head.
    const head = page.body.slice(0, page.body.indexOf('</head>'));
    expect(head.indexOf('data-custom-css')).toBeGreaterThan(head.indexOf('/assets/app.css'));
    expect(head.slice(head.indexOf('data-custom-css')).trim()).toBe('data-custom-css>');
    expect(page.body).not.toContain('terminal-title');
    expect(page.body).not.toContain('#5c1f24');
    // On every address of the page alike.
    expect(linkIn((await asOwner(`/c/${newId()}`)).body)).toBe(href);
    expect(linkIn((await asOwner(`/t/${newId()}`)).body)).toBe(href);
    // A changed file is another address.
    await writeFile(path.join(dir, 'custom.css'), `${RULE}/* more */\n`);
    const changed = linkIn((await asOwner('/')).body);
    expect(changed).not.toBe(href);
    expect(changed).toBe(`${CUSTOM_CSS_PATH}?v=${versionOf(Buffer.from(`${RULE}/* more */\n`))}`);
  });

  it('leaves it out when there is no file, when it is switched off, with ?plain, and for anyone not signed in', async () => {
    await start();
    expect(linkIn((await asOwner('/')).body)).toBeNull();
    await writeFile(path.join(dir, 'custom.css'), RULE);
    expect(linkIn((await asOwner('/')).body)).not.toBeNull();
    for (const plain of ['/?plain', '/?plain=1', `/c/${newId()}?x=1&plain`]) expect(linkIn((await asOwner(plain)).body), plain).toBeNull();
    // Not signed in: the page is the same page, with nothing of the owner's own on it.
    const stranger = await send('GET', '/');
    expect(stranger.statusCode).toBe(200);
    expect(linkIn(stranger.body)).toBeNull();
    customCssOn = false;
    expect(linkIn((await asOwner('/')).body)).toBeNull();
  });

  it('keeps what a stylesheet names to this server, in both places the policy is sent', async () => {
    await start();
    expect(PAGE_POLICY).toBe("frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:");
    // Nothing that restricts scripts, connections or frames beyond what was there.
    expect(PAGE_POLICY).not.toMatch(/default-src|connect-src|script-src|frame-src|child-src/);
    expect((await asOwner('/')).headers['content-security-policy']).toBe(PAGE_POLICY);
    await app.close();
    await start({ web: false });
    expect((await send('GET', '/')).headers['content-security-policy']).toBe(PAGE_POLICY);
  });
});

describe('the state, and reading it again', () => {
  it('says the version and size to the owner, and a problem in a sentence', async () => {
    await writeFile(path.join(dir, 'custom.css'), RULE);
    await start();
    const state = StateResponse.parse(JSON.parse((await asOwner(paths.state)).body));
    expect(state.customCss).toEqual({ version: versionOf(Buffer.from(RULE)), bytes: Buffer.byteLength(RULE) });
    expect(state.customCssProblem).toBeNull();
    await rm(path.join(dir, 'custom.css'));
    await mkdir(path.join(dir, 'custom.css'));
    const read = await send('POST', '/v1/settings/stylesheet/read', { cookie: ownerCookie(), origin: here(), 'sec-fetch-site': 'same-origin' }, {});
    expect(read.statusCode).toBe(200);
    expect(CustomCssAnswer.parse(JSON.parse(read.body))).toEqual({ stylesheet: null, problem: expect.stringMatching(/not a regular file/) });
    expect(warnings).toHaveLength(1);
  });
});

describe('aubergine css', () => {
  const run = async (words: string[]) => {
    const printed: string[] = [];
    const warned: string[] = [];
    const code = await runCssCommand(parseCssCommand(words), { dataDir: dir, print: (text) => printed.push(text), warn: (text) => warned.push(text) });
    return { code, printed, warned };
  };

  it('says where the file is, and whether there is one', async () => {
    const none = await run(['path']);
    expect(none).toEqual({ code: 0, printed: [path.join(dir, 'custom.css')], warned: [expect.stringMatching(/no stylesheet of your own/)] });
    expect((await run([])).printed).toEqual([path.join(dir, 'custom.css')]);
    await writeFile(path.join(dir, 'custom.css'), RULE);
    expect((await run(['path'])).warned).toEqual([]);
    expect(() => parseCssCommand(['path', 'more'])).toThrow(/takes no arguments/);
    expect(() => parseCssCommand(['remove'])).toThrow(/"path" or "new"/);
  });

  it('writes a starter made from the hooks, never over a file that is there, never through a link', async () => {
    const made = await run(['new']);
    expect(made.code).toBe(0);
    const text = await readFile(path.join(dir, 'custom.css'), 'utf8');
    expect(text).toBe(customCssStarter());
    for (const part of PART_HOOKS) expect(text).toContain(part.name);
    for (const token of TOKEN_HOOKS) expect(text).toContain(`--${token.name}`);
    // Nothing in it is switched on: every rule is inside a comment.
    expect(text.replace(/\/\*[\s\S]*?\*\//g, '').trim()).toBe('');
    // Never over the file that is there.
    await writeFile(path.join(dir, 'custom.css'), RULE);
    const again = await run(['new']);
    expect(again.code).toBe(1);
    expect(again.warned[0]).toMatch(/already a custom\.css/);
    expect(await readFile(path.join(dir, 'custom.css'), 'utf8')).toBe(RULE);
    // Never through a link, even one that points at nothing.
    await rm(path.join(dir, 'custom.css'));
    await symlink(path.join(dir, 'target.css'), path.join(dir, 'custom.css'));
    await expect(writeStarter(dir)).rejects.toThrow(/already a custom\.css/);
    await expect(readFile(path.join(dir, 'target.css'), 'utf8')).rejects.toThrow();
  });
});
