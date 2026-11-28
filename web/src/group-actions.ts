import { api, isSuperseded } from './api';
import { canvasActions } from './canvas-actions';
import { isGroupFolded, withGroupFolded } from './groups';
import { useApp } from './store';

/**
 * What is done to a group as a whole. A group is the terminals that carry its name, so each of these is the ordinary
 * change of a terminal (its group, its canvas), once for each member: no request is about a group.
 */

const members = (name: string) => (useApp.getState().app?.sessions ?? []).filter((session) => session.group === name);

const said = (what: string) => (error: unknown) => {
  if (!isSuperseded(error)) useApp.getState().setNotice(`${what}: ${(error as Error).message}`);
};

/** Folds a group, or opens it: in the list and on the canvas alike. A terminal that is folded away lets go of the keyboard. */
export function foldGroup(name: string, folded: boolean): void {
  const state = useApp.getState();
  if (folded) {
    const inGroup = new Set(members(name).map((session) => session.id));
    if (state.focus && inGroup.has(state.focus.sessionId)) canvasActions.get()?.releaseFocus();
    if (state.selected && inGroup.has(state.selected)) state.select(null);
  }
  state.setListView({ collapsedGroups: withGroupFolded(state.listView.collapsedGroups, name, folded) });
}

export function toggleGroupFold(name: string): void {
  foldGroup(name, !isGroupFolded(useApp.getState().listView.collapsedGroups, name));
}

/** Puts a terminal into a group, or takes it out of the one it is in (null). */
export function setGroup(sessionId: string, group: string | null): Promise<void> {
  return api.updateSession(sessionId, { group }).then(() => undefined);
}

/** Gives a group another name: every terminal in it carries the new one. A folded group stays folded. */
export function renameGroup(name: string, next: string): void {
  if (next === name) return;
  const state = useApp.getState();
  if (isGroupFolded(state.listView.collapsedGroups, name)) state.setListView({ collapsedGroups: withGroupFolded(withGroupFolded(state.listView.collapsedGroups, name, false), next, true) });
  for (const session of members(name)) void setGroup(session.id, next).catch(said(`Could not rename the group for "${session.name}"`));
}

/** Ends a group: its terminals stay where they are, in no group. */
export function ungroup(name: string): void {
  foldGroup(name, false);
  for (const session of members(name)) void setGroup(session.id, null).catch(said(`Could not take "${session.name}" out of its group`));
}

/** Brings the terminals of a group that are on other canvases, or parked, onto the given canvas. Their shells are untouched. */
export function gatherGroup(name: string, canvasId: string): void {
  const state = useApp.getState();
  const here = new Set((state.app?.canvases.find((canvas) => canvas.id === canvasId)?.layout.nodes ?? []).map((node) => node.sessionId));
  for (const session of members(name)) {
    if (here.has(session.id) || session.state === 'exited') continue;
    const moved = session.state === 'parked' ? api.restoreSession(session.id, canvasId) : api.moveSession(session.id, canvasId);
    void Promise.resolve(moved).catch(said(`Could not bring "${session.name}" here`));
  }
}
