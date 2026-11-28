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
import { ThemeFolder } from './theme-files';
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
  const themes = new ThemeFolder(dir);
  await themes.reload();
  const settings = new SettingsFile(dir, () => {}, () => themes.value.themes);
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
    themes,
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
      [{ terminal: 'gruvbox-light' }, { appearance: { ...OWNERS.appearance, terminal: 'gruvbox-light' } }],
      [{ terminal: 'dracula' }, { appearance: { ...OWNERS.appearance, terminal: 'dracula' } }],
      [{ terminal: null }, { appearance: { ...OWNERS.appearance, terminal: null } }],
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
        terminal: ('terminal' in expected.appearance ? expected.appearance.terminal : null) ?? null,
        byTag: [],
      });
    }
  });

  it('writes the default theme of terminals, of either kind, and clears it with null', async () => {
    await writeConfig(OWNERS);
    expect((await asOwner('PUT', '/v1/settings/appearance', { terminal: 'solarized-light' })).body.terminal).toBe('solarized-light');
    expect((await asOwner('GET', '/api/v1/state')).body.settings.appearance.terminal).toBe('solarized-light');
    // Left out: as it was.
    expect((await asOwner('PUT', '/v1/settings/appearance', { cursor: 'block' })).body.terminal).toBe('solarized-light');
    const cleared = await asOwner('PUT', '/v1/settings/appearance', { terminal: null });
    expect(cleared.body.terminal).toBeNull();
    expect(((await config()) as { appearance: Record<string, unknown> }).appearance).toEqual({ ...OWNERS.appearance, cursor: 'block', terminal: null });
    // An ID that names no theme now is kept as written (a theme file may come back), and is drawn as the page is; the
    // rest of the file still counts. What cannot be an ID is the page's.
    await writeConfig({ ...OWNERS, appearance: { ...OWNERS.appearance, terminal: 'sepia' } });
    expect((await asOwner('PUT', '/v1/settings/appearance', {})).body).toMatchObject({ terminal: 'sepia', dark: 'nord' });
    await writeConfig({ ...OWNERS, appearance: { ...OWNERS.appearance, terminal: 'Not an ID' } });
    expect((await asOwner('PUT', '/v1/settings/appearance', {})).body).toMatchObject({ terminal: null, dark: 'nord' });
  });

  it('answers an old caller that sends only the theme as before, with the rest beside it', async () => {
    const answered = await asOwner('PUT', '/v1/settings/appearance', { theme: 'light' });
    expect(answered.status).toBe(200);
    expect(answered.body).toEqual({ theme: 'light', light: 'light', dark: 'dark', font: DEFAULT_SETTINGS.font, cursor: 'block', cursorBlink: true, terminal: null, byTag: [] });
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
      expect(answered.body).toEqual({ theme: 'light', light: 'solarized-light', dark: 'nord', font: { family: 'Mono of mine', size: 15 }, cursor: 'bar', cursorBlink: false, terminal: null, byTag: [] });
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
      { terminal: 'sepia' },
      { terminal: '' },
      { terminal: 12 },
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
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="system" data-theme-light="light" data-theme-dark="dark" data-theme-light-id="light" data-theme-dark-id="dark">');
    await writeConfig({ theme: 'dark', appearance: { light: 'gruvbox-light', dark: 'nord', colors: { accent: '#AA66CC', '[nord]': { bg: '#101010', accent: '#123456' }, '[gruvbox-light]': { text: '#202020' } } } });
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="gruvbox-light" data-theme-dark="nord" data-theme-light-id="gruvbox-light" data-theme-dark-id="nord" data-colors-light="text:#202020,accent:#aa66cc" data-colors-dark="bg:#101010,accent:#123456">');
    // A change through the route is on the next page sent.
    expect((await asOwner('PUT', '/v1/settings/appearance', { dark: 'dracula', theme: 'light' })).status).toBe(200);
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="light" data-theme-light="gruvbox-light" data-theme-dark="dracula" data-theme-light-id="gruvbox-light" data-theme-dark-id="dracula" data-colors-light="text:#202020,accent:#aa66cc" data-colors-dark="accent:#aa66cc">');
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
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="system" data-theme-light="light" data-theme-dark="dark" data-theme-light-id="light" data-theme-dark-id="dark">');
    await writeConfig({ ...hostile, theme: 'dark' });
    const tag = await htmlTag();
    expect(tag).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="light" data-theme-dark="dark" data-theme-light-id="light" data-theme-dark-id="dark" data-colors-dark="field:#abcdef">');
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
    expect(pageAttributes(settings)).toBe('data-theme-setting="system" data-theme-light="high-contrast-light" data-theme-dark="gruvbox-dark" data-theme-light-id="high-contrast-light" data-theme-dark-id="gruvbox-dark"');
    // Values that slipped past the schema somehow are parsed again.
    expect(pageAttributes({ ...settings, theme: 'x"' as 'dark', appearance: { ...settings.appearance, light: 'nord' as 'light', dark: '"' as 'dark' } })).toBe('data-theme-setting="system" data-theme-light="light" data-theme-dark="dark" data-theme-light-id="light" data-theme-dark-id="dark"');
  });
});

describe('themes of the owner\'s own', () => {
  const HARBOR = { name: 'Harbor', kind: 'dark', base: 'nord', colors: { bg: '#0e1a24', accent: '#5fb3b3' } };
  const PAPER = { name: 'Paper', kind: 'light', colors: { text: '#101010' } };
  const writeTheme = async (file: string, value: unknown): Promise<void> => {
    await mkdir(path.join(dir, 'themes'), { recursive: true });
    await writeFile(path.join(dir, 'themes', file), typeof value === 'string' ? value : JSON.stringify(value));
  };

  it('are in the state answer, with what is wrong in the files', async () => {
    await writeTheme('harbor.json', HARBOR);
    await writeTheme('paper.json', PAPER);
    await writeTheme('broken.json', '{ nope');
    const state = (await asOwner('GET', '/api/v1/state')).body;
    expect(state.themes.map((theme: { id: string }) => theme.id)).toEqual(['harbor', 'paper']);
    expect(state.themes[0]).toEqual({ id: 'harbor', name: 'Harbor', kind: 'dark', base: 'nord', colors: { bg: '#0e1a24', accent: '#5fb3b3' }, terminal: {} });
    expect(state.themeProblems).toEqual(['themes/broken.json: it is not JSON. It is not read.']);
  });

  it('may be chosen for their kind, as the default for terminals and for one terminal; another ID is refused with 400', async () => {
    await writeConfig(OWNERS);
    await writeTheme('harbor.json', HARBOR);
    await writeTheme('paper.json', PAPER);
    expect((await asOwner('PUT', '/v1/settings/appearance', { dark: 'harbor', light: 'paper' })).body).toMatchObject({ dark: 'harbor', light: 'paper' });
    expect((await asOwner('PUT', '/v1/settings/appearance', { terminal: 'paper' })).body.terminal).toBe('paper');
    const before = await configText();
    for (const body of [{ light: 'harbor' }, { dark: 'paper' }, { dark: 'gone' }, { terminal: 'gone' }, { light: 'paper', dark: 'gone' }]) {
      const refused = await asOwner('PUT', '/v1/settings/appearance', body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(refused.body.error.message).toMatch(/names no theme|theme, not a/);
    }
    expect(await configText()).toBe(before);

    const made = (await asOwner('POST', '/api/v1/sessions', {})).body.session as Session;
    expect((await asOwner('PATCH', `/api/v1/sessions/${made.id}`, { theme: 'harbor' })).body.theme).toBe('harbor');
    expect((await asOwner('PATCH', `/v1/sessions/${made.id}`, { theme: 'paper' })).body.theme).toBe('paper');
    for (const url of [`/api/v1/sessions/${made.id}`, `/v1/sessions/${made.id}`]) expect((await asOwner('PATCH', url, { theme: 'gone' })).status, url).toBe(400);
    expect(hub.state.sessions.find((s) => s.id === made.id)?.theme).toBe('paper');
  });

  it('are sent on the page as their base, with their colors and then those set by hand over them', async () => {
    await writeTheme('harbor.json', HARBOR);
    await writeConfig({ theme: 'dark', appearance: { dark: 'harbor', colors: { text: '#eeeeee' } } });
    expect(await htmlTag()).toBe(
      '<html lang="en" data-theme-setting="dark" data-theme-light="light" data-theme-dark="nord" data-theme-light-id="light" data-theme-dark-id="harbor" data-colors-light="text:#eeeeee" data-colors-dark="bg:#0e1a24,text:#eeeeee,accent:#5fb3b3">',
    );
    // Set by hand for that theme alone wins over the file's own.
    await writeConfig({ theme: 'dark', appearance: { dark: 'harbor', colors: { accent: '#111111', '[harbor]': { accent: '#222222' } } } });
    expect(await htmlTag()).toContain('data-colors-dark="bg:#0e1a24,accent:#222222"');
  });

  it('put nothing of a hostile file into the page', async () => {
    await writeTheme('evil.json', '{ "name": "</style><script>alert(1)</script>", "kind": "dark", "base": "dracula", "colors": { "accent": "#000000; } body { display: none", "bg": "#000000\\"><script>", "surface": "#101010", "__proto__": "#000000" } }');
    await writeConfig({ theme: 'dark', appearance: { dark: 'evil' } });
    const tag = await htmlTag();
    expect(tag).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="light" data-theme-dark="dracula" data-theme-light-id="light" data-theme-dark-id="evil" data-colors-dark="surface:#101010">');
    const page = (await send({}, 'GET', '/')).text;
    for (const piece of ['script', 'alert', 'display', '<b>', "'"]) expect(page, piece).not.toContain(piece);
  });

  it('fall back where the file was removed: the page is drawn in the default of the kind, and nothing fails', async () => {
    await writeTheme('harbor.json', HARBOR);
    await writeConfig({ theme: 'dark', appearance: { dark: 'harbor', terminal: 'harbor' } });
    expect(await htmlTag()).toContain('data-theme-dark="nord"');
    await rm(path.join(dir, 'themes', 'harbor.json'));
    expect(await htmlTag()).toBe('<html lang="en" data-theme-setting="dark" data-theme-light="light" data-theme-dark="dark" data-theme-light-id="light" data-theme-dark-id="dark">');
    const state = await asOwner('GET', '/api/v1/state');
    expect(state.status).toBe(200);
    expect(state.body.settings.appearance).toMatchObject({ dark: 'harbor', terminal: 'harbor' });
    expect(state.body.themes).toEqual([]);
  });

  it('are read again when the owner asks, and only the owner may', async () => {
    const first = await asOwner('POST', '/v1/settings/themes/read');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ themes: [], problems: [] });
    await writeTheme('harbor.json', HARBOR);
    await writeTheme('nord.json', HARBOR);
    const again = await asOwner('POST', '/v1/settings/themes/read');
    expect(again.body.themes.map((theme: { id: string }) => theme.id)).toEqual(['harbor']);
    expect(again.body.problems).toEqual(['themes/nord.json: "nord" is the name of a theme that comes with Aubergine: a file of your own needs another name. It is not read.']);
    const made = (await asOwner('POST', '/api/v1/sessions', {})).body.session as Session;
    const token = await asOwner('POST', '/v1/tokens', { name: 'everything', scopes: [...GRANTABLE_SCOPES], reviewWorkflowChanges: false, reach: { kind: 'all' } });
    for (const secret of [token.body.secret as string, sessionToken(ownerToken, made.id)]) expect((await call(secret, 'POST', '/v1/settings/themes/read')).status).toBe(403);
  });
});

describe('themes of terminals by tag', () => {
  const HARBOR = { name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3' } };

  it('are written as a whole list by the appearance route, left as they are when not sent, and emptied with []', async () => {
    await writeConfig(OWNERS);
    const list = [
      { tag: 'prod', theme: 'dracula' },
      { tag: 'docs', theme: 'solarized-light' },
    ];
    const written = await asOwner('PUT', '/v1/settings/appearance', { byTag: list });
    expect(written.status, JSON.stringify(written.body)).toBe(200);
    expect(written.body.byTag).toEqual(list);
    expect(await config()).toEqual({ ...OWNERS, appearance: { ...OWNERS.appearance, byTag: list } });
    expect((await asOwner('GET', '/api/v1/state')).body.settings.appearance.byTag).toEqual(list);
    // Left out: as it was.
    expect((await asOwner('PUT', '/v1/settings/appearance', { cursor: 'block' })).body.byTag).toEqual(list);
    // The whole list replaces the one there was.
    expect((await asOwner('PUT', '/v1/settings/appearance', { byTag: [list[1]] })).body.byTag).toEqual([list[1]]);
    expect((await asOwner('PUT', '/v1/settings/appearance', { byTag: [] })).body.byTag).toEqual([]);
    expect(((await config()) as { appearance: { byTag: unknown } }).appearance.byTag).toEqual([]);
  });

  it('may name a theme file; a theme the server has not read, or a list that is not one, is refused with 400 and nothing is written', async () => {
    await writeConfig(OWNERS);
    await mkdir(path.join(dir, 'themes'), { recursive: true });
    await writeFile(path.join(dir, 'themes', 'harbor.json'), JSON.stringify(HARBOR));
    expect((await asOwner('PUT', '/v1/settings/appearance', { byTag: [{ tag: 'prod', theme: 'harbor' }] })).body.byTag).toEqual([{ tag: 'prod', theme: 'harbor' }]);
    const before = await configText();
    for (const byTag of [[{ tag: 'prod', theme: 'gone' }], [{ tag: 'a', theme: 'nord' }, { tag: 'b', theme: 'gone' }], [{ tag: '', theme: 'nord' }], [{ tag: 'prod' }], Array.from({ length: 21 }, (_, i) => ({ tag: `t${i}`, theme: 'nord' })), 'prod']) {
      const refused = await asOwner('PUT', '/v1/settings/appearance', { byTag });
      expect(refused.status, JSON.stringify(byTag)).toBe(400);
    }
    expect(await configText()).toBe(before);
  });

  it('in a file: a wrong entry is skipped and said, and the rest still count', async () => {
    const warnings: string[] = [];
    await writeConfig({ appearance: { dark: 'nord', byTag: [{ tag: 'prod', theme: 'dracula' }, { tag: 'docs' }, 7] } });
    const settings = new SettingsFile(dir, (message) => warnings.push(message), () => []);
    const read = await settings.reload();
    expect(read.appearance.byTag).toEqual([{ tag: 'prod', theme: 'dracula' }]);
    expect(read.appearance.dark).toBe('nord');
    expect(warnings.filter((w) => w.includes('appearance.byTag'))).toHaveLength(2);
  });
});

describe('a project’s themes', () => {
  const HARBOR = { name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3' } };
  const PAPER = { name: 'Paper', kind: 'light', colors: { text: '#101010' } };
  const projectId = (): string => hub.state.projects[0]!.id;
  const themesOf = (): unknown => hub.state.projects.find((p) => p.id === projectId())?.themes;

  it('are set, each kind alone, left as they are when not sent, and cleared with null, by the owner', async () => {
    expect(themesOf()).toBeUndefined();
    const set = await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: { dark: 'dracula' } });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.themes).toEqual({ light: null, dark: 'dracula' });
    expect((await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: { light: 'solarized-light' } })).body.themes).toEqual({ light: 'solarized-light', dark: 'dracula' });
    // Left out, or another field alone: as they were.
    expect((await asOwner('PATCH', `/v1/projects/${projectId()}`, { name: 'Renamed' })).body.themes).toEqual({ light: 'solarized-light', dark: 'dracula' });
    expect((await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: {} })).body.themes).toEqual({ light: 'solarized-light', dark: 'dracula' });
    expect((await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: { dark: null } })).body.themes).toEqual({ light: 'solarized-light', dark: null });
    expect((await asOwner('GET', '/api/v1/state')).body.state.projects[0].themes).toEqual({ light: 'solarized-light', dark: null });
  });

  it('may be theme files of their kind; a theme of the other kind or one the server has not read is refused with 400', async () => {
    await mkdir(path.join(dir, 'themes'), { recursive: true });
    await writeFile(path.join(dir, 'themes', 'harbor.json'), JSON.stringify(HARBOR));
    await writeFile(path.join(dir, 'themes', 'paper.json'), JSON.stringify(PAPER));
    expect((await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: { light: 'paper', dark: 'harbor' } })).body.themes).toEqual({ light: 'paper', dark: 'harbor' });
    for (const themes of [{ light: 'nord' }, { dark: 'light' }, { dark: 'paper' }, { light: 'harbor' }, { dark: 'gone' }, { light: 'Not An ID' }, { light: 'light', dark: 'gone' }]) {
      const refused = await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes });
      expect(refused.status, JSON.stringify(themes)).toBe(400);
    }
    expect(themesOf()).toEqual({ light: 'paper', dark: 'harbor' });
  });

  it('are the owner’s: no token of any scope and no session can set them', async () => {
    const made = (await asOwner('POST', '/api/v1/sessions', {})).body.session as Session;
    const token = await asOwner('POST', '/v1/tokens', { name: 'everything', scopes: [...GRANTABLE_SCOPES], reviewWorkflowChanges: false, reach: { kind: 'all' } });
    for (const secret of [token.body.secret as string, sessionToken(ownerToken, made.id)]) expect((await call(secret, 'PATCH', `/v1/projects/${projectId()}`, { themes: { dark: 'dracula' } })).status).toBe(403);
    expect(themesOf()).toBeUndefined();
  });

  it('are not written into a project file', async () => {
    await asOwner('PATCH', `/v1/projects/${projectId()}`, { themes: { light: 'gruvbox-light', dark: 'dracula' } });
    const file = await asOwner('GET', `/v1/projects/${projectId()}/file`);
    expect(file.status, JSON.stringify(file.body)).toBe(200);
    const text = JSON.stringify(file.body);
    for (const word of ['dracula', 'gruvbox-light', 'themes']) expect(text, word).not.toContain(word);
  });
});
