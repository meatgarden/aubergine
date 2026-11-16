import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer, useStore, type Node, type NodeProps } from '@xyflow/react';
import { NODE_MIN_HEIGHT, NODE_MIN_WIDTH } from '@aubergine/shared';
import { api } from './api';
import { canResumeAgent } from './attention';
import { ColorButton } from './ColorButton';
import { parkSession, runCommand } from './commands';
import { hint } from './shortcuts';
import { nodeMode, type NodeMode } from './culling';
import { MoveToCanvas } from './MoveToCanvas';
import { NotePanel } from './NotePanel';
import { SnapshotView } from './SnapshotView';
import { StatusBadges } from './StatusBadges';
import { currentLayout, useApp } from './store';
import { TerminalView } from './TerminalView';
import { useIsFullZoom } from './viewport';
import { tourSignal } from './tour/tour-store';
import { ListMark } from './workflows/ListMark';
import { RunStrip } from './workflows/RunStrip';

export type TerminalFlowNode = Node<{ sessionId: string }, 'terminal'>;

export const TerminalNode = memo(function TerminalNode({ id, data, selected }: NodeProps<TerminalFlowNode>) {
  const { sessionId } = data;
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const name = session?.name ?? '';
  const exited = session?.state === 'exited';
  const interactive = useIsFullZoom();
  const [draft, setDraft] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // Whether this node's terminal holds the keyboard.
  const [focused, setFocused] = useState(false);
  const onFocusChange = useCallback(
    (now: boolean) => {
      setFocused(now);
      if (now) useApp.getState().settled();
      if (now) tourSignal('terminal.focused');
      // Looking at it, and looking away from it, both mark everything so far as seen.
      void api.seenSession(sessionId).catch(() => {});
    },
    [sessionId],
  );
  // Selected: the terminal that keys such as park and rename act on while none has the keyboard.
  const isSelected = useApp((s) => s.selected === sessionId);
  useApp((s) => s.settings.shortcuts);

  // Asked to start renaming, or to show or hide the note (by a key or the palette).
  const ask = useApp((s) => (s.ask?.id === sessionId && (s.ask.kind === 'rename-session' || s.ask.kind === 'note') ? s.ask : null));
  useEffect(() => {
    if (!ask) return;
    if (ask.kind === 'rename-session') setDraft(useApp.getState().app?.sessions.find((x) => x.id === sessionId)?.name ?? '');
    else setNoteOpen((open) => !open);
    useApp.getState().asked(ask.tick);
  }, [ask, sessionId]);

  const node = useApp((s) => currentLayout(s).nodes.find((n) => n.id === id));
  const color = node?.color ?? 'none';
  const hasNote = (session?.note ?? '') !== '';

  // Live only while on screen and large enough to read; see culling.ts.
  const modeRef = useRef<NodeMode>('live');
  const mode = useStore((s) => {
    if (!node) return modeRef.current;
    return nodeMode({
      rect: node,
      view: { x: s.transform[0], y: s.transform[1], zoom: s.transform[2] },
      pane: { width: s.width, height: s.height },
      current: modeRef.current,
    });
  });
  modeRef.current = mode;

  const commitName = (): void => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== name) void api.updateSession(sessionId, { name: next });
  };

  return (
    <div
      className={`terminal-node color-${color}${selected ? ' selected' : ''}${isSelected && !focused ? ' is-selected' : ''}`}
      data-testid="terminal-node"
      data-session={sessionId}
      data-selected={isSelected && !focused ? 'true' : undefined}
      data-focused={focused ? 'true' : undefined}
      data-mode={exited ? 'ended' : mode}
      data-busy={session?.status.state === 'busy' ? 'true' : undefined}
      data-attention={session?.attention.state ?? 'none'}
    >
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
          <span className="node-name" title={hint('terminal.rename', 'Double-click to rename')} data-testid="node-name">
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
        {draft === null && !exited && session && session.attention.state !== 'none' && (
          <span
            className={`badge-attention is-${session.attention.state}`}
            title={session.attention.message ?? undefined}
            data-testid="badge-attention"
          >
            {session.attention.state === 'waiting' ? 'waiting for you' : session.attention.state === 'done' ? 'finished' : 'working'}
          </span>
        )}
        {draft === null && !exited && <RunStrip sessionId={sessionId} variant="node" />}
        {draft === null && <ListMark sessionId={sessionId} variant="node" />}
        {draft === null && session?.typedBy && <TypedBy by={session.typedBy} />}
        {draft === null && !exited && session && (
          <button
            type="button"
            className={`node-tool nodrag people-only${session.peopleOnly ? ' is-on' : ''}`}
            aria-pressed={session.peopleOnly}
            aria-label={`People only: ${name}`}
            title={hint('terminal.peopleOnly', session.peopleOnly ? 'People only: no API token may read this terminal or type into it. Click to open it to tokens again.' : 'Open to API tokens that have the scope and the reach. Click to make it people only.')}
            data-testid="people-only"
            onClick={() => {
              useApp.getState().select(sessionId);
              runCommand('terminal.peopleOnly');
            }}
          >
            {session.peopleOnly ? '🔒 people only' : '🔓'}
          </button>
        )}
        {draft === null && session && canResumeAgent(session) && (
          <button
            type="button"
            className="node-tool resume-agent nodrag"
            title="Start the agent again in the conversation it was last in"
            onClick={() => void api.resumeAgent(sessionId).catch(() => {})}
          >
            Resume agent
          </button>
        )}
        {draft === null && !exited && session && <StatusBadges session={session} focused={focused} />}
        {draft === null && (
          <button
            type="button"
            className={`node-tool nodrag${(session?.tags.length ?? 0) > 0 ? ' has-note' : ''}`}
            aria-label={`Tags of ${name}`}
            title={hint('terminal.tags', (session?.tags.length ?? 0) > 0 ? `Tags: ${session?.tags.join(', ')}` : 'Add tags')}
            onClick={() => useApp.getState().request({ kind: 'tags', id: sessionId })}
          >
            #{(session?.tags.length ?? 0) > 0 ? session?.tags.length : ''}
          </button>
        )}
        {draft === null && !exited && (
          <button
            type="button"
            className="node-tool nodrag"
            aria-label={`Run a workflow on ${name}`}
            title={hint('workflow.run', 'Run a workflow on this terminal')}
            data-testid="node-run-workflow"
            onClick={() => {
              useApp.getState().select(sessionId);
              runCommand('workflow.run');
            }}
          >
            ⇶
          </button>
        )}
        {draft === null && <MoveToCanvas sessionId={sessionId} name={name} />}
        <button
          type="button"
          className={`node-tool nodrag${hasNote ? ' has-note' : ''}`}
          aria-label={`Note for ${name}`}
          aria-pressed={noteOpen}
          title={hint('notes.toggle', hasNote ? 'Show note' : 'Add a note')}
          onClick={() => setNoteOpen((v) => !v)}
        >
          Note
        </button>
        {node && (
          <ColorButton
            value={color}
            onChange={(next) =>
              void api.updateNode(id, { x: node.x, y: node.y, width: node.width, height: node.height, color: next })
            }
          />
        )}
        <button
          type="button"
          className="node-close nodrag"
          aria-label={exited ? `Remove ${name}` : `Park ${name}`}
          title={exited ? 'Remove' : hint('terminal.park', 'Park: take it off the canvas, the shell keeps running')}
          onClick={() => parkSession(sessionId)}
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
      ) : mode === 'live' ? (
        <LiveBody sessionId={sessionId} interactive={interactive} onFocusChange={onFocusChange} />
      ) : (
        <div className="node-body nodrag nopan" data-testid="node-body" data-mode={mode}>
          <SnapshotView sessionId={sessionId} refreshing={mode === 'snapshot'} />
          <div className="node-shield zoomed-out" title="Click to zoom in and use this terminal" />
        </div>
      )}
      {noteOpen && <NotePanel sessionId={sessionId} onClose={() => setNoteOpen(false)} />}
    </div>
  );
});

/** A brief mark that a token typed into the terminal, and which. It fades after half a minute; the row in the list keeps the time. */
function TypedBy({ by }: { by: { name: string; at: string } }) {
  const [recent, setRecent] = useState(() => Date.now() - Date.parse(by.at) < 30_000);
  useEffect(() => {
    const left = 30_000 - (Date.now() - Date.parse(by.at));
    setRecent(left > 0);
    if (left <= 0) return;
    const timer = window.setTimeout(() => setRecent(false), left);
    return () => window.clearTimeout(timer);
  }, [by.at]);
  if (!recent) return null;
  return (
    <span className="badge-typed" title={`The API token “${by.name}” typed into this terminal at ${new Date(by.at).toLocaleTimeString()}`} data-testid="badge-typed">
      typed by {by.name}
    </span>
  );
}

/**
 * The body never drags or pans the canvas. Until its terminal has focus (and
 * whenever the view is zoomed out) a shield covers it: the wheel then belongs
 * to the canvas, and a click focuses the terminal.
 */
function LiveBody({
  sessionId,
  interactive,
  onFocusChange,
}: {
  sessionId: string;
  interactive: boolean;
  onFocusChange: (focused: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);
  const live = interactive && focused;
  const change = (now: boolean): void => {
    setFocused(now);
    onFocusChange(now);
  };
  return (
    <div
      className={`node-body nodrag nopan${live ? ' nowheel' : ''}`}
      onFocus={() => change(true)}
      onBlur={() => change(false)}
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
