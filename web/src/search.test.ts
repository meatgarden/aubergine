import { describe, expect, it } from 'vitest';
import { NO_ATTENTION, NO_STATUS, newId, type Session } from '@aubergine/shared';
import { searchSessions, shortFolder } from './search';

function session(name: string, extra: Partial<Session> = {}): Session {
  return {
    id: newId(),
    projectId: newId(),
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    state: 'open',
    cwd: null,
    command: null,
    note: '',
    status: NO_STATUS,
    attention: NO_ATTENTION,
    noteLog: [],
    ...extra,
  };
}

const sessions = [
  session('api server', { cwd: '/home/u/work/api', command: 'node' }),
  session('scratch', { cwd: '/home/u/work/billing', command: 'zsh' }),
  session('Terminal 3', { note: '# Fixing the billing bug\nretry logic in invoices' }),
  session('billing deploy', { state: 'parked' }),
];

describe('searchSessions', () => {
  it('lists everything for an empty query', () => {
    expect(searchSessions(sessions, '  ').map((m) => m.session.name)).toEqual(sessions.map((s) => s.name));
  });

  it('finds sessions by name, folder, command and note text, names first', () => {
    const found = searchSessions(sessions, 'billing');
    expect(found.map((m) => [m.session.name, m.field])).toEqual([
      ['billing deploy', 'name'],
      ['scratch', 'folder'],
      ['Terminal 3', 'note'],
    ]);
    expect(searchSessions(sessions, 'node').map((m) => m.session.name)).toEqual(['api server']);
  });

  it('finds a session by its note and shows the matching line', () => {
    const [match] = searchSessions(sessions, 'RETRY');
    expect(match?.session.name).toBe('Terminal 3');
    expect(match?.field).toBe('note');
    expect(match?.excerpt).toBe('retry logic in invoices');
  });

  it('searches the note log too', () => {
    const logged = session('agent run', {
      noteLog: [{ id: newId(), at: '2026-01-01T00:00:00.000Z', author: 'agent', kind: 'prompt', text: 'migrate the invoices table' }],
    });
    const [match] = searchSessions([...sessions, logged], 'invoices table');
    expect(match?.session.name).toBe('agent run');
    expect(match?.excerpt).toBe('migrate the invoices table');
  });

  it('requires every word, in any field', () => {
    expect(searchSessions(sessions, 'api node').map((m) => m.session.name)).toEqual(['api server']);
    expect(searchSessions(sessions, 'api zsh')).toEqual([]);
    expect(searchSessions(sessions, 'nothing-like-this')).toEqual([]);
  });
});

describe('shortFolder', () => {
  it('keeps the last two parts of a long path', () => {
    expect(shortFolder('/home/u/work/api')).toBe('…/work/api');
    expect(shortFolder('/tmp')).toBe('/tmp');
    expect(shortFolder(null)).toBe('');
  });
});
