import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  useStore,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, findFreeRect, type LayoutNode } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
import { canvasShortcut, isCanvasChord, isMac, isTypingTarget } from './keys';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { isFullZoom, loadViewport, saveViewport, useZoomToNode } from './viewport';

const nodeTypes = { terminal: TerminalNode };
const initialViewport = loadViewport();
const noNodes: LayoutNode[] = [];

function toFlowNode(node: LayoutNode, previous: TerminalFlowNode | undefined): TerminalFlowNode {
  return {
    ...previous,
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

export function Canvas() {
  const layout = useApp((s) => s.canvas?.layout.nodes ?? noNodes);
  const live = useApp((s) => s.live);
  const focusSession = useApp((s) => s.focusSession);
  const flow = useReactFlow();
  const zoomToNode = useZoomToNode();
  const zoom = useStore((s) => s.transform[2]);

  // React Flow owns the nodes while they are dragged or resized; the saved
  // layout replaces them whenever it changes.
  const [nodes, setNodes] = useState<TerminalFlowNode[]>([]);
  useEffect(() => {
    setNodes((previous) => {
      const byId = new Map(previous.map((n) => [n.id, n]));
      return layout.map((node) => toFlowNode(node, byId.get(node.id)));
    });
  }, [layout]);

  const onNodesChange = useCallback(
    (changes: NodeChange<TerminalFlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    const width = node.width ?? node.measured?.width;
    const height = node.height ?? node.measured?.height;
    if (width === undefined || height === undefined) return;
    void api.updateNode(node.id, { x: node.position.x, y: node.position.y, width, height });
  }, []);

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if ((event.target as HTMLElement).closest('input, button')) return;
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

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTerminal = useCallback(async () => {
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
      const taken = flow.getNodes().map((n) => ({
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? n.measured?.width ?? NODE_DEFAULT_WIDTH,
        height: n.height ?? n.measured?.height ?? NODE_DEFAULT_HEIGHT,
      }));
      const rect = findFreeRect(taken, center, { width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT });
      const created = await api.createSession({ rect });
      useApp.getState().apply({ type: 'session.created', ...created });
      // Wait for React Flow to know the node before moving to it.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          zoomToNode(created.node.id, { reveal: true });
          focusSession(created.session.id);
        }),
      );
    } catch (e) {
      setError(`Could not start a terminal: ${(e as Error).message}`);
    } finally {
      setAdding(false);
    }
  }, [flow, zoomToNode, focusSession]);

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
        releaseFocus();
        return;
      }
      if (isTypingTarget(event.target) || useApp.getState().closing) return;
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

  const percent = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  return (
    <div className="canvas">
      <ReactFlow<TerminalFlowNode>
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onMoveEnd={onMoveEnd}
        onPaneClick={releaseFocus}
        defaultViewport={initialViewport}
        minZoom={0.1}
        maxZoom={1}
        colorMode="dark"
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        disableKeyboardA11y
        nodeDragThreshold={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Panel position="top-left" className="toolbar">
          <span className="brand">Aubergine</span>
          <button type="button" onClick={() => void addTerminal()} disabled={adding} title="New terminal (N)">
            + New terminal
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
          {!live && <span className="warning">Reconnecting…</span>}
          {error && <span className="warning">{error}</span>}
        </Panel>
        {layout.length === 0 && (
          <Panel position="top-center" className="empty">
            No terminals yet. Choose “New terminal” to start one.
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
