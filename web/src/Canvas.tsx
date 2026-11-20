import { useMapFolded, underMap } from './map-fold';
import { NOTE_GAP, NOTE_WIDTH } from './note-open';
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
  placeOfSession,
  type AgentKind,
  type AgentToolsChoice,
  type Frame,
  type LayoutNode,
} from '@aubergine/shared';
import { api } from './api';
import { OutsidePanel } from './OutsidePanel';
import { ParkedList } from './ParkedList';
import { currentLayout, useApp } from './store';
import { canvasActions } from './canvas-actions';
import { runCommand } from './commands';
import { afterOpening } from './desktop';
import { hint } from './shortcuts';
import { setAdding } from './NewTerminal';
import { IconButton, MenuButton } from './ui';
import { useEndedRuns } from './workflows/ended-runs';
import { EmptyCanvas } from './EmptyCanvas';
import { FULL_SIZE_HINT, shouldSayFullSize } from './full-size-hint';
import { tourSignal } from './tour/tour-store';
import './review/drafts-source';
import './review/library-source';
import './review/project-file-source';
import './panel/sections/copies';
import './panel/sections/for-you';
import './workflows/output-views';
import './workflows/element-views';
import './workflows/run-views';
import { FrameNode, type FrameFlowNode } from './FrameNode';
import { TerminalNode, type TerminalFlowNode } from './TerminalNode';
import { isFullZoom, loadViewport, saveViewport, useZoomToNode } from './viewport';
import { READABLE_ZOOM } from './culling';
import { useBarKeptOpen } from './bar-open';
import { opensUp, useBarPlace } from './bar-place';
import { BarSettings } from './BarSettings';

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

/** Under this width the bar over the canvas has no room for everything in one row. */
const NARROW_CANVAS = 640;

/**
 * Where the bar over the canvas has no room for them, what is used seldom is in one menu at its end: the terminals
 * that are not on this canvas.
 */
function NarrowMenu() {
  const parked = useApp((s) => (s.app?.sessions ?? []).filter((session) => session.state === 'parked').length);
  return (
    <MenuButton label="More" more testid="toolbar-more" menuTestid="toolbar-more-menu" className="toolbar-more">
      {parked > 0 && (
        <button type="button" role="menuitem" title={hint('parked.open')} onClick={() => runCommand('parked.open')} data-testid="toolbar-menu-parked">
          Parked terminals: {parked}…<small>Put away, still running: bring one back.</small>
        </button>
      )}
      <button type="button" role="menuitem" title={hint('outside.open')} onClick={() => runCommand('outside.open')} data-testid="toolbar-menu-outside">
        Terminals open elsewhere…<small>In your terminal application: bring one in.</small>
      </button>
    </MenuButton>
  );
}

/**
 * The small map in the corner, with the one button that folds it away. It steps aside while the terminal in use
 * (typed into, or selected), or the note beside it, lies under it, so that it never covers what is being used.
 */
function CanvasMap({ aboveBar }: { aboveBar: boolean }) {
  const folded = useMapFolded();
  // The terminal in use: the one that has the keyboard, or the one that is selected (its note may have the keyboard).
  const focused = useApp((s) => {
    const id = s.focus?.sessionId ?? s.selected;
    return id ? (currentLayout(s).nodes.find((n) => n.sessionId === id) ?? null) : null;
  });
  const aside = useStore((s) => focused !== null && underMap(focused, NOTE_GAP + NOTE_WIDTH, { x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }, { width: s.width, height: s.height }));
  // Where the bar stands in the map's corner, the map stands over it.
  return !folded && !aside ? <MiniMap pannable zoomable position="bottom-right" className={`minimap${aboveBar ? ' above-bar' : ''}`} /> : null;
}

/** The button that folds the map away and brings it back: a picture of a map, in the bar beside "Go to…". */
function MapButton() {
  const folded = useMapFolded();
  useApp((s) => s.settings.shortcuts);
  const words = folded ? 'Show the map of this canvas' : 'Hide the map of this canvas';
  return (
    <IconButton className="quiet map-fold" label={words} aria-expanded={!folded} title={hint('view.map', words)} onClick={() => runCommand('view.map')} data-testid="map-fold">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z" />
        <path d="M9 4v14M15 6v14" />
      </svg>
    </IconButton>
  );
}

export function Canvas() {
  const canvasId = useApp((s) => s.canvasId);
  // The demo's own canvas offers to take the demo away.
  const layout = useApp((s) => currentLayout(s).nodes);
  // This component is mounted afresh for each canvas, so this is read once per canvas.
  const [initialViewport] = useState(() => loadViewport(canvasId ?? ''));
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
      // A control, and the note beside the terminal, keep the click: the terminal does not take the keyboard from them.
      if ((event.target as HTMLElement).closest('input, button, textarea, a, [role="button"], .note-panel')) return;
      // A click gives the terminal the keyboard where it is. Only when it is too small to read
      // does the view zoom in first; that is said once, where it happens.
      if (flow.getViewport().zoom < READABLE_ZOOM) {
        if (shouldSayFullSize()) {
          setFullSizeHint({ x: event.clientX, y: event.clientY });
          setTimeout(() => setFullSizeHint(null), 6000);
        }
        zoomToNode(node.id);
      }
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

  // The canvas is narrow (the details are open beside the panel, say): the bar keeps to one row, and what is used seldom is in its menu.
  const narrow = useStore((s) => s.width > 0 && s.width < NARROW_CANVAS);
  const barOpen = useBarKeptOpen();
  const barAt = useBarPlace();
  const [fullSizeHint, setFullSizeHint] = useState<{ x: number; y: number } | null>(null);
  const setError = useApp((s) => s.setNotice);

  const addTerminal = useCallback(async (agent?: AgentKind, agentArgs?: string[], agentTools?: AgentToolsChoice, where?: { cwd?: string; environment?: string; name?: string; desktop?: boolean }): Promise<string | null> => {
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
      // Every way of making a terminal in the page comes through here: the setting decides, unless a dialog said otherwise for this one.
      const created = await api.createSession({ rect, canvasId, ...(agent ? { agent } : {}), ...(agent && agentArgs ? { agentArgs } : {}), ...(agent && agentTools ? { agentTools } : {}), ...(where?.cwd ? { cwd: where.cwd } : {}), ...(where?.environment ? { environment: where.environment } : {}), ...(where?.name ? { name: where.name, uniqueName: true } : {}) , desktop: where?.desktop ?? useApp.getState().settings.desktop.openNew });
      useApp.getState().apply({ type: 'session.created', canvasId, ...created });
      goToNode(created.node.id, created.session.id);
      // The terminal is made either way; why its window could not be opened is said.
      if (created.desktop) setError(afterOpening(created.desktop));
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
      // Looked for among everything: a terminal that is asked for may be in another project, and the page goes there.
      const everything = useApp.getState().whole ?? app;
      const place = everything ? placeOfSession(everything, show.sessionId) : null;
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
        <CanvasMap aboveBar={barAt === 'bottom-right'} />
        {/* Before the bar in the page, so that a menu hanging from the bar lies over it. */}
        {layout.length === 0 && frames.length === 0 && (
          <Panel position="top-center" className="empty">
            <EmptyCanvas />
          </Panel>
        )}
        {/* Folded to "Go to…" and the map's button unless kept open in Settings: the rest shows while the pointer or the keyboard is in the bar. "New terminal" is at the top of the list of terminals. */}
        {/* It stands where this browser chose in Settings; at the foot of the canvas what hangs from it opens upward. */}
        <Panel position={barAt} className={`toolbar${narrow ? ' is-narrow' : ''}${barOpen ? '' : ' is-folded'}${opensUp(barAt) ? ' opens-up' : ''}${barAt.endsWith('-right') ? ' at-right' : ''}`} data-place={barAt} data-testid="canvas-bar">
          <span className="toolbar-group toolbar-first" role="group" aria-label="Go to, and the map">
            <button
              type="button"
              className="quiet"
              onClick={() => runCommand('palette.toggle')}
              title={hint('palette.toggle', 'Go to a terminal or canvas, or run a command')}
              data-testid="toolbar-goto"
            >
              Go to…
            </button>
            <MapButton />
          </span>
          <span className="toolbar-rest" data-testid="toolbar-rest">
          <span className="toolbar-group" role="group" aria-label="The view">
            <button type="button" className="quiet" onClick={() => runCommand('view.fit')} title={hint('view.fit', 'Zoom to fit everything')}>
              Fit
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => runCommand('view.actualSize')}
              title={hint('view.actualSize', 'Zoom to 100%, where text is sharpest')}
              data-testid="zoom-level"
            >
              {percent}
            </button>
          </span>
          <span className="toolbar-group toolbar-status" role="group" aria-label="Terminals that are not on this canvas">
            <ParkedList />
            <OutsidePanel />
            {narrow && <NarrowMenu />}
          </span>
          <span className="toolbar-group" role="group" aria-label="This bar">
            <BarSettings />
          </span>
          </span>
          {notice && <span className="warning">{notice}</span>}
        </Panel>
      </ReactFlow>
      {fullSizeHint && (
        <div className="full-size-hint" role="status" style={{ left: Math.max(8, Math.min(fullSizeHint.x + 12, window.innerWidth - 340)), top: Math.max(8, fullSizeHint.y - 44) }} data-testid="full-size-hint">
          {FULL_SIZE_HINT}
        </div>
      )}
    </div>
  );
}
