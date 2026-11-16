import { COMMAND_IDS, demoOf, sortedCanvases, type CommandId, type Session } from '@aubergine/shared';
import { api } from './api';
import { nextWaiting } from './attention';
import { canvasActions } from './canvas-actions';
import { neighbour, type Box, type Direction } from './spatial';
import { currentLayout, useApp, type AppStore } from './store';
import { SCOPE_FILTER } from './list-filters';
import { listModel } from './list-model';
import { SORTS } from './terminal-rows';
import { runOfSession } from './workflows/run-model';
import { removeDemo, showMeAround } from './tour/actions';

/**
 * The commands: everything that can be done from a button, a key, or the
 * palette. Each is implemented here once; buttons and keys only run them.
 */
export interface Command {
  id: CommandId;
  title: string;
  /** One sentence for the shortcut sheet and the palette. */
  description: string;
  group: 'Terminals' | 'Canvases' | 'View' | 'Panels' | 'List';
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

/** Whether a button, a tab or a list (not a terminal, not the page itself) has the keyboard. */
const onControl = (): boolean =>
  typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest('.xterm');

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
    canvasActions.get()?.bringIntoView(id);
  },
}));

const stepCommands = ([1, -1] as const).map((by): Command => ({
  id: by === 1 ? 'select.next' : 'select.previous',
  title: by === 1 ? 'Select the next terminal' : 'Select the previous terminal',
  description: `Selects the ${by === 1 ? 'next' : 'previous'} terminal in the terminal list as it is filtered and ordered, wrapping at the ends. With every canvas in scope it switches canvas on the way.`,
  group: 'Terminals',
  available: (state) => listModel(state.app, state.listView, state.canvasId).order.length > 0,
  run: (state) => {
    const { order } = listModel(state.app, state.listView, state.canvasId);
    if (order.length === 0) return;
    const from = state.focus?.sessionId ?? state.selected;
    const at = order.findIndex((step) => step.sessionId === from);
    const next = at < 0 ? (by === 1 ? order[0] : order.at(-1)) : order[(at + by + order.length) % order.length];
    if (!next) return;
    if (next.canvasId !== state.canvasId) {
      // On another canvas: go there, and select once that canvas is the one on screen.
      state.setCanvas(next.canvasId);
      useApp.getState().select(next.sessionId);
      window.setTimeout(() => canvasActions.get()?.bringIntoView(next.sessionId), 80);
      return;
    }
    state.select(next.sessionId);
    canvasActions.get()?.bringIntoView(next.sessionId);
  },
}));

const FILTER_COMMANDS: [CommandId, string, string][] = [
  ['list.filter.waiting', 'waiting', 'waiting for you'],
  ['list.filter.busy', 'busy', 'busy'],
  ['list.filter.unread', 'unread', 'with unread output'],
  ['list.filter.agent', 'agent', 'with an agent'],
  ['list.filter.parked', 'parked', 'parked'],
];

const toggleFilter = (state: AppStore, id: string): void =>
  state.setListView({ filters: state.listView.filters.includes(id) ? state.listView.filters.filter((f) => f !== id) : [...state.listView.filters, id] });

const filterCommands = FILTER_COMMANDS.map(([id, filter, words]): Command => ({
  id,
  title: `List: only terminals ${words}`,
  description: `Switches the filter "${words}" of the terminal list on or off.`,
  group: 'List',
  available: always,
  run: (state) => toggleFilter(state, filter),
}));

/** The parts of the page that hold controls, in the order the keyboard visits them. */
const CONTROL_REGIONS = ['.tour-card button', '.side-panel:not(.collapsed) .list-rows', '.toolbar button', '.tabbar [role="tab"], .tabbar button'];

function focusNextControls(): void {
  const active = document.activeElement;
  const regions = CONTROL_REGIONS.map((selector) => document.querySelector<HTMLElement>(selector)).filter((el): el is HTMLElement => el !== null);
  const containers = ['.tour-card', '.side-panel', '.toolbar', '.tabbar'];
  const at = containers.findIndex((selector) => active?.closest(selector));
  const current = at < 0 ? -1 : regions.findIndex((el) => el.closest(containers[at] as string));
  const next = regions[current + 1];
  if (next) next.focus();
  else if (active instanceof HTMLElement) active.blur();
}

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
    run: () => void canvasActions.get()?.addTerminal(),
  },
  {
    id: 'agent.new',
    title: 'New Claude Code session',
    description: 'Starts a terminal running Claude Code, with hooks that report to this canvas.',
    group: 'Terminals',
    available: withCanvas,
    run: () => void canvasActions.get()?.addTerminal('claude-code'),
  },
  {
    id: 'agent.newWithTools',
    title: 'New Claude Code session with Aubergine tools…',
    description: 'Asks first which Aubergine tools the agent gets: none, those for its own work, or more, with a token made for that session.',
    group: 'Terminals',
    available: withCanvas,
    run: (state) => state.chooseAgentTools(true),
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
  ...stepCommands,
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
    description: 'Shows or hides the notes of the terminal: beside the side panel when that is open, else on the terminal itself.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (!session) return;
      if (!state.side.open) {
        state.request({ kind: 'note', id: session.id });
        return;
      }
      const open = state.drawer?.section === 'terminals' && state.drawer.kind === 'notes' && state.drawer.id === session.id;
      state.openDrawer(open ? null : { section: 'terminals', kind: 'notes', id: session.id });
    },
  },
  {
    id: 'terminal.tags',
    title: 'Edit the tags of the terminal…',
    description: 'Adds or removes tags: short words of your own to find and filter terminals by.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'tags', id: session.id });
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
    id: 'panel.toggle',
    title: 'Show or hide the side panel',
    description: 'Collapses the panel on the left to a narrow strip of icons and counts, or opens it again.',
    group: 'Panels',
    available: always,
    run: (state) => state.setSide({ open: !state.side.open }),
  },
  {
    id: 'list.scope.toggle',
    title: 'List: this canvas, or all canvases',
    description: 'Switches the terminal list between the canvas being looked at and every canvas. Tab follows the list.',
    group: 'List',
    available: always,
    run: (state) => toggleFilter(state, SCOPE_FILTER),
  },
  {
    id: 'list.search',
    title: 'List: filter by text',
    description: 'Puts the keyboard in the text box of the terminal list.',
    group: 'List',
    available: always,
    run: (state) => {
      state.setSide({ open: true, folded: state.side.folded.filter((id) => id !== 'terminals') });
      state.request({ kind: 'list-search', id: 'terminals' });
    },
  },
  {
    id: 'list.filters.clear',
    title: 'List: clear the filters',
    description: 'Removes every filter of the terminal list, the scope included, so that it shows everything.',
    group: 'List',
    available: (state) => state.listView.filters.length > 0 || state.listView.text !== '' || state.listView.tags.length > 0,
    run: (state) => state.setListView({ filters: [], text: '', tags: [] }),
  },
  ...filterCommands,
  {
    id: 'list.grouping.toggle',
    title: 'List: by canvas, or one flat list',
    description: 'Switches the terminal list between groups by canvas and one flat list.',
    group: 'List',
    available: always,
    run: (state) => state.setListView({ grouping: state.listView.grouping === 'flat' ? 'canvas' : 'flat' }),
  },
  {
    id: 'list.sort.cycle',
    title: 'List: change the order of the flat list',
    description: 'Goes to the next order of the flat list: canvas order, last updated, last typed in, name.',
    group: 'List',
    available: (state) => state.listView.grouping === 'flat',
    run: (state) => state.setListView({ sort: SORTS[(SORTS.indexOf(state.listView.sort) + 1) % SORTS.length] ?? 'canvas' }),
  },
  {
    id: 'list.density.toggle',
    title: 'List: compact or two lines',
    description: 'Switches the rows of the terminal list between one line and two.',
    group: 'List',
    available: always,
    run: (state) => state.setListView({ density: state.listView.density === 'compact' ? 'comfortable' : 'compact' }),
  },
  {
    id: 'controls.focus',
    title: 'Move the keyboard to the list, the toolbar, the tabs',
    description: 'Moves the keyboard to the terminal list, then the toolbar, then the canvas tabs, then back to the canvas. Tab moves within each.',
    group: 'Panels',
    available: always,
    run: focusNextControls,
  },
  {
    id: 'tokens.manage',
    title: 'API tokens…',
    description: 'Creates and revokes tokens that let programs of your own call the API.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('tokens'),
  },
  {
    id: 'activity.show',
    title: 'API activity…',
    description: 'Shows what each API token did, call by call.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('activity'),
  },
  {
    id: 'workflows.open',
    title: 'Workflows…',
    description: 'Lists the workflows: make one from a template, change, duplicate or remove one.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('workflows'),
  },
  {
    id: 'workflow.run',
    title: 'Run workflow… on the terminal',
    description: 'Puts the terminal on a workflow: choose one, fill in what it asks for, see what the agent will be told, start.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.startRun({ sessionId: session.id });
    },
  },
  {
    id: 'workflow.runOnAgent',
    title: 'New Claude Code session on a workflow…',
    description: 'Starts a terminal running Claude Code and puts it on a workflow from its first prompt.',
    group: 'Terminals',
    available: withCanvas,
    run: (state) => state.startRun({ sessionId: null }),
  },
  {
    id: 'workflow.view',
    title: 'Show the run of the terminal',
    description: 'Opens the run the terminal is on: every element with its state, and the buttons that move it.',
    group: 'Terminals',
    available: (state) => {
      const session = targetSession(state);
      return session !== null && runOfSession(state.app, session.id) !== null;
    },
    run: (state) => {
      const session = targetSession(state);
      const run = session ? runOfSession(state.app, session.id) : null;
      if (run) state.viewRun(run.id);
    },
  },
  {
    id: 'drafts.review',
    title: 'Review drafts…',
    description: 'Shows what agents and programs proposed: read each as an agent would be told it, then accept, send back or discard.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('review'),
  },
  {
    id: 'workflow.describe',
    title: 'Describe a workflow…',
    description: 'Asks an agent to write a workflow from your description. What it writes arrives as a draft for you to read.',
    group: 'Panels',
    available: always,
    run: (state) => state.describe('workflow'),
  },
  {
    id: 'element.describe',
    title: 'Describe an element…',
    description: 'Asks an agent to write one element from your description. What it writes arrives as a draft for you to read.',
    group: 'Panels',
    available: always,
    run: (state) => state.describe('element'),
  },
  {
    id: 'element.run',
    title: 'Run an element by itself… on the terminal',
    description: 'Runs one element from the shelf on the terminal, without a workflow around it.',
    group: 'Terminals',
    available: (state) => hasTarget(state) && (state.app?.shelf.length ?? 0) > 0,
    run: (state) => {
      const session = targetSession(state);
      // An empty choice: the dialog asks which element.
      if (session) state.startRun({ sessionId: session.id, elementId: '' });
    },
  },
  {
    id: 'terminal.peopleOnly',
    title: 'People only: close the terminal to API tokens, or open it again',
    description: 'While a terminal is people only, no API token may read it or type into it, whatever its scopes.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) attempt(api.protectSession(session.id, !session.peopleOnly).then((next) => useApp.getState().apply({ type: 'session.protected', sessionId: session.id, peopleOnly: next.peopleOnly })), 'Could not change that');
    },
  },
  {
    id: 'tour.start',
    title: 'Take the tour (show me around)',
    description: 'Makes a canvas named "Demo" with stand-ins on it, if there is none, and shows you round it in a few steps. Nothing in it is real.',
    group: 'Panels',
    available: always,
    run: () => void showMeAround(),
  },
  {
    id: 'demo.remove',
    title: 'Remove the demo',
    description: 'Takes away everything the demo made: its canvas, its terminals, their runs and drafts. Nothing else is touched.',
    group: 'Panels',
    available: (state) => state.app !== null && demoOf(state.app) !== null,
    run: () => void removeDemo(),
  },
  {
    id: 'help.show',
    title: 'Help: what you can do here',
    description: 'Lists the main things in one line each, and points at them.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('help'),
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
    description: 'Closes whatever panel is open; else returns the keyboard from a button to the canvas; else clears the selection.',
    group: 'Panels',
    available: (state) => state.picker || state.choosingAgentTools || state.describing !== null || state.editingElement !== null || state.viewingRun !== null || state.startingRun !== null || state.editingWorkflow !== null || state.panel !== null || state.drawer !== null || state.selected !== null || onControl(),
    run: (state) => {
      if (state.picker) state.setPicker(false);
      else if (state.choosingAgentTools) state.chooseAgentTools(false);
      else if (state.describing !== null) state.describe(null);
      else if (state.editingElement !== null) state.editElement(null);
      else if (state.startingRun !== null) state.startRun(null);
      else if (state.viewingRun !== null) state.viewRun(null);
      else if (state.editingWorkflow !== null) state.editWorkflow(null);
      else if (state.panel !== null) state.togglePanel(null);
      else if (state.drawer !== null) state.openDrawer(null);
      else if (onControl()) (document.activeElement as HTMLElement).blur();
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
