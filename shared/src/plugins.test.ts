import { describe, expect, it } from 'vitest';
import {
  FOLLOW,
  PLUGIN_API_VERSION,
  PLUGIN_MANIFEST_MAX_BYTES,
  PluginsAnswer,
  isPluginFileName,
  pluginContentType,
  pluginDigestText,
  pluginFileHref,
  pluginRuns,
  pluginStanding,
  readPluginManifest,
  resolvePluginSwitches,
  starterManifest,
} from './plugins';
import { pluginStarter } from './plugin-starter';
import { Settings } from './settings';

const GOOD = { name: 'Ticket column', version: '0.1.0', runs: 'page', main: 'index.js', style: 'style.css', api: 1 };
const read = (value: unknown, id = 'ticket-column') => readPluginManifest(id, typeof value === 'string' ? value : JSON.stringify(value));
const problemOf = (value: unknown, id?: string): string => {
  const reading = read(value, id);
  if (!('problem' in reading)) throw new Error('it was read');
  return reading.problem;
};
const DIGEST = 'a'.repeat(64);

describe('a manifest', () => {
  it('is read when it says everything a plugin needs', () => {
    expect(read(GOOD)).toEqual({ manifest: { name: 'Ticket column', version: '0.1.0', runs: 'page', main: 'index.js', style: 'style.css', api: 1 }, problems: [] });
    // No stylesheet is fine; `$schema` is for an editor.
    expect(read({ ...GOOD, style: undefined, $schema: 'x' })).toEqual({ manifest: { ...GOOD, style: null }, problems: [] });
    expect(read({ ...GOOD, style: null })).toMatchObject({ manifest: { style: null } });
    // Spaces round the name and the version are not kept.
    expect(read({ ...GOOD, name: '  Tickets ', version: ' 2 ' })).toMatchObject({ manifest: { name: 'Tickets', version: '2' } });
  });

  it('says and skips a key it does not have', () => {
    const reading = read({ ...GOOD, permissions: ['all'], description: 'x', __proto__x: 1 });
    expect('manifest' in reading && reading.problems).toEqual([expect.stringMatching(/"permissions" is not a key/), expect.stringMatching(/"description" is not a key/), expect.stringMatching(/"__proto__x" is not a key/)]);
  });

  it('is refused whole for anything a plugin cannot be, with one sentence', () => {
    for (const [value, said] of [
      ['not json', /not JSON/],
      ['[]', /not a JSON object/],
      ['null', /not a JSON object/],
      ['"page"', /not a JSON object/],
      ['x'.repeat(PLUGIN_MANIFEST_MAX_BYTES + 1), /larger than/],
      [{ ...GOOD, name: '' }, /"name" is not a plain name/],
      [{ ...GOOD, name: 7 }, /"name"/],
      [{ ...GOOD, name: 'two\nlines' }, /"name"/],
      [{ ...GOOD, name: 'line separator' }, /"name"/],
      [{ ...GOOD, name: 'evil‮reversed' }, /"name"/],
      [{ ...GOOD, name: 'bell\u0007' }, /"name"/],
      [{ ...GOOD, name: 'n'.repeat(121) }, /"name"/],
      [{ ...GOOD, version: undefined }, /"version"/],
      [{ ...GOOD, version: 1 }, /"version"/],
      [{ ...GOOD, version: 'v'.repeat(41) }, /"version"/],
      [{ ...GOOD, version: '1\r\n2' }, /"version"/],
      [{ ...GOOD, main: undefined }, /"main"/],
      [{ ...GOOD, main: 'index.mjs' }, /"main"/],
      [{ ...GOOD, main: '../index.js' }, /"main"/],
      [{ ...GOOD, main: 'lib/index.js' }, /"main"/],
      [{ ...GOOD, main: '/etc/index.js' }, /"main"/],
      [{ ...GOOD, main: 'https://example.com/index.js' }, /"main"/],
      [{ ...GOOD, main: 'in dex.js' }, /"main"/],
      [{ ...GOOD, style: 'style.js' }, /"style"/],
      [{ ...GOOD, style: '../style.css' }, /"style"/],
      [{ ...GOOD, style: 3 }, /"style"/],
      [{ ...GOOD, api: undefined }, /"api"/],
      [{ ...GOOD, api: '1' }, /"api"/],
      [{ ...GOOD, api: 1.5 }, /"api"/],
      [{ ...GOOD, api: 0 }, /"api"/],
    ] as const) {
      expect(problemOf(value), JSON.stringify(value).slice(0, 80)).toMatch(said);
      expect(problemOf(value)).toMatch(/^plugins\/ticket-column\/plugin\.json: /);
    }
  });

  it('is not loaded, and says so, for a way of running this page does not have; nothing is guessed', () => {
    for (const runs of ['sandbox', 'worker', 'Page', 'PAGE', '', 1, true, null, ['page']]) {
      expect(problemOf({ ...GOOD, runs }), String(runs)).toMatch(/not loaded: this Aubergine cannot run a plugin that way/);
    }
    expect(problemOf({ ...GOOD, runs: undefined })).toMatch(/does not say how it runs/);
    // The way it asked for is quoted plainly.
    expect(problemOf({ ...GOOD, runs: 'iframe‮' })).toContain('"iframe?"');
  });

  it('is not loaded, and says so, when it was written for a later API', () => {
    expect(problemOf({ ...GOOD, api: PLUGIN_API_VERSION + 1 })).toMatch(new RegExp(`version ${PLUGIN_API_VERSION + 1} of the plugin API, and this Aubergine offers version ${PLUGIN_API_VERSION}`));
  });

  it('keeps its name where it says one, so that a list can show it', () => {
    expect(read({ ...GOOD, api: 99 })).toMatchObject({ name: 'Ticket column' });
  });

  it('is refused for a folder whose name no plugin can have, before its text is read', () => {
    for (const id of ['Ticket', '1st', '-x', 'a_b', 'a.b', '', 'a'.repeat(41), '../x', 'é']) expect(problemOf(GOOD, id), id).toMatch(/its folder’s name is not one a plugin can have/);
    expect('manifest' in read(GOOD, 'a'.repeat(40))).toBe(true);
  });

  it('is what the starter writes', () => {
    expect(read(starterManifest('Mine'), 'mine')).toEqual({ manifest: { name: 'Mine', version: '0.1.0', runs: 'page', main: 'index.js', style: 'style.css', api: PLUGIN_API_VERSION }, problems: [] });
    expect(Object.keys(pluginStarter('Mine')).sort()).toEqual(['index.js', 'plugin.json', 'style.css']);
  });
});

describe('a file of a plugin', () => {
  it('has a plain name, directly in its folder', () => {
    for (const name of ['index.js', 'a-b_c.d.css', 'X'.repeat(80)]) expect(isPluginFileName(name), name).toBe(true);
    for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a b', 'X'.repeat(81), 'é.js', 'a\u0000b']) expect(isPluginFileName(name), name).toBe(false);
  });

  it('is sent as what its name ends with, from a fixed table, and anything else not at all', () => {
    expect(pluginContentType('index.js')).toBe('text/javascript; charset=utf-8');
    expect(pluginContentType('STYLE.CSS')).toBe('text/css; charset=utf-8');
    expect(pluginContentType('icon.svg')).toBe('image/svg+xml');
    expect(pluginContentType('a.woff2')).toBe('font/woff2');
    for (const name of ['index.html', 'index.mjs', 'x.exe', 'noext', '.js', 'a.constructor', 'a.__proto__', 'a.toString']) expect(pluginContentType(name), name).toBeNull();
  });

  it('is addressed with the digest in its path, so that what it imports keeps it', () => {
    expect(pluginFileHref('tickets', DIGEST, 'index.js')).toBe(`/api/v1/plugins/tickets/${DIGEST}/index.js`);
    expect(new URL('./other.js', `http://x${pluginFileHref('tickets', DIGEST, 'index.js')}`).pathname).toBe(`/api/v1/plugins/tickets/${DIGEST}/other.js`);
  });
});

describe('the digest', () => {
  it('is over every name and content in the order of their names, whatever order they were listed in', () => {
    const one = pluginDigestText([
      { name: 'index.js', sha256: '1'.repeat(64) },
      { name: 'b.css', sha256: '2'.repeat(64) },
      { name: 'B.css', sha256: '3'.repeat(64) },
    ]);
    const two = pluginDigestText([
      { name: 'B.css', sha256: '3'.repeat(64) },
      { name: 'index.js', sha256: '1'.repeat(64) },
      { name: 'b.css', sha256: '2'.repeat(64) },
    ]);
    expect(one).toBe(two);
    expect(one).toBe(`aubergine-plugin-digest 1\nB.css ${'3'.repeat(64)}\nb.css ${'2'.repeat(64)}\nindex.js ${'1'.repeat(64)}\n`);
  });

  it('changes with a name, a content, a file more or a file less', () => {
    const base = [{ name: 'index.js', sha256: '1'.repeat(64) }];
    const texts = new Set([
      pluginDigestText(base),
      pluginDigestText([{ name: 'main.js', sha256: '1'.repeat(64) }]),
      pluginDigestText([{ name: 'index.js', sha256: '4'.repeat(64) }]),
      pluginDigestText([...base, { name: 'x.css', sha256: '1'.repeat(64) }]),
      pluginDigestText([]),
    ]);
    expect(texts.size).toBe(5);
  });
});

describe('the switches', () => {
  it('keep each good entry and say and skip each wrong one', () => {
    const { on, problems } = resolvePluginSwitches({ tickets: DIGEST, writing: FOLLOW, Wrong: DIGEST, short: 'abc', upper: 'A'.repeat(64), number: 7, off: null, follow2: 'Follow' });
    expect(on).toEqual({ tickets: DIGEST, writing: FOLLOW });
    expect(problems).toHaveLength(6);
    expect(problems[0]).toMatch(/"Wrong" is not a plugin’s ID/);
    expect(problems.slice(1).every((problem) => /is neither the digest/.test(problem))).toBe(true);
  });

  it('are none, and no problem, where there are none, and none with one sentence where the value is not a map', () => {
    expect(resolvePluginSwitches(undefined)).toEqual({ on: {}, problems: [] });
    expect(resolvePluginSwitches({})).toEqual({ on: {}, problems: [] });
    for (const value of ['follow', ['tickets'], 3]) expect(resolvePluginSwitches(value)).toEqual({ on: {}, problems: [expect.stringMatching(/No plugin is switched on/)] });
  });

  it('are read from a settings file that has none, an older one, and one that is wrong, without dropping the file', () => {
    expect(Settings.parse({}).plugins).toEqual({ on: {} });
    expect(Settings.parse({ plugins: 'yes' }).plugins).toEqual({ on: {} });
    expect(Settings.parse({ plugins: { on: 'all' } }).plugins).toEqual({ on: {} });
    // A wrong entry is kept as written in the settings, and skipped where it is used: the others still count.
    const settings = Settings.parse({ theme: 'dark', plugins: { on: { tickets: DIGEST, ['x'.repeat(200)]: FOLLOW } } });
    expect(settings.theme).toBe('dark');
    expect(resolvePluginSwitches(settings.plugins.on).on).toEqual({ tickets: DIGEST });
  });
});

describe('where a plugin stands', () => {
  const found = { digest: DIGEST, notLoaded: null, manifest: { ...GOOD, runs: 'page' as const } };
  it('is off, on, following, changed or not loaded, and only on and following run', () => {
    expect(pluginStanding(found, undefined)).toBe('off');
    expect(pluginStanding(found, DIGEST)).toBe('on');
    expect(pluginStanding(found, FOLLOW)).toBe('following');
    expect(pluginStanding(found, 'b'.repeat(64))).toBe('changed');
    expect(pluginStanding({ ...found, notLoaded: 'no' }, FOLLOW)).toBe('not-loaded');
    expect(pluginStanding({ ...found, digest: null }, FOLLOW)).toBe('not-loaded');
    expect(pluginStanding({ ...found, manifest: null }, DIGEST)).toBe('not-loaded');
    expect((['off', 'on', 'following', 'changed', 'not-loaded'] as const).filter(pluginRuns)).toEqual(['on', 'following']);
  });

  it('is told in an answer the server can describe', () => {
    expect(PluginsAnswer.parse({ folder: '/x/plugins', plugins: [{ id: 'tickets', name: 'T', manifest: { ...GOOD }, digest: DIGEST, files: [{ name: 'index.js', bytes: 3 }], notLoaded: null, problems: [] }], on: { tickets: FOLLOW }, problems: [] }).plugins).toHaveLength(1);
  });
});
