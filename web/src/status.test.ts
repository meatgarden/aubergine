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
  agent: null,
  parkedFrom: null, peopleOnly: false, typedBy: null,
    recap: null, takesMessages: false, theme: null, untold: null, messages: { unread: 0, from: null, forOwner: 0, paused: 0, at: null }, links: [], written: {}, suggested: {}, found: null,
    lastInputAt: null,
    lastOutputAt: null,
    tags: [], fields: [],
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
  it('says what runs in short while busy, and the whole line to whoever asks', () => {
    const session = { ...base, command: 'node', status: { ...NO_STATUS, state: 'busy' as const, commandLine: "sh '/work/made up/demo-agent.sh' --fast" } };
    expect(describeStatus(session).text).toBe('sh demo-agent.sh');
    expect(describeStatus(session).title).toContain("sh '/work/made up/demo-agent.sh' --fast");
  });

  it('shows the foreground program and folder otherwise', () => {
    expect(describeStatus(base).text).toBe('zsh · …/work/api');
    const idle = { ...base, status: { ...NO_STATUS, state: 'idle' as const, lastExit: 2, lastFinishedAt: '2026-01-01T00:00:00.000Z' } };
    expect(describeStatus(idle).title).toContain('exit code 2');
  });
});
