// @vitest-environment node
import DOCS from '../../../docs/plugins.md?raw';
import { afterEach, describe, expect, it } from 'vitest';
import { FOLLOW, PLUGIN_API_VERSION, pluginStarter, parseTemplate, templatePart, type PluginFound, type PluginsAnswer } from '@aubergine/shared';
import { tellChange } from '../change-listeners';
import { filterById, listFilters } from '../list-filters';
import { panelSections, sectionById } from '../panel/registry';
import { useApp } from '../store';
import { drawnParts } from '../templates/TemplateSays';
import { elementView, outputView, runViewList } from '../workflows/registries';
import { apiMembers, makePluginApi } from './api';
import { pluginCommandById, pluginCommands, runPluginCommand } from './commands';
import { loadedNow, syncPlugins, toRun, unloadAll } from './loader';
import { reportOf, setReport } from './reports';
import { pluginStateWords } from './PluginsPart';

const Nothing = () => null;

const made = (id = 'tickets') => makePluginApi({ id, name: 'Tickets', version: '1' }, (error) => failures.push(error));
let failures: unknown[] = [];
afterEach(() => {
  failures = [];
  unloadAll();
});

describe('the API', () => {
  it('is version 1, and its members are exactly those docs/plugins.md lists', () => {
    const { aubergine } = made();
    expect(aubergine.apiVersion).toBe(PLUGIN_API_VERSION);
    const listed = [...DOCS.matchAll(/^\| `aubergine\.([A-Za-z.]+)(?:\([^`]*\))?` \|/gm)].map((m) => m[1]);
    expect(new Set(listed).size, 'a member is listed twice').toBe(listed.length);
    expect([...listed].sort()).toEqual(apiMembers(aubergine).sort());
  });

  it('gives the page’s own React, and the pieces of the look under their names', () => {
    const { aubergine } = made();
    expect(typeof aubergine.ui.React.createElement).toBe('function');
    for (const name of ['Button', 'Row', 'Badge', 'MenuItem', 'TextField']) expect(typeof (aubergine.ui as Record<string, unknown>)[name], name).toBe('function');
  });
});

describe('each slot', () => {
  it('takes a registration after the page is drawn, under the plugin’s name, and gives back what takes it away', () => {
    const { aubergine, removeAll } = made();
    const before = panelSections().length;
    const removeSection = aubergine.panel.addSection({ id: 'by-field', title: 'By ticket', says: 'Terminals by ticket.', Component: Nothing });
    expect(sectionById('plugin.tickets.by-field')).toMatchObject({ title: 'By ticket', order: 80 });
    expect(panelSections()).toHaveLength(before + 1);
    aubergine.list.addFilter({ id: 'has-ticket', label: 'Has a ticket', test: (session) => session.fields.length > 0 });
    expect(filterById('plugin.tickets.has-ticket')?.label).toBe('Has a ticket');
    aubergine.templates.addPart({ name: 'ticket', says: 'Its ticket.', say: () => 'ABC-1' });
    expect(templatePart('ticket')).toMatchObject({ kind: 'words', where: ['title', 'row'] });
    expect(drawnParts()).toContain('ticket');
    expect(parseTemplate('{ticket}', 'row').problems).toEqual([]);
    aubergine.commands.add({ id: 'copy', title: 'Copy every ticket', run: () => {} });
    expect(pluginCommandById('plugin.tickets.copy')).toMatchObject({ pluginName: 'Tickets', title: 'Copy every ticket' });
    aubergine.runs.addView({ id: 'gantt', title: 'Gantt', Component: Nothing });
    expect(runViewList().map((v) => v.id)).toContain('plugin.tickets.gantt');
    const before2 = elementView('instructions');
    aubergine.steps.addView({ kind: 'instructions', Editor: Nothing, Detail: Nothing });
    expect(elementView('instructions')).not.toBe(before2);
    const beforeOutput = outputView('note');
    aubergine.outputs.addView({ kind: 'note', View: Nothing });
    expect(outputView('note')).not.toBe(beforeOutput);

    removeSection();
    expect(sectionById('plugin.tickets.by-field')).toBeUndefined();
    // Taken away twice is the same as once.
    removeSection();
    removeAll();
    expect(filterById('plugin.tickets.has-ticket')).toBeUndefined();
    expect(templatePart('ticket')).toBeUndefined();
    expect(parseTemplate('{ticket}', 'row').problems).toEqual([expect.stringMatching(/is not a placeholder/)]);
    expect(pluginCommands()).toEqual([]);
    expect(runViewList().map((v) => v.id)).not.toContain('plugin.tickets.gantt');
    // The page's own views are back.
    expect(elementView('instructions')).toBe(before2);
    expect(outputView('note')).toBe(beforeOutput);
  });

  it('refuses an id that is not plain, and a placeholder of a name there is, and a kind it does not draw', () => {
    const { aubergine, removeAll } = made();
    expect(() => aubergine.commands.add({ id: 'Copy All', title: 'x', run: () => {} })).toThrow(/lowercase letters/);
    expect(() => aubergine.templates.addPart({ name: 'state', says: 'x', say: () => 'x' })).toThrow(/already registered/);
    expect(() => aubergine.templates.addPart({ name: 'odd', says: 'x', kind: 'tags' as 'words', say: () => 'x' })).toThrow(/words or as a field/);
    removeAll();
  });

  it('keeps a plugin’s filter from failing the list: a test that throws passes the row, and is said', () => {
    const { aubergine, removeAll } = made();
    aubergine.list.addFilter({ id: 'broken', label: 'Broken', test: () => {
      throw new Error('no');
    } });
    const filter = filterById('plugin.tickets.broken')!;
    expect(filter.test({ session: { fields: [] }, canvasId: null, parked: false } as never, { currentCanvasId: null, words: [], tags: [], runs: new Map() })).toBe(true);
    expect(failures).toHaveLength(1);
    removeAll();
    expect(listFilters().some((f) => f.id.startsWith('plugin.'))).toBe(false);
  });

  it('runs a plugin’s command, and says what it throws without stopping', () => {
    const { aubergine, removeAll } = made();
    let ran = 0;
    aubergine.commands.add({ id: 'one', title: 'One', run: () => void (ran += 1) });
    aubergine.commands.add({ id: 'two', title: 'Two', run: () => {
      throw new Error('broken');
    } });
    expect(aubergine.runCommand('plugin.tickets.one')).toBe(true);
    expect(ran).toBe(1);
    const said: string[] = [];
    expect(runPluginCommand('plugin.tickets.two', (message) => said.push(message))).toBe(true);
    expect(said).toEqual(['Tickets: broken']);
    expect(aubergine.runCommand('plugin.tickets.none')).toBe(false);
    removeAll();
  });

  it('tells a plugin of the state and of each change, and stops when it is taken away', () => {
    const { aubergine, removeAll } = made();
    const seen: unknown[] = [];
    aubergine.state.onEvent((event) => seen.push(event.type));
    let states = 0;
    aubergine.state.subscribe(() => void (states += 1));
    useApp.setState({ app: { canvases: [], sessions: [], projects: [{ id: 'p', name: 'P', archived: false }] } as never });
    expect(states).toBe(1);
    tellChange({ type: 'session.renamed', sessionId: 'x', name: 'y' } as never);
    expect(seen).toEqual(['session.renamed']);
    removeAll();
    useApp.setState({ app: null });
    tellChange({ type: 'session.renamed', sessionId: 'x', name: 'y' } as never);
    expect(states).toBe(1);
    expect(seen).toHaveLength(1);
  });
});

/** A plugin as the server would answer it, switched on by its digest. */
function plugin(id: string, digest = id.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a')): PluginFound {
  return { id, name: id, manifest: { name: id, version: '1', runs: 'page', main: 'index.js', style: null, api: 1 }, digest, files: [{ name: 'index.js', bytes: 1 }], notLoaded: null, problems: [] };
}
const answerOf = (plugins: PluginFound[], on: Record<string, string>): PluginsAnswer => ({ folder: '/x', plugins, on, problems: [] });
const switchedOn = (plugins: PluginFound[]): PluginsAnswer => answerOf(plugins, Object.fromEntries(plugins.map((p) => [p.id, p.digest!])));

describe('the loader', () => {
  it('runs only what is switched on at the digest it has, or follows changes, in the order of their IDs', () => {
    const [a, b, c, d] = [plugin('ccc'), plugin('aaa'), plugin('bbb'), plugin('ddd')];
    expect(toRun(answerOf([a!, b!, c!, d!], { ccc: a!.digest!, aaa: FOLLOW, bbb: 'f'.repeat(64) })).map((p) => p.id)).toEqual(['aaa', 'ccc']);
  });

  it('imports each, one after the other, gives each its own API, and carries on past one that fails', async () => {
    const order: string[] = [];
    const modules: Record<string, unknown> = {
      aaa: { activate: (api: { plugin: { id: string }; say: (t: string) => void }) => void order.push(`aaa:${api.plugin.id}`) },
      bbb: { activate: () => {
        throw new Error('it broke\u001b[31m');
      } },
      ccc: { default: { activate: async () => void order.push('ccc') } },
      ddd: { nothing: true },
      eee: { default: () => void order.push('eee') },
    };
    const asked: string[] = [];
    const importer = async (href: string) => {
      asked.push(href);
      const id = href.split('/')[4]!;
      if (id === 'fff') throw new Error('Failed to fetch dynamically imported module');
      return modules[id];
    };
    const all = ['eee', 'ddd', 'ccc', 'bbb', 'aaa', 'fff'].map((id) => plugin(id));
    await syncPlugins(switchedOn(all), { importer, plain: false });
    expect(order).toEqual(['aaa:aaa', 'ccc', 'eee']);
    expect(asked.map((href) => href.split('/')[4])).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff']);
    expect(asked[0]).toBe(`/api/v1/plugins/aaa/${all[4]!.digest}/index.js`);
    expect(reportOf('bbb')).toMatchObject({ state: 'failed', message: 'it broke\u241b[31m' });
    expect(reportOf('ddd')).toMatchObject({ state: 'failed', message: expect.stringMatching(/no activate function/) });
    expect(reportOf('fff')).toMatchObject({ state: 'failed', message: expect.stringMatching(/could not be loaded/) });
    expect([...loadedNow().keys()].sort()).toEqual(['aaa', 'ccc', 'eee']);
    // Failed at that digest: not tried again by every answer.
    await syncPlugins(switchedOn(all), { importer, plain: false });
    expect(asked).toHaveLength(6);
  });

  it('takes away what a plugin added when its activate fails part way', async () => {
    const module = { activate: (api: ReturnType<typeof made>['aubergine']) => {
      api.commands.add({ id: 'half', title: 'Half', run: () => {} });
      throw new Error('half way');
    } };
    await syncPlugins(switchedOn([plugin('half')]), { importer: async () => module, plain: false });
    expect(pluginCommands()).toEqual([]);
    expect(reportOf('half')?.state).toBe('failed');
  });

  it('loads none with ?plain', async () => {
    const asked: string[] = [];
    await syncPlugins(switchedOn([plugin('aaa')]), { importer: async (href) => void asked.push(href), plain: true });
    expect(asked).toEqual([]);
    expect(loadedNow().size).toBe(0);
  });

  it('switched off: calls deactivate, takes away everything it added at once, and says to reload', async () => {
    let deactivated = 0;
    const module = {
      activate: (api: ReturnType<typeof made>['aubergine']) => {
        api.commands.add({ id: 'one', title: 'One', run: () => {} });
        api.templates.addPart({ name: 'ticket-of', says: 'x', say: () => 'x' });
      },
      deactivate: () => void (deactivated += 1),
    };
    const one = plugin('aaa');
    await syncPlugins(switchedOn([one]), { importer: async () => module, plain: false });
    expect(pluginCommands().map((c) => c.id)).toEqual(['plugin.aaa.one']);
    await syncPlugins(answerOf([one], {}), { importer: async () => module, plain: false });
    expect(deactivated).toBe(1);
    expect(pluginCommands()).toEqual([]);
    expect(templatePart('ticket-of')).toBeUndefined();
    expect(reportOf('aaa')).toMatchObject({ state: 'unloaded' });
    expect(pluginStateWords(one, 'off', reportOf('aaa'), false)).toBe('off. Reload the page to be sure it is gone');
    setReport('aaa', null);
  });

  it('loads a plugin again when what runs is at another digest than it has now', async () => {
    let activated = 0;
    const module = { activate: () => void (activated += 1) };
    const first = plugin('aaa', 'a'.repeat(64));
    await syncPlugins(answerOf([first], { aaa: FOLLOW }), { importer: async () => module, plain: false });
    const second = { ...first, digest: 'b'.repeat(64) };
    await syncPlugins(answerOf([second], { aaa: FOLLOW }), { importer: async () => module, plain: false });
    expect(activated).toBe(2);
    expect(loadedNow().get('aaa')).toBe('b'.repeat(64));
  });
});

describe('what Settings says of a plugin', () => {
  const one = plugin('aaa');
  it('is its state in words', () => {
    expect(pluginStateWords(one, 'off', undefined, false)).toBe('off');
    expect(pluginStateWords(one, 'on', undefined, false)).toBe('on');
    expect(pluginStateWords(one, 'following', undefined, false)).toBe('on, following changes');
    expect(pluginStateWords(one, 'changed', undefined, false)).toBe('changed since you switched it on: not loaded');
    expect(pluginStateWords({ notLoaded: 'plugins/aaa: no\u0007' }, 'not-loaded', undefined, false)).toBe('not loaded: plugins/aaa: no\u2407');
    expect(pluginStateWords(one, 'on', { state: 'failed', digest: one.digest!, message: 'boom' }, false)).toBe('failed: boom');
    expect(pluginStateWords(one, 'on', undefined, true)).toMatch(/left out of this page/);
  });
});

describe('the starter', () => {
  it('runs against the API alone: a section, a command and a placeholder, all taken away again', async () => {
    {
      // As the browser imports it: a module of its own, by its address; here, its text as a data: address.
      const href = `data:text/javascript,${encodeURIComponent(pluginStarter('Ticket column')['index.js']!)}`;
      const module = (await import(/* @vite-ignore */ href)) as { activate: (api: unknown) => void; deactivate: () => void };
      const { aubergine, removeAll } = made('ticket-column');
      module.activate(aubergine);
      expect(sectionById('plugin.ticket-column.by-field')?.title).toBe('By Ticket');
      expect(pluginCommandById('plugin.ticket-column.copy')?.title).toBe('Copy every Ticket');
      expect(templatePart('ticket')?.where).toEqual(['title', 'row']);
      expect(failures).toEqual([]);
      module.deactivate();
      removeAll();
      expect(sectionById('plugin.ticket-column.by-field')).toBeUndefined();
      expect(templatePart('ticket')).toBeUndefined();
    }
  });
});
