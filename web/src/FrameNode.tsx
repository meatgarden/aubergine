import { memo, useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { FRAME_MIN_HEIGHT, FRAME_MIN_WIDTH } from '@aubergine/shared';
import { api } from './api';
import { ColorButton } from './ColorButton';
import { useApp } from './store';

export type FrameFlowNode = Node<{ frameId: string }, 'frame'>;

/** A labeled rectangle behind the terminals. Only its title bar reacts to the pointer. */
export const FrameNode = memo(function FrameNode({ id, selected }: NodeProps<FrameFlowNode>) {
  const frame = useApp((s) => s.canvas?.layout.frames.find((f) => f.id === id));
  const [draft, setDraft] = useState<string | null>(null);
  if (!frame) return null;

  const rect = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const commitLabel = (): void => {
    const next = draft?.trim() ?? '';
    setDraft(null);
    if (next !== frame.label) void api.updateFrame(id, { ...rect, label: next });
  };

  return (
    <div className={`frame color-${frame.color}${selected ? ' selected' : ''}`} data-testid="frame">
      <NodeResizer
        minWidth={FRAME_MIN_WIDTH}
        minHeight={FRAME_MIN_HEIGHT}
        lineClassName="resize-line"
        handleClassName="resize-handle"
        onResizeEnd={(_event, r) =>
          void api.updateFrame(id, { x: r.x, y: r.y, width: r.width, height: r.height })
        }
      />
      <header className="frame-title" onDoubleClick={() => setDraft(frame.label)}>
        {draft === null ? (
          <span className="frame-label" title="Double-click to rename" data-testid="frame-label">
            {frame.label || 'Untitled frame'}
          </span>
        ) : (
          <input
            className="node-name-input nodrag"
            aria-label="Frame label"
            value={draft}
            maxLength={80}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        )}
        <ColorButton value={frame.color} onChange={(color) => void api.updateFrame(id, { ...rect, color })} />
        <button
          type="button"
          className="node-close nodrag"
          aria-label={`Remove frame ${frame.label}`}
          title="Remove frame (the terminals stay)"
          onClick={() => void api.removeFrame(id)}
        >
          ×
        </button>
      </header>
    </div>
  );
});
