import { registerTourStep, tourSteps, type TourName } from './registry';
import { useTour } from './tour-store';

/**
 * The short tour of each of the four pages: what is on it, and how it leads to the next. Started from "Show me
 * around" under the page's name, it points at the real things on the page. Most steps only tell; one waits for the
 * real action where there is one to take. Two short sentences each.
 */

const find = (selector: string): Element | null => document.querySelector(selector);

/** Starts the tour of a page from its first step. */
export function startPageTour(page: Exclude<TourName, 'canvas'>): void {
  const first = tourSteps(page)[0];
  if (first) useTour.getState().start(0, first.id, page);
}

// The Library.
registerTourStep({
  tour: 'library',
  id: 'library-items',
  group: 'workflows',
  order: 10,
  title: 'What others published',
  text: 'Each line is a workflow or a step someone published. Click one to read what it would tell an agent.',
  reminder: '',
  target: () => find('[data-testid="library-item"]') ?? find('[data-testid="library-items"]'),
  done: (c) => c.signals.has('library.read'),
});
registerTourStep({
  tour: 'library',
  id: 'library-install',
  group: 'workflows',
  order: 20,
  title: 'Install after reading',
  text: '“Read and install…” shows all of it in Review. Accept it there, and it is yours under Workflows.',
  reminder: '',
  target: () => find('[data-testid="library-install"]') ?? find('[data-testid="library-detail"]'),
});
registerTourStep({
  tour: 'library',
  id: 'library-sources',
  group: 'workflows',
  order: 30,
  title: 'Where it comes from',
  text: 'One source comes with Aubergine. Add a folder or a Git address of your own under Manage.',
  reminder: '',
  target: () => find('[data-testid="library-sources-fold"]'),
});

// Workflows.
registerTourStep({
  tour: 'workflows',
  id: 'workflows-cards',
  group: 'workflows',
  order: 10,
  title: 'Your recipes',
  text: 'Each card is a workflow and its steps, in order. Click one to open and change it.',
  reminder: '',
  target: () => find('[data-testid="workflow-row"]') ?? find('[data-testid="workflows-empty"]') ?? find('[data-testid="workflows-part"]'),
});
registerTourStep({
  tour: 'workflows',
  id: 'workflows-new',
  group: 'workflows',
  order: 20,
  title: 'Make one',
  text: '“New workflow” starts one from a template, or empty. An agent can also write one for you to review.',
  reminder: '',
  target: () => find('[data-testid="workflow-new"]')?.closest('.ui-menu-button') ?? find('[data-testid="workflow-new"]'),
});
registerTourStep({
  tour: 'workflows',
  id: 'workflows-steps',
  group: 'workflows',
  order: 30,
  title: 'Saved steps',
  text: 'A step you use in many workflows is kept under “Saved steps”. Change it there, and choose where the change goes.',
  reminder: '',
  target: () => find('[data-testid="steps-tab"]'),
});
registerTourStep({
  tour: 'workflows',
  id: 'workflows-run',
  group: 'workflows',
  order: 40,
  title: 'Run one',
  text: 'Start a workflow on a terminal from its menu, or from the Board. Each start is a run.',
  reminder: '',
  target: () => find('[data-testid="workflow-run"]') ?? find('[data-testid="page-flow-step"][data-page="board"]'),
});

// The Queue.
registerTourStep({
  tour: 'queue',
  id: 'queue-foryou',
  group: 'waiting',
  order: 10,
  title: 'What waits on you',
  text: 'Questions from agents, steps to approve and your own to-dos are listed here. Each row has the one thing to do.',
  reminder: '',
  target: () => find('.queue-foryou'),
  // The two lists are on the page's first tab: shown, if another tab was open.
  arrive: () => {
    const tab = find('[data-testid="queue-tab-queue"]');
    if (tab instanceof HTMLElement && tab.getAttribute('aria-selected') !== 'true') tab.click();
  },
});
registerTourStep({
  tour: 'queue',
  id: 'queue-tasks',
  group: 'waiting',
  order: 20,
  title: 'Tasks for agents',
  text: 'A task is one sentence of what to do. When an agent is free, it takes the next one, as a run of a workflow.',
  reminder: '',
  target: () => find('.queue-tasks'),
});
registerTourStep({
  tour: 'queue',
  id: 'queue-start',
  group: 'waiting',
  order: 30,
  title: 'You say when',
  text: '“Start next” gives the next task to a free agent. Nothing starts by itself unless you switch that on.',
  reminder: '',
  target: () => find('[data-testid="queue-start-next"]'),
});
registerTourStep({
  tour: 'queue',
  id: 'queue-later',
  group: 'waiting',
  order: 40,
  title: 'Schedules and rules',
  text: 'A schedule adds a task at a time of day. A rule adds one when something happens.',
  reminder: '',
  target: () => find('[data-testid="queue-tab-schedules"]')?.parentElement ?? null,
});

// The Board.
registerTourStep({
  tour: 'board',
  id: 'board-card',
  group: 'workflows',
  order: 10,
  title: 'This is a run',
  text: 'Each card is one terminal on one workflow, in the column of the step it is on. Click it to go to that terminal.',
  reminder: '',
  target: () => find('[data-testid="board-card"]') ?? find('[data-testid="board-empty"]'),
});
registerTourStep({
  tour: 'board',
  id: 'board-waits',
  group: 'workflows',
  order: 20,
  title: 'A step that waits for you',
  text: 'A column marked “you decide” stops a run until you approve it or send it back. What waits also shows under For you.',
  reminder: '',
  target: () => find('.board-column-mark')?.closest('[data-testid="board-column"]') ?? find('[data-testid="board-column"]') ?? find('[data-testid="for-you"]'),
});
registerTourStep({
  tour: 'board',
  id: 'board-start',
  group: 'workflows',
  order: 30,
  title: 'Start one',
  text: 'Start a workflow on one terminal, or on several at once.',
  reminder: '',
  target: () => find('[data-testid="board-start-many"]') ?? find('[data-testid="board-empty-start"]'),
});
