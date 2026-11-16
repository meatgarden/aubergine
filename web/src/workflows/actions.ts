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
