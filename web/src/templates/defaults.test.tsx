import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NO_ATTENTION, NO_STATUS, createInitialState, templateParts, type AppState, type LayoutNode, type Session } from '@aubergine/shared';
import { RowSays, TitleSays, drawnParts, templateOf } from './TemplateSays';
import { useApp } from '../store';
import { createRowSelector } from '../terminal-rows';

/**
 * What a terminal's title and its row say after the name, for terminals in many states. The expected markup was
 * taken from the page as it was before templates; the default templates must draw exactly that. Two empty elements
 * are not drawn any more, as a placeholder with nothing to say is not: the line of what runs in a title where nothing
 * is known of it (a terminal with neither folder nor command), and the box of a row's tags where it has none, which
 * was never seen.
 */

const NOW = Date.parse('2026-03-01T12:00:00.000Z');
const at = (secondsAgo: number): string => new Date(NOW - secondsAgo * 1000).toISOString();
let n = 0;
const id = (): string => `0190c2a4-0000-7000-8000-${String((n += 1)).padStart(12, '0')}`;

function session(name: string, extra: Partial<Session> = {}): Session {
  return {
    id: id(),
    projectId: 'project',
    name,
    createdAt: at(3600),
    state: 'open',
    cwd: `/work/made-up/${name}`,
    command: 'zsh',
    note: '',
    status: NO_STATUS,
    attention: NO_ATTENTION,
    noteLog: [],
    agent: null,
    parkedFrom: null,
    peopleOnly: false,
    typedBy: null,
    recap: null,
    takesMessages: false,
    theme: null,
    untold: null,
    messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null },
    links: [],
    written: {},
    suggested: {},
    found: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [],
    fields: [],
    ...extra,
  };
}

const link = (url: string, kind: Session['links'][number]['kind'], label: string): Session['links'][number] => ({ id: id(), url, kind, label, at: at(10) }) as Session['links'][number];

export const SAMPLES: Session[] = [
  session('plain'),
  session('no-folder', { cwd: null, command: null }),
  session('busy', { status: { ...NO_STATUS, state: 'busy', commandLine: "sh '/work/made up/demo-agent.sh' --fast", startedAt: at(90) }, lastOutputAt: at(3) }),
  session('waiting', { attention: { state: 'waiting', message: 'May I push?', at: at(20) }, tags: ['backend', 'api'], peopleOnly: true, lastInputAt: at(400), lastOutputAt: at(100) }),
  session('done', { attention: { state: 'done', message: 'It finished.', at: at(20) }, status: { ...NO_STATUS, state: 'idle', lastExit: 2, lastFinishedAt: at(30) }, messages: { unread: 2, from: null, forOwner: 1, paused: 0, at: at(5) }, untold: { what: 'kickoff', why: 'at-shell', at: at(60) } }),
  session('failed', { status: { ...NO_STATUS, state: 'idle', lastExit: 1, lastFinishedAt: at(30) }, tags: ['one'] }),
  session('working', { attention: { state: 'working', message: null, at: at(5) }, agent: { kind: 'claude-code', conversationId: null, program: 'claude' } }),
  session('ended', { state: 'exited', meantFor: { agent: 'claude-code' } as Session['meantFor'], tags: ['x'] }),
  session('parked', { state: 'parked', typedBy: { name: 'robot', at: at(200) } }),
  session('typed', {
    typedBy: { name: 'robot', at: at(10) },
    outsideViewers: 1,
    agent: { kind: 'claude-code', conversationId: '11111111-2222-4333-8444-555555555555', program: 'claude' },
    status: { ...NO_STATUS, state: 'idle', lastExit: 0, lastFinishedAt: at(30) },
    links: [link('https://github.com/acme/app/pull/12', 'pull-request', 'PR 12'), link('https://example.com/a', 'link', 'a'), link('https://linear.app/acme/issue/AB-1', 'ticket', 'AB-1'), link('https://example.com/b', 'link', 'b')],
    lastInputAt: at(10),
  }),
];

function app(): AppState {
  const base = createInitialState(new Date(NOW));
  const main = base.canvases[0]!;
  const nodes: LayoutNode[] = SAMPLES.filter((s) => s.state !== 'parked').map((s, i) => ({ id: id(), sessionId: s.id, x: 0, y: i * 400, width: 600, height: 300, color: i % 2 ? 'blue' : 'none' }));
  return { ...base, sessions: SAMPLES.map((s) => ({ ...s, projectId: base.projects[0]!.id })), canvases: [{ ...main, layout: { frames: [], nodes } }] };
}

/** Drawn to a string, the store is read as it was made (the snapshot for a server): both are changed alike. */
function put(change: Partial<ReturnType<typeof useApp.getState>>): void {
  useApp.setState(change);
  Object.assign(useApp.getInitialState(), change);
}

beforeAll(() => {
  // What a tooltip asks of the window, to know the keys: a browser tab.
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const state = app();
  put({ app: state, whole: state, canvasId: state.canvases[0]!.id });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the default templates', () => {
  const rows = (): ReturnType<ReturnType<typeof createRowSelector>> => createRowSelector()(useApp.getState().app!);
  it('draw in a title what was drawn before templates', () => {
    const out = Object.fromEntries(useApp.getState().app!.sessions.map((s) => [s.name, renderToStaticMarkup(<TitleSays session={s} />)]));
    expect(out).toMatchSnapshot();
  });
  it('draw on a row what was drawn before templates', () => {
    const out = Object.fromEntries(rows().map((row) => [row.session.name, renderToStaticMarkup(<RowSays row={row} now={NOW} onTag={() => {}} />)]));
    expect(out).toMatchSnapshot();
  });
  it('draw on a compact row what was drawn before templates', () => {
    const out = Object.fromEntries(rows().map((row) => [row.session.name, renderToStaticMarkup(<RowSays row={row} now={NOW} onTag={() => {}} compact />)]));
    expect(out).toMatchSnapshot();
  });
});

describe('a template of the owner’s', () => {
  const row = (name: string) => createRowSelector()(useApp.getState().app!).find((r) => r.session.name === name)!;
  const rowHtml = (name: string, text: string): string => renderToStaticMarkup(<RowSays row={row(name)} now={NOW} onTag={() => {}} template={templateOf(text, 'row')} />);
  const titleHtml = (name: string, text: string, standalone = false): string => renderToStaticMarkup(<TitleSays session={row(name).session} template={templateOf(text, 'title')} standalone={standalone} />);

  it('draws text as text between the pieces, and leaves out what hangs from a placeholder with nothing to say', () => {
    expect(rowHtml('waiting', '{state} · {step} · {folder}')).toBe(
      '<span class="list-said is-attention list-badge" data-testid="list-badge" data-tone="waiting" title="May I push?">waiting for you</span><span class="template-text"> · </span><span class="list-words" title="/work/made-up/waiting" data-testid="template-words">…/made-up/waiting</span>',
    );
    expect(rowHtml('plain', '{state} · {folder}')).toBe('<span class="list-words" title="/work/made-up/plain" data-testid="template-words">…/made-up/plain</span>');
    expect(rowHtml('plain', '[{state}]')).toBe('');
  });

  it('draws markup written in a template as text', () => {
    expect(rowHtml('plain', '<b>{folder}</b>')).toContain('<span class="template-text">&lt;b&gt;</span>');
  });

  it('draws a field by its label, whatever the capitals, with an address in it as a chip', () => {
    const app = useApp.getState().app!;
    const fields = [{ label: 'Ticket', value: 'see https://linear.app/acme/issue/AB-7 now', source: 'owner' as const }];
    const changed = { ...app, sessions: app.sessions.map((s) => (s.name === 'plain' ? { ...s, fields } : s)) };
    put({ app: changed, whole: changed });
    const html = rowHtml('plain', 'T {field:ticket}');
    expect(html).toContain('data-testid="template-field" data-label="Ticket"');
    expect(html).toContain('data-testid="inline-link"');
    expect(html).toContain('<span class="template-text">T </span>');
    expect(rowHtml('plain', 'T {field:Other}')).toBe('');
    put({ app, whole: app });
  });

  it('says the canvas, the project, the agent and the command, each as words', () => {
    expect(rowHtml('working', '{canvas} {project} {agent} {command}')).toBe(
      '<span class="list-words" data-testid="template-words">Main</span><span class="list-words" data-testid="template-words">Default</span><span class="list-words" title="The agent on record in this terminal" data-testid="template-words">claude</span><span class="list-words" data-testid="template-words">zsh</span>',
    );
    expect(titleHtml('busy', '{command}')).toBe('<span class="node-words" title="sh &#x27;/work/made up/demo-agent.sh&#x27; --fast" data-testid="template-words">sh demo-agent.sh</span>');
  });

  it('leaves out of a terminal in a tab of its own what is pressed for one of the canvas’s screens, and says its tags', () => {
    const standalone = titleHtml('done', '{messages} {tags} {exit}', true);
    expect(standalone).not.toContain('message-mark');
    expect(titleHtml('waiting', '{tags}', true)).toBe('<span class="ui-chip" title="Tags: backend, api" data-testid="node-tags">#backend +1</span>');
  });

  it('draws a template of 200 characters, and a compact row says its state alone', () => {
    const long = '{state} · {folder} · {time} · {canvas} · '.repeat(5).slice(0, 200);
    expect(templateOf(long, 'row').problems.length).toBeLessThanOrEqual(1);
    expect(rowHtml('waiting', long)).toContain('waiting for you');
    expect(renderToStaticMarkup(<RowSays row={row('waiting')} now={NOW} onTag={() => {}} compact template={templateOf('{folder} {state} {time}', 'row')} />)).toBe(
      '<span class="list-said is-attention list-badge" data-testid="list-badge" data-tone="waiting" title="May I push?">waiting for you</span>',
    );
  });

  it('has a drawing for every placeholder registered', () => {
    expect(drawnParts()).toEqual(templateParts().map((part) => part.name));
  });

  it('is read once for each text, not once a row', () => {
    expect(templateOf('{state} {time}', 'row')).toBe(templateOf('{state} {time}', 'row'));
  });
});
