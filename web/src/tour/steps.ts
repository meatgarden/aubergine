import { registerTourStep, type TourContext } from './registry';

/**
 * The eight steps a newcomer is walked through, on the demo canvas. Each
 * points at the real thing and waits for the real action. Two short
 * sentences each, and no name the person has not seen yet.
 */

const find = (selector: string): Element | null => document.querySelector(selector);
const nodeOf = (sessionId: string | undefined): Element | null => (sessionId ? find(`[data-testid="terminal-node"][data-session="${sessionId}"]`) : null);
const noted = (context: TourContext, sessionId: string | undefined, start: string): boolean =>
  context.app.sessions.find((session) => session.id === sessionId)?.noteLog.some((entry) => entry.text.startsWith(start)) ?? false;

registerTourStep({
  id: 'terminal',
  group: 'terminals',
  order: 10,
  title: 'This is a terminal',
  text: 'Click it to type in it. Then click “Fit” at the top to see all of them at once.',
  reminder: 'Click a terminal to use it; zoom out to see them all. The menu in its title has the rest.',
  target: (c) => nodeOf(c.demo?.sessions.shell) ?? find('[data-testid="terminal-node"]'),
  done: (c) => c.signals.has('terminal.focused') && c.signals.has('canvas.zoomed-out'),
});

registerTourStep({
  id: 'waiting',
  group: 'waiting',
  order: 20,
  title: 'Something needs you',
  text: 'One terminal has a question for you. Click it, type an answer and press Enter.',
  reminder: '“For you” at the top counts and lists what waits on you.',
  // The button goes to whoever has waited longest, on any canvas. When that is not the demo's terminal, or it has
  // been looked at already, the terminal itself is pointed at instead, so that the step never leads away.
  target: (c) => {
    const mine = c.demo?.sessions.waiting;
    // The terminal itself is pointed at; the count at the top when it is not in sight.
    return nodeOf(mine) ?? find('[data-testid="for-you"]');
  },
  done: (c) => noted(c, c.demo?.sessions.waiting, 'Answered:'),
});

registerTourStep({
  id: 'find',
  group: 'terminals',
  order: 30,
  title: 'Find a terminal by what it printed',
  text: 'Open “Go to…” and type: redirects twice. Choose the line it finds.',
  reminder: '“Go to…” finds a terminal by its name, or by anything it printed.',
  target: () => find('.picker') ?? find('[data-testid="toolbar-goto"]'),
  done: (c) => c.signals.has('picker.output'),
});

registerTourStep({
  id: 'list',
  group: 'terminals',
  order: 40,
  title: 'Every terminal, in one list',
  text: 'The list on the left has this canvas’s terminals. Open “Filter” and choose “Waiting for me” to see only those.',
  reminder: 'The list on the left has every terminal; its filters narrow it.',
  target: () => find('.list-filter[data-filter="waiting"]') ?? find('[data-testid="side-panel"]'),
  done: (c) => c.state.listView.filters.includes('waiting'),
  // The list has to be there to be pointed at.
  arrive: (c) => {
    if (!c.state.side.open || c.state.side.tab !== 'terminals') c.state.setSide({ open: true, tab: 'terminals' });
  },
});

registerTourStep({
  id: 'workflow',
  group: 'workflows',
  order: 50,
  title: 'An agent on a workflow',
  text: 'The strip on this terminal shows its agent’s step; click it for the whole run. “Board” above shows every run at once.',
  reminder: 'A strip on a terminal shows the step its agent is on; click it for the run.',
  target: (c) => find('[data-testid="run-view"]') ?? nodeOf(c.demo?.sessions.fixing)?.querySelector('[data-testid="run-strip"]') ?? find('[data-testid="run-strip"]'),
  done: (c) => c.demo !== null && c.demo.runId !== null && c.state.viewingRun === c.demo.runId,
});

registerTourStep({
  id: 'checklist',
  group: 'waiting',
  order: 60,
  title: 'A list an agent made for you',
  text: 'This terminal’s agent handed in a list. Click “list” on it, and tick an item.',
  reminder: 'A terminal whose agent handed in a list says “list” on it; click that and tick what is done.',
  target: (c) => find('[data-testid="checklist"]') ?? nodeOf(c.demo?.sessions.checklist)?.querySelector('[data-testid="list-mark"]') ?? nodeOf(c.demo?.sessions.checklist) ?? find('[data-testid="row-list-mark"]'),
  done: (c) => c.signals.has('checklist.ticked'),
  arrive: (c) => {
    if (c.state.viewingRun !== null) c.state.viewRun(null);
  },
});

registerTourStep({
  id: 'review',
  group: 'waiting',
  order: 70,
  title: 'Something an agent wrote for you',
  text: 'Click “For you” at the top, then “Review”. Nothing an agent writes is used until you accept it: accept or discard this one.',
  reminder: 'What agents write waits under “For you” until you have read and accepted it.',
  target: () => find('[data-testid="review-screen"] .review-main') ?? find('[data-testid="review-open"]') ?? find('[data-testid="for-you"]'),
  done: (c) => c.demo !== null && c.demo.draftId === null,
  arrive: (c) => {
    if (c.state.viewingRun !== null) c.state.viewRun(null);
  },
});

registerTourStep({
  id: 'your-own',
  group: 'terminals',
  order: 80,
  title: 'Now bring in your own',
  text: 'Type “aubergine here” in any terminal you already have open, or use “New terminal”. Then remove the demo.',
  reminder: '“aubergine here”, typed in a terminal that is open elsewhere, brings it onto the canvas.',
  target: () => find('[data-testid="toolbar-new-terminal"]'),
});

// Lines that are Help's alone: the tour does not walk through them, and Help points at each as it does at a step.
const helpLine = (id: string, group: 'terminals' | 'waiting' | 'workflows' | 'projects', order: number, reminder: string, selector: string): void =>
  registerTourStep({ id, group, order, helpOnly: true, title: '', text: '', reminder, target: () => find(selector) });

helpLine('help-queue', 'waiting', 25, '“Queue” has the tasks for agents: add one, and start the next.', '[data-testid="toolbar-queue"]');
helpLine('help-workflows', 'workflows', 62, '“Workflows” has what an agent can be given to do, step by step, and your saved steps.', '[data-testid="toolbar-workflows"]');
helpLine('help-board', 'workflows', 72, '“Board” shows every run at once; approve or send back from there.', '[data-testid="toolbar-board"]');
helpLine('help-library', 'workflows', 73, '“Library” has workflows and steps others have written, to read and install.', '[data-testid="toolbar-library"]');
helpLine('help-projects', 'projects', 110, 'The name at the top left is the project; each has its own canvases, queue and list.', '[data-testid="project-switcher"]');
helpLine('help-project-file', 'projects', 111, 'A project can be sent as a file: Projects, then Export.', '[data-testid="project-switcher"]');
