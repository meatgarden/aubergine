import { canvasesOf, forYou, openProjects, type AppState, type Project } from '@aubergine/shared';
import { rememberedCanvas } from '../address';
import { useApp } from '../store';

/**
 * Projects, as the page deals with them. One place: the switcher, the
 * Projects page and the commands all come here to go to a project.
 */

/** Goes to a project: to the canvas this browser looked at last in it, else its first. */
export function goToProject(projectId: string): void {
  const store = useApp.getState();
  const whole = store.whole;
  if (!whole) return;
  const canvases = canvasesOf(whole, projectId);
  const remembered = rememberedCanvas(projectId);
  const canvas = canvases.find((c) => c.id === remembered) ?? canvases[0];
  if (canvas) store.setCanvas(canvas.id);
}

/** How many things wait on the owner in a project: the same function the owner's list is made by, asked about that project. */
export const waitingIn = (whole: AppState, projectId: string, now: number = Date.now()): number => forYou(whole, now, [], projectId).items.length;

/** The projects that are open, each with what waits in it. For the switcher. */
export function switcherRows(whole: AppState, now: number = Date.now()): { project: Project; waiting: number }[] {
  return openProjects(whole).map((project) => ({ project, waiting: waitingIn(whole, project.id, now) }));
}
