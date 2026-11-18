import { describe, expect, it } from 'vitest';
import { applyEvent, createInitialState, newCanvas, newId, type AppState, type Project, type Session } from '@aubergine/shared';
import { canvasIdFromPath } from '../address';
import { viewOf } from '../store';
import { switcherRows, waitingIn } from './projects';

/** Two projects, each with a canvas; a terminal that waits in the second. */
function two(): { state: AppState; a: Project; b: Project; waits: Session } {
  let state = createInitialState(new Date('2026-06-01T09:00:00.000Z'));
  const a = state.projects[0] as Project;
  const b: Project = { ...a, id: newId(), name: 'Second', order: 1 };
  state = applyEvent(state, { type: 'project.changed', project: b });
  const canvas = newCanvas(b.id, 'Main', 5);
  state = applyEvent(state, { type: 'canvas.created', canvas });
  const waits = { id: newId(), projectId: b.id, name: 'waits', createdAt: '2026-06-01T09:00:00.000Z', state: 'open', cwd: null, command: null, note: '', status: { state: 'unknown' }, attention: { state: 'waiting', message: 'Which one?', at: '2026-06-01T09:05:00.000Z' }, noteLog: [], agent: null, tags: [] } as unknown as Session;
  state = applyEvent(state, { type: 'session.created', session: waits, canvasId: canvas.id, node: { id: newId(), sessionId: waits.id, x: 0, y: 0, width: 640, height: 400, color: 'none' } });
  return { state: applyEvent(state, { type: 'session.attention', sessionId: waits.id, attention: { state: 'waiting', message: 'Which one?', at: '2026-06-01T09:05:00.000Z' } }), a, b, waits };
}

describe('the switcher', () => {
  it('says how many things wait in each project, so that nothing that waits is out of sight', () => {
    const { state, a, b } = two();
    expect(switcherRows(state).map((row) => [row.project.name, row.waiting])).toEqual([[a.name, 0], ['Second', 1]]);
    expect(waitingIn(state, a.id)).toBe(0);
    expect(waitingIn(state, b.id)).toBe(1);
    // An archived project is in no switcher.
    expect(switcherRows(applyEvent(state, { type: 'project.changed', project: { ...b, state: 'archived' } })).map((row) => row.project.name)).toEqual([a.name]);
  });
});

describe('what the page shows', () => {
  it('is the project of the canvas being looked at; with one project it is everything, as it is', () => {
    const { state, a, b, waits } = two();
    const canvasOfA = state.canvases.find((c) => c.projectId === a.id)!.id;
    const canvasOfB = state.canvases.find((c) => c.projectId === b.id)!.id;
    expect(viewOf(state, canvasOfA, null).sessions).toEqual([]);
    expect(viewOf(state, canvasOfA, null).canvases.map((c) => c.id)).toEqual([canvasOfA]);
    expect(viewOf(state, canvasOfB, null).sessions.map((s) => s.id)).toEqual([waits.id]);
    // What did not change keeps its identity, so that it is not drawn again.
    const before = viewOf(state, canvasOfB, null);
    const after = viewOf(applyEvent(state, { type: 'canvas.updated', canvasId: canvasOfA, changes: { name: 'Renamed' } }), canvasOfB, before);
    expect(after.sessions).toBe(before.sessions);
    expect(after.canvases).toBe(before.canvases);
    const one = createInitialState();
    expect(viewOf(one, null, null)).toBe(one);
  });

  it('an address names its project, and the older one still leads to the canvas', () => {
    const id = newId();
    expect(canvasIdFromPath(`/p/${newId()}/c/${id}`)).toBe(id);
    expect(canvasIdFromPath(`/c/${id}`)).toBe(id);
    expect(canvasIdFromPath(`/c/${id}/`)).toBe(id);
    expect(canvasIdFromPath('/p/x')).toBeNull();
    expect(canvasIdFromPath('/')).toBeNull();
  });
});
