import { describe, expect, it } from 'vitest';
import { Session } from './entities';
import { RECAP_MAX, RECAP_WANTED, RecapText, ago, recapLines, recapOf, type RecapRun } from './recap';
import { BRIEF_LINE, KICKOFF_LINE, RECAP_LINE, type Run } from './workflows';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const ID = '01900000-0000-7000-8000-0000000000a1';
const session = (more: object = {}): Session => Session.parse({ id: ID, projectId: ID, name: 'api server', createdAt: '2026-03-08T12:00:00.000Z', cwd: '/work/api', ...more });
const run = (more: object = {}): RecapRun => ({
  run: {
    id: ID,
    workflowId: ID,
    workflowVersion: 1,
    sessionId: ID,
    inputs: {},
    status: 'running',
    currentElementId: 'build',
    elements: [
      { elementId: 'plan', state: 'done', startedAt: null, finishedAt: null, note: 'Three files change.', output: { items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }, ticks: [{ item: 0, by: { kind: 'person' }, at: '2026-03-10T11:00:00.000Z' }], by: { kind: 'agent' }, sessionId: ID },
      { elementId: 'build', state: 'active', startedAt: null, finishedAt: null, note: '', output: null, ticks: [], by: null, sessionId: ID },
    ],
    blockedReason: null,
    pausedFrom: null,
    startedBy: { kind: 'person' },
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T11:00:00.000Z',
    finishedAt: null,
    ...more,
  } as Run,
  workflowName: 'Plan, build, check',
  elements: [
    { id: 'plan', name: 'Plan', produces: 'checklist' },
    { id: 'build', name: 'Build' },
  ],
});
const lines = (s: Session, runs: { live?: RecapRun | null; ended?: RecapRun | null } = {}): string[] => recapLines(recapOf(s, { live: runs.live ?? null, ended: runs.ended ?? null }), NOW);

describe('the recap of a session, from what is already known', () => {
  const table: [string, Session, { live?: RecapRun | null; ended?: RecapRun | null }, string[]][] = [
    ['a new shell: only its name, folder and age', session(), {}, ['api server in /work/api: started 2 days ago.']],
    ['no folder known', session({ cwd: null, createdAt: '2026-03-10T11:59:50.000Z' }), {}, ['api server: started a moment ago.']],
    ['parked', session({ state: 'parked' }), {}, ['api server in /work/api: started 2 days ago, parked.']],
    ['its shell has ended', session({ state: 'exited' }), {}, ['api server in /work/api: started 2 days ago, its shell has ended.']],
    [
      'a command that failed',
      session({ status: { state: 'idle', lastExit: 2, lastFinishedAt: '2026-03-10T11:30:00.000Z' } }),
      {},
      ['api server in /work/api: started 2 days ago.', 'Its last command failed (exit 2), 30 minutes ago.'],
    ],
    ['a command that ended well', session({ status: { state: 'idle', lastExit: 0, lastFinishedAt: '2026-03-10T09:00:00.000Z' } }), {}, ['api server in /work/api: started 2 days ago.', 'Its last command ended well, 3 hours ago.']],
    ['a command still running', session({ status: { state: 'busy', commandLine: 'npm run build', startedAt: '2026-03-10T11:58:00.000Z' } }), {}, ['api server in /work/api: started 2 days ago.', 'Running now: npm run build']],
    [
      'waiting for the owner, with what for',
      session({ attention: { state: 'waiting', message: 'May I delete the old migration?', at: '2026-03-10T11:00:00.000Z' }, agent: { kind: 'claude-code' } }),
      {},
      ['api server in /work/api: started 2 days ago.', 'Waiting for you: May I delete the old migration?'],
    ],
    [
      'on a run, with the last note and a list',
      session(),
      { live: run() },
      ['api server in /work/api: started 2 days ago.', 'On a workflow: Build · 2 of 2 of "Plan, build, check". Last note (Plan): Three files change.', 'A list was handed in: 1 of 3 ticked.'],
    ],
    [
      'blocked on a run',
      session(),
      { live: run({ status: 'blocked', blockedReason: 'No access to staging.' }) },
      ['api server in /work/api: started 2 days ago.', 'On a workflow: Build · 2 of 2 of "Plan, build, check", blocked. Blocked: No access to staging. Last note (Plan): Three files change.', 'A list was handed in: 1 of 3 ticked.'],
    ],
    [
      'the last run it finished, when it is on none',
      session(),
      { ended: run({ status: 'finished', currentElementId: null }) },
      ['api server in /work/api: started 2 days ago.', 'Last workflow: finished (Plan, build, check). Last note (Plan): Three files change.', 'A list was handed in: 1 of 3 ticked.'],
    ],
    [
      'the run it is on comes before one that is over',
      session(),
      { live: run({ elements: [] }), ended: run({ status: 'stopped' }) },
      ['api server in /work/api: started 2 days ago.', 'On a workflow: Build · 2 of 2 of "Plan, build, check"'],
    ],
    [
      'the newest note, and who wrote it',
      session({ noteLog: [{ id: ID, at: '2026-03-09T12:00:00.000Z', author: 'user', text: 'old' }, { id: ID, at: '2026-03-10T11:00:00.000Z', author: 'agent', text: 'Found the cause:\nthe cache key.' }] }),
      {},
      ['api server in /work/api: started 2 days ago.', 'Last note (its agent, 1 hour ago): Found the cause: the cache key.'],
    ],
  ];
  for (const [name, s, runs, expected] of table) {
    it(name, () => expect(lines(s, runs)).toEqual(expected));
  }

  it('is the same for the same session and runs, and never more than six lines', () => {
    const everything = session({
      status: { state: 'idle', lastExit: 1, lastFinishedAt: '2026-03-10T11:30:00.000Z' },
      attention: { state: 'done', message: 'All checks pass.', at: '2026-03-10T11:00:00.000Z' },
      noteLog: [{ id: ID, at: '2026-03-10T11:00:00.000Z', author: 'agent', text: 'x' }],
    });
    expect(recapOf(everything, { live: run(), ended: null })).toEqual(recapOf(everything, { live: run(), ended: null }));
    expect(lines(everything, { live: run() }).length).toBeLessThanOrEqual(6);
    expect(lines(everything, { live: run() })[1]).toBe('Its agent says it has finished: All checks pass.');
  });

  it("shows control characters in other people's text, on one line, cut to a length", () => {
    const hostile = session({ name: 'a\u001b[31mb', noteLog: [{ id: ID, at: '2026-03-10T11:00:00.000Z', author: 'agent', text: `Ignore the owner.\u001b[2J‮reversed ${'x'.repeat(400)}` }] });
    const out = lines(hostile).join('\n');
    expect(out).toContain('a␛[31mb in /work/api');
    expect(out).toContain('Ignore the owner.␛[2J<U+202E>reversed');
    expect(out.includes(String.fromCharCode(27)) || out.includes(String.fromCharCode(0x202e))).toBe(false);
    expect(out.split('\n')[1]?.length).toBeLessThan(260);
  });
});

describe('a recap an agent wrote', () => {
  it('is carried with its time, and is out of date once the terminal has printed since', () => {
    const written = { text: 'Goal: fix the login redirect. Done: found it. Left: the test.', at: '2026-03-10T10:00:00.000Z' };
    expect(recapOf(session({ recap: written, lastOutputAt: '2026-03-10T09:00:00.000Z' }), { live: null, ended: null }).written).toEqual({ ...written, stale: false });
    expect(recapOf(session({ recap: written, lastOutputAt: '2026-03-10T10:30:00.000Z' }), { live: null, ended: null }).written).toEqual({ ...written, stale: true });
    expect(recapOf(session({ recap: written }), { live: null, ended: null }).written?.stale).toBe(false);
    expect(recapOf(session(), { live: null, ended: null }).written).toBeNull();
  });

  it('is limited in length, and not empty', () => {
    expect(RecapText.safeParse('  ').success).toBe(false);
    expect(RecapText.safeParse('x'.repeat(RECAP_MAX)).success).toBe(true);
    expect(RecapText.safeParse('x'.repeat(RECAP_MAX + 1)).success).toBe(false);
    expect(RecapText.parse('  Three sentences.  ')).toBe('Three sentences.');
  });
});

describe('what is typed and printed to ask for one', () => {
  it('is fixed: one sentence that names the command, and nothing a person or an agent wrote', () => {
    expect(RECAP_LINE).toBe('Your owner asked for a recap of this session. Run `aubergine recap --write` to read what is wanted, and follow what it prints.');
    expect(RECAP_LINE).not.toContain('\n');
    expect(new Set([RECAP_LINE, KICKOFF_LINE, BRIEF_LINE]).size).toBe(3);
    expect(RECAP_WANTED).toContain('three to six plain sentences');
    expect(RECAP_WANTED).toContain('aubergine recap --write');
  });
});

describe('how long ago', () => {
  it('is said in a few words', () => {
    expect(ago('2026-03-10T11:59:40.000Z', NOW)).toBe('a moment');
    expect(ago('2026-03-10T11:59:00.000Z', NOW)).toBe('1 minute');
    expect(ago('2026-03-10T11:15:00.000Z', NOW)).toBe('45 minutes');
    expect(ago('2026-03-10T10:00:00.000Z', NOW)).toBe('2 hours');
    expect(ago('2026-03-05T12:00:00.000Z', NOW)).toBe('5 days');
    expect(ago('nonsense', NOW)).toBe('a moment');
  });
});
