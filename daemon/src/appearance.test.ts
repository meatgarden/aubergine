import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SETTINGS, GRANTABLE_SCOPES, Settings, THEME_COLORS, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from './auth';
import { colorsAttribute, pageAttributes } from './page-choice';
import type { RuntimeSession, SessionRuntime } from './runtime/runtime';
import { buildServer, cookieName } from './server';
import { Sessions } from './sessions';
import { SettingsFile } from './settings';
import { StateHub } from './state-hub';
import { JsonStore } from './store/json-store';
import { loadOrCreateToken } from './token';

/**
 * How the page looks, through the server: the route that writes it, and the page sent with the choice on it. No
 * shell is started: the runtime is a stand-in.
 */

let dir: string;
let ownerToken: string;
let app: FastifyInstance;
let hub: StateHub;
let port: number;
let origin: string;
let live: RuntimeSession[] = [];

const runtime = {
  check: async () => ({ status: 'ok', version: '3.4' }),
  list: async () => live,
  has: async () => true,
  kill: async (id: string) => void (live = live.filter((s) => s.id !== id)),
  foreground: async () => 'zsh',
  typeLine: async () => {},
  create: async (options: { id: string }) => {
    const made = { id: options.id, cwd: null, command: null, activityAt: null };
    live.push(made);
    return made;
  },
  snapshot: async () => '',
} as unknown as SessionRuntime;

const PAGE = '<!doctype html><html lang="en"><head><title>Aubergine</title></head><body></body></html>\n';

async function start(): Promise<void> {
  const store = new JsonStore(dir);
  hub = new StateHub(await store.load(), store);
  const settings = new SettingsFile(dir);
  const web = path.join(dir, 'web');
  await mkdir(web, { recursive: true });
  await writeFile(path.join(web, 'index.html'), PAGE);
  app = await buildServer({
    hub,
    sessions: new Sessions(hub, runtime, {}),
    runtime,
    settings: () => settings.reload(),
    token: ownerToken,
    devOrigin: null,
    webDist: web,
    setAppearance: (change) => settings.setAppearance(change),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}

interface Answer {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test answers are checked field by field
  text: string;
}
async function send(headers: Record<string, string>, method: string, url: string, body?: unknown): Promise<Answer> {
  const response = await app.inject({ method: method as 'GET', url, headers: { host: `127.0.0.1:${port}`, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
  let parsed: unknown;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch {
    parsed = response.body;
  }
  return { status: response.statusCode, body: parsed, text: response.body };
}
const asOwner = (method: string, url: string, body?: unknown): Promise<Answer> => send({ origin, cookie: `${cookieName(port)}=${ownerToken}`, 'sec-fetch-site': 'same-origin' }, method, url, body);
const call = (secret: string, method: string, url: string, body?: unknown): Promise<Answer> => send({ authorization: `Bearer ${secret}` }, method, url, body);
const configText = (): Promise<string> => readFile(path.join(dir, 'config.json'), 'utf8');
const config = async (): Promise<unknown> => JSON.parse(await configText());
const writeConfig = (value: unknown): Promise<void> => writeFile(path.join(dir, 'config.json'), typeof value === 'string' ? value : JSON.stringify(value));
/** The `<html …>` tag of the page as sent. */
async function htmlTag(): Promise<string> {
  const page = await send({}, 'GET', '/');
  expect(page.status).toBe(200);
  const tag = /<html[^>]*>/.exec(page.text);
  expect(tag).not.toBeNull();
  return tag![0];
}

/** A file of the owner's, with keys the server does not know and others it does. */
const OWNERS = {
  theme: 'light',
  font: { family: 'Mono of mine', size: 15, laterFontKey: 'kept' },
  appearance: { light: 'solarized-light', dark: 'nord', cursor: 'bar', cursorBlink: false, colors: { accent: '#aa66cc' }, laterKey: [1] },
  api: { rateLimitPerMinute: 100_000 },
  somethingOfTheirs: { a: 1 },
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-appearance-'));
  ownerToken = await loadOrCreateToken(dir);
  live = [];
  await start();
});
afterEach(async () => {
  await hub.flush();
  await app.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('the appearance route', () => {
  it('writes each field alone and leaves every other key of the file as it was', async () => {
    const cases = [
      [{ theme: 'dark' }, { theme: 'dark' }],
      [{ light: 'gruvbox-light' }, { appearance: { ...OWNERS.appearance, light: 'gruvbox-light' } }],
      [{ dark: 'dracula' }, { appearance: { ...OWNERS.appearance, dark: 'dracula' } }],
      [{ cursor: 'underline' }, { appearance: { ...OWNERS.appearance, cursor: 'underline' } }],
      [{ cursorBlink: true }, { appearance: { ...OWNERS.appearance, cursorBlink: true } }],
      [{ fontSize: 20 }, { font: { ...OWNERS.font, size: 20 } }],
      [{ fontFamily: ' Fira Code, "JetBrains Mono", monospace ' }, { font: { ...OWNERS.font, family: 'Fira Code, "JetBrains Mono", monospace' } }],
    ] as const;
    for (const [body, differs] of cases) {
      await writeConfig(OWNERS);
      const answered = await asOwner('PUT', '/v1/settings/appearance', body);
      expect(answered.status, JSON.stringify(answered.body)).toBe(200);
      const expected = { ...OWNERS, ...differs };
      expect(await config(), JSON.stringify(body)).toEqual(expected);
      expect(answered.body).toEqual({
        theme: expected.theme,
        light: expected.appearance.light,
        dark: expected.appearance.dark,
        font: { family: expected.font.family, size: expected.font.size },
        cursor: expected.appearance.cursor,
        cursorBlink: expected.appearance.cursorBlink,
      });
    }
  });

  it('answers an old caller that sends only the theme as before, with the rest beside it', async () => {
    const answered = await asOwner('PUT', '/v1/settings/appearance', { theme: 'light' });
    expect(answered.status).toBe(200);
    expect(answered.body).toEqual({ theme: 'light', light: 'light', dark: 'dark', font: DEFAULT_SETTINGS.font, cursor: 'block', cursorBlink: true });
    // No file yet: one is made, holding that key alone.
    expect(await config()).toEqual({ theme: 'light' });
    expect((await asOwner('GET', '/api/v1/state')).body.settings.theme).toBe('light');
  });

  it('changes nothing for a body that sends none of the fields, and answers what the file says', async () => {
    await writeConfig(OWNERS);
    const before = await configText();
    for (const body of [{}, { colors: { accent: '#000000' } }, { somethingElse: true }]) {
      const answered = await asOwner('PUT', '/v1/settings/appearance', body);
      expect(answered.status, JSON.stringify(body)).toBe(200);
      expect(answered.body).toEqual({ theme: 'light', light: 'solarized-light', dark: 'nord', font: { family: 'Mono of mine', size: 15 }, cursor: 'bar', cursorBlink: false });
      expect(await configText()).toBe(before);
    }
  });

  it('refuses a wrong value with 400 and writes nothing; a theme of the other kind is wrong', async () => {
    await writeConfig(OWNERS);
    const before = await configText();
    for (const body of [
      { light: 'nord' },
      { dark: 'light' },
      { theme: 'sepia' },
      { light: 'sepia', theme: 'dark' },
      { fontSize: 7 },
      { fontSize: 33 },
      { fontSize: 13.5 },
      { fontFamily: '' },
      { fontFamily: 'Mono; color: red' },
      { fontFamily: 'Mono</style><script>alert(1)</script>' },
      { fontFamily: 'Mono\nmonospace' },
      { fontFamily: 'x'.repeat(301) },
      { cursor: 'beam' },
      { cursorBlink: 'no' },
      { theme: 'dark', cursorBlink: 1 },
    ]) {
      const answered = await asOwner('PUT', '/v1/settings/appearance', body);
      expect(answered.status, JSON.stringify(body)).toBe(400);
      expect(await configText()).toBe(before);
    }
  });

  it('leaves a file that cannot be read exactly as it is, and says so', async () => {
    await writeConfig('{ not json');
    const refused = await asOwner('PUT', '/v1/settings/appearance', { dark: 'nord' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('Mend it by hand; it was not changed.');
    expect(await configText()).toBe('{ not json');
  });

  it('is the owner\'s: no token of any scope and no session can call it', async () => {
    await writeConfig(OWNERS);
    const made = await asOwner('POST', '/api/v1/sessions', {});
    expect(made.status).toBe(201);
    const session = made.body.session as Session;
    const token = await asOwner('POST', '/v1/tokens', { name: 'everything', scopes: [...GRANTABLE_SCOPES], reviewWorkflowChanges: false, reach: { kind: 'all' } });
    expect(token.status).toBe(201);
    const before = await configText();
    for (const secret of [token.body.secret as string, sessionToken(ownerToken, session.id)])
      for (const body of [{ theme: 'dark' }, { dark: 'dracula', fontFamily: 'Mono' }, {}]) expect((await call(secret, 'PUT', '/v1/settings/appearance', body)).status).toBe(403);
    expect(await configText()).toBe(before);
  });
});

describe('the page sent', () => {
  it('carries the choice: which of the two, the theme of each, and the colors set by hand over each', async () => {
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="system" data-theme-light="light" data-theme-dark="dark">');
    await writeConfig({ theme: 'dark', appearance: { light: 'gruvbox-light', dark: 'nord', colors: { accent: '#AA66CC', '[nord]': { bg: '#101010', accent: '#123456' }, '[gruvbox-light]': { text: '#202020' } } } });
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="gruvbox-light" data-theme-dark="nord" data-colors-light="text:#202020,accent:#aa66cc" data-colors-dark="bg:#101010,accent:#123456">');
    // A change through the route is on the next page sent.
    expect((await asOwner('PUT', '/v1/settings/appearance', { dark: 'dracula', theme: 'light' })).status).toBe(200);
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="light" data-theme-light="gruvbox-light" data-theme-dark="dracula" data-colors-light="text:#202020,accent:#aa66cc" data-colors-dark="accent:#aa66cc">');
  });

  it('puts nothing of a hostile file into the page: wrong themes are the defaults, and wrong colors are left out', async () => {
    const hostile = {
      theme: '"><script>alert(1)</script>',
      appearance: {
        light: 'light" onload="alert(1)',
        dark: '<script>',
        colors: {
          'accent"><script>alert(1)</script>': '#000000',
          bg: '#000000"><script>alert(1)</script>',
          text: '"><img src=x onerror=alert(1)>',
          "border' x='": '#000000',
          '[nord]': { '<b>': '#000000' },
          '[dark]': { surface: "#111111' onclick='x", field: '#ABCDEF' },
          '[x"><script>]': { bg: '#000000' },
        },
      },
    };
    await writeConfig(hostile);
    // The theme setting is not a word the schema takes: the whole file is set aside, as before.
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="system" data-theme-light="light" data-theme-dark="dark">');
    await writeConfig({ ...hostile, theme: 'dark' });
    const tag = await htmlTag();
    expect(tag).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="light" data-theme-dark="dark" data-colors-dark="field:#abcdef">');
    const page = (await send({}, 'GET', '/')).text;
    for (const piece of ['script', 'alert', 'onload', 'onerror', 'onclick', '<b>', "'"]) expect(page, piece).not.toContain(piece);
    expect(page.replace(tag, '')).toBe(PAGE.replace('<html lang="en">', ''));
  });
});

describe('the attributes', () => {
  it('hold only known names and six lower-case hexadecimal digits, in the order of the list', () => {
    const every = Object.fromEntries(THEME_COLORS.map((name) => [name, '#ABCDEF']));
    const text = colorsAttribute(every, 'nord');
    expect(text.split(',').map((pair) => pair.split(':')[0])).toEqual([...THEME_COLORS]);
    expect(text).toMatch(/^([a-z-]+:#[0-9a-f]{6})(,[a-z-]+:#[0-9a-f]{6})*$/);
    expect(colorsAttribute({}, 'nord')).toBe('');
    expect(colorsAttribute('accent', 'nord')).toBe('');
    // Whatever the settings hold, for each theme there is.
    const settings = Settings.parse({ appearance: { light: 'high-contrast-light', dark: 'gruvbox-dark' } });
    expect(pageAttributes(settings)).toBe('data-theme-setting="system" data-theme-light="high-contrast-light" data-theme-dark="gruvbox-dark"');
    // Values that slipped past the schema somehow are parsed again.
    expect(pageAttributes({ ...settings, theme: 'x"' as 'dark', appearance: { ...settings.appearance, light: 'nord' as 'light', dark: '"' as 'dark' } })).toBe('data-theme-setting="system" data-theme-light="light" data-theme-dark="dark"');
  });
});
