import { describe, expect, it } from 'vitest';
import type { EventsServerMessage } from '@aubergine/shared';
import { Viewers } from './viewers';

function tab(viewers: Viewers) {
  const got: EventsServerMessage[] = [];
  return { got, viewer: viewers.add((message) => got.push(message)) };
}

describe('Viewers', () => {
  it('asks the tabs already on the canvas, and only those', () => {
    const viewers = new Viewers();
    const a = tab(viewers);
    const b = tab(viewers);
    const c = tab(viewers);
    viewers.viewing(a.viewer, 'canvas-1');
    viewers.viewing(b.viewer, 'canvas-2');
    viewers.viewing(c.viewer, 'canvas-2');
    expect(viewers.show('session-x', 'canvas-2')).toBe(2);
    expect(a.got).toEqual([]);
    expect(b.got).toEqual([{ type: 'show', sessionId: 'session-x' }]);
    expect(c.got).toHaveLength(1);
  });

  it('otherwise asks the tab used most recently, which will switch canvas', async () => {
    const viewers = new Viewers();
    const older = tab(viewers);
    const newer = tab(viewers);
    viewers.viewing(older.viewer, 'canvas-1');
    await new Promise((resolve) => setTimeout(resolve, 5));
    viewers.viewing(newer.viewer, 'canvas-2');
    expect(viewers.show('session-x', 'canvas-3')).toBe(1);
    expect(older.got).toEqual([]);
    expect(newer.got).toHaveLength(1);

    // The older tab is used again: now it is the one.
    await new Promise((resolve) => setTimeout(resolve, 5));
    viewers.viewing(older.viewer, 'canvas-1');
    viewers.show('session-y', 'canvas-3');
    expect(older.got).toHaveLength(1);
  });

  it('asks nobody when no tab is connected, and says so', () => {
    const viewers = new Viewers();
    expect(viewers.show('session-x', 'canvas-1')).toBe(0);
    const only = tab(viewers);
    viewers.remove(only.viewer);
    expect(viewers.show('session-x', 'canvas-1')).toBe(0);
    expect(viewers.count).toBe(0);
  });

  it('remembers the canvas looked at last, also after its tab has closed', () => {
    const viewers = new Viewers();
    expect(viewers.lastViewedCanvasId).toBeNull();
    const a = tab(viewers);
    viewers.viewing(a.viewer, 'canvas-1');
    viewers.viewing(a.viewer, 'canvas-2');
    viewers.remove(a.viewer);
    expect(viewers.lastViewedCanvasId).toBe('canvas-2');
  });

  it('never asks a tab that has not said which canvas it shows, and does not count it as asked', () => {
    const viewers = new Viewers();
    const alone = tab(viewers);
    // Nothing but that tab: nobody is asked.
    expect(viewers.show('session-x', 'canvas-1')).toBe(0);
    expect(viewers.show('session-x', null)).toBe(0);
    expect(viewers.showCanvas('canvas-1')).toBe(0);
    expect(alone.got).toEqual([]);
    // Beside a tab on another canvas, used longer ago: that one is asked, the other still not.
    const canvas = tab(viewers);
    viewers.viewing(canvas.viewer, 'canvas-2');
    alone.viewer.activeAt = Date.now() + 1000;
    expect(viewers.show('session-x', 'canvas-1')).toBe(1);
    expect(viewers.showCanvas('canvas-3')).toBe(1);
    expect(canvas.got).toEqual([
      { type: 'show', sessionId: 'session-x' },
      { type: 'show-canvas', canvasId: 'canvas-3' },
    ]);
    expect(alone.got).toEqual([]);
  });

  it('tells every tab of a notification, also one that has not said which canvas it shows', () => {
    const viewers = new Viewers();
    const alone = tab(viewers);
    const canvas = tab(viewers);
    viewers.viewing(canvas.viewer, 'canvas-1');
    expect(viewers.notify('Title', 'Body')).toBe(2);
    expect(alone.got).toEqual([{ type: 'notify', title: 'Title', body: 'Body' }]);
    expect(canvas.got).toHaveLength(1);
  });
});
