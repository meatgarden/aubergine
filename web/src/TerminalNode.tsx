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
  const name = useApp((s) => s.canvas?.sessions.find((x) => x.id === sessionId)?.name ?? '');
  const askToClose = useApp((s) => s.askToClose);
  const interactive = useIsFullZoom();
  const [draft, setDraft] = useState<string | null>(null);

  const commitName = (): void => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== name) void api.renameSession(sessionId, { name: next });
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
          aria-label={`Close ${name}`}
          title="Close terminal"
          onClick={() => askToClose(sessionId)}
        >
          ×
        </button>
      </header>
      {/* The body never drags, pans or zooms the canvas. */}
      <div className="node-body nodrag nopan nowheel">
        <TerminalView sessionId={sessionId} interactive={interactive} />
        {!interactive && (
          <div className="node-shield" title="Click to zoom in and use this terminal" data-testid="node-shield" />
        )}
      </div>
    </div>
  );
});
