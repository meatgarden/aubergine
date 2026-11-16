import { demoOf } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { tourSteps } from './registry';
import { remembered, resumeAt, useTour } from './tour-store';

/** Makes the demo if there is none, goes to its canvas, and takes the tour up where it was left (or from the start). */
export async function showMeAround(): Promise<void> {
  const state = useApp.getState();
  try {
    let canvasId = state.app ? (demoOf(state.app)?.canvasId ?? null) : null;
    if (canvasId === null) canvasId = (await api.makeDemo()).canvasId;
    if (canvasId === null) return;
    // The canvas arrives as a change event; go there once it has.
    for (let i = 0; i < 100 && !useApp.getState().app?.canvases.some((c) => c.id === canvasId); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    useApp.getState().setCanvas(canvasId);
    const steps = tourSteps();
    const at = resumeAt(remembered(), steps.map((step) => step.id));
    const step = steps[at];
    if (step) useTour.getState().start(at, step.id);
  } catch (error) {
    state.setNotice(`Could not make the demo: ${(error as Error).message}`);
  }
}

/** Takes away everything the demo made. The tour, if it is up, ends with it. */
export async function removeDemo(): Promise<void> {
  // Whoever takes the demo away has seen what they wanted of the tour: it is over, and does not begin by itself again.
  // Said first, before the demo goes, so that its going is not mistaken for the tour being put aside for later.
  if (useTour.getState().step !== null) useTour.getState().end('finished', null);
  try {
    await api.removeDemo();
  } catch (error) {
    useApp.getState().setNotice(`Could not remove the demo: ${(error as Error).message}`);
  }
}
