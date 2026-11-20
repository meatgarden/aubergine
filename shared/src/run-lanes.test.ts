import { describe, expect, it } from 'vitest';
import { runLanesOf, type Board, type BoardCard } from './board';

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const card = (n: number, status: BoardCard['status'], waitsForPerson = false): BoardCard => ({
  runId: ID(n),
  projectId: null,
  workflowId: ID(900),
  sessionId: status === 'queued' ? null : ID(n + 100),
  sessionName: status === 'queued' ? '' : `t${n}`,
  canvasId: null,
  canvasName: '',
  tags: [],
  status,
  statusWords: status,
  elementId: null,
  elementName: 'Step',
  since: null,
  quiet: false,
  blockedReason: null,
  waitsForPerson,
  finishedAt: null,
});
const board = (queued: BoardCard[], live: BoardCard[], ended: BoardCard[]): Board => ({
  counts: { waitingForYou: 0, blocked: 0, working: 0, paused: 0, queued: 0, total: 0 },
  summary: '',
  groups: [{ key: 'w', workflowId: ID(900), workflowName: 'W', version: null, single: false, queued, columns: [{ elementId: 'a', name: 'A', waitsForPerson: false, cards: live }] }],
  ended: ended.map((c) => ({ ...c, workflowName: 'W' })),
  endedCut: false,
});

describe('the columns of the runs page', () => {
  it('put each run where it stands: waiting for a terminal, running, or over', () => {
    const lanes = runLanesOf(board([card(1, 'queued')], [card(2, 'running'), card(3, 'paused')], [card(4, 'finished')]), new Set());
    expect(lanes.waiting.map((c) => c.runId)).toEqual([ID(1)]);
    expect(lanes.running.map((c) => c.runId)).toEqual([ID(2), ID(3)]);
    expect(lanes.ended.map((c) => c.runId)).toEqual([ID(4)]);
  });

  it('leave out what waits for a person or is blocked: that is on the owner\'s list', () => {
    const lanes = runLanesOf(board([], [card(2, 'awaiting', true), card(3, 'blocked'), card(5, 'running')], []), new Set());
    expect(lanes.running.map((c) => c.runId)).toEqual([ID(5)]);
  });

  it('leave out a run that a task stands for: it is shown as its task', () => {
    const lanes = runLanesOf(board([card(1, 'queued')], [card(2, 'running')], [card(4, 'finished')]), new Set([ID(1), ID(2), ID(4)]));
    expect(lanes).toEqual({ waiting: [], running: [], ended: [] });
  });
});
