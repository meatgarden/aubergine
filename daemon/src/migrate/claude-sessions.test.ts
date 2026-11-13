import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claudeSessionsDir, isSameProcess, parseProcessStart, parseSessionFile, readClaudeSession } from './claude-sessions';

const ID = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
const valid = {
  pid: 4321,
  sessionId: ID,
  cwd: '/Users/me/work/api',
  startedAt: 1794332553271,
  procStart: 'Tue Nov 10 17:41:56 2026',
  version: '2.1.319',
  kind: 'interactive',
  entrypoint: 'cli',
  name: 'fix the build',
  status: 'idle',
  somethingNew: { nested: true },
};

describe('parseSessionFile', () => {
  it('reads what is needed and ignores fields it does not know', () => {
    expect(parseSessionFile(JSON.stringify(valid))).toEqual({
      pid: 4321,
      conversationId: ID,
      cwd: '/Users/me/work/api',
      status: 'idle',
      entrypoint: 'cli',
      name: 'fix the build',
      processStart: new Date('2026-11-10T17:41:56Z'),
    });
  });

  it('copes with optional fields being absent', () => {
    expect(parseSessionFile(JSON.stringify({ pid: 5, sessionId: ID }))).toEqual({
      pid: 5,
      conversationId: ID,
      cwd: null,
      status: null,
      entrypoint: null,
      name: null,
      processStart: null,
    });
  });

  it('keeps the entry point, so that processes started by something else can be left out', () => {
    expect(parseSessionFile(JSON.stringify({ ...valid, entrypoint: 'claude-desktop' }))?.entrypoint).toBe('claude-desktop');
  });

  it('returns null for anything malformed', () => {
    expect(parseSessionFile('')).toBeNull();
    expect(parseSessionFile('{ "pid": 1,')).toBeNull();
    expect(parseSessionFile('[]')).toBeNull();
    expect(parseSessionFile(JSON.stringify({ sessionId: ID }))).toBeNull();
    expect(parseSessionFile(JSON.stringify({ pid: 'x', sessionId: ID }))).toBeNull();
  });

  it('refuses a conversation ID that would not be safe on a command line', () => {
    expect(parseSessionFile(JSON.stringify({ ...valid, sessionId: 'aaaaaaaa; rm -rf ~' }))).toBeNull();
    expect(parseSessionFile(JSON.stringify({ ...valid, sessionId: '$(id)-aaaaaaaa' }))).toBeNull();
  });
});

describe('process start times', () => {
  it('reads the form ps prints, as UTC', () => {
    expect(parseProcessStart('Tue Nov 10 17:41:56 2026')).toEqual(new Date('2026-11-10T17:41:56Z'));
    expect(parseProcessStart('Sun Nov  8 03:06:21 2026')).toEqual(new Date('2026-11-08T03:06:21Z'));
    expect(parseProcessStart('yesterday')).toBeNull();
  });

  it('tells the same process from a reused process ID', () => {
    const session = parseSessionFile(JSON.stringify(valid))!;
    expect(isSameProcess(session, new Date('2026-11-10T17:41:56Z'))).toBe(true);
    expect(isSameProcess(session, new Date('2026-11-10T17:41:57Z'))).toBe(true);
    expect(isSameProcess(session, new Date('2026-11-12T09:00:00Z'))).toBe(false);
    expect(isSameProcess(session, null)).toBe(false);
    expect(isSameProcess({ ...session, processStart: null }, new Date('2026-11-10T17:41:56Z'))).toBe(false);
  });
});

describe('readClaudeSession', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'aubergine-claude-sessions-'));
    await writeFile(path.join(dir, '4321.json'), JSON.stringify(valid));
    await writeFile(path.join(dir, '11.json'), 'not json');
    await writeFile(path.join(dir, '12.json'), JSON.stringify({ ...valid, pid: 999 }));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the file for a process', async () => {
    expect((await readClaudeSession(4321, dir))?.conversationId).toBe(ID);
  });

  it('returns null when the file is missing, malformed, or about another process', async () => {
    expect(await readClaudeSession(4000, dir)).toBeNull();
    expect(await readClaudeSession(11, dir)).toBeNull();
    expect(await readClaudeSession(12, dir)).toBeNull();
    expect(await readClaudeSession(4321, path.join(dir, 'missing-folder'))).toBeNull();
  });

  it('looks in the folder Claude Code itself uses', () => {
    expect(claudeSessionsDir({ CLAUDE_CONFIG_DIR: '/custom/claude' })).toBe('/custom/claude/sessions');
    expect(claudeSessionsDir({})).toBe(path.join(os.homedir(), '.claude', 'sessions'));
  });
});
