import { memo, useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { NODE_MIN_HEIGHT, NODE_MIN_WIDTH } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
import { TerminalView } from './TerminalView';
import { useIsFullZoom } from './viewport';

export type TerminalFlowNode = Node<{ sessionId: string }, 'terminal'>;

export const TerminalNode = memo(function TerminalNode({ id, data, selected }: NodeProps<TerminalFlowNode>) {
  const { sessionId } = data;
  const session = useApp((s) => s.canvas?.sessions.find((x) => x.id === sessionId));
  const name = session?.name ?? '';
  const exited = session?.state === 'exited';
  const interactive = useIsFullZoom();
  const [draft, setDraft] = useState<string | null>(null);

  const commitName = (): void => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== name) void api.updateSession(sessionId, { name: next });
  };

  return (
    <div className={`terminal-node${selected ? ' selected' : ''}`} data-testid="terminal-node">
      <NodeResizer
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        lineClassName="resize-line"
        handleClassName="resize-handle"
        onResizeEnd={(_event, rect) =>
          void api.updateNode(id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        }
      />
      <header className="node-title" onDoubleClick={() => setDraft(name)}>
        {draft === null ? (
          <span className="node-name" title="Double-click to rename" data-testid="node-name">
            {name}
          </span>
        ) : (
          <input
            className="node-name-input nodrag"
            aria-label="Terminal name"
            value={draft}
            maxLength={80}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        )}
        <button
          type="button"
          className="node-close nodrag"
          aria-label={exited ? `Remove ${name}` : `Park ${name}`}
          title={exited ? 'Remove' : 'Park: take it off the canvas, the shell keeps running'}
          onClick={() => void (exited ? api.closeSession(sessionId) : api.parkSession(sessionId))}
        >
          ×
        </button>
      </header>
      {exited ? (
        <div className="node-body node-ended nodrag" data-testid="node-ended">
          <p>This shell has ended.</p>
          <div className="node-ended-actions">
            <button type="button" onClick={() => void api.restartSession(sessionId)}>
              Restart here
            </button>
            <button type="button" className="quiet" onClick={() => void api.closeSession(sessionId)}>
              Remove
            </button>
          </div>
          {session?.cwd && <p className="node-ended-folder">{session.cwd}</p>}
        </div>
      ) : (
        <LiveBody sessionId={sessionId} interactive={interactive} />
      )}
    </div>
  );
});

/**
 * The body never drags or pans the canvas. Until its terminal has focus (and
 * whenever the view is zoomed out) a shield covers it: the wheel then belongs
 * to the canvas, and a click focuses the terminal.
 */
function LiveBody({ sessionId, interactive }: { sessionId: string; interactive: boolean }) {
  const [focused, setFocused] = useState(false);
  const live = interactive && focused;
  return (
    <div
      className={`node-body nodrag nopan${live ? ' nowheel' : ''}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      data-testid="node-body"
    >
      <TerminalView sessionId={sessionId} interactive={interactive} />
      {!live && (
        <div
          className={`node-shield${interactive ? '' : ' zoomed-out'}`}
          title={interactive ? 'Click to use this terminal' : 'Click to zoom in and use this terminal'}
          data-testid="node-shield"
        />
      )}
    </div>
  );
}
