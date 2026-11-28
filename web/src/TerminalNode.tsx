import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer, useStore, useStoreApi, type Node, type NodeProps } from '@xyflow/react';
import { NODE_MIN_HEIGHT, NODE_MIN_WIDTH, type CommandId } from '@aubergine/shared';
import { api } from './api';
import { ColorButton } from './ColorButton';
import { parkSession, runCommand } from './commands';
import { hint } from './shortcuts';
import { nodeMode, type NodeMode } from './culling';
import { MoveToCanvas } from './MoveToCanvas';
import { NotePanel } from './NotePanel';
import { SnapshotView } from './SnapshotView';
import { TitleDot } from './StatusBadges';
import { useUnseenNotes } from './notes-seen';
import { atThisComputer, currentLayout, useApp } from './store';
import { TerminalView } from './TerminalView';
import { useBodyTheme, useColorThemeShown } from './theme';
import { TerminalThemeMenu } from './TerminalTheme';
import { colorClass, colorStyle } from './color';
import { noteRoom, noteStartsOpen, rememberNoteOpen } from './note-open';
import { tourSignal } from './tour/tour-store';
import { RecapBlock } from './Recap';
import { RunStrip } from './workflows/RunStrip';
import { TitleSays } from './templates/TemplateSays';
import { terminalHooks } from './page-hooks';

export type TerminalFlowNode = Node<{ sessionId: string }, 'terminal'>;

export const TerminalNode = memo(function TerminalNode({ id, data, selected }: NodeProps<TerminalFlowNode>) {
  const { sessionId } = data;
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const name = session?.name ?? '';
  const exited = session?.state === 'exited';
  // "Open on desktop" is for the computer Aubergine runs on, not another device.
  const here = useApp(atThisComputer);
  const [draft, setDraft] = useState<string | null>(null);
  // The one menu of the title: everything that is done seldom.
  const [more, setMore] = useState(false);
  const moreRoot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!more) return;
    const away = (event: PointerEvent): void => {
      if (!moreRoot.current?.contains(event.target as globalThis.Node)) setMore(false);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMore(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key, true);
    };
  }, [more]);
  // The note sits beside the terminal and is open unless it was closed here before.
  const [noteOpen, setNoteOpenState] = useState(() => noteStartsOpen(sessionId));
  const [noteAsked, setNoteAsked] = useState(false);
  const noteOpenRef = useRef(noteOpen);
  // Whether the whole note is showing now; a note that is open but has no room is not.
  const noteShownRef = useRef(false);
  const setNoteOpen = useCallback(
    (next: boolean | ((was: boolean) => boolean)): void => {
      const now = typeof next === 'function' ? next(noteOpenRef.current) : next;
      noteOpenRef.current = now;
      rememberNoteOpen(sessionId, now);
      // Asked for just now: it takes the keyboard. Simply being there, it does not.
      if (now) setNoteAsked(true);
      setNoteOpenState(now);
    },
    [sessionId],
  );
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
    else setNoteOpen(!noteShownRef.current);
    useApp.getState().asked(ask.tick);
  }, [ask, sessionId, setNoteOpen]);

  const node = useApp((s) => currentLayout(s).nodes.find((n) => n.id === id));
  const color = node?.color ?? 'none';
  // The note never lies over a neighbour by simply being there: it is whole where there is room, a tab where there is little.
  const room = useApp((s) => {
    const nodes = currentLayout(s).nodes;
    const me = nodes.find((n) => n.id === id);
    return me ? noteRoom(me, nodes.filter((n) => n.id !== id)) : 'full';
  });
  const noteShown = noteOpen && (noteAsked || room === 'full');
  /**
   * Runs a command on this terminal from its title or its menu. A command acts on the terminal that has the keyboard
   * before the selected one, so another terminal that has the keyboard is let go of first: otherwise the command
   * would act on that one.
   */
  const actHere = (command: CommandId): void => {
    const store = useApp.getState();
    if (store.focus && store.focus.sessionId !== sessionId) store.focusSession(null);
    store.select(sessionId);
    runCommand(command);
  };
  // Whether this terminal's details are open beside the side panel: its button is pressed while they are.
  const detailsShown = useApp((st) => st.drawer?.section === 'terminals' && st.drawer.kind === 'notes' && st.drawer.id === sessionId);
  noteShownRef.current = noteShown;
  const hasNote = (session?.note ?? '') !== '';
  // Entries added to its note log since the notes were last opened in this browser: said on the one button that opens them.
  const unseen = useUnseenNotes(sessionId, session?.noteLog.length ?? 0);

  // Live only while on screen and large enough to read; see culling.ts.
  const modeRef = useRef<NodeMode>('live');
  // Its body, live or a snapshot, is drawn in its own theme; its title and note are the page's.
  const bodyTheme = useBodyTheme(sessionId);
  const pageTheme = useColorThemeShown();
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
      style={colorStyle(color)}
      className={`terminal-node ${colorClass(color)}${selected ? ' selected' : ''}${isSelected && !focused ? ' is-selected' : ''}`}
      data-part="terminal"
      data-testid="terminal-node"
      {...(session ? terminalHooks(session, color) : {})}
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
      <header className="node-title" data-part="terminal-title" onDoubleClick={() => setDraft(name)}>
        {session && <TitleDot session={session} focused={focused} />}
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
        {draft === null && session && <TitleSays session={session} />}
        <button
          type="button"
          className={`node-tool note-tool nodrag${hasNote ? ' has-note' : ''}`}
          aria-label={`Note for ${name}`}
          aria-pressed={noteShown}
          title={hint('notes.toggle', hasNote ? 'Show note' : 'Add a note')}
          onClick={() => setNoteOpen(!noteShown)}
        >
          Note
          {unseen > 0 && !noteShown && (
            <span className="node-note-new" title={`${unseen} new in its note log`} data-testid="note-new">
              {unseen}
            </span>
          )}
        </button>
        {draft === null && (
          <button
            type="button"
            className="node-tool nodrag"
            aria-label={`Details of ${name}`}
            aria-pressed={detailsShown}
            title={hint('terminal.details', 'Details: what it asks, what is known about it, its note and messages, beside the side panel')}
            onClick={() => {
              actHere('terminal.details');
            }}
            data-testid="node-details"
          >
            Details
          </button>
        )}
        {/* Beside Details: this same terminal by itself in a tab of the browser. Its menu says the same in words. */}
        {draft === null && !exited && (
          <button
            type="button"
            className="node-tool nodrag"
            aria-label={`Open ${name} in a new browser tab`}
            title={hint('terminal.openInNewTab', 'Open in new browser tab: this same terminal by itself in a tab of your browser. Closing the tab ends nothing.')}
            onClick={() => {
              actHere('terminal.openInNewTab');
            }}
            data-testid="node-browser-tab"
          >
            Tab ↗
          </button>
        )}
        {/* The list of canvases to move to hangs from the title; its own button is not shown, the menu's line and the key ask for it. */}
        {draft === null && <MoveToCanvas sessionId={sessionId} name={name} />}
        {/* The themes it can have hang from the title too; the menu's line, a key or the palette ask for them. */}
        {draft === null && <TerminalThemeMenu sessionId={sessionId} name={name} page={pageTheme} />}
        {draft === null && (
          <span className="node-more nodrag" ref={moreRoot}>
            <button type="button" className="node-tool" aria-haspopup="menu" aria-expanded={more} aria-label={`More for ${name}`} title="More: tags, a workflow, a message, the desktop, move, colour, park" onClick={() => setMore((v) => !v)} data-testid="node-more">
              ⋮
            </button>
            {/* Kept in the page while closed: what a key or the palette asks for (move, colour) is answered from here. */}
            <span className="ui-menu toolbar-menu node-menu" role="menu" data-part="menu" hidden={!more} onClick={(event) => (event.target as HTMLElement).closest('[role^="menuitem"]') && !(event.target as HTMLElement).closest('.move-to, .color-button') && setMore(false)} data-testid="node-menu">
              {draft === null && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Tags of ${name}`}
                  title={hint('terminal.tags', (session?.tags.length ?? 0) > 0 ? `Tags: ${session?.tags.join(', ')}` : 'Add tags')}
                  onClick={() => useApp.getState().request({ kind: 'tags', id: sessionId })}
                >
                  Tags…
                </button>
              )}
              {draft === null && !exited && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Run a workflow on ${name}`}
                  title={hint('workflow.run', 'Run a workflow on this terminal')}
                  data-testid="node-run-workflow"
                  onClick={() => {
                    actHere('workflow.run');
                  }}
                >
                  Run a workflow…
                </button>
              )}
              {draft === null && !exited && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Message ${name}`}
                  title={hint('terminal.message', 'Message the agent in this terminal, and see every message to and from it')}
                  data-testid="node-message"
                  onClick={() => {
                    actHere('terminal.message');
                  }}
                >
                  Message…
                </button>
              )}
              {draft === null && !exited && here && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Open ${name} on the desktop`}
                  title={hint('terminal.openOnDesktop', 'Open on desktop: a window of your terminal application on this same terminal. Closing the window ends nothing.')}
                  data-testid="node-open-desktop"
                  onClick={() => {
                    actHere('terminal.openOnDesktop');
                  }}
                >
                  Open on desktop
                </button>
              )}
              {draft === null && !exited && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Open ${name} in a new browser tab`}
                  title={hint('terminal.openInNewTab', 'Open in new browser tab: this same terminal by itself in a tab of your browser. Closing the tab ends nothing.')}
                  data-testid="node-open-tab"
                  onClick={() => {
                    actHere('terminal.openInNewTab');
                  }}
                >
                  Open in new browser tab
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                title={hint('terminal.moveToCanvas', 'Move this terminal to another canvas')}
                data-testid="node-move"
                onClick={() => {
                  actHere('terminal.moveToCanvas');
                }}
              >
                Move to canvas…
              </button>

              {node && (
                <span className="ui-menu-line node-menu-colour">
                  <span>Color</span>
                  <ColorButton
                    value={color}
                    onChange={(next) =>
                      void api.updateNode(id, { x: node.x, y: node.y, width: node.width, height: node.height, color: next })
                    }
                  />
                </span>
              )}
              {draft === null && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Theme of ${name}`}
                  title={hint('terminal.theme', 'The color theme its body is drawn in, whatever the page is drawn in')}
                  data-testid="terminal-theme"
                  onClick={() => {
                    actHere('terminal.theme');
                  }}
                >
                  Theme…
                </button>
              )}
              {draft === null && !exited && session && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={session.peopleOnly}
                  aria-pressed={session.peopleOnly}
                  aria-label={`People only: ${name}`}
                  title={hint('terminal.peopleOnly', session.peopleOnly ? 'People only: no API token may read this terminal or type into it. Click to open it to tokens again.' : 'People only is off: API tokens that have the scope and the reach may read this terminal and type into it. Click to make it people only.')}
                  data-testid="people-only"
                  onClick={() => {
                    actHere('terminal.peopleOnly');
                  }}
                >
                  People only
                </button>
              )}
              {draft === null && session?.agent && (
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`How this agent is set up: ${name}`}
                  title="How this agent is set up, read from its configuration files: MCP servers, plugins, hooks, skills, and what Aubergine added"
                  data-testid="switched-on"
                  onClick={(event) => {
                    event.stopPropagation();
                    useApp.getState().showInventory(sessionId);
                  }}
                >
                  How this agent is set up…
                </button>
              )}
                <button
                  type="button"
                  role="menuitem"
                  aria-label={exited ? `Remove ${name}` : `Park ${name}`}
                  title={exited ? 'Remove' : hint('terminal.park', 'Park: take it off the canvas, the shell keeps running')}
                  onClick={() => parkSession(sessionId)}
                >
                  {exited ? 'Remove' : 'Park'}
                </button>

            </span>
          </span>
        )}
      </header>
      {!exited && <RunStrip sessionId={sessionId} variant="node" />}
      {exited ? (
        <div className="node-body node-ended nodrag" data-part="terminal-body" data-testid="node-ended">
          {session?.meantFor ? (
            // Came in a project file: its shell was never started here. What it was is said; nothing is done because of it.
            <p data-testid="node-not-started">
              Not started yet.{session.meantFor.agent ? ` It was an agent’s terminal (${session.meantFor.agent}): Start gives you a plain shell, and you start the agent yourself.` : ''}
              {session.meantFor.environment && session.meantFor.environment !== 'full' ? ' It worked in a place of its own (a working copy); here it starts in the folder itself.' : ''}
              {session.meantFor.placeUnset ? ' Its place was not set: it starts in your home folder.' : ''}
            </p>
          ) : (
            <p>This shell has ended.</p>
          )}
          {/* A terminal that was never started here has nothing to look back on. */}
          {!session?.meantFor && <RecapBlock sessionId={sessionId} canAsk={false} />}
          <div className="node-ended-actions">
            <button type="button" onClick={() => void api.restartSession(sessionId)} data-testid="node-start">
              {session?.meantFor ? 'Start' : 'Restart here'}
            </button>
            <button type="button" className="quiet" onClick={() => void api.closeSession(sessionId)}>
              Remove
            </button>
          </div>
          {session?.cwd && <p className="node-ended-folder">{session.cwd}</p>}
        </div>
      ) : mode === 'live' ? (
        <LiveBody sessionId={sessionId} onFocusChange={onFocusChange} />
      ) : (
        <div className="node-body nodrag nopan" data-part="terminal-body" data-testid="node-body" data-mode={mode} {...bodyTheme}>
          <SnapshotView sessionId={sessionId} refreshing={mode === 'snapshot'} />
          <div className="node-shield zoomed-out" title="Too small to type in: click to zoom in" />
        </div>
      )}
      {noteShown && (mode === 'live' || exited) && (
        <NotePanel sessionId={sessionId} onClose={() => setNoteOpen(false)} takeKeyboard={noteAsked} />
      )}
    </div>
  );
});

/**
 * The body never drags or pans the canvas. Until its terminal has focus a
 * shield covers it: the wheel then belongs to the canvas, and one click
 * gives the terminal the keyboard, at whatever zoom it is drawn live.
 */
function LiveBody({ sessionId, onFocusChange }: { sessionId: string; onFocusChange: (focused: boolean) => void }) {
  const [focused, setFocused] = useState(false);
  const flow = useStoreApi();
  const zoom = useCallback(() => flow.getState().transform[2], [flow]);
  const live = focused;
  const bodyTheme = useBodyTheme(sessionId);
  const change = (now: boolean): void => {
    setFocused(now);
    onFocusChange(now);
  };
  return (
    <div
      className={`node-body nodrag nopan${live ? ' nowheel' : ''}`}
      onFocus={() => change(true)}
      onBlur={() => change(false)}
      data-part="terminal-body"
      data-testid="node-body"
      {...bodyTheme}
    >
      <TerminalView sessionId={sessionId} interactive zoom={zoom} />
      {!live && (
        <div
          className="node-shield"
          title="Click to use this terminal"
          data-testid="node-shield"
        />
      )}
    </div>
  );
}
