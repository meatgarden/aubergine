import { describe, expect, it } from 'vitest';
import type { OutsideTerminal } from '@aubergine/shared';
import { commandsFor, formatAgents, formatOutside, normaliseTty, toShells } from './outside';

const terminal = (tty: string, kind: OutsideTerminal['kind'], extra: Partial<OutsideTerminal> = {}): OutsideTerminal => ({
  tty,
  pid: 100,
  cwd: '/Users/me/work/api',
  kind,
  running: kind === 'shell' ? null : 'something',
  runningPid: kind === 'shell' ? null : 200,
  agent: null,
  ...extra,
});

const terminals = [
  terminal('ttys001', 'shell', { cwd: '/Users/me' }),
  terminal('ttys002', 'command', { running: 'npm run dev' }),
  terminal('ttys003', 'agent', { agent: { known: true, name: 'fix the build', status: 'idle' } }),
  terminal('ttys004', 'agent', { agent: { known: true, name: null, status: 'busy' } }),
  terminal('ttys005', 'agent', { agent: { known: false, name: null, status: null } }),
  terminal('ttys006', 'view'),
];

describe('scan output', () => {
  it('shows each terminal by the name the other commands take', () => {
    const lines = formatOutside(terminals, 'ttys001').split('\n');
    expect(lines[0]).toMatch(/^TERMINAL\s+RUNNING\s+FOLDER$/);
    expect(lines[1]).toMatch(/^ttys001 \(this one\)\s+-\s+\/Users\/me$/);
    expect(lines[2]).toMatch(/^ttys002\s+npm run dev\s+/);
    expect(lines[3]).toMatch(/^ttys003\s+Claude Code \(idle\)/);
    expect(lines[5]).toMatch(/^ttys005\s+Claude Code \(state unknown\)/);
    expect(lines[6]).toMatch(/^ttys006\s+a view of an Aubergine session/);
    expect(formatOutside([], null)).toBe('No open terminals found outside Aubergine.');
  });

  it('prints a ready-to-copy command for each row', () => {
    const lines = commandsFor(terminals, 'all').map((line) => line.split('#')[0]?.trim());
    expect(lines).toEqual([
      'aubergine import ttys001',
      'aubergine import ttys002',
      'aubergine move ttys003',
      'aubergine move ttys003 --stop',
      'aubergine move ttys004', // busy: no --stop offered
      'aubergine move ttys005', // unreadable record: no --stop offered
    ]);
  });
});

describe('move output', () => {
  it('lists agent tabs only, with state and conversation', () => {
    const lines = formatAgents(terminals).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^ttys003\s+idle\s+fix the build\s+\/Users\/me\/work\/api$/);
    expect(lines[2]).toMatch(/^ttys004\s+busy\s+\(unnamed\)/);
    expect(lines[3]).toMatch(/^ttys005\s+unknown\s+\(not readable\)/);
    expect(formatAgents([terminals[0]!])).toBe('No Claude Code tabs found outside Aubergine.');
    expect(commandsFor(terminals, 'agents').every((line) => line.startsWith('aubergine move '))).toBe(true);
  });
});

describe('helpers', () => {
  it('turns the listing into what the import planner works on', () => {
    const shells = toShells(terminals, 'ttys002');
    expect(shells[1]).toMatchObject({ tty: 'ttys002', current: true, running: 'npm run dev', looksLikeClaude: false });
    expect(shells[2]).toMatchObject({ looksLikeClaude: true });
    expect(shells[5]).toMatchObject({ viewingAubergine: true });
  });

  it('accepts terminal names with or without /dev/', () => {
    expect(normaliseTty('/dev/ttys004')).toBe('ttys004');
    expect(normaliseTty('ttys004')).toBe('ttys004');
  });
});
