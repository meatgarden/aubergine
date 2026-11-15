import { COMMAND_IDS, sortedCanvases, type CommandId, type Session } from '@aubergine/shared';
import { api } from './api';
import { nextWaiting } from './attention';
import { canvasActions } from './canvas-actions';
import { neighbour, type Box, type Direction } from './spatial';
import { currentLayout, useApp, type AppStore } from './store';

/**
 * The commands: everything that can be done from a button, a key, or the
 * palette. Each is implemented here once; buttons and keys only run them.
 */
export interface Command {
  id: CommandId;
  title: string;
  /** One sentence for the shortcut sheet and the palette. */
  description: string;
  group: 'Terminals' | 'Canvases' | 'View' | 'Panels';
  /** Whether it can run right now. A command that cannot is shown greyed out and does nothing. */
  available: (state: AppStore) => boolean;
  run: (state: AppStore) => void;
}

/** Runs something that talks to the server, and shows why if it fails. */
function attempt(work: Promise<unknown>, what: string): void {
  useApp.getState().setNotice(null);
  work.catch((error: unknown) => useApp.getState().setNotice(`${what}: ${(error as Error).message}`));
}

const onCanvas = (state: AppStore, sessionId: string | null | undefined): boolean =>
  !!sessionId && currentLayout(state).nodes.some((node) => node.sessionId === sessionId);

/** The terminal a command acts on: the one with the keyboard, else the selected one. */
export function targetSession(state: AppStore): Session | null {
  const id = state.focus?.sessionId ?? state.selected;
  if (!onCanvas(state, id)) return null;
  return state.app?.sessions.find((session) => session.id === id) ?? null;
}

const boxes = (state: AppStore): Box[] =>
  currentLayout(state).nodes.map((node) => ({ id: node.sessionId, x: node.x, y: node.y, width: node.width, height: node.height }));

function nextTo(state: AppStore, direction: Direction): string | null {
  const from = state.focus?.sessionId ?? state.selected;
  return neighbour(boxes(state), onCanvas(state, from) ? (from ?? null) : null, direction)?.id ?? null;
}

/** Takes a terminal off the canvas; its shell keeps running. One whose shell has ended is removed instead. */
export function parkSession(sessionId: string): void {
  const session = useApp.getState().app?.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  attempt(session.state === 'exited' ? api.closeSession(sessionId) : api.parkSession(sessionId), `Could not park "${session.name}"`);
}

function addCanvas(state: AppStore): void {
  const canvases = state.app ? sortedCanvases(state.app) : [];
  const names = new Set(canvases.map((c) => c.name));
  let n = canvases.length + 1;
  while (names.has(`Canvas ${n}`)) n += 1;
  attempt(
    api.createCanvas({ name: `Canvas ${n}` }).then((created) => {
      const { nodes: _nodes, frames: _frames, counts: _counts, ...canvas } = created;
      const store = useApp.getState();
      store.apply({ type: 'canvas.created', canvas: { ...canvas, layout: { nodes: [], frames: [] } } });
      store.setCanvas(created.id);
    }),
    'Could not add a canvas',
  );
}

function stepCanvas(state: AppStore, by: number): void {
  const canvases = state.app ? sortedCanvases(state.app) : [];
  const index = canvases.findIndex((c) => c.id === state.canvasId);
  const next = canvases[(index + by + canvases.length) % canvases.length];
  if (next && next.id !== state.canvasId) state.setCanvas(next.id);
}

const canvasCount = (state: AppStore): number => state.app?.canvases.length ?? 0;
const always = (): boolean => true;
const withCanvas = (): boolean => canvasActions.get() !== null;
const hasTerminals = (state: AppStore): boolean => currentLayout(state).nodes.length > 0;
const hasTarget = (state: AppStore): boolean => targetSession(state) !== null;
const parked = (state: AppStore): Session[] => (state.app?.sessions ?? []).filter((s) => s.state === 'parked');

const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down'];
const WORDS: Record<Direction, string> = { left: 'to the left', right: 'to the right', up: 'above', down: 'below' };

const goToCanvas = Array.from({ length: 9 }, (_, i): Command => ({
  id: `canvas.go.${i + 1}` as CommandId,
  title: `Go to canvas ${i + 1}`,
  description: `Shows the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][i]} canvas.`,
  group: 'Canvases',
  available: (state) => canvasCount(state) > i,
  run: (state) => {
    const canvas = state.app ? sortedCanvases(state.app)[i] : undefined;
    if (canvas) state.setCanvas(canvas.id);
  },
}));

const focusCommands = DIRECTIONS.map((direction): Command => ({
  id: `focus.${direction}`,
  title: `Go to the terminal ${WORDS[direction]}`,
  description: `Gives the keyboard to the terminal ${WORDS[direction]} on this canvas.`,
  group: 'Terminals',
  available: hasTerminals,
  run: (state) => {
    const id = nextTo(state, direction);
    if (id) state.showSession(id);
  },
}));

const selectCommands = DIRECTIONS.map((direction): Command => ({
  id: `select.${direction}`,
  title: `Select the terminal ${WORDS[direction]}`,
  description: `Selects the terminal ${WORDS[direction]} without going into it.`,
  group: 'Terminals',
  available: hasTerminals,
  run: (state) => {
    const id = nextTo(state, direction);
    if (!id) return;
    state.select(id);
    canvasActions.get()?.reveal(id);
  },
}));

export const COMMANDS: readonly Command[] = [
  {
    id: 'palette.toggle',
    title: 'Go to… / run a command',
    description: 'Opens the palette: sessions, canvases and every command.',
    group: 'Panels',
    available: always,
    run: (state) => {
      canvasActions.get()?.releaseFocus();
      state.setPicker(!state.picker);
    },
  },
  {
    id: 'terminal.new',
    title: 'New terminal',
    description: 'Starts a terminal in free space on this canvas.',
    group: 'Terminals',
    available: withCanvas,
    run: () => canvasActions.get()?.addTerminal(),
  },
  {
    id: 'agent.new',
    title: 'New Claude Code session',
    description: 'Starts a terminal running Claude Code, with hooks that report to this canvas.',
    group: 'Terminals',
    available: withCanvas,
    run: () => canvasActions.get()?.addTerminal('claude-code'),
  },
  {
    id: 'frame.new',
    title: 'New frame',
    description: 'Adds a frame to group terminals.',
    group: 'Terminals',
    available: withCanvas,
    run: () => canvasActions.get()?.addFrame(),
  },
  ...focusCommands,
  ...selectCommands,
  {
    id: 'terminal.enter',
    title: 'Go into the selected terminal',
    description: 'Gives the keyboard to the selected terminal.',
    group: 'Terminals',
    available: (state) => onCanvas(state, state.selected) && state.focus === null,
    run: (state) => {
      if (state.selected) state.showSession(state.selected);
    },
  },
  {
    id: 'terminal.leave',
    title: 'Leave the terminal',
    description: 'Takes the keyboard out of the terminal, back to the canvas. The terminal stays selected.',
    group: 'Terminals',
    available: (state) => state.focus !== null,
    run: () => canvasActions.get()?.releaseFocus(),
  },
  {
    id: 'terminal.park',
    title: 'Park the terminal',
    description: 'Takes the terminal off the canvas. Its shell keeps running.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) parkSession(session.id);
    },
  },
  {
    id: 'parked.restoreLast',
    title: 'Restore the last parked terminal',
    description: 'Brings the terminal parked most recently back onto this canvas.',
    group: 'Terminals',
    available: (state) => parked(state).length > 0,
    run: (state) => {
      const all = parked(state);
      const recent = [...state.parkedHere].reverse().find((id) => all.some((s) => s.id === id));
      const id = recent ?? all.at(-1)?.id;
      if (id) state.showSession(id);
    },
  },
  {
    id: 'terminal.rename',
    title: 'Rename the terminal',
    description: 'Edits the name of the terminal.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'rename-session', id: session.id });
    },
  },
  {
    id: 'terminal.moveToCanvas',
    title: 'Move the terminal to another canvas…',
    description: 'Opens the list of canvases to move the terminal to. Its shell is not touched.',
    group: 'Terminals',
    available: (state) => hasTarget(state) && canvasCount(state) > 1,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'move', id: session.id });
    },
  },
  {
    id: 'notes.toggle',
    title: 'Open or close the notes',
    description: 'Shows or hides the notes of the terminal.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'note', id: session.id });
    },
  },
  {
    id: 'attention.next',
    title: 'Go to the next waiting session',
    description: 'Goes to the next session that is waiting for you, on whichever canvas it is.',
    group: 'Terminals',
    available: (state) => nextWaiting(state.app?.sessions ?? [], state.focus?.sessionId ?? null) !== null,
    run: (state) => {
      const next = nextWaiting(state.app?.sessions ?? [], state.focus?.sessionId ?? null);
      if (next) state.showSession(next.id);
    },
  },
  {
    id: 'canvas.new',
    title: 'New canvas',
    description: 'Adds a canvas and shows it.',
    group: 'Canvases',
    available: (state) => state.app !== null,
    run: addCanvas,
  },
  {
    id: 'canvas.next',
    title: 'Next canvas',
    description: 'Shows the canvas after this one.',
    group: 'Canvases',
    available: (state) => canvasCount(state) > 1,
    run: (state) => stepCanvas(state, 1),
  },
  {
    id: 'canvas.previous',
    title: 'Previous canvas',
    description: 'Shows the canvas before this one.',
    group: 'Canvases',
    available: (state) => canvasCount(state) > 1,
    run: (state) => stepCanvas(state, -1),
  },
  ...goToCanvas,
  {
    id: 'canvas.rename',
    title: 'Rename the canvas',
    description: 'Edits the name of this canvas.',
    group: 'Canvases',
    available: (state) => state.canvasId !== null,
    run: (state) => {
      if (state.canvasId) state.request({ kind: 'rename-canvas', id: state.canvasId });
    },
  },
  {
    id: 'view.fit',
    title: 'Zoom to fit',
    description: 'Shows everything on this canvas.',
    group: 'View',
    available: withCanvas,
    run: () => canvasActions.get()?.zoomToFit(),
  },
  {
    id: 'view.actualSize',
    title: 'Zoom to 100%',
    description: 'Returns to full size. Terminals take input only at 100%.',
    group: 'View',
    available: withCanvas,
    run: () => canvasActions.get()?.resetZoom(),
  },
  {
    id: 'parked.open',
    title: 'Open the parked list',
    description: 'Shows the terminals that are parked.',
    group: 'Panels',
    available: (state) => parked(state).length > 0,
    run: (state) => state.togglePanel('parked'),
  },
  {
    id: 'outside.open',
    title: 'Open Outside terminals',
    description: 'Shows the terminals you have open outside the canvas.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('outside'),
  },
  {
    id: 'shortcuts.show',
    title: 'Show shortcuts',
    description: 'Shows every command and its keys.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('shortcuts'),
  },
  {
    id: 'panels.close',
    title: 'Close panels',
    description: 'Closes whatever panel is open; with none open, clears the selection.',
    group: 'Panels',
    available: (state) => state.picker || state.panel !== null || state.selected !== null,
    run: (state) => {
      if (state.picker) state.setPicker(false);
      else if (state.panel !== null) state.togglePanel(null);
      else state.select(null);
    },
  },
];

const BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));

export function commandById(id: CommandId): Command {
  const command = BY_ID.get(id);
  if (!command) throw new Error(`No command ${id}`);
  return command;
}

/** Runs a command if it is available. Returns whether it ran. */
export function runCommand(id: CommandId): boolean {
  const state = useApp.getState();
  const command = commandById(id);
  if (!command.available(state)) return false;
  command.run(state);
  return true;
}

/** Commands in the order the shortcut sheet and the palette list them. */
export const COMMAND_ORDER: readonly CommandId[] = COMMANDS.map((command) => command.id);

// Every command name the settings file may mention has an implementation here, and the other way round.
if (COMMANDS.length !== COMMAND_IDS.length) throw new Error('The command list and the command names differ');
