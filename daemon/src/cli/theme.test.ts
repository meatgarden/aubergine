import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createClient, type Client } from '@aubergine/client';
import { BUILT_IN_THEME_COLORS, COLOR_THEMES, NO_ATTENTION, NO_STATUS, SESSION_ENV, contrastRatio, newId, readThemeFile, type Session } from '@aubergine/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionToken } from '../auth';
import type { SessionRuntime } from '../runtime/runtime';
import { buildServer, cookieName } from '../server';
import { Sessions } from '../sessions';
import { SettingsFile } from '../settings';
import { StateHub } from '../state-hub';
import { JsonStore } from '../store/json-store';
import { ThemeFolder } from '../theme-files';
import { loadOrCreateToken } from '../token';
import { UsageError, parseCommand } from './commands';
import { parseThemeCommand, runThemeCommand, type ThemeCommand } from './theme';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-cli-theme-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(command: ThemeCommand): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runThemeCommand(command, { dataDir: dir, print: (text) => out.push(text), warn: (text) => err.push(text) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
describe('parsing the theme commands', () => {
  it('reads list, path, check and new, and list by itself', () => {
    expect(parseCommand(['theme'])).toEqual({ name: 'theme', words: [] });
    expect(parseCommand(['themes', 'list'])).toEqual({ name: 'theme', words: ['list'] });
    expect(parseThemeCommand([])).toEqual({ action: 'list' });
    expect(parseThemeCommand(['path'])).toEqual({ action: 'path' });
    expect(parseThemeCommand(['check', 'a.json'])).toEqual({ action: 'check', file: 'a.json' });
    expect(parseThemeCommand(['new', 'harbor'])).toEqual({ action: 'new', id: 'harbor', from: null, name: null, accent: null });
    expect(parseThemeCommand(['new', 'harbor', '--from', 'nord', '--name', 'Harbor night'])).toEqual({ action: 'new', id: 'harbor', from: 'nord', name: 'Harbor night', accent: null });
    expect(parseThemeCommand(['propose', 'harbor.json'])).toEqual({ action: 'propose', file: 'harbor.json', id: null, why: null });
    expect(parseThemeCommand(['propose', 'h.json', '--id', 'harbor', '--why', 'at night'])).toEqual({ action: 'propose', file: 'h.json', id: 'harbor', why: 'at night' });
    expect(parseThemeCommand(['proposals'])).toEqual({ action: 'proposals' });
    for (const words of [['propose'], ['propose', 'a', 'b'], ['proposals', 'x'], ['propose', '--why', 'x']]) expect(() => parseThemeCommand(words), words.join(' ')).toThrow(UsageError);
    for (const words of [['set'], ['check'], ['check', 'a', 'b'], ['new'], ['new', 'a', 'b'], ['path', 'x'], ['new', '--from', 'nord']]) expect(() => parseThemeCommand(words), words.join(' ')).toThrow(UsageError);
  });
});

describe('aubergine theme', () => {
  it('says where the folder is', async () => {
    expect((await run({ action: 'path' })).out).toBe(path.join(dir, 'themes'));
  });

  it('lists the themes that come with Aubergine and the owner\'s, and what is wrong in a file, through showControl', async () => {
    const empty = await run({ action: 'list' });
    for (const theme of COLOR_THEMES) expect(empty.out).toContain(theme.name);
    expect(empty.out).toContain('No theme of your own yet.');
    await mkdir(path.join(dir, 'themes'));
    await writeFile(path.join(dir, 'themes', 'harbor.json'), JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord' }));
    await writeFile(path.join(dir, 'themes', 'odd.json'), JSON.stringify({ name: 'Odd', kind: 'light', 'x\u001b[31m': 1 }));
    const { code, out } = await run({ action: 'list' });
    expect(code).toBe(0);
    expect(out).toMatch(/harbor +yours, over nord +Harbor/);
    expect(out).toContain('Not read, or skipped:');
    // eslint-disable-next-line no-control-regex -- control characters are what is looked for
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
  });

  it('writes a new file to start from with every color of the theme it is from, and never over one that is there', async () => {
    const made = await run({ action: 'new', id: 'harbor', from: 'nord', name: null, accent: null });
    expect(made.code, made.err).toBe(0);
    const file = path.join(dir, 'themes', 'harbor.json');
    expect(made.out).toContain(`Wrote ${file}`);
    const text = await readFile(file, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ $schema: '../theme.schema.json', name: 'Harbor', kind: 'dark', base: 'nord', colors: BUILT_IN_THEME_COLORS.nord });
    expect(readThemeFile('harbor', text)).toMatchObject({ problems: [] });

    const again = await run({ action: 'new', id: 'harbor', from: 'dracula', name: null, accent: null });
    expect(again.code).toBe(1);
    expect(again.err).toContain('There is already a file named harbor.json');
    expect(await readFile(file, 'utf8')).toBe(text);

    // From a theme of the owner's: its base, and its colors as it draws them.
    await writeFile(file, JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3' } }));
    expect((await run({ action: 'new', id: 'harbor-2', from: 'harbor', name: 'Second harbor', accent: null })).code).toBe(0);
    expect(JSON.parse(await readFile(path.join(dir, 'themes', 'harbor-2.json'), 'utf8'))).toMatchObject({ name: 'Second harbor', base: 'nord', colors: { ...BUILT_IN_THEME_COLORS.nord, accent: '#5fb3b3' } });
    // Left out, from Dark.
    expect((await run({ action: 'new', id: 'mine', from: null, name: null, accent: null })).code).toBe(0);
    expect(JSON.parse(await readFile(path.join(dir, 'themes', 'mine.json'), 'utf8'))).toMatchObject({ kind: 'dark', base: 'dark' });
  });

  it('with --accent, writes only the accent and the colors that go with it, over the theme it is from, readable', async () => {
    expect(parseThemeCommand(['new', 'teal', '--from', 'nord', '--accent', '#2F9E8F'])).toEqual({ action: 'new', id: 'teal', from: 'nord', name: null, accent: '#2f9e8f' });
    expect(() => parseThemeCommand(['new', 'teal', '--accent', 'teal'])).toThrow('--accent is a color written #rrggbb');
    expect(() => parseThemeCommand(['new', 'teal', '--accent', '#abc'])).toThrow('--accent is a color written #rrggbb');
    const made = await run({ action: 'new', id: 'teal', from: 'nord', name: null, accent: '#2f9e8f' });
    expect(made.code, made.err).toBe(0);
    expect(made.out).toContain('Nord with the accent');
    const text = await readFile(path.join(dir, 'themes', 'teal.json'), 'utf8');
    const read = readThemeFile('teal', text);
    if ('problem' in read) throw new Error(read.problem);
    expect(read.problems).toEqual([]);
    expect(read.theme).toMatchObject({ name: 'Teal', kind: 'dark', base: 'nord' });
    expect(Object.keys(read.theme.colors).sort()).toEqual(['accent', 'accent-pressed', 'accent-soft', 'accent-text', 'on-accent', 'selection']);
    const colors = { ...BUILT_IN_THEME_COLORS.nord, ...read.theme.colors };
    expect(contrastRatio(colors['accent-text'], colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors['on-accent'], colors.accent)).toBeGreaterThanOrEqual(4.5);
    // An accent that cannot be read on a light page is darkened, and that is said.
    const pale = await run({ action: 'new', id: 'pale', from: 'light', name: null, accent: '#ffee88' });
    expect(pale.code, pale.err).toBe(0);
    expect(pale.out).toMatch(/the accent #ffee88 was darkened to #[0-9a-f]{6}/);
  });

  it('refuses an ID that cannot be one, a name that is not plain, a theme that is not there, and a link in the way', async () => {
    for (const id of ['Harbor', 'nord', '../x', 'a b']) expect((await run({ action: 'new', id, from: null, name: null, accent: null })).code, id).toBe(1);
    expect((await run({ action: 'new', id: 'x', from: null, name: 'a\nb', accent: null })).code).toBe(1);
    expect((await run({ action: 'new', id: 'x', from: 'sepia', name: null, accent: null })).err).toContain('names no theme');
    const outside = path.join(dir, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(dir, 'themes'));
    const linked = await run({ action: 'new', id: 'x', from: null, name: null, accent: null });
    expect(linked.code).toBe(1);
    expect(linked.err).toContain('Nothing was written');
    expect(await readdir(outside)).toEqual([]);
  });

  it('checks a file with the server\'s own reader, and starts nothing', async () => {
    const good = path.join(dir, 'good.json');
    await writeFile(good, JSON.stringify({ name: 'Good', kind: 'light', colors: { accent: '#123456' } }));
    expect(await run({ action: 'check', file: good })).toEqual({ code: 0, out: 'Good: a light theme over light, 1 of its colors its own.\nNothing in it is wrong.', err: '' });
    const skipped = path.join(dir, 'skipped.json');
    await writeFile(skipped, JSON.stringify({ name: 'S', kind: 'dark', colors: { accent: 'red' } }));
    const some = await run({ action: 'check', file: skipped });
    expect(some.code).toBe(1);
    expect(some.out).toContain('"accent" is not a color written as #rrggbb');
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, '{');
    expect(await run({ action: 'check', file: bad })).toEqual({ code: 1, out: '', err: 'themes/bad.json: it is not JSON. It is not read.' });
    expect((await run({ action: 'check', file: path.join(dir, 'missing.json') })).code).toBe(1);
    expect((await run({ action: 'check', file: path.join(dir, 'a.txt') })).err).toContain('ends in .json');
  });
});

describe('aubergine theme, inside a terminal', () => {
  // A real server with its own data folder; the command runs as the agent in one of its terminals.
  let app: FastifyInstance;
  let hub: StateHub;
  let origin: string;
  let ownerToken: string;
  let session: Session;
  let work: string;

  beforeEach(async () => {
    ownerToken = await loadOrCreateToken(dir);
    const store = new JsonStore(dir);
    hub = new StateHub(await store.load(), store);
    const themes = new ThemeFolder(dir);
    const settings = new SettingsFile(dir, () => {}, () => themes.value.themes);
    const runtime = { check: async () => ({ status: 'ok', version: '3.4' }), list: async () => [], has: async () => true, kill: async () => {} } as unknown as SessionRuntime;
    app = await buildServer({ hub, sessions: new Sessions(hub, runtime, {}), runtime, settings: () => settings.reload(), token: ownerToken, devOrigin: null, webDist: path.join(dir, 'none'), themes });
    await app.listen({ host: '127.0.0.1', port: 0 });
    origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    session = { id: newId(), projectId: hub.state.projects[0]!.id, name: 'designer', createdAt: new Date().toISOString(), state: 'open', cwd: null, command: null, note: '', status: NO_STATUS, attention: NO_ATTENTION, noteLog: [], agent: null, lastInputAt: null, lastOutputAt: null, tags: [], fields: [], parkedFrom: null, peopleOnly: false, typedBy: null,
      recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null };
    hub.emit({ type: 'session.created', session, canvasId: hub.state.canvases[0]!.id, node: { id: newId(), sessionId: session.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
    work = path.join(dir, 'work');
    await mkdir(work);
  });
  afterEach(async () => {
    await hub.flush();
    await app.close();
  });

  const inside = async (command: ThemeCommand): Promise<{ code: number; out: string; err: string }> => {
    const out: string[] = [];
    const err: string[] = [];
    const env = { [SESSION_ENV.url]: origin, [SESSION_ENV.sessionId]: session.id, [SESSION_ENV.token]: sessionToken(ownerToken, session.id) };
    const code = await runThemeCommand(command, { dataDir: dir, print: (text) => out.push(text), warn: (text) => err.push(text), env, cwd: work });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  it('lists the themes through the server, writes a new file into the current folder, and proposes it for the owner to read', async () => {
    const listed = await inside({ action: 'list' });
    expect(listed.code, listed.err).toBe(0);
    expect(listed.out).toMatch(/nord +comes with Aubergine +Nord/);
    expect(listed.out).toContain('aubergine theme propose <file>');

    const made = await inside({ action: 'new', id: 'harbor', from: 'nord', name: null, accent: null });
    expect(made.code, made.err).toBe(0);
    expect(made.out).toContain(`Wrote ${path.join(work, 'harbor.json')}`);
    expect(await readdir(dir)).not.toContain('themes');

    const proposed = await inside({ action: 'propose', file: 'harbor.json', id: null, why: 'night \u001b[31mred' });
    expect(proposed.code).toBe(1);
    expect(proposed.err).not.toMatch(/\u001b/); // eslint-disable-line no-control-regex -- what is looked for
    expect((await inside({ action: 'propose', file: 'harbor.json', id: null, why: 'easier at night' })).code).toBe(0);
    expect(hub.state.themeProposals.waiting.map((one) => [one.themeId, one.why, one.proposedBy])).toEqual([['harbor', 'easier at night', { kind: 'session', sessionId: session.id }]]);
    expect(hub.state.themeProposals.waiting[0]?.text).toBe(await readFile(path.join(work, 'harbor.json'), 'utf8'));
    // Nothing was written into the theme files.
    expect(await readdir(dir)).not.toContain('themes');

    const mine = await inside({ action: 'proposals' });
    expect(mine.out).toMatch(/^harbor {2}Harbor \(dark, over Nord\): waits for the owner/);
    expect((await inside({ action: 'propose', file: 'missing.json', id: null, why: null })).code).toBe(1);
    expect((await inside({ action: 'propose', file: 'harbor.json', id: 'Bad Id', why: null })).err).toContain("a theme's ID is");
  });

  it('outside a terminal, propose says to write the file, and proposals lists what waits for the owner', async () => {
    const outside = await run({ action: 'propose', file: path.join(work, 'x.json'), id: null, why: null });
    expect(outside.code).toBe(1);
    expect(outside.err).toContain('from inside an Aubergine terminal');
    await inside({ action: 'new', id: 'harbor', from: null, name: null, accent: null });
    await inside({ action: 'propose', file: 'harbor.json', id: null, why: null });
    const out: string[] = [];
    const owner = <T>(call: (client: Client) => Promise<T>): Promise<T> => call(createClient({ baseUrl: origin, headers: { origin, cookie: `${cookieName(Number(new URL(origin).port))}=${ownerToken}` } }));
    expect(await runThemeCommand({ action: 'proposals' }, { dataDir: dir, print: (text) => out.push(text), warn: () => {}, owner })).toBe(0);
    expect(out.join('\n')).toContain(`harbor  Harbor (dark, over Dark), from a terminal (${session.id}): waits for the owner`);
    expect(out.join('\n')).toContain('under Review');
  });
});
