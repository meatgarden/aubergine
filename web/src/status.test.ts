import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type Session } from '@aubergine/shared';
import { describeStatus, timeAgo } from './StatusBadges';

const base: Session = {
  id: newId(),
  projectId: newId(),
  name: 'build',
  createdAt: '2026-01-01T00:00:00.000Z',
  state: 'open',
  cwd: '/home/u/work/api',
  command: 'zsh',
  note: '',
  status: NO_STATUS,
  attention: NO_ATTENTION,
  noteLog: [],
};

describe('timeAgo', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  it('uses the largest sensible unit', () => {
    expect(timeAgo('2026-01-01T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-01-01T11:57:00Z', now)).toBe('3m ago');
    expect(timeAgo('2026-01-01T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2025-12-30T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo(null, now)).toBe('');
  });
});

describe('describeStatus', () => {
  it('shows the full command line while busy', () => {
    const session = { ...base, command: 'node', status: { ...NO_STATUS, state: 'busy' as const, commandLine: 'pnpm test --watch' } };
    expect(describeStatus(session).text).toBe('pnpm test --watch · …/work/api');
  });

  it('shows the foreground program and folder otherwise', () => {
    expect(describeStatus(base).text).toBe('zsh · …/work/api');
    const idle = { ...base, status: { ...NO_STATUS, state: 'idle' as const, lastExit: 2, lastFinishedAt: '2026-01-01T00:00:00.000Z' } };
    expect(describeStatus(idle).title).toContain('exit code 2');
  });
});
