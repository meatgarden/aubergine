import { describe, expect, it } from 'vitest';
import { createInitialState, type AppState, type ChangeEvent } from '@aubergine/shared';
import { StateHub } from './state-hub';

const store = { load: async () => createInitialState(), save: async (_state: AppState) => {} };

describe('the state holder numbers its changes', () => {
  it('counts each change from one, and the number read with the state is of the last change in it', () => {
    const hub = new StateHub(createInitialState(), store);
    const canvasId = hub.state.canvases[0]!.id;
    expect(hub.revision).toBe(0);
    const heard: [string, number][] = [];
    hub.subscribe((event, revision) => heard.push([(event as { changes: { name: string } }).changes.name, revision]));
    hub.emit({ type: 'canvas.updated', canvasId, changes: { name: 'One' } });
    hub.emit({ type: 'canvas.updated', canvasId, changes: { name: 'Two' } });
    expect(heard).toEqual([['One', 1], ['Two', 2]]);
    expect([hub.revision, hub.state.canvases[0]!.name]).toEqual([2, 'Two']);
    // Another run of the server is another epoch.
    expect(new StateHub(createInitialState(), store).epoch).not.toBe(hub.epoch);
  });

  it('tells every listener of the changes in the order they were made, also when a listener makes one while it is told of another', () => {
    const hub = new StateHub(createInitialState(), store);
    const canvasId = hub.state.canvases[0]!.id;
    const rename = (name: string): ChangeEvent => ({ type: 'canvas.updated', canvasId, changes: { name } });
    // The first listener answers a change with a change of its own, as the queue does when a run moves.
    hub.subscribe((event) => {
      if ((event as { changes: { name: string } }).changes.name === 'One') hub.emit(rename('Because of one'));
    });
    // The second is whoever follows by number, such as a page on the stream.
    const followed: number[] = [];
    const names: string[] = [];
    hub.subscribe((event, revision) => {
      followed.push(revision);
      names.push((event as { changes: { name: string } }).changes.name);
    });
    hub.emit(rename('One'));
    expect(followed).toEqual([1, 2]);
    expect(names).toEqual(['One', 'Because of one']);
    expect(hub.state.canvases[0]!.name).toBe('Because of one');
    // A listener that throws does not leave the holder unable to tell of the next change.
    const failing = hub.subscribe(() => {
      throw new Error('a listener failed');
    });
    expect(() => hub.emit(rename('Three'))).toThrow('a listener failed');
    failing();
    hub.emit(rename('Four'));
    expect(followed.at(-1)).toBe(4);
  });
});
