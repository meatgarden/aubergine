import { foldMap, mapFolded } from './map-fold';
import { canvasColumnFolded, canvasView, nextCanvasView, setCanvasColumnFolded, setCanvasView } from './canvas-view';
import { COLOR_THEMES, COMMAND_IDS, THEMES, THEME_WORDS, demoOf, sortedCanvases, type CommandId, type Session } from '@aubergine/shared';
import { chooseColorTheme, chooseTheme } from './theme';
import { openOnDesktop } from './desktop';
import { canvasHref, openInNewTab, terminalHref } from './address';
import { api, isSuperseded } from './api';
import { nextWaiting } from './attention';
import { canvasActions } from './canvas-actions';
import { neighbour, type Box, type Direction } from './spatial';
import { atThisComputer, currentCanvas, currentLayout, useApp, type AppStore } from './store';
import { SCOPE_FILTER } from './list-filters';
import { listModel, listSource } from './list-model';
import { SORTS } from './terminal-rows';
import { toggleGroupFold } from './group-actions';
import { runOfSession } from './workflows/run-model';
import { removeDemo, showMeAround } from './tour/actions';
import { startPageTour } from './tour/page-steps';

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
  /** It acts on the desktop of the computer Aubergine runs on: not offered on another device (`atThisComputer`). */
  atThisComputerOnly?: true;
}

/** Said when such a command is asked for on another device. */
export const NOT_AT_THIS_COMPUTER = 'Not available on this device: it acts on the desktop of the computer Aubergine runs on.';

/** Whether a command is offered at all where the page is: everything at that computer, all but what acts on its desktop elsewhere. */
export const offeredHere = (command: Pick<Command, 'atThisComputerOnly'>, state: Pick<AppStore, 'here'>): boolean => !command.atThisComputerOnly || atThisComputer(state);

/** Runs something that talks to the server, and shows why if it fails. */
function attempt(work: Promise<unknown>, what: string): void {
  useApp.getState().setNotice(null);
  // An answer about a server no longer shown is not said.
  work.catch((error: unknown) => !isSuperseded(error) && useApp.getState().setNotice(`${what}: ${(error as Error).message}`));
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
  if (session.state === 'exited') {
    attempt(api.closeSession(sessionId), `Could not close "${session.name}"`);
    return;
  }
  const canvasId = useApp.getState().canvasId;
  attempt(
    api.parkSession(sessionId).then(() =>
      // Parking takes a terminal off the canvas and its shell keeps running: it is said, with the way back.
      useApp.getState().say(`Parked “${session.name}”. Its shell keeps running.`, {
        label: 'Undo',
        run: () => attempt(api.restoreSession(sessionId, canvasId), `Could not put "${session.name}" back`),
      }),
    ),
    `Could not park "${session.name}"`,
  );
}

/** Makes a canvas with the next free name, and puts it in this page's state at once. */
async function makeCanvas(state: AppStore): Promise<{ id: string; projectId: string }> {
  const canvases = state.app ? sortedCanvases(state.app) : [];
  const names = new Set(canvases.map((c) => c.name));
  let n = canvases.length + 1;
  while (names.has(`Canvas ${n}`)) n += 1;
  const created = await api.createCanvas({ name: `Canvas ${n}` });
  const { nodes: _nodes, frames: _frames, counts: _counts, ...canvas } = created;
  useApp.getState().apply({ type: 'canvas.created', canvas: { ...canvas, layout: { nodes: [], frames: [] } } });
  return created;
}

function addCanvas(state: AppStore): void {
  attempt(
    makeCanvas(state).then((created) => useApp.getState().setCanvas(created.id)),
    'Could not add a canvas',
  );
}

/**
 * Makes a canvas and shows it in a new browser tab; this tab stays on the canvas it shows. The tab is opened at once,
 * while the click or key that asked for it still counts, and is sent to the canvas once it exists: a tab opened only
 * after an answer from the server is one a browser may refuse to open.
 */
function addCanvasInNewTab(state: AppStore): void {
  const tab = window.open('', '_blank');
  // It is this app's own page; it is given no way back into this one.
  if (tab) tab.opener = null;
  attempt(
    makeCanvas(state).then(
      (created) => {
        const href = canvasHref(created.id, created.projectId);
        if (tab && !tab.closed) tab.location.href = href;
        else openInNewTab(href);
      },
      (error: unknown) => {
        tab?.close();
        throw error;
      },
    ),
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
  available: (state) => listModel(listSource(state), state.listView, state.canvasId).order.length > 0,
  run: (state) => {
    const { order } = listModel(listSource(state), state.listView, state.canvasId);
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
const CONTROL_REGIONS = ['.tour-card button', '.side-panel:not(.collapsed) .list-rows', '.toolbar button', '.tabbar [role="tab"], .tabbar button', '.appbar button'];

function focusNextControls(): void {
  const active = document.activeElement;
  const regions = CONTROL_REGIONS.map((selector) => document.querySelector<HTMLElement>(selector)).filter((el): el is HTMLElement => el !== null);
  const containers = ['.tour-card', '.side-panel', '.toolbar', '.tabbar', '.appbar'];
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
    title: 'New Claude Code terminal',
    description: 'Starts a terminal running Claude Code, with hooks that report to this canvas.',
    group: 'Terminals',
    available: withCanvas,
    run: () => void canvasActions.get()?.addTerminal('claude-code'),
  },
  {
    id: 'agent.newWithTools',
    title: 'New Claude Code terminal with Aubergine tools…',
    description: 'Asks first which Aubergine tools the agent gets: none, those for its own work, or more, with a token made for that terminal.',
    group: 'Terminals',
    available: withCanvas,
    run: (state) => state.chooseAgentTools(true),
  },
  {
    id: 'canvas.show',
    title: 'Canvas',
    description: 'Leaves the Queue, the Board, Workflows or the Library for the canvas, as it was: the same tab, the same view, the same terminal selected.',
    group: 'Panels',
    available: (state) => state.page !== null,
    run: (state) => state.showPage(null),
  },
  {
    id: 'queue.open',
    title: 'Runs…',
    description: 'Work for agents from waiting to done, in four columns: tasks waiting to start, runs going now, everything that waits on you (terminals, approvals, drafts, proposed tasks, what was asked of you), and what is done. Add a task, say how many run at once, start the next.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('queue'),
  },
  {
    id: 'projects.open',
    title: 'Projects…',
    description: 'The projects there are, each with its own canvases, terminals, queue, schedules and rules: rename, color, the folder new terminals start in, order; archive, reopen, remove; and make a new one.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('projects'),
  },
  {
    id: 'project.new',
    title: 'New project…',
    description: 'Makes a project of its own in this server: its own canvases, terminals, queue, schedules and rules.',
    group: 'Panels',
    available: always,
    run: (state) => {
      if (state.panel !== 'projects') state.togglePanel('projects');
      state.request({ kind: 'new-project', id: '' });
    },
  },
  {
    id: 'project.fromTemplate',
    title: 'New project from a template, or from a file…',
    description: 'Makes a project from a template (two come with Aubergine; your own are saved from the Projects page) or from a project file someone sent you. You read everything it holds first; it starts no terminal and no agent unless you say so.',
    group: 'Panels',
    available: always,
    run: (state) => {
      if (state.panel !== 'projects') state.togglePanel('projects');
      state.request({ kind: 'project-from-template', id: '' });
    },
  },
  {
    id: 'sharing.open',
    title: 'Sharing…',
    description: 'What is shared between projects: for workflows, saved steps, library sources and API tokens, whether a new one is shared with every project or belongs to the project it is made in, and where each existing one belongs.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('sharing'),
  },
  {
    id: 'terminal.newIn',
    title: 'New terminal in a folder, or in a working copy…',
    description: 'Asks where: a folder of your choosing, and whether the terminal works there or in a working copy of its own, a second checkout of that repository on a new branch. A working copy keeps its work apart from yours; it is not a lock.',
    group: 'Terminals',
    available: withCanvas,
    run: (state) => state.chooseStart(true),
  },
  {
    id: 'copies.show',
    title: 'What changed in this terminal’s working copy…',
    description: 'For a terminal that works in a working copy of its own: the files that differ from where it started, the difference of each, and what to do with the copy.',
    group: 'Terminals',
    available: (state) => {
      const target = targetSession(state);
      return target !== null && (state.app?.environments.some((e) => e.sessionId === target.id) ?? false);
    },
    run: (state) => {
      const target = targetSession(state);
      const found = target ? state.app?.environments.find((e) => e.sessionId === target.id) : undefined;
      if (found) state.viewEnvironment(found.id);
    },
  },
  {
    id: 'agent.switchedOn',
    title: 'How this agent is set up…',
    description: 'Shows the MCP servers, plugins, hooks, skills and settings files the agent in this terminal is configured with, and what Aubergine added. Read only.',
    group: 'Terminals',
    available: (state) => targetSession(state)?.agent != null,
    run: (state) => {
      const session = targetSession(state);
      if (session?.agent) state.showInventory(session.id);
    },
  },
  {
    id: 'agent.askRecap',
    title: 'Ask this agent for a recap',
    description: 'Types one fixed sentence into the terminal asking its agent to write what the terminal is about and where it stands. It shows with the terminal\'s notes.',
    group: 'Terminals',
    available: (state) => targetSession(state)?.agent != null,
    run: (state) => {
      const session = targetSession(state);
      if (!session?.agent) return;
      void api.askRecap(session.id).then(
        () => state.openDrawer({ section: 'terminals', kind: 'notes', id: session.id }),
        (error: unknown) => !isSuperseded(error) && state.setNotice(`Could not ask for a recap: ${(error as Error).message}`),
      );
    },
  },
  {
    id: 'terminal.details',
    title: 'Details of this terminal',
    description: 'Opens the terminal\'s details beside the side panel: what it asks of you, what is known about it, its note and its messages. Asked again for the same terminal, it closes them.',
    group: 'Terminals',
    available: (state) => targetSession(state) != null,
    run: (state) => {
      const session = targetSession(state);
      if (!session) return;
      const open = state.drawer;
      if (open?.section === 'terminals' && open.kind === 'notes' && open.id === session.id) return state.openDrawer(null);
      // The details stand beside the side panel, so a folded panel is opened for them.
      if (!state.side.open) state.setSide({ open: true });
      state.openDrawer({ section: 'terminals', kind: 'notes', id: session.id });
    },
  },
  {
    id: 'terminal.message',
    title: 'Message this terminal…',
    description: 'Opens the terminal\'s details on its messages, where you can write a message for the agent in it and see every message to and from it. A message is kept for the agent to read; it is never typed.',
    group: 'Terminals',
    available: (state) => targetSession(state) != null,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.openDrawer({ section: 'terminals', kind: 'notes', id: session.id, part: 'messages' });
    },
  },
  {
    id: 'terminal.openOnDesktop',
    title: 'Open on desktop',
    description: 'Opens this terminal in a window of your own terminal application. Both show the same terminal, an agent\'s too, and you can type in either. Closing the window ends nothing. Which application is in the settings file.',
    group: 'Terminals',
    atThisComputerOnly: true,
    available: (state) => {
      const session = targetSession(state);
      return atThisComputer(state) && session != null && session.state !== 'exited';
    },
    run: (state) => {
      const session = targetSession(state);
      if (session && session.state !== 'exited') void openOnDesktop(session.id);
    },
  },
  {
    id: 'terminal.openInNewTab',
    title: 'Open in new browser tab',
    description: 'Opens this terminal by itself in a new browser tab. Both show the same terminal, an agent\'s too, and you can type in either; they share one size, the size of the one typed into last. Closing the tab ends nothing.',
    group: 'Terminals',
    available: (state) => {
      const session = targetSession(state);
      return session != null && session.state !== 'exited';
    },
    run: (state) => {
      const session = targetSession(state);
      if (session && session.state !== 'exited') openInNewTab(terminalHref(session.id));
    },
  },
  {
    id: 'history.open',
    title: 'Past conversations…',
    description: 'Lists the agent\'s earlier conversations in this terminal\'s folder: read one, open it on the canvas, or open a copy. Type @ in the palette to search them.',
    group: 'Terminals',
    available: always,
    run: (state) => state.openHistory({ folder: targetSession(state)?.cwd ?? null, query: '' }),
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
    title: 'Open or close the details of the terminal',
    description: 'Shows or hides the details of the terminal beside the side panel: what it asks of you, what is known about it, its note and its messages. With the side panel folded away: the note beside the terminal itself.',
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
    id: 'terminal.theme',
    title: 'Terminal theme…',
    description: 'Opens the list of color themes for the terminal: its own, drawn in its body whatever the page is drawn in, or the same as the default for terminals.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'theme', id: session.id });
    },
  },
  {
    id: 'terminal.group',
    title: 'Group of the terminal…',
    description: 'Puts the terminal into a group, or takes it out of one. Terminals in a group stand together in the list and inside one outline on the canvas, and fold away as one; a group may hold terminals of several canvases.',
    group: 'Terminals',
    available: hasTarget,
    run: (state) => {
      const session = targetSession(state);
      if (session) state.request({ kind: 'group', id: session.id });
    },
  },
  {
    id: 'group.fold',
    title: 'Fold or open the group of the terminal',
    description: 'Folds the terminals of the group away, in the list and on the canvas, or brings them back. They keep running.',
    group: 'Terminals',
    available: (state) => Boolean(targetSession(state)?.group),
    run: (state) => {
      const group = targetSession(state)?.group;
      if (group) toggleGroupFold(group);
    },
  },
  {
    id: 'attention.next',
    title: 'Go to the next waiting terminal',
    description: 'Goes to the next terminal that is waiting for you, on whichever canvas it is.',
    group: 'Terminals',
    available: (state) => nextWaiting(state.whole?.sessions ?? [], state.focus?.sessionId ?? null, state.whole?.runs ?? []) !== null,
    run: (state) => {
      // In whichever project it is: the page goes there.
      const next = nextWaiting(state.whole?.sessions ?? [], state.focus?.sessionId ?? null, state.whole?.runs ?? []);
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
    id: 'canvas.newInNewTab',
    title: 'New canvas in a new browser tab',
    description: 'Adds a canvas and shows it in a new browser tab. This tab stays on the canvas it shows.',
    group: 'Canvases',
    available: (state) => state.app !== null,
    run: addCanvasInNewTab,
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
    id: 'canvas.openInNewTab',
    title: 'Open the canvas in a new browser tab',
    description: 'Opens this canvas in a new browser tab, beside this one. Each tab can then show a canvas of its own. Clicking a tab the way you open a link in a new tab does the same.',
    group: 'Canvases',
    available: (state) => state.canvasId !== null,
    run: (state) => {
      const canvas = currentCanvas(state);
      if (canvas) openInNewTab(canvasHref(canvas.id, canvas.projectId));
    },
  },
  {
    id: 'canvas.switchView',
    title: 'Show the canvases as tabs, a list or a column',
    description: 'Goes to the next way of showing the canvases: a row of tabs over the canvas, one list that opens, or a column of tabs at the left of the window. This browser remembers the choice.',
    group: 'Canvases',
    available: () => true,
    run: () => setCanvasView(nextCanvasView(canvasView())),
  },
  {
    id: 'canvas.foldColumn',
    title: 'Fold or unfold the column of canvases',
    description: 'With the canvases shown as a column on the left: folds it to a narrow rail with a dot for each canvas, or opens it again. This browser remembers it.',
    group: 'Canvases',
    available: () => canvasView() === 'column',
    run: () => setCanvasColumnFolded(!canvasColumnFolded()),
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
    id: 'view.map',
    title: 'Show or hide the map',
    description: 'Shows the small map in the corner of the canvas, or folds it away again. It begins folded; this browser remembers what you chose.',
    group: 'View',
    available: withCanvas,
    run: () => foldMap(!mapFolded()),
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
    atThisComputerOnly: true,
    available: atThisComputer,
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
    run: (state) => {
      // Back to one project's terminals, whichever of the two it then shows.
      if (state.listView.everyProject) state.setListView({ everyProject: false });
      toggleFilter(state, SCOPE_FILTER);
    },
  },
  {
    id: 'list.search',
    title: 'List: filter by text',
    description: 'Puts the keyboard in the text box of the terminal list.',
    group: 'List',
    available: always,
    run: (state) => {
      state.setSide({ open: true, tab: 'terminals' });
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
    id: 'list.byGroup',
    title: 'List: by group, over every canvas',
    description: 'Lays the terminal list out by group and looks at every canvas, so that each group is whole wherever its terminals are.',
    group: 'List',
    available: always,
    run: (state) => state.setListView({ grouping: 'group', filters: state.listView.filters.filter((id) => id !== SCOPE_FILTER) }),
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
    id: 'library.open',
    title: 'Library…',
    description: 'Workflows and steps that others published: add a source, browse, read what an item would tell an agent, and ask for it to be installed. Nothing installs until you have read it in Review.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('library'),
  },
  {
    id: 'board.open',
    title: 'Runs by step…',
    description: 'Every run that is going, on every canvas, by workflow and step: who is waiting for you, who is blocked, who is working. Approve or send back from there, or start one workflow on several terminals.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('board'),
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
    title: 'New Claude Code terminal on a workflow…',
    description: 'Starts a terminal running Claude Code and puts it on a workflow from its first prompt.',
    group: 'Terminals',
    available: withCanvas,
    run: (state) => state.startRun({ sessionId: null }),
  },
  {
    id: 'workflow.view',
    title: 'Show the run of the terminal',
    description: 'Opens the run the terminal is on: every step with its state, and the buttons that move it.',
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
    title: 'Describe a step…',
    description: 'Asks an agent to write one step from your description. What it writes arrives as a draft for you to read.',
    group: 'Panels',
    available: always,
    run: (state) => state.describe('element'),
  },
  {
    id: 'element.run',
    title: 'Run a step by itself… on the terminal',
    description: 'Runs one saved step on the terminal, without a workflow around it.',
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
    id: 'tour.page',
    title: 'Show me around this page',
    description: 'On Library, Workflows, Queue or Board: a few steps pointing at what is on the page and how it leads to the next.',
    group: 'Panels',
    available: (state) => state.page !== null,
    run: (state) => {
      if (state.page) startPageTour(state.page);
    },
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
    id: 'settings.show',
    title: 'Settings…',
    description: 'What you change about the page itself: how it looks (light, dark or matching the system, the color theme of each, a terminal’s text and cursor) and whether the desktop is told when a terminal starts waiting.',
    group: 'Panels',
    available: always,
    run: (state) => state.togglePanel('settings'),
  },
  {
    id: 'devices.show',
    title: 'Devices…',
    description: 'The browsers on your other devices that are signed in to this Aubergine with a code, in Settings: when each was added and last used, and Revoke.',
    group: 'Panels',
    available: always,
    run: (state) => state.showSettings('devices'),
  },
  {
    id: 'settings.all',
    title: 'Settings: every setting',
    description: 'Opens the list of every key of the settings file in Settings, with the keyboard in its search: what each is, its value now and its default, and the line to copy for those written by hand.',
    group: 'Panels',
    available: always,
    run: (state) => state.showSettings('all'),
  },
  {
    id: 'devices.add',
    title: 'Add a device…',
    description: 'Makes a code that signs in a browser on another device, once, for a few minutes, with the address to open and its QR code.',
    group: 'Panels',
    available: always,
    run: (state) => state.addDevice(true),
  },
  {
    id: 'server.link',
    title: 'Link a server…',
    description: 'Shows the projects of another Aubergine in this page: its address, a name for it here, and a code made there for this page.',
    group: 'Panels',
    available: always,
    run: (state) => state.linkServer(true),
  },
  {
    id: 'server.unlink',
    title: 'Unlink the server shown…',
    description: 'Asks first. This browser forgets the linked server it shows, and that server is asked to revoke this page’s device.',
    group: 'Panels',
    available: (state) => state.server !== null,
    run: (state) => state.server !== null && state.askToUnlink(state.server),
  },
  ...THEMES.map((theme): Command => ({
    id: `theme.${theme}` as const,
    title: `Theme: ${THEME_WORDS[theme].toLowerCase()}`,
    description: theme === 'system' ? 'The page is light or dark as the system is, and follows it when that changes. Kept in the settings file.' : `The page is ${theme}, whatever the system is set to. Kept in the settings file.`,
    group: 'View',
    available: always,
    run: () => chooseTheme(theme),
  })),
  {
    id: 'theme.choose',
    title: 'Color theme…',
    description: 'Opens Settings at Appearance, with the keyboard on the theme drawn now: the color theme of the light page and of the dark one, the text and the cursor of a terminal.',
    group: 'View',
    available: always,
    run: (state) => state.showSettings('appearance'),
  },
  {
    id: 'titles.format',
    title: 'Titles and rows: what they show',
    description: 'Opens Settings at Titles and rows, with the keyboard in the field of a terminal’s title: what a title and a row in the list say after the name, as a template such as {state} · {folder} · {time}.',
    group: 'View',
    available: always,
    run: (state) => state.showSettings('titles'),
  },
  {
    id: 'appearance.stylesheet',
    title: 'Your stylesheet',
    description: 'Opens Settings at Your stylesheet: where your own custom.css is, whether it is drawn, the switch, Read it again, and the address of this page without it.',
    group: 'View',
    available: always,
    run: (state) => state.showSettings('stylesheet'),
  },
  {
    id: 'plugins.show',
    title: 'Plugins',
    description: 'Opens Settings at Plugins: your own code that runs in this page as you, which of it is switched on, what failed, and switching one on or off.',
    group: 'View',
    available: always,
    run: (state) => state.showSettings('plugins'),
  },
  ...COLOR_THEMES.map((theme): Command => ({
    id: `theme.use.${theme.id}` as const,
    title: `Color theme: ${theme.name}`,
    description: `${theme.name} becomes the theme of the ${theme.kind} page, and the page is ${theme.kind} from now on if it was not. Kept in the settings file.`,
    group: 'View',
    available: always,
    run: () => chooseColorTheme(theme.id),
  })),
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
    available: (state) => state.picker || state.page !== null || state.choosingAgentTools || state.viewingEnvironment !== null || state.inventoryFor !== null || state.historyView !== null || state.describing !== null || state.editingElement !== null || state.viewingRun !== null || state.startingRun !== null || state.editingWorkflow !== null || state.addingDevice || state.panel !== null || state.drawer !== null || state.selected !== null || onControl(),
    run: (state) => {
      if (state.picker) state.setPicker(false);
      else if (state.choosingAgentTools) state.chooseAgentTools(false);
      else if (state.viewingEnvironment !== null) state.viewEnvironment(null);
      else if (state.inventoryFor !== null) state.showInventory(null);
      else if (state.historyView !== null) state.openHistory(null);
      else if (state.describing !== null) state.describe(null);
      else if (state.editingElement !== null) state.editElement(null);
      else if (state.startingRun !== null) state.startRun(null);
      else if (state.viewingRun !== null) state.viewRun(null);
      else if (state.editingWorkflow !== null) state.editWorkflow(null);
      // Adding a device opens over Settings: Escape closes it, and Settings stays.
      else if (state.addingDevice) state.addDevice(false);
      else if (state.panel !== null) state.togglePanel(null);
      else if (state.page !== null) state.showPage(null);
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
  if (!offeredHere(command, state)) {
    state.setNotice(NOT_AT_THIS_COMPUTER);
    return false;
  }
  if (!command.available(state)) return false;
  command.run(state);
  return true;
}

/** Commands in the order the shortcut sheet and the palette list them. */
export const COMMAND_ORDER: readonly CommandId[] = COMMANDS.map((command) => command.id);

// Every command name the settings file may mention has an implementation here, and the other way round.
if (COMMANDS.length !== COMMAND_IDS.length) throw new Error('The command list and the command names differ');
