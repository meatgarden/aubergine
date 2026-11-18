import { AsyncLocalStorage } from 'node:async_hooks';
import { firstProject, type AppState } from '@aubergine/shared';

/**
 * The project a request is made in.
 *
 * Every request is about one project: the one of the thing it names, the
 * one it names itself, or the first where it names none. The loop that
 * handles routes works that out once and runs the handler inside it; a
 * service that makes something asks here which project that is, instead of
 * every function between the route and the place of making passing it on.
 * It lasts for one request and is never kept.
 */
const storage = new AsyncLocalStorage<{ projectId: string }>();

/** Runs `work` as a request made in this project. */
export const inProject = <T>(projectId: string, work: () => T): T => storage.run({ projectId }, work);

/** The project of the request being handled; the first project where nothing is being handled (the server's own start, a test that calls a service). */
export const projectNow = (state: Pick<AppState, 'projects'>): string => {
  const asked = storage.getStore()?.projectId;
  return asked !== undefined && state.projects.some((project) => project.id === asked) ? asked : firstProject(state).id;
};

/**
 * Whose a new thing of a shared kind is: shared with every project (null), or of the project it is made in. The
 * owner's choice per kind, on the sharing page; shared unless they chose otherwise.
 */
export const ownerOfNew = (state: Pick<AppState, 'projects' | 'sharing'>, kind: string): string | null => (state.sharing[kind] === 'project' ? projectNow(state) : null);
