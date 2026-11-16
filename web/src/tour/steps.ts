import { waitingQueue } from '../attention';
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
  text: 'One terminal has a question for you. Click “waiting” (or the terminal itself), type an answer and press Enter.',
  reminder: 'When something waits for you, “waiting” at the top takes you to it.',
  // The button goes to whoever has waited longest, on any canvas. When that is not the demo's terminal, or it has
  // been looked at already, the terminal itself is pointed at instead, so that the step never leads away.
  target: (c) => {
    const mine = c.demo?.sessions.waiting;
    const head = waitingQueue(c.app.sessions)[0];
    return (head !== undefined && head.id === mine ? find('[data-testid="attention-queue"]') : null) ?? nodeOf(mine) ?? find('[data-testid="attention-queue"]');
  },
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
