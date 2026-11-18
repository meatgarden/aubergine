import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, applyEvent, createInitialState, newCanvas, newId, type AppState, type LayoutNode, type Session } from '@aubergine/shared';
import { SCOPE_FILTER, listFilters, registerFilter, unregisterFilter } from './list-filters';
import {
  DEFAULT_VIEW,
  FRAME_HEIGHT,
  GROUP_HEIGHT,
  ROW_HEIGHT,
  activeFilters,
  ago,
  buildItems,
  createRowSelector,
  dotTone,
  shortCommand,
  describeEmpty,
  filterChips,
  filterRows,
  measureItems,
  navigationOrder,
  parseView,
  rowState,
  sortRows,
  stateCounts,
  visibleRange,
  type ListView,
} from './terminal-rows';

const at = '2026-01-01T00:00:00.000Z';

function session(name: string, extra: Partial<Session> = {}): Session {
  return {
    id: newId(),
    projectId: newId(),
    name,
    createdAt: at,
    state: 'open',
    cwd: `/work/${name}`,
    command: 'zsh',
    note: '',
    status: NO_STATUS,
    attention: NO_ATTENTION,
    noteLog: [],
    agent: null,
    parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    ...extra,
  };
}

const node = (s: Session, x: number, y: number): LayoutNode => ({ id: newId(), sessionId: s.id, x, y, width: 100, height: 60, color: 'none' });

/** Main: frame "Backend" holding api and db, and a loose web. Deploys: builder. Parked: old. */
function sample() {
  const base = createInitialState(new Date(at));
  const api = session('api', { status: { ...NO_STATUS, state: 'busy' }, tags: ['backend'], lastOutputAt: '2026-01-01T00:05:00.000Z' });
  const db = session('db', { attention: { state: 'waiting', message: 'ok?', at }, agent: { kind: 'claude-code', conversationId: null, program: null }, tags: ['Backend', 'data'] });
  const web = session('web', { status: { ...NO_STATUS, unread: true }, note: 'fix the header', lastInputAt: '2026-01-01T00:09:00.000Z' });
  const builder = session('builder', { status: { ...NO_STATUS, state: 'idle', lastExit: 2 }, lastOutputAt: '2026-01-01T00:07:00.000Z' });
  const old = session('old', { state: 'parked' });
  const main = base.canvases[0]!;
  const deploys = newCanvas(base.projects[0]!.id, 'Deploys', 1, new Date(at));
  const app: AppState = {
    ...base,
    sessions: [web, old, builder, db, api],
    canvases: [
      {
        ...main,
        layout: {
          frames: [{ id: newId(), label: 'Backend', color: 'none', x: -10, y: 190, width: 400, height: 100 }],
          nodes: [node(web, 0, 0), node(db, 120, 200), node(api, 0, 200)],
        },
      },
      { ...deploys, layout: { frames: [], nodes: [node(builder, 0, 0)] } },
    ],
  };
  return { app, main: app.canvases[0]!, deploys: app.canvases[1]!, api, db, web, builder, old };
}

const names = (rows: readonly { session: Session }[]): string[] => rows.map((r) => r.session.name);
const view = (change: Partial<ListView> = {}): ListView => ({ ...DEFAULT_VIEW, filters: [], ...change });

describe('rowState', () => {
  it('gives one state, the most pressing first', () => {
    const busy = { ...NO_STATUS, state: 'busy' as const };
    expect(rowState(session('a', { attention: { state: 'waiting', message: null, at }, status: { ...busy, unread: true } }))).toBe('waiting');
    expect(rowState(session('a', { attention: { state: 'done', message: null, at } }))).toBe('waiting');
    expect(rowState(session('a', { status: { ...busy, unread: true } }))).toBe('processing');
    expect(rowState(session('a', { attention: { state: 'working', message: null, at } }))).toBe('processing');
    expect(rowState(session('a', { status: { ...NO_STATUS, state: 'idle', lastExit: 1, unread: true } }))).toBe('unread');
    expect(rowState(session('a', { status: { ...NO_STATUS, state: 'idle', lastExit: 1 } }))).toBe('failed');
    expect(rowState(session('a', { status: { ...NO_STATUS, state: 'idle', lastExit: 0 } }))).toBe('idle');
    expect(rowState(session('a'))).toBe('idle');
    expect(rowState(session('a', { state: 'exited', status: { ...busy } }))).toBe('ended');
  });
});

describe('rows', () => {
  it('are every session: canvases in tab order, each in reading order with its frames, parked last', () => {
    const { app } = sample();
    const rows = createRowSelector()(app);
    expect(names(rows)).toEqual(['api', 'db', 'web', 'builder', 'old']);
    expect(rows.map((r) => r.canvasName)).toEqual(['Main', 'Main', 'Main', 'Deploys', null]);
    expect(rows.map((r) => r.frame?.label ?? null)).toEqual(['Backend', 'Backend', null, null, null]);
    expect(rows.map((r) => r.state)).toEqual(['processing', 'waiting', 'unread', 'failed', 'idle']);
    expect(rows.at(-1)?.parked).toBe(true);
  });

  it('are not rebuilt by a change that touches neither sessions nor canvases', () => {
    const { app } = sample();
    const select = createRowSelector();
    const rows = select(app);
    expect(select({ ...app, organization: { ...app.organization } })).toBe(rows);
  });

  it('keep the very same row for every session a change did not touch', () => {
    const { app, api } = sample();
    const select = createRowSelector();
    const before = select(app);
    const after = select(applyEvent(app, { type: 'session.times', sessionId: api.id, lastOutputAt: '2026-01-01T01:00:00.000Z' }));
    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(before[0]);
    expect(after[0]?.session.lastOutputAt).toBe('2026-01-01T01:00:00.000Z');
    for (const i of [1, 2, 3, 4]) expect(after[i]).toBe(before[i]);
  });

  it('follow a rename of a canvas and a move of a node', () => {
    const { app, main, web } = sample();
    const select = createRowSelector();
    select(app);
    const renamed = select(applyEvent(app, { type: 'canvas.updated', canvasId: main.id, changes: { name: 'Work' } }));
    expect(renamed[0]?.canvasName).toBe('Work');
    const webNode = main.layout.nodes.find((n) => n.sessionId === web.id)!;
    const moved = select(applyEvent(app, { type: 'node.updated', canvasId: main.id, node: { ...webNode, y: 900 } }));
    expect(names(moved).slice(0, 3)).toEqual(['api', 'db', 'web']);
    const up = select(applyEvent(app, { type: 'node.updated', canvasId: main.id, node: { ...webNode, x: 500, y: 200 } }));
    expect(names(up).slice(0, 3)).toEqual(['api', 'db', 'web']);
  });
});

describe('filters', () => {
  const { app, main, deploys } = sample();
  const rows = createRowSelector()(app);
  const pass = (change: Partial<ListView>, canvas = main.id): string[] => names(filterRows(rows, view(change), canvas));

  it('show everything when none is on', () => {
    expect(pass({})).toEqual(['api', 'db', 'web', 'builder', 'old']);
    expect(filterRows(rows, view(), main.id)).toBe(rows);
  });

  it('narrow to the canvas being looked at, keeping the parked ones', () => {
    expect(pass({ filters: [SCOPE_FILTER] })).toEqual(['api', 'db', 'web', 'old']);
    expect(pass({ filters: [SCOPE_FILTER] }, deploys.id)).toEqual(['builder', 'old']);
  });

  it('each test one thing', () => {
    expect(pass({ filters: ['waiting'] })).toEqual(['db']);
    expect(pass({ filters: ['busy'] })).toEqual(['api']);
    expect(pass({ filters: ['unread'] })).toEqual(['web']);
    expect(pass({ filters: ['agent'] })).toEqual(['db']);
    expect(pass({ filters: ['parked'] })).toEqual(['old']);
  });

  it('combine with AND', () => {
    expect(pass({ filters: [SCOPE_FILTER, 'agent'] })).toEqual(['db']);
    expect(pass({ filters: [SCOPE_FILTER, 'agent'] }, deploys.id)).toEqual([]);
    expect(pass({ filters: ['waiting', 'busy'] })).toEqual([]);
    expect(pass({ filters: ['agent'], tags: ['data'] })).toEqual(['db']);
  });

  it('match text in the name, folder, command, note and tags, every word', () => {
    expect(pass({ text: 'WEB' })).toEqual(['web']);
    expect(pass({ text: '/work/bu' })).toEqual(['builder']);
    expect(pass({ text: 'header fix' })).toEqual(['web']);
    expect(pass({ text: 'zsh' })).toHaveLength(5);
    expect(pass({ text: 'data' })).toEqual(['db']);
    expect(pass({ text: 'web nope' })).toEqual([]);
    expect(pass({ text: '   ' })).toHaveLength(5);
  });

  it('match any of the chosen tags, whatever the capitals', () => {
    expect(pass({ tags: ['backend'] })).toEqual(['api', 'db']);
    expect(pass({ tags: ['BACKEND', 'nothing'] })).toEqual(['api', 'db']);
    expect(pass({ tags: ['data'] })).toEqual(['db']);
  });

  it('ignore a filter that is not registered, and take one that is added', () => {
    expect(pass({ filters: ['from-an-older-version'] })).toHaveLength(5);
    registerFilter({ id: 'short-name', label: 'Short name', order: 60, test: (row) => row.session.name.length <= 2 });
    expect(listFilters().map((f) => f.id)).toContain('short-name');
    expect(pass({ filters: ['short-name'] })).toEqual(['db']);
    expect(filterChips(view({ filters: ['short-name'] }))[0]?.label).toBe('Short name');
    unregisterFilter('short-name');
    expect(pass({ filters: ['short-name'] })).toHaveLength(5);
  });

  it('name what narrows the list, one removable chip each, and say why it is empty', () => {
    const narrowed = view({ filters: [SCOPE_FILTER, 'waiting'], text: ' api ', tags: ['backend', 'data'] });
    expect(activeFilters(narrowed)).toEqual([SCOPE_FILTER, 'waiting', 'text', 'tag']);
    const chips = filterChips(narrowed);
    expect(chips.map((c) => c.label)).toEqual(['This canvas', 'Waiting for me', '“api”', '#backend', '#data']);
    expect(chips[1]?.remove).toEqual({ filters: [SCOPE_FILTER] });
    expect(chips[2]?.remove).toEqual({ text: '' });
    expect(chips[4]?.remove).toEqual({ tags: ['backend'] });
    expect(describeEmpty(narrowed, 5)).toBe('No terminal matches This canvas + Waiting for me + “api” + #backend + #data. 5 are hidden.');
    expect(describeEmpty(view(), 0)).toBe('No terminals yet.');
  });
});

describe('grouping and sorting', () => {
  const { app, main, deploys } = sample();
  const rows = createRowSelector()(app);
  const shape = (items: ReturnType<typeof buildItems>): string[] =>
    items.map((i) => (i.kind === 'row' ? i.row.session.name : i.kind === 'group' ? `[${i.title} ${i.count}${i.waiting ? ` !${i.waiting}` : ''}${i.collapsed ? ' folded' : ''}]` : `(${i.title})`));

  it('groups by canvas in tab order, frames as sub-headings, parked last', () => {
    expect(shape(buildItems(rows, view()))).toEqual(['[Main 3 !1]', '(Backend)', 'api', 'db', 'web', '[Deploys 1]', 'builder', '[Parked 1]', 'old']);
  });

  it('leaves the canvas heading out when only one canvas is in scope', () => {
    const scoped = view({ filters: [SCOPE_FILTER] });
    expect(shape(buildItems(filterRows(rows, scoped, main.id), scoped))).toEqual(['(Backend)', 'api', 'db', 'web', '[Parked 1]', 'old']);
  });

  it('folds a group away, keeping its heading and counts', () => {
    const folded = view({ collapsedGroups: [main.id, 'parked'] });
    expect(shape(buildItems(rows, folded))).toEqual(['[Main 3 !1 folded]', '[Deploys 1]', 'builder', '[Parked 1 folded]']);
  });

  it('shows only groups that still have rows after filtering', () => {
    const filtered = view({ filters: ['busy'] });
    expect(shape(buildItems(filterRows(rows, filtered, main.id), filtered))).toEqual(['[Main 1]', '(Backend)', 'api']);
  });

  it('lists flat, in the chosen order', () => {
    expect(shape(buildItems(rows, view({ grouping: 'flat' })))).toEqual(['api', 'db', 'web', 'builder', 'old']);
    expect(names(sortRows(rows, 'name'))).toEqual(['api', 'builder', 'db', 'old', 'web']);
    expect(names(sortRows(rows, 'updated'))).toEqual(['builder', 'api', 'db', 'web', 'old']);
    expect(names(sortRows(rows, 'typed'))).toEqual(['web', 'api', 'db', 'builder', 'old']);
    expect(shape(buildItems(rows, view({ grouping: 'flat', sort: 'name' })))).toEqual(['api', 'builder', 'db', 'old', 'web']);
  });

  it('gives Tab the rows on show that are on a canvas, in the order drawn', () => {
    const order = (v: ListView, canvas = main.id): string[] => {
      const items = buildItems(filterRows(rows, v, canvas), v);
      return navigationOrder(items).map((step) => names(rows.filter((r) => r.session.id === step.sessionId))[0]!);
    };
    expect(order(view({ filters: [SCOPE_FILTER] }))).toEqual(['api', 'db', 'web']);
    expect(order(view())).toEqual(['api', 'db', 'web', 'builder']);
    expect(order(view({ filters: [SCOPE_FILTER] }), deploys.id)).toEqual(['builder']);
    expect(order(view({ collapsedGroups: [main.id] }))).toEqual(['builder']);
    expect(order(view({ grouping: 'flat', sort: 'name' }))).toEqual(['api', 'builder', 'db', 'web']);
    expect(order(view({ filters: ['parked'] }))).toEqual([]);
    const items = buildItems(rows, view());
    expect(navigationOrder(items).at(-1)?.canvasId).toBe(deploys.id);
  });

  it('counts rows by state', () => {
    expect(stateCounts(rows)).toEqual({ waiting: 1, processing: 1, unread: 1, failed: 1, idle: 1, ended: 0 });
  });
});

describe('a saved view', () => {
  it('is read back, and anything odd in it falls to the default', () => {
    expect(parseView(null)).toEqual(DEFAULT_VIEW);
    expect(parseView('nonsense')).toEqual(DEFAULT_VIEW);
    expect(parseView({ filters: ['waiting', 'text'], text: 7, tags: ['a'], grouping: 'flat', sort: 'sideways', collapsedGroups: 'x', density: 'compact' })).toEqual({
      filters: ['waiting'],
      text: '',
      tags: ['a'],
      grouping: 'flat',
      sort: 'canvas',
      collapsedGroups: [],
      density: 'compact',
    });
    // The default looks at this canvas only.
    expect(DEFAULT_VIEW.filters).toEqual([SCOPE_FILTER]);
  });
});

describe('drawing only what is in view', () => {
  const { app } = sample();
  const items = buildItems(createRowSelector()(app), view());

  it('knows where each item starts', () => {
    const { tops, total } = measureItems(items, 'comfortable');
    expect(tops.slice(0, 4)).toEqual([0, GROUP_HEIGHT, GROUP_HEIGHT + FRAME_HEIGHT, GROUP_HEIGHT + FRAME_HEIGHT + ROW_HEIGHT.comfortable]);
    expect(total).toBe(3 * GROUP_HEIGHT + FRAME_HEIGHT + 5 * ROW_HEIGHT.comfortable);
    expect(measureItems(items, 'compact').total).toBeLessThan(total);
    expect(measureItems([], 'compact')).toEqual({ tops: [], total: 0 });
  });

  it('picks the items that touch the visible strip, with a few either side', () => {
    const tops = Array.from({ length: 1000 }, (_, i) => i * 40);
    expect(visibleRange(tops, 40_000, 0, 400, 0)).toEqual([0, 10]);
    expect(visibleRange(tops, 40_000, 4000, 400, 0)).toEqual([100, 110]);
    expect(visibleRange(tops, 40_000, 4010, 400, 0)).toEqual([100, 111]);
    expect(visibleRange(tops, 40_000, 4000, 400, 5)).toEqual([95, 115]);
    expect(visibleRange(tops, 40_000, 999_999, 400, 0)).toEqual([990, 1000]);
    expect(visibleRange(tops, 40_000, -50, 400, 0)).toEqual([0, 10]);
    expect(visibleRange([], 0, 0, 400)).toEqual([0, 0]);
  });
});

describe('a thousand sessions', () => {
  const base = createInitialState(new Date(at));
  const canvases = Array.from({ length: 10 }, (_, c) => (c === 0 ? base.canvases[0]! : newCanvas(base.projects[0]!.id, `Canvas ${c + 1}`, c, new Date(at))));
  const sessions: Session[] = [];
  const big: AppState = {
    ...base,
    canvases: canvases.map((canvas, c) => {
      const nodes: LayoutNode[] = [];
      for (let i = 0; i < 100; i++) {
        const s = session(`s-${c}-${i}`, { tags: i % 10 === 0 ? ['tenth'] : [], status: { ...NO_STATUS, state: i % 7 === 0 ? 'busy' : 'idle' } });
        sessions.push(s);
        nodes.push(node(s, (i % 10) * 120, Math.floor(i / 10) * 80));
      }
      return { ...canvas, layout: { frames: [], nodes } };
    }),
    sessions,
  };

  it('are listed, filtered and grouped quickly, and only a screenful is drawn', () => {
    const select = createRowSelector();
    const started = performance.now();
    const rows = select(big);
    const all = view();
    const items = buildItems(filterRows(rows, all, canvases[0]!.id), all);
    const { tops, total } = measureItems(items, 'comfortable');
    const [from, to] = visibleRange(tops, total, total / 2, 800);
    const elapsed = performance.now() - started;

    expect(rows).toHaveLength(1000);
    expect(items).toHaveLength(1010);
    expect(to - from).toBeLessThanOrEqual(Math.ceil(800 / GROUP_HEIGHT) + 13);
    expect(to - from).toBeGreaterThan(10);
    // Generous: this takes a few milliseconds; the limit only catches something going badly wrong.
    expect(elapsed).toBeLessThan(250);
    expect(names(filterRows(rows, view({ tags: ['tenth'] }), null))).toHaveLength(100);
    expect(filterRows(rows, view({ filters: ['busy'], text: 's-3-' }), null)).toHaveLength(15);
  });

  it('touch one row when one session changes', () => {
    const select = createRowSelector();
    const before = select(big);
    const changed = sessions[517]!;
    const again = performance.now();
    const after = select(applyEvent(big, { type: 'session.times', sessionId: changed.id, lastOutputAt: '2026-01-01T02:00:00.000Z' }));
    expect(performance.now() - again).toBeLessThan(100);
    expect(after.filter((row, i) => row !== before[i])).toHaveLength(1);
    expect(after[517]?.session.id).toBe(changed.id);
  });
});

describe('ago', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');
  it('says how long ago in a few characters', () => {
    expect(ago(null, now)).toBe('');
    expect(ago('2026-01-01T11:59:58.000Z', now)).toBe('now');
    expect(ago('2026-01-01T11:59:48.000Z', now)).toBe('12s');
    expect(ago('2026-01-01T11:56:00.000Z', now)).toBe('4m');
    expect(ago('2026-01-01T09:00:00.000Z', now)).toBe('3h');
    expect(ago('2025-12-30T12:00:00.000Z', now)).toBe('2d');
    // A clock that is slightly ahead never shows a negative time.
    expect(ago('2026-01-01T12:00:03.000Z', now)).toBe('now');
  });
});

describe('the one mark of a terminal', () => {
  it('is coloured by what the terminal is doing, and hollow when it is put away or over', () => {
    expect(dotTone(session('a'))).toBe('ordinary');
    expect(dotTone(session('a'), true)).toBe('hollow');
    expect(dotTone(session('a', { state: 'exited' }))).toBe('hollow');
    expect(dotTone(session('a', { status: { ...NO_STATUS, state: 'busy' } }))).toBe('working');
    expect(dotTone(session('a', { status: { ...NO_STATUS, unread: true } }))).toBe('unread');
    expect(dotTone(session('a', { status: { ...NO_STATUS, state: 'idle', lastExit: 3 } }))).toBe('failed');
    expect(dotTone(session('a', { attention: { ...NO_ATTENTION, state: 'waiting' } }))).toBe('waiting');
    // Finished is not waiting: it has a colour of its own.
    expect(dotTone(session('a', { attention: { ...NO_ATTENTION, state: 'done' } }))).toBe('finished');
    // A parked terminal that waits still says so.
    expect(dotTone(session('a', { attention: { ...NO_ATTENTION, state: 'waiting' } }), true)).toBe('waiting');
  });
});

describe('what a terminal runs, in short', () => {
  it('is the program and the last part of the first path, never a quoted absolute path', () => {
    expect(shortCommand(null)).toBe('');
    expect(shortCommand('zsh')).toBe('zsh');
    expect(shortCommand("sh '/work/made up/demo/demo-agent.sh' fixing")).toBe('sh demo-agent.sh');
    expect(shortCommand('/usr/local/bin/node --inspect "/work/app/server.js"')).toBe('node server.js');
    expect(shortCommand('npm test')).toBe('npm test');
    expect(shortCommand('git status --short')).toBe('git status');
    expect(shortCommand('sleep 5; exit 3')).toBe('sleep 5');
    expect(shortCommand(`x ${'y'.repeat(80)}`).length).toBe(40);
  });
});
