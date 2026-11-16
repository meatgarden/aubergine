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
  DEMO_LABEL,
  NODE_DEFAULT_HEIGHT,
  NODE_DEFAULT_WIDTH,
  findFreeRect,
  nodesInside,
  placeOfSession,
  type AgentKind,
  type AgentToolsChoice,
  type Frame,
  type LayoutNode,
} from '@aubergine/shared';
import { api } from './api';
import { AttentionQueue } from './AttentionQueue';
import { OutsidePanel } from './OutsidePanel';
import { ParkedList } from './ParkedList';
import { Picker } from './Picker';
import { currentLayout, useApp } from './store';
import { canvasActions } from './canvas-actions';
import { runCommand } from './commands';
import { hint } from './shortcuts';
import { ShortcutSheet } from './ShortcutSheet';
import { ActivityScreen, TokenScreen } from './TokenScreen';
import { RunDialog } from './workflows/RunDialog';
import { useEndedRuns } from './workflows/ended-runs';
import { EmptyCanvas } from './EmptyCanvas';
import { FULL_SIZE_HINT, shouldSayFullSize } from './full-size-hint';
import { HelpPanel } from './HelpPanel';
import { HistoryPanel } from './HistoryPanel';
import { InventoryPanel } from './InventoryPanel';
import { tourSignal } from './tour/tour-store';
import { AgentToolsDialog } from './AgentToolsDialog';
import { RunViewDialog } from './workflows/RunViewDialog';
import { WorkflowEditor } from './workflows/WorkflowEditor';
import { WorkflowsScreen } from './workflows/WorkflowsScreen';
import { ReviewScreen } from './review/ReviewScreen';
import './review/drafts-source';
import './review/library-source';
import { LibraryScreen } from './library/LibraryScreen';
import { itemsOfListing, useRepositoryListing } from './review/repository-source';
import { DescribeDialog } from './workflows/DescribeDialog';
import { ShelfEditor } from './workflows/ShelfEditor';
import './workflows/output-views';
import './workflows/element-views';
import './workflows/run-views';
import { FrameNode, type FrameFlowNode } from './FrameNode';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { isFullZoom, loadViewport, saveViewport, useZoomToNode } from './viewport';

const nodeTypes = { terminal: TerminalNode, frame: FrameNode };
type CanvasNode = TerminalFlowNode | FrameFlowNode;

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

/** Shown only when something an agent or a program wrote is waiting to be read. */
function DraftsWaiting() {
  const drafts = useApp((s) => (s.app?.drafts ?? []).filter((d) => d.status === 'waiting').length);
  // Workflow files in repositories that were never accepted, or changed since.
  const waiting = drafts + itemsOfListing(useRepositoryListing()).length;
  if (waiting === 0) return null;
  return (
    <button type="button" className="attention-button" onClick={() => runCommand('drafts.review')} title="Written by agents or programs, or kept in a repository: waiting for you to read them" data-testid="drafts-waiting">
      {waiting} to review
    </button>
  );
}

export function Canvas() {
  const canvasId = useApp((s) => s.canvasId);
  // The demo's own canvas offers to take the demo away.
  const onDemo = useApp((s) => s.canvasId !== null && s.app?.canvases.find((c) => c.id === s.canvasId)?.labels[DEMO_LABEL] !== undefined);
  const layout = useApp((s) => currentLayout(s).nodes);
  // This component is mounted afresh for each canvas, so this is read once per canvas.
  const [initialViewport] = useState(() => loadViewport(canvasId ?? ''));
  const live = useApp((s) => s.live);
  const theme = useApp((s) => s.settings.theme);
  const focusSession = useApp((s) => s.focusSession);
  const notice = useApp((s) => s.notice);
  // Tooltips name the keys in effect, which follow the settings file.
  useApp((s) => s.settings.shortcuts);
  const flow = useReactFlow();
  const zoomToNode = useZoomToNode();
  const zoom = useStore((s) => s.transform[2]);

  // React Flow owns the nodes while they are dragged or resized; the saved
  // layout replaces them whenever it changes.
  const frames = useApp((s) => currentLayout(s).frames);
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
      // Zoomed out, a click does not type: it zooms in first. Said once, where it happens.
      if (!isFullZoom(flow.getViewport().zoom) && shouldSayFullSize()) {
        setFullSizeHint({ x: event.clientX, y: event.clientY });
        setTimeout(() => setFullSizeHint(null), 6000);
      }
      zoomToNode(node.id);
      focusSession((node as TerminalFlowNode).data.sessionId);
    },
    [zoomToNode, focusSession, flow],
  );

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      // Text is only sharp on whole pixels.
      if (isFullZoom(viewport.zoom) && !(Number.isInteger(viewport.x) && Number.isInteger(viewport.y))) {
        const snapped = { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: 1 };
        void flow.setViewport(snapped);
        if (canvasId) saveViewport(canvasId, snapped);
        return;
      }
      if (canvasId) saveViewport(canvasId, viewport);
      if (viewport.zoom < 0.95) tourSignal('canvas.zoomed-out');
    },
    [flow, canvasId],
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

  // Runs that are over are read from the archive: at first, and again whenever a run leaves the live ones.
  const liveRuns = useApp((s) => s.app?.runs.length ?? 0);
  useEffect(() => {
    void useEndedRuns.getState().refresh();
  }, [liveRuns]);

  const [adding, setAdding] = useState(false);
  const [fullSizeHint, setFullSizeHint] = useState<{ x: number; y: number } | null>(null);
  const setError = useApp((s) => s.setNotice);

  const addTerminal = useCallback(async (agent?: AgentKind, agentArgs?: string[], agentTools?: AgentToolsChoice): Promise<string | null> => {
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
      if (!canvasId) return null;
      const created = await api.createSession({ rect, canvasId, ...(agent ? { agent } : {}), ...(agent && agentArgs ? { agentArgs } : {}), ...(agent && agentTools ? { agentTools } : {}) });
      useApp.getState().apply({ type: 'session.created', canvasId, ...created });
      goToNode(created.node.id, created.session.id);
      return created.session.id;
    } catch (e) {
      setError(`Could not start a terminal: ${(e as Error).message}`);
      return null;
    } finally {
      setAdding(false);
    }
  }, [flow, goToNode, canvasId, setError]);

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
      if (!canvasId) return;
      const frame = await api.createFrame({ rect: { x, y, width, height }, canvasId });
      useApp.getState().apply({ type: 'frame.created', canvasId, frame });
    } catch (e) {
      setError(`Could not add a frame: ${(e as Error).message}`);
    }
  }, [flow, canvasId, setError]);

  const zoomToFit = useCallback(() => {
    void flow.fitView({ padding: 0.08, maxZoom: 1, duration: 200 });
  }, [flow]);

  /** Takes keyboard focus away from any terminal, back to the canvas. */
  const releaseFocus = useCallback(() => {
    focusSession(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [focusSession]);

  /** Brings a session's node into view at 100% without giving it the keyboard. */
  const reveal = useCallback(
    (sessionId: string) => {
      const node = currentLayout(useApp.getState()).nodes.find((n) => n.sessionId === sessionId);
      if (node) zoomToNode(node.id, { reveal: true });
    },
    [zoomToNode],
  );

  /** Pans to a session's node if part of it is off screen. The zoom stays as it is. */
  const bringIntoView = useCallback(
    (sessionId: string) => {
      const node = currentLayout(useApp.getState()).nodes.find((n) => n.sessionId === sessionId);
      const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
      if (!node || !pane) return;
      const view = flow.getViewport();
      const left = node.x * view.zoom + view.x;
      const top = node.y * view.zoom + view.y;
      const right = left + node.width * view.zoom;
      const bottom = top + node.height * view.zoom;
      // The toolbar covers a strip at the top.
      if (left >= 0 && top >= 48 && right <= pane.width && bottom <= pane.height) return;
      void flow.setCenter(node.x + node.width / 2, node.y + node.height / 2, { zoom: view.zoom, duration: 200, interpolate: 'linear' });
    },
    [flow],
  );

  // Commands reach this canvas through here; see commands.ts.
  useEffect(
    () =>
      canvasActions.register({
        addTerminal,
        addFrame: () => void addFrame(),
        zoomToFit,
        resetZoom,
        releaseFocus,
        reveal,
        bringIntoView,
      }),
    [addTerminal, addFrame, zoomToFit, resetZoom, releaseFocus, reveal, bringIntoView],
  );

  // Asked to bring a session into view: by the picker, the queue, the parked list, `aubergine here`,
  // or the address this page was opened on. This is the one way to get to a session, wherever it is.
  const show = useApp((s) => s.show);
  useEffect(() => {
    if (!show || !canvasId) return;
    let cancelled = false;
    void (async () => {
      const store = useApp.getState();
      // A request is used once. Left in place it would be replayed on every later change of
      // canvas, and would bring back a session the user has parked since.
      const done = (): void => useApp.getState().shown(show.tick);
      const session = store.app?.sessions.find((x) => x.id === show.sessionId);
      if (!session) return done();
      if (session.state === 'parked') {
        // A parked session comes back onto the canvas being looked at.
        const restored = await api.restoreSession(session.id, canvasId).catch(() => null);
        if (cancelled) return;
        if (!restored) return done();
        store.apply({ type: 'session.restored', sessionId: session.id, canvasId, node: restored.node });
      }
      const app = useApp.getState().app;
      const place = app ? placeOfSession(app, show.sessionId) : null;
      if (cancelled) return;
      if (!place) return done();
      if (place.canvas.id !== canvasId) {
        // On another canvas: go there first. This effect runs again once that canvas is showing.
        useApp.getState().setCanvas(place.canvas.id);
        return;
      }
      goToNode(place.node.id, show.sessionId);
      done();
    })();
    return () => {
      cancelled = true;
    };
  }, [show, canvasId, goToNode]);

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
        onPaneClick={() => {
          releaseFocus();
          useApp.getState().select(null);
        }}
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
          <button type="button" onClick={() => runCommand('terminal.new')} disabled={adding} title={hint('terminal.new')} data-testid="toolbar-new-terminal">
            + New terminal
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => runCommand('agent.new')}
            disabled={adding}
            title={hint('agent.new', 'New Claude Code session: starts claude with hooks that report to this canvas')}
          >
            + Claude Code
          </button>
          <button
            type="button"
            className="quiet toolbar-attached"
            aria-label="New Claude Code session with Aubergine tools"
            onClick={() => runCommand('agent.newWithTools')}
            disabled={adding}
            title={hint('agent.newWithTools', 'New Claude Code session with Aubergine tools: choose which first')}
            data-testid="agent-with-tools"
          >
            ⚙
          </button>
          <button
            type="button"
            className="quiet toolbar-attached"
            aria-label="New Claude Code session on a workflow"
            onClick={() => runCommand('workflow.runOnAgent')}
            disabled={adding}
            title={hint('workflow.runOnAgent', 'New Claude Code session on a workflow: choose the workflow first')}
            data-testid="agent-on-workflow"
          >
            ⇶
          </button>
          <button type="button" className="quiet" onClick={() => runCommand('workflows.open')} title={hint('workflows.open', 'Workflows: make, change and run them')} data-testid="toolbar-workflows">
            Workflows
          </button>
          <button type="button" className="quiet" onClick={() => runCommand('library.open')} title={hint('library.open', 'Library: workflows and elements others published, to read and install')} data-testid="toolbar-library">
            Library
          </button>
          <DraftsWaiting />
          <button type="button" className="quiet" onClick={() => runCommand('frame.new')} title={hint('frame.new', 'Add a frame to group terminals')}>
            + Frame
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => runCommand('palette.toggle')}
            title={hint('palette.toggle', 'Go to a session or canvas, or run a command')}
            data-testid="toolbar-goto"
          >
            Go to…
          </button>
          <button type="button" className="quiet" onClick={() => runCommand('view.fit')} title={hint('view.fit', 'Zoom to fit everything')}>
            Fit
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => runCommand('view.actualSize')}
            title={hint('view.actualSize', 'Zoom to 100%. Terminals take input only at 100%.')}
            data-testid="zoom-level"
          >
            {percent}
          </button>
          <OutsidePanel />
          <AttentionQueue />
          <ParkedList />
          {!live && <span className="warning">Reconnecting…</span>}
          {onDemo && (
            <button type="button" className="quiet" onClick={() => runCommand('demo.remove')} title="Take away everything the demo made. Nothing else is touched." data-testid="remove-demo">
              Remove the demo
            </button>
          )}
          <button type="button" className="quiet" aria-label="Help" onClick={() => runCommand('help.show')} title={hint('help.show', 'Help: what you can do here, and the keyboard shortcuts')} data-testid="toolbar-help">
            ?
          </button>
          {notice && <span className="warning">{notice}</span>}
        </Panel>
        {layout.length === 0 && frames.length === 0 && (
          <Panel position="top-center" className="empty">
            <EmptyCanvas />
          </Panel>
        )}
      </ReactFlow>
      {fullSizeHint && (
        <div className="full-size-hint" role="status" style={{ left: Math.max(8, Math.min(fullSizeHint.x + 12, window.innerWidth - 340)), top: Math.max(8, fullSizeHint.y - 44) }} data-testid="full-size-hint">
          {FULL_SIZE_HINT}
        </div>
      )}
      <Picker />
      <ShortcutSheet />
      <HelpPanel />
      <InventoryPanel />
      <HistoryPanel />
      <TokenScreen />
      <ActivityScreen />
      <WorkflowsScreen />
      <WorkflowEditor />
      <ShelfEditor />
      <DescribeDialog />
      <ReviewScreen />
      <LibraryScreen />
      <RunDialog />
      <AgentToolsDialog />
      <RunViewDialog />
    </div>
  );
}
