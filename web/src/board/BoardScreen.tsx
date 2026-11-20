import { howLong, versionOf, type BoardCard } from '@aubergine/shared';
import { useApp } from '../store';
import { ApprovalControls } from '../workflows/ApprovalControls';
import { DOT_WORD, dotTone } from '../terminal-rows';
import { StateDot } from '../ui';

/**
 * A run's card, as the Runs page draws it in its columns and by step,
 * from what `boardOf` returns.
 */

export const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function Card({ card, single, now, onGo, onView, named }: { card: BoardCard; single: boolean; now: number; onGo: (card: BoardCard) => void; onView: (runId: string) => void; named: ((projectId: string) => string) | null }) {
  // Looked up among everything: in the view of every project a card may be of another project.
  const run = useApp((s) => s.whole?.runs.find((r) => r.id === card.runId));
  const elements = useApp((s) => {
    const workflow = run ? s.whole?.workflows.find((w) => w.id === run.workflowId) : undefined;
    return workflow && run ? (versionOf(workflow, run.workflowVersion)?.elements ?? null) : null;
  });
  // The same mark as the terminal has in the list and in its title; hollow where the run has no terminal yet.
  const tone = useApp((s) => {
    const session = card.sessionId ? s.whole?.sessions.find((x) => x.id === card.sessionId) : undefined;
    return session ? dotTone(session) : 'hollow';
  });
  return (
    <div
      role="button"
      tabIndex={0}
      className={`board-card status-${card.status}${card.waitsForPerson ? ' needs-you' : ''}`}
      title={card.sessionId ? `Go to “${card.sessionName}”${card.canvasName ? ` on ${card.canvasName}` : ''}` : 'This run has no terminal yet'}
      onClick={() => onGo(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onGo(card);
        }
      }}
      data-board-card={card.runId}
      data-testid="board-card"
      data-status={card.status}
      data-session={card.sessionId ?? ''}
    >
      <div className="board-card-head">
        <span className="board-card-name">
          {named && card.projectId ? <span data-testid="board-card-project">{named(card.projectId)} · </span> : null}
          {card.sessionName || 'no terminal yet'}
        </span>
        {card.canvasName && <span className="board-card-canvas">{card.canvasName}</span>}
      </div>
      {single && <div className="board-card-element">{card.elementName}</div>}
      <div className="board-card-facts">
        {/* The same mark as the terminal has in the list and in its title, before how its run stands. */}
        <StateDot tone={tone} word={tone === 'hollow' ? (card.sessionId ? 'ended' : 'no terminal yet') : DOT_WORD[tone]} />
        <span className="board-card-status" data-testid="board-card-status">
          {card.statusWords}
        </span>
        {card.since && <span title="How long it has been on this step"> · {howLong(card.since, now)}</span>}
        {card.quiet && <span title="The terminal has printed for a while with no report, so this may be behind"> · quiet</span>}
      </div>
      {card.blockedReason && <p className="board-card-reason">{card.blockedReason}</p>}
      {card.waitsForPerson && run && elements && <ApprovalControls run={run} elements={elements} compact />}
      <button
        type="button"
        className="quiet board-card-view"
        onClick={(e) => {
          e.stopPropagation();
          onView(card.runId);
        }}
        data-testid="board-card-view"
      >
        What it did
      </button>
    </div>
  );
}
