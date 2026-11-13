import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClaudeSession } from './claude-sessions';
import { describeItem, findCandidates, formatCandidates, planMove, stopAgent, systemProcesses, type ProcessControl } from './move';
import type { ScannedShell } from './shells';

const ID_A = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
const ID_B = '0190bbbb-cccc-7ddd-8eee-ffffffffffff';

function shell(tty: string, extra: Partial<ScannedShell> = {}): ScannedShell {
  return {
    tty,
    pid: 100,
    cwd: '/Users/me/work/api',
    running: 'claude',
    runningPid: 200,
    looksLikeClaude: true,
    viewingAubergine: false,
    current: false,
    ...extra,
  };
}

function record(pid: number, extra: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    pid,
    conversationId: ID_A,
    cwd: '/Users/me/work/api',
    status: 'idle',
    entrypoint: 'cli',
    name: 'fix the build',
    processStart: new Date('2026-11-10T17:41:56Z'),
    ...extra,
  };
}

const shells = [
  shell('ttys001', { runningPid: 201 }),
  shell('ttys002', { runningPid: 202, cwd: '/Users/me/work/web' }),
  shell('ttys003', { runningPid: 203 }),
  shell('ttys004', { runningPid: 204 }),
  shell('ttys005', { running: 'npm run dev', runningPid: 205, looksLikeClaude: false }),
  shell('ttys006', { running: null, runningPid: null, looksLikeClaude: false }),
];
const records = new Map([
  [201, record(201)],
  [202, record(202, { conversationId: ID_B, status: 'busy', cwd: '/Users/me/work/web', name: null })],
  // Started by another program, not by a person at a command line.
  [203, record(203, { entrypoint: 'claude-desktop' })],
  // 204 has no readable record.
]);
const candidates = findCandidates(shells, records);

describe('findCandidates', () => {
  it('takes agent tabs started from a command line, with or without a readable record', () => {
    expect(candidates.map((c) => [c.shell.tty, c.pid, c.session?.conversationId ?? null])).toEqual([
      ['ttys001', 201, ID_A],
      ['ttys002', 202, ID_B],
      ['ttys004', 204, null],
    ]);
  });

  it('lists them with state, conversation and folder', () => {
    const lines = formatCandidates(candidates).split('\n');
    expect(lines[0]).toMatch(/^TERMINAL\s+STATE\s+CONVERSATION\s+FOLDER$/);
    expect(lines[1]).toMatch(/^ttys001\s+idle\s+fix the build\s+\/Users\/me\/work\/api$/);
    expect(lines[2]).toMatch(/^ttys002\s+busy\s+0190bbbb\s+\/Users\/me\/work\/web$/);
    expect(lines[3]).toMatch(/^ttys004\s+unknown\s+\(not readable\)/);
    expect(formatCandidates([])).toBe('No Claude Code tabs found outside Aubergine.');
  });
});

describe('planMove', () => {
  it('by default starts a copy of each chosen conversation and leaves the originals alone', () => {
    const plan = planMove(candidates, { select: 'all', mode: 'fork', force: false });
    expect(plan.items.map((i) => [i.candidate.shell.tty, i.action, 'agentArgs' in i ? i.agentArgs : null])).toEqual([
      ['ttys001', 'fork', ['--resume', ID_A, '--fork-session']],
      ['ttys002', 'fork', ['--resume', ID_B, '--fork-session']],
      ['ttys004', 'continue', ['--continue']],
    ]);
    expect(describeItem(plan.items[2]!)).toContain('could not be read');
  });

  it('moves only the terminals that were named, and says which names matched nothing', () => {
    const plan = planMove(candidates, { select: ['/dev/ttys002', 'ttys099', 'ttys005'], mode: 'fork', force: false });
    expect(plan.items.map((i) => i.candidate.shell.tty)).toEqual(['ttys002']);
    // ttys005 is a terminal, but not one running an agent.
    expect(plan.unknown).toEqual(['ttys099', 'ttys005']);
  });

  it('with stop, resumes the same conversation, and only for an idle agent', () => {
    const plan = planMove(candidates, { select: 'all', mode: 'stop', force: false });
    expect(plan.items.map((i) => [i.candidate.shell.tty, i.action])).toEqual([
      ['ttys001', 'resume'],
      ['ttys002', 'refuse'],
      ['ttys004', 'refuse'],
    ]);
    expect(plan.items[0]).toMatchObject({ agentArgs: ['--resume', ID_A] });
    expect(describeItem(plan.items[1]!)).toContain('busy, not idle');
    expect(describeItem(plan.items[2]!)).toContain('could not be read');
  });

  it('stops a busy agent only when forced, and never one it cannot identify', () => {
    const plan = planMove(candidates, { select: 'all', mode: 'stop', force: true });
    expect(plan.items.map((i) => i.action)).toEqual(['resume', 'resume', 'refuse']);
    const noStart = findCandidates([shells[0]!], new Map([[201, record(201, { processStart: null })]]));
    expect(planMove(noStart, { select: 'all', mode: 'stop', force: true }).items[0]?.action).toBe('refuse');
  });
});

describe('stopAgent, with a pretend process table', () => {
  const session = record(201);
  const started = session.processStart;

  function control(behaviour: { exitsAfterChecks: number | null; args?: string; started?: Date | null }) {
    const sent: number[] = [];
    let checks = 0;
    const fake: ProcessControl = {
      startOf: async () => {
        if (sent.length > 0) checks += 1;
        if (behaviour.exitsAfterChecks !== null && sent.length > 0 && checks > behaviour.exitsAfterChecks) return null;
        return { started: behaviour.started === undefined ? started : behaviour.started, args: behaviour.args ?? 'claude' };
      },
      terminate: (pid) => {
        sent.push(pid);
      },
      wait: async () => {},
    };
    return { fake, sent };
  }

  it('asks once, and reports that the process went away', async () => {
    const { fake, sent } = control({ exitsAfterChecks: 2 });
    expect(await stopAgent(session, fake, 5000)).toBe('stopped');
    expect(sent).toEqual([201]);
  });

  it('reports a process that does not exit, without asking again or forcing it', async () => {
    const { fake, sent } = control({ exitsAfterChecks: null });
    expect(await stopAgent(session, fake, 0)).toBe('still-running');
    expect(sent).toEqual([201]);
  });

  it('sends nothing when the process ID now belongs to something else', async () => {
    for (const behaviour of [
      { exitsAfterChecks: null, started: new Date('2026-11-12T00:00:00Z') }, // the ID was reused
      { exitsAfterChecks: null, args: 'vim notes.md' }, // same start, but not the agent
      { exitsAfterChecks: null, started: null },
    ]) {
      const { fake, sent } = control(behaviour);
      expect(await stopAgent(session, fake, 0)).toBe('not-the-same-process');
      expect(sent).toEqual([]);
    }
  });
});

// Real processes, started here and belonging to this test. No real agent is involved.
describe('stopAgent, with a stand-in process', () => {
  const children: ChildProcess[] = [];
  let dir = '';

  afterEach(async () => {
    for (const child of children.splice(0)) child.kill('SIGKILL'); // ours to clean up
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  /** Starts a script named `claude` that behaves like an idle agent: it waits, and on a termination request does what `onTerm` says. */
  async function standIn(onTerm: 'exit' | 'ignore'): Promise<ClaudeSession> {
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-standin-'));
    const script = path.join(dir, 'claude');
    await writeFile(
      script,
      onTerm === 'exit'
        ? "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 200)); setInterval(() => {}, 1000);"
        : "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    );
    const child = spawn(process.execPath, [script], { stdio: 'ignore' });
    children.push(child);
    await sleep(400);
    const now = await systemProcesses.startOf(child.pid!);
    expect(now?.args).toContain(script);
    return record(child.pid!, { processStart: now!.started });
  }

  it('ends a stand-in that exits when asked', async () => {
    const session = await standIn('exit');
    expect(await stopAgent(session, systemProcesses, 8000)).toBe('stopped');
    expect(await systemProcesses.startOf(session.pid)).toBeNull();
  });

  it('leaves a stand-in that will not exit running, and says so', async () => {
    const session = await standIn('ignore');
    expect(await stopAgent(session, systemProcesses, 1200)).toBe('still-running');
    expect(await systemProcesses.startOf(session.pid)).not.toBeNull();
  });

  it('does not signal a process whose start time does not match the record', async () => {
    const session = await standIn('exit');
    const stale = { ...session, processStart: new Date(session.processStart!.getTime() - 3_600_000) };
    expect(await stopAgent(stale, systemProcesses, 1000)).toBe('not-the-same-process');
    await sleep(500);
    expect(await systemProcesses.startOf(session.pid)).not.toBeNull();
  });
});
