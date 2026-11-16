import { isLive, type ReportRunRequest } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';

/** Reports on a run from a button. The page shows the result at once; the same change also arrives as an event. */
export async function reportRun(runId: string, report: ReportRunRequest): Promise<boolean> {
  const store = useApp.getState();
  store.setNotice(null);
  try {
    const next = await api.reportRun(runId, report);
    useApp.getState().apply(isLive(next.run.status) ? { type: 'run.moved', run: next.run } : { type: 'run.finished', run: next.run });
    return true;
  } catch (error) {
    useApp.getState().setNotice(`Could not move the run: ${(error as Error).message}`);
    return false;
  }
}

/** Ticks or unticks an item of what an element produced. For a run that is over, whoever shows it is told to read it again. */
export async function tickItem(runId: string, elementId: string, item: number, ticked: boolean): Promise<void> {
  useApp.getState().setNotice(null);
  try {
    const next = await api.tickRunItem(runId, { elementId, item, ticked });
    if (isLive(next.run.status)) useApp.getState().apply({ type: 'run.moved', run: next.run as never });
    else window.dispatchEvent(new CustomEvent('aubergine:run-read', { detail: next }));
  } catch (error) {
    useApp.getState().setNotice(`Could not tick that: ${(error as Error).message}`);
  }
}
