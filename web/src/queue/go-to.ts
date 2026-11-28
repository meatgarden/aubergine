import { useApp } from '../store';

/** Where one acts on an item: its address, understood here and by the command line alike. */
export function goTo(act: string): void {
  const [what, id] = act.split(':');
  const store = useApp.getState();
  if (what === 'run' && id) store.viewRun(id);
  else if (what === 'session' && id) {
    store.showPage(null);
    store.showSession(id);
  } else if (what === 'copy' && id) store.viewEnvironment(id);
  else if (what === 'review') {
    // `review:<source>:<id>`: that one is chosen when the review opens.
    if (id) store.wantReview(act.slice('review:'.length));
    if (store.panel !== 'review') store.togglePanel('review');
  }
  else if (what === 'task' && id && store.whole?.queue.tasks.find((task) => task.id === id)?.runId) store.viewRun(store.whole.queue.tasks.find((task) => task.id === id)?.runId ?? null);
  else store.showPage('queue');
}
