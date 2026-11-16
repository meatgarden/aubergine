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
  order: 10,
  title: 'This is a terminal',
  text: 'Click it to type in it. Then click “Fit” at the top to see all of them at once.',
  reminder: 'Click a terminal to use it; zoom out to see them all.',
  target: (c) => nodeOf(c.demo?.sessions.shell) ?? find('[data-testid="terminal-node"]'),
  done: (c) => c.signals.has('terminal.focused') && c.signals.has('canvas.zoomed-out'),
});

registerTourStep({
  id: 'waiting',
  order: 20,
  title: 'Something needs you',
  text: 'Click “waiting” to go to the terminal that has a question. Type an answer there and press Enter.',
  reminder: 'When something waits for you, “waiting” at the top takes you to it.',
  target: (c) => find('[data-testid="attention-queue"]') ?? nodeOf(c.demo?.sessions.waiting),
  done: (c) => noted(c, c.demo?.sessions.waiting, 'Answered:'),
});

registerTourStep({
  id: 'find',
  order: 30,
  title: 'Find a terminal by what it printed',
  text: 'Open “Go to…” and type: redirects twice. Choose the line it finds.',
  reminder: '“Go to…” finds a terminal by its name, or by anything it printed.',
  target: () => find('.picker') ?? find('[data-testid="toolbar-goto"]'),
  done: (c) => c.signals.has('picker.output'),
});

registerTourStep({
  id: 'list',
  order: 40,
  title: 'Every terminal, in one list',
  text: 'The list on the left has every terminal on every canvas. Switch on “Waiting for me” to see only those.',
  reminder: 'The list on the left has every terminal; its filters narrow it.',
  target: () => find('.list-filter[data-filter="waiting"]') ?? find('[data-testid="side-panel"]'),
  done: (c) => c.state.listView.filters.includes('waiting'),
  // The list has to be there to be pointed at.
  arrive: (c) => {
    if (!c.state.side.open) c.state.setSide({ open: true, folded: [] });
  },
});

registerTourStep({
  id: 'workflow',
  order: 50,
  title: 'An agent on a workflow',
  text: 'The strip on this terminal shows which step its agent is on. Click the strip to see every step and what was noted.',
  reminder: 'A strip on a terminal shows the step its agent is on; click it for the whole run.',
  target: (c) => find('[data-testid="run-view"]') ?? nodeOf(c.demo?.sessions.fixing)?.querySelector('[data-testid="run-strip"]') ?? find('[data-testid="run-strip"]'),
  done: (c) => c.demo !== null && c.demo.runId !== null && c.state.viewingRun === c.demo.runId,
});

registerTourStep({
  id: 'checklist',
  order: 60,
  title: 'A list an agent made for you',
  text: 'Under “Over lately” on the left, open “List what is left”. Tick an item.',
  reminder: 'A list an agent handed in is on its run; tick what is done.',
  target: () => find('[data-testid="checklist"]') ?? find('[data-testid="ended-row"]') ?? find('[data-testid="runs-section"]'),
  done: (c) => c.signals.has('checklist.ticked'),
  arrive: (c) => {
    if (c.state.viewingRun !== null) c.state.viewRun(null);
    if (!c.state.side.open) c.state.setSide({ open: true, folded: [] });
  },
});

registerTourStep({
  id: 'review',
  order: 70,
  title: 'Something an agent wrote for you',
  text: 'Click “to review” and read it. Nothing an agent writes is used until you accept it; accept or discard this one.',
  reminder: 'What agents write waits under “to review” until you accept it.',
  target: () => find('[data-testid="review-screen"] .review-main') ?? find('[data-testid="drafts-waiting"]'),
  done: (c) => c.demo !== null && c.demo.draftId === null,
  arrive: (c) => {
    if (c.state.viewingRun !== null) c.state.viewRun(null);
  },
});

registerTourStep({
  id: 'your-own',
  order: 80,
  title: 'Now bring in your own',
  text: 'Type “aubergine here” in any terminal you already have open, or use “+ New terminal”. Then remove the demo.',
  reminder: '“aubergine here” in a terminal you have open brings it in; “+ New terminal” starts a fresh one.',
  target: () => find('[data-testid="toolbar-new-terminal"]'),
});
