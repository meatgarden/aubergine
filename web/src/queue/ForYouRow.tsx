import { useState } from 'react';
import { WithLinks } from '../links/LinkChip';
import type { ForYouItem, Run } from '@aubergine/shared';
import { api, isSuperseded } from '../api';
import { timeAgo } from '../StatusBadges';
import { useApp } from '../store';
import { Badge } from '../ui';
import { useEndedRuns } from '../workflows/ended-runs';
import { goTo } from './go-to';
import type { TaskDraft } from './TaskForm';

/** The lines of a list a run handed in that the owner ticked. */
function tickedLines(run: Run | undefined, elementId: string | null): { item: number; text: string }[] {
  const entry = run?.elements.find((e) => e.elementId === elementId);
  const items = (entry?.output as { items?: { text?: unknown }[] } | null | undefined)?.items;
  if (!entry || !Array.isArray(items)) return [];
  return entry.ticks.flatMap((tick) => (typeof items[tick.item]?.text === 'string' ? [{ item: tick.item, text: items[tick.item]?.text as string }] : []));
}

/**
 * One thing that waits on the owner, drawn the same on the Queue page and in the side panel. The first line is
 * whose it is and since when; the second is its kind, in a column of one width, and what waits in its own words,
 * so that the words stand under each other down the list. Its kind names the one thing to do with it: that is the
 * button at its end, and pressing the row does the same. Nothing here knows a kind by name.
 *
 * `onSend` is given where there is room for what sets an item aside or sends it on (the Queue page); without it
 * the row is only its two lines and its one action.
 */
export function ForYouRow({ item, named = false, onSend, testid = 'foryou-row' }: { item: ForYouItem; named?: boolean; onSend?: (draft: TaskDraft) => void; testid?: string }) {
  // Looked up among everything: in the view of every project a row may be about another project's task or run.
  const task = useApp((s) => (item.taskId ? s.whole?.queue.tasks.find((t) => t.id === item.taskId) : undefined));
  const liveRun = useApp((s) => (item.runId ? s.whole?.runs.find((r) => r.id === item.runId) : undefined));
  const project = useApp((s) => (named && item.projectId ? s.whole?.projects.find((p) => p.id === item.projectId)?.name : undefined));
  const endedRun = useEndedRuns((e) => (item.runId ? e.items.find((entry) => entry.run.id === item.runId)?.run : undefined));
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      if (!isSuperseded(e)) useApp.getState().setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ticked = onSend && item.elementId ? tickedLines(liveRun ?? endedRun, item.elementId) : [];
  const open = (): void => goTo(item.act);
  const opens = item.action !== null;
  // Where it came from is said only where the first line has not said it already.
  const from = item.from.toLowerCase() === item.who.toLowerCase() ? null : item.from.startsWith(`${item.who}, `) ? item.from.slice(item.who.length + 2).replace(/^from /, '') : item.from;
  return (
    <li
      className={`foryou-row${opens ? ' is-pressed' : ''}`}
      // Where there is one thing to do with it, the row is pressed as a whole and does that.
      role={opens ? 'button' : undefined}
      tabIndex={opens ? 0 : undefined}
      aria-label={opens ? `${item.action}: ${item.who}` : undefined}
      // A control inside the row does its own thing and nothing more.
      onClick={opens ? (e) => !(e.target as HTMLElement).closest('button, a, input, select, textarea, label') && open() : undefined}
      onKeyDown={opens ? (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()) : undefined}
      data-testid={testid}
      data-kind={item.kind}
      data-opens={opens ? 'true' : undefined}
    >
      <div className="foryou-first">
        <span className="foryou-who" data-testid="foryou-who">
          {item.who}
        </span>
        {(project || from) && (
          <span className="foryou-from">
            {project ? <span data-testid="foryou-project">{project} · </span> : null}
            {from ? `from ${from}` : ''}
          </span>
        )}
        {item.at && (
          <time className="foryou-when" dateTime={item.at} title={new Date(item.at).toLocaleString()}>
            {timeAgo(item.at)}
          </time>
        )}
      </div>
      <div className="foryou-second">
        <Badge tone={item.tone} className="foryou-kind">
          {item.title}
        </Badge>
        <span className="foryou-what" data-testid="foryou-what">
          {/* An address in what it says is a chip, as everywhere. */}
          <WithLinks text={item.what} />
        </span>
      </div>
      <div className="foryou-actions">
        {/* The one thing to do with it: there while the pointer or the keyboard is on the row. */}
        {opens && (
          <button type="button" className="foryou-act" onClick={open} data-testid="foryou-open">
            {item.action}
          </button>
        )}
        {/* What was written is ticked off by the owner; what was proposed is accepted or declined; a task that is over is put away. */}
        {onSend && item.askId !== null && (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => api.askDo(item.askId as string, 'done'))} data-testid="ask-done">
              Done
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => onSend({ titles: [item.what.split('\n')[0]?.slice(0, 120) ?? ''], details: item.what.split('\n').slice(1).join('\n').trim(), sources: [{ kind: 'hand' }], after: () => api.askDo(item.askId as string, 'done').then(() => {}) })} data-testid="ask-to-queue">
              To the queue…
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.askDo(item.askId as string, 'dismiss'))} data-testid="ask-dismiss">
              Dismiss
            </button>
          </>
        )}
        {onSend && task && task.state === 'proposed' && (
          <>
            <button type="button" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'accept'))} data-testid="task-accept">
              Accept
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'decline'))} data-testid="task-decline">
              Decline
            </button>
          </>
        )}
        {onSend && task && (task.state === 'done' || task.state === 'failed') && (
          <>
            {task.state === 'failed' && (
              <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'again'))} data-testid="task-again">
                Put it back in the queue
              </button>
            )}
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api.taskDo(task.id, 'clear'))} data-testid="task-clear">
              Looked at
            </button>
          </>
        )}
        {onSend && ticked.length > 0 && (
          <button type="button" className="quiet" onClick={() => onSend({ titles: ticked.map((line) => line.text.slice(0, 120)), details: '', sources: ticked.map((line) => ({ kind: 'checklist', from: item.from, runId: item.runId, elementId: item.elementId, item: line.item })) })} data-testid="checklist-to-queue">
            Send {ticked.length} ticked {ticked.length === 1 ? 'line' : 'lines'} to the queue…
          </button>
        )}
      </div>
    </li>
  );
}
