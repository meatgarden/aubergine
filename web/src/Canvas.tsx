import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  useStore,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import {
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  findFreeRect,
  nodesInside,
  type AgentKind,
  type Frame,
  type LayoutNode,
  type Session,
} from '@aubergine/shared';
import { api } from './api';
import { AttentionQueue } from './AttentionQueue';
import { OutsidePanel } from './OutsidePanel';
import { ParkedList } from './ParkedList';
import { Picker } from './Picker';
import { useApp } from './store';
import { canvasShortcut, isCanvasChord, isMac, isTypingTarget } from './keys';
import { FrameNode, type FrameFlowNode } from './FrameNode';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { isFullZoom, loadViewport, saveViewport, useZoomToNode } from './viewport';

const nodeTypes = { terminal: TerminalNode, frame: FrameNode };
type CanvasNode = TerminalFlowNode | FrameFlowNode;
const noFrames: Frame[] = [];
const initialViewport = loadViewport();
const noNodes: LayoutNode[] = [];
const noSessions: Session[] = [];

function toFlowNode(node: LayoutNode, previous: CanvasNode | undefined): TerminalFlowNode {
  return {
    ...(previous?.type === 'terminal' ? previous : {}),
    id: node.id,
    type: 'terminal',
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    data: { sessionId: node.sessionId },
    // Only the title bar moves a node; the terminal body belongs to the terminal.
    dragHandle: '.node-title',
  };
}

function toFrameNode(frame: Frame, previous: CanvasNode | undefined): FrameFlowNode {
  return {
    ...(previous?.type === 'frame' ? previous : {}),
    id: frame.id,
    type: 'frame',
    position: { x: frame.x, y: frame.y },
    width: frame.width,
    height: frame.height,
    data: { frameId: frame.id },
    dragHandle: '.frame-title',
    // Frames sit behind the terminals.
    zIndex: -1,
  };
}

export function Canvas() {
  const allNodes = useApp((s) => s.canvas?.layout.nodes ?? noNodes);
  const sessions = useApp((s) => s.canvas?.sessions ?? noSessions);
  // Parked sessions keep their place in the layout but are not on the canvas.
  const layout = useMemo(() => {
    const parked = new Set(sessions.filter((x) => x.state === 'parked').map((x) => x.id));
    return parked.size === 0 ? allNodes : allNodes.filter((n) => !parked.has(n.sessionId));
  }, [allNodes, sessions]);
  const live = useApp((s) => s.live);
  const theme = useApp((s) => s.settings.theme);
  const focusSession = useApp((s) => s.focusSession);
  const flow = useReactFlow();
  const zoomToNode = useZoomToNode();
  const zoom = useStore((s) => s.transform[2]);

  // React Flow owns the nodes while they are dragged or resized; the saved
  // layout replaces them whenever it changes.
  const frames = useApp((s) => s.canvas?.layout.frames ?? noFrames);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  useEffect(() => {
    setNodes((previous) => {
      const byId = new Map(previous.map((n) => [n.id, n]));
      return [
        ...frames.map((frame) => toFrameNode(frame, byId.get(frame.id))),
        ...layout.map((node) => toFlowNode(node, byId.get(node.id))),
      ];
    });
  }, [layout, frames]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  // While a frame is dragged, the nodes inside it follow.
  const carried = useRef<{ frame: { x: number; y: number }; members: Map<string, { x: number; y: number }> } | null>(null);

  const onNodeDragStart = useCallback(
    (_event: unknown, node: Node) => {
      carried.current = null;
      if (node.type !== 'frame') return;
      const frame = frames.find((f) => f.id === node.id);
      if (!frame) return;
      const members = new Map(nodesInside(frame, layout).map((n) => [n.id, { x: n.x, y: n.y }]));
      carried.current = { frame: { x: frame.x, y: frame.y }, members };
    },
    [frames, layout],
  );

  const onNodeDrag = useCallback((_event: unknown, node: Node) => {
    const carry = carried.current;
    if (!carry || carry.members.size === 0) return;
    const dx = node.position.x - carry.frame.x;
    const dy = node.position.y - carry.frame.y;
    setNodes((current) =>
      current.map((n) => {
        const start = carry.members.get(n.id);
        return start ? { ...n, position: { x: start.x + dx, y: start.y + dy } } : n;
      }),
    );
  }, []);

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    const width = node.width ?? node.measured?.width;
    const height = node.height ?? node.measured?.height;
    if (width === undefined || height === undefined) return;
    const rect = { x: node.position.x, y: node.position.y, width, height };
    if (node.type === 'frame') {
      carried.current = null;
      void api.updateFrame(node.id, { ...rect, carry: true });
    } else {
      void api.updateNode(node.id, rect);
    }
  }, []);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type !== 'terminal') return;
      if ((event.target as HTMLElement).closest('input, button, textarea')) return;
      zoomToNode(node.id);
      focusSession((node as TerminalFlowNode).data.sessionId);
    },
    [zoomToNode, focusSession],
  );

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      // Text is only sharp on whole pixels.
      if (isFullZoom(viewport.zoom) && !(Number.isInteger(viewport.x) && Number.isInteger(viewport.y))) {
        const snapped = { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: 1 };
        void flow.setViewport(snapped);
        saveViewport(snapped);
        return;
      }
      saveViewport(viewport);
    },
    [flow],
  );

  /** Moves the view to a node at 100% and gives its terminal the keyboard. */
  const goToNode = useCallback(
    (nodeId: string, sessionId: string) => {
      // A node that was just created or restored takes a moment to reach the canvas:
      // wait until it is there, or the view would not move at all.
      let attempts = 0;
      const tryNow = (): void => {
        if (!flow.getNode(nodeId) && attempts++ < 60) {
          window.setTimeout(tryNow, 50);
          return;
        }
        // A timer, not an animation frame: frames stop in a tab that is not showing,
        // and the view should be in place when the user comes back to it.
        window.setTimeout(() => {
          zoomToNode(nodeId, { reveal: true });
          focusSession(sessionId);
        }, 30);
      };
      tryNow();
    },
    [flow, zoomToNode, focusSession],
  );

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTerminal = useCallback(async (agent?: AgentKind) => {
    setAdding(true);
    setError(null);
    try {
      const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
      const view = flow.getViewport();
      // Free space as close as possible to the middle of what is on screen.
      const center = {
        x: ((pane?.width ?? 1200) / 2 - view.x) / view.zoom,
        y: ((pane?.height ?? 800) / 2 - view.y) / view.zoom,
      };
      const taken = flow
        .getNodes()
        .filter((n) => n.type === 'terminal')
        .map((n) => ({
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? n.measured?.width ?? NODE_DEFAULT_WIDTH,
        height: n.height ?? n.measured?.height ?? NODE_DEFAULT_HEIGHT,
      }));
      const rect = findFreeRect(taken, center, { width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT });
      const created = await api.createSession({ rect, ...(agent ? { agent } : {}) });
      useApp.getState().apply({ type: 'session.created', ...created });
      goToNode(created.node.id, created.session.id);
    } catch (e) {
      setError(`Could not start a terminal: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  }, [flow, goToNode]);

  const resetZoom = useCallback(() => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const view = flow.getViewport();
    if (!pane || isFullZoom(view.zoom)) return;
    // Keep the point at the middle of the window where it is.
    const cx = (pane.width / 2 - view.x) / view.zoom;
    const cy = (pane.height / 2 - view.y) / view.zoom;
    void flow.setViewport(
      { x: Math.round(pane.width / 2 - cx), y: Math.round(pane.height / 2 - cy), zoom: 1 },
      { duration: 200 },
    );
  }, [flow]);

  const addFrame = useCallback(async () => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const view = flow.getViewport();
    const width = 860;
    const height = 560;
    const x = Math.round(((pane?.width ?? 1200) / 2 - view.x) / view.zoom - width / 2);
    const y = Math.round(((pane?.height ?? 800) / 2 - view.y) / view.zoom - height / 2);
    try {
      const frame = await api.createFrame({ rect: { x, y, width, height } });
      useApp.getState().apply({ type: 'frame.created', frame });
    } catch (e) {
      setError(`Could not add a frame: ${(e as Error).message}`);
    }
  }, [flow]);

  const zoomToFit = useCallback(() => {
    void flow.fitView({ padding: 0.08, maxZoom: 1, duration: 200 });
  }, [flow]);

  /** Takes keyboard focus away from any terminal, back to the canvas. */
  const releaseFocus = useCallback(() => {
    focusSession(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [focusSession]);

  useEffect(() => {
    const mac = isMac();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isCanvasChord(event, mac)) {
        event.preventDefault();
        const { picker, setPicker } = useApp.getState();
        releaseFocus();
        setPicker(!picker);
        return;
      }
      const { closing, picker } = useApp.getState();
      if (isTypingTarget(event.target) || closing || picker) return;
      const action = canvasShortcut(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'new-terminal') void addTerminal();
      else if (action === 'zoom-100') resetZoom();
      else zoomToFit();
    };
    // Capture phase, so the reserved chord is seen before a focused terminal gets it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [addTerminal, resetZoom, zoomToFit, releaseFocus]);

  // Asked to bring a session into view (by `aubergine here`, or by the address this page was opened on).
  const show = useApp((s) => s.show);
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    void (async () => {
      const { canvas } = useApp.getState();
      const session = canvas?.sessions.find((x) => x.id === show.sessionId);
      const node = canvas?.layout.nodes.find((n) => n.sessionId === show.sessionId);
      if (!session || !node) return;
      if (session.state === 'parked') await api.restoreSession(session.id).catch(() => {});
      if (!cancelled) goToNode(node.id, session.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [show, goToNode]);

  const percent = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  return (
    <div className="canvas">
      <ReactFlow<CanvasNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onMoveEnd={onMoveEnd}
        onPaneClick={releaseFocus}
        defaultViewport={initialViewport}
        minZoom={0.1}
        maxZoom={1}
        colorMode={theme}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        disableKeyboardA11y
        nodeDragThreshold={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <MiniMap pannable zoomable position="bottom-right" className="minimap" />
        <Panel position="top-left" className="toolbar">
          <span className="brand">Aubergine</span>
          <button type="button" onClick={() => void addTerminal()} disabled={adding} title="New terminal (N)">
            + New terminal
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => void addTerminal('claude-code')}
            disabled={adding}
            title="New Claude Code session: starts claude with hooks that report to this canvas"
          >
            + Claude Code
          </button>
          <button type="button" className="quiet" onClick={() => void addFrame()} title="Add a frame to group terminals">
            + Frame
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => useApp.getState().setPicker(true)}
            title={isMac() ? 'Go to session (⌘K)' : 'Go to session (Ctrl+Shift+K)'}
          >
            Go to…
          </button>
          <button type="button" className="quiet" onClick={zoomToFit} title="Zoom to fit everything (F)">
            Fit
          </button>
          <button
            type="button"
            className="quiet"
            onClick={resetZoom}
            title="Zoom to 100% (0). Terminals take input only at 100%."
            data-testid="zoom-level"
          >
            {percent}
          </button>
          <OutsidePanel onGo={goToNode} />
          <AttentionQueue onGo={goToNode} />
          <ParkedList onRestored={(nodeId) => requestAnimationFrame(() => requestAnimationFrame(() => zoomToNode(nodeId, { reveal: true })))} />
          {!live && <span className="warning">Reconnecting…</span>}
          {error && <span className="warning">{error}</span>}
        </Panel>
        {layout.length === 0 && frames.length === 0 && (
          <Panel position="top-center" className="empty">
            No terminals yet. Choose “New terminal” to start one.
          </Panel>
        )}
      </ReactFlow>
      <Picker onGo={goToNode} />
    </div>
  );
}
