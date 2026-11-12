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
import { NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, type LayoutNode } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
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
      // Where the node would sit centered in the window once the view is at 100%.
      const centerX = ((pane?.width ?? 1200) / 2 - view.x) / view.zoom;
      const centerY = ((pane?.height ?? 800) / 2 - view.y) / view.zoom;
      let x = Math.round(centerX - NODE_DEFAULT_WIDTH / 2);
      let y = Math.round(centerY - NODE_DEFAULT_HEIGHT / 2);
      const taken = (): boolean =>
        flow.getNodes().some((n) => Math.abs(n.position.x - x) < 16 && Math.abs(n.position.y - y) < 16);
      while (taken()) {
        x += 32;
        y += 32;
      }
      const created = await api.createSession({
        rect: { x, y, width: NODE_DEFAULT_WIDTH, height: NODE_DEFAULT_HEIGHT },
      });
      useApp.getState().apply({ type: 'session.created', ...created });
      // Wait for React Flow to know the node before moving to it.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          zoomToNode(created.node.id);
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
          <button type="button" onClick={() => void addTerminal()} disabled={adding}>
            + New terminal
          </button>
          <button
            type="button"
            className="quiet"
            onClick={resetZoom}
            title="Zoom to 100%. Terminals take input only at 100%."
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
