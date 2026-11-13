import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type Session } from '@aubergine/shared';
import { findShells, importLayout, looksLikeClaude, parseLsofCwd, parsePs, planImport, programName } from './shells';

// What `ps -axo pid=,ppid=,pgid=,tpgid=,tty=,args=` prints, including processes with no terminal.
const PS = `
    1     0     1     0 ??       /sbin/launchd
 1101  1100  1101  1102 ttys000  login -pf me
 1102  1101  1102  1102 ttys000  -zsh
 1201  1100  1201  1203 ttys001  login -pf me
 1202  1201  1202  1203 ttys001  -zsh
 1203  1202  1203  1203 ttys001  claude
 1204  1203  1203  1203 ttys001  node /opt/tools/helper.js
 1301  1300  1301  1302 ttys003  /bin/zsh
 1302  1301  1302  1302 ttys003  npm run dev --port 3000
 6001  6000  6001  6001 ttys004  -zsh
 7001  7000  7001  7050 ttys005  -zsh
 7050  7001  7050  7050 ttys005  tmux -L aubergine -f /repo/daemon/src/runtime/tmux.conf attach-session -t =0190-abc
 8001  8000  8001  8001 ttys006  /usr/bin/python3 server.py
 9001  9000  9001  9001 ttys023  -zsh
`;

const LSOF = `p1102
fcwd
n/Users/me
p1202
fcwd
n/Users/me/work/api
p1301
fcwd
n/Users/me/work/web site
p7001
fcwd
n/Users/me/work/api
p9001
fcwd
n/Users/me
`;

const options = { aubergineTtys: new Set(['ttys023']), tmuxSocket: 'aubergine', currentTty: 'ttys000' };
const shells = findShells(parsePs(PS), parseLsofCwd(LSOF), options);
const byTty = (tty: string) => shells.find((s) => s.tty === tty);

describe('parsing', () => {
  it('reads processes that have a terminal, with their full command line', () => {
    const processes = parsePs(PS);
    expect(processes).toHaveLength(13);
    expect(processes.find((p) => p.pid === 1302)).toEqual({
      pid: 1302,
      ppid: 1301,
      pgid: 1302,
      tpgid: 1302,
      tty: 'ttys003',
      args: 'npm run dev --port 3000',
    });
  });

  it('reads working folders, including ones with spaces', () => {
    expect(parseLsofCwd(LSOF).get(1301)).toBe('/Users/me/work/web site');
    expect(parseLsofCwd('').size).toBe(0);
  });

  it('names programs and recognises Claude Code', () => {
    expect(programName('-zsh')).toBe('zsh');
    expect(programName('/bin/zsh -l')).toBe('zsh');
    expect(looksLikeClaude('claude')).toBe(true);
    expect(looksLikeClaude('/Users/me/.local/bin/claude --continue')).toBe(true);
    expect(looksLikeClaude('node /opt/claude-tools/other.js')).toBe(false);
    expect(looksLikeClaude('vim notes-about-claude.md')).toBe(false);
  });
});

describe('findShells', () => {
  it('finds one shell per terminal, with its folder', () => {
    expect(shells.map((s) => s.tty)).toEqual(['ttys000', 'ttys001', 'ttys003', 'ttys004', 'ttys005']);
    expect(byTty('ttys003')?.cwd).toBe('/Users/me/work/web site');
  });

  it('tells an idle shell from one running something', () => {
    expect(byTty('ttys000')).toMatchObject({ running: null, current: true });
    expect(byTty('ttys003')).toMatchObject({ running: 'npm run dev --port 3000', looksLikeClaude: false });
    expect(byTty('ttys001')).toMatchObject({ running: 'claude', runningPid: 1203, looksLikeClaude: true });
    expect(byTty('ttys000')?.runningPid).toBeNull();
  });

  it("leaves out Aubergine's own sessions and terminals with no shell, and marks views of a session", () => {
    expect(byTty('ttys023')).toBeUndefined();
    expect(byTty('ttys006')).toBeUndefined();
    expect(byTty('ttys005')?.viewingAubergine).toBe(true);
    expect(byTty('ttys001')?.viewingAubergine).toBe(false);
  });

  it('reports a shell whose folder is unknown', () => {
    expect(byTty('ttys004')?.cwd).toBeNull();
  });

});

function session(cwd: string, state: Session['state'] = 'open'): Session {
  return {
    id: newId(),
    projectId: newId(),
    name: 'x',
    createdAt: '2026-01-01T00:00:00.000Z',
    state,
    cwd,
    command: null,
    note: '',
    status: NO_STATUS,
    attention: NO_ATTENTION,
    noteLog: [],
    agent: null,
  };
}

describe('planImport', () => {
  it('gives each folder one session and says why the rest are skipped', () => {
    const plan = planImport(shells, [], { all: false });
    expect(plan.create.map((i) => [i.shell.tty, i.name])).toEqual([
      ['ttys000', 'me'],
      ['ttys001', 'api'],
      ['ttys003', 'web site'],
    ]);
    expect(plan.skipped.map((s) => [s.shell.tty, s.reason])).toEqual([
      ['ttys004', 'its folder could not be read'],
      ['ttys005', 'already a view of an Aubergine session'],
    ]);
  });

  it('skips folders that already have a session, unless told to import all', () => {
    const existing = [session('/Users/me/work/api'), session('/Users/me', 'exited')];
    const plan = planImport(shells, existing, { all: false });
    expect(plan.create.map((i) => i.shell.tty)).toEqual(['ttys000', 'ttys003']);
    expect(plan.skipped.find((s) => s.shell.tty === 'ttys001')?.reason).toContain('already has a session');
    expect(planImport(shells, existing, { all: true }).create.map((i) => i.shell.tty)).toEqual(['ttys000', 'ttys001', 'ttys003']);
  });

  it('when tabs share a folder, keeps the one running an agent over an idle one', () => {
    const idle = { ...byTty('ttys000')!, tty: 'ttys010', cwd: '/Users/me/work/api', current: false };
    const plan = planImport([idle, ...shells], [], { all: false });
    expect(plan.create.find((i) => i.cwd === '/Users/me/work/api')?.shell.tty).toBe('ttys001');
    expect(plan.skipped.map((s) => s.shell.tty)).toContain('ttys010');
  });
});

describe('importLayout', () => {
  it('lays new nodes out in a grid inside a frame, clear of what is already there', () => {
    const existing = [{ x: 0, y: 100, width: 720, height: 440 }];
    const { frame, nodes } = importLayout(5, existing);
    expect(nodes).toHaveLength(5);
    expect(frame.x).toBeGreaterThan(720);
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(frame.x);
      expect(node.y).toBeGreaterThanOrEqual(frame.y);
      expect(node.x + node.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(node.y + node.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
    const overlap = nodes.some((a, i) => nodes.some((b, j) => i < j && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
    expect(overlap).toBe(false);
    expect(importLayout(1, []).frame).toMatchObject({ x: 0, y: 0 });
  });
});
