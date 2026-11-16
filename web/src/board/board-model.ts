import { RunStatus, type BoardFilters, type Session } from '@aubergine/shared';

/**
 * What the board screen keeps for itself: which filters are on, remembered by
 * this browser like the side panel's, and how the arrow keys move between cards.
 * Pure, apart from the two functions that read and write the browser's storage.
 */

const KEY = 'aubergine.board.filters';

/** Whatever was stored, made into filters: anything that is not one is dropped. */
export function filtersFrom(stored: unknown): BoardFilters {
  if (!stored || typeof stored !== 'object') return {};
  const { canvasId, workflowId, status, tag } = stored as Record<string, unknown>;
  return {
    ...(typeof canvasId === 'string' && canvasId ? { canvasId } : {}),
    ...(typeof workflowId === 'string' && workflowId ? { workflowId } : {}),
    ...(RunStatus.safeParse(status).success ? { status: status as RunStatus } : {}),
    ...(typeof tag === 'string' && tag ? { tag } : {}),
  };
}

export function loadFilters(): BoardFilters {
  try {
    return filtersFrom(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return {};
  }
}

export function saveFilters(filters: BoardFilters): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    // Not remembered, then.
  }
}

/** A filter that names something that is gone (a closed canvas, a removed workflow) is dropped, so the board is not empty for no visible reason. */
export function liveFilters(filters: BoardFilters, known: { canvasIds: readonly string[]; workflowIds: readonly string[] }): BoardFilters {
  const { canvasId, workflowId, ...rest } = filters;
  return { ...rest, ...(canvasId && known.canvasIds.includes(canvasId) ? { canvasId } : {}), ...(workflowId && known.workflowIds.includes(workflowId) ? { workflowId } : {}) };
}

export interface Box {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The card an arrow key moves to from `from`: the nearest one that lies in that direction, counting a step
 * sideways from the line of travel as three times as far. Null when there is none: the key then does nothing.
 */
export function nextCard(boxes: readonly Box[], from: string, direction: 'left' | 'right' | 'up' | 'down'): string | null {
  const start = boxes.find((box) => box.id === from);
  if (!start) return boxes[0]?.id ?? null;
  const centre = (box: Box): { x: number; y: number } => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const here = centre(start);
  let best: { id: string; score: number } | null = null;
  for (const box of boxes) {
    if (box.id === from) continue;
    const there = centre(box);
    const dx = there.x - here.x;
    const dy = there.y - here.y;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);
    if (along <= 1) continue;
    // Up and down stay in the column when it has a card that way; left and right change column.
    if ((direction === 'up' || direction === 'down') && across > start.width / 2) continue;
    const score = along + across * 3;
    if (!best || score < best.score) best = { id: box.id, score };
  }
  return best?.id ?? null;
}

/** What is known about whether an agent would read a sentence typed into this terminal. Words only: nothing is decided by it here. */
export function agentInFront(session: Pick<Session, 'agent' | 'command' | 'state'>): { ready: boolean; words: string } {
  if (session.state === 'exited') return { ready: false, words: 'its shell has ended' };
  if (session.agent === null || session.agent.program === null) return { ready: false, words: 'no agent seen here: nothing is typed, the run waits to be read' };
  if (session.command !== null && session.command === session.agent.program) return { ready: true, words: 'an agent is in front' };
  return { ready: false, words: `an agent was here; ${session.command ? `“${session.command}”` : 'something else'} is in front now` };
}
