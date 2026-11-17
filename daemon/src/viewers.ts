import type { EventsServerMessage } from '@aubergine/shared';

interface Viewer {
  send: (message: EventsServerMessage) => void;
  /** The canvas that browser tab is showing, once it has said. */
  canvasId: string | null;
  /** When it last said so: on connecting, on switching canvas, and when the tab is used again. */
  activeAt: number;
}

/**
 * The browser tabs that are connected, and which canvas each is showing.
 * Used to send things to the right tab, and to know which canvas the user
 * looked at last.
 */
export class Viewers {
  private readonly viewers = new Set<Viewer>();
  private lastCanvasId: string | null = null;

  add(send: Viewer['send']): Viewer {
    const viewer: Viewer = { send, canvasId: null, activeAt: Date.now() };
    this.viewers.add(viewer);
    return viewer;
  }

  remove(viewer: Viewer): void {
    this.viewers.delete(viewer);
  }

  /** A tab says which canvas it is showing. */
  viewing(viewer: Viewer, canvasId: string): void {
    viewer.canvasId = canvasId;
    viewer.activeAt = Date.now();
    this.lastCanvasId = canvasId;
  }

  /** The canvas most recently looked at in any tab, also after that tab has gone. */
  get lastViewedCanvasId(): string | null {
    return this.lastCanvasId;
  }

  get count(): number {
    return this.viewers.size;
  }

  /**
   * Asks the right tabs to bring a session into view: every tab already
   * showing its canvas; when there is none, the tab used most recently, which
   * switches canvas. Returns how many tabs were asked.
   */
  show(sessionId: string, canvasId: string | null): number {
    const all = [...this.viewers];
    const onCanvas = canvasId === null ? [] : all.filter((v) => v.canvasId === canvasId);
    const mostRecent = all.sort((a, b) => b.activeAt - a.activeAt)[0];
    const chosen = onCanvas.length > 0 ? onCanvas : mostRecent ? [mostRecent] : [];
    for (const viewer of chosen) viewer.send({ type: 'show', sessionId });
    return chosen.length;
  }

  /** Asks every open page to notify the owner. Returns how many pages were asked. */
  notify(title: string, body: string): number {
    for (const viewer of this.viewers) viewer.send({ type: 'notify', title: title.slice(0, 200), body: body.slice(0, 600) });
    return this.viewers.size;
  }

  /**
   * Asks the tab used most recently to switch to a canvas, unless a tab is
   * already showing it. Returns how many tabs are now showing or were asked.
   */
  showCanvas(canvasId: string): number {
    const all = [...this.viewers];
    const already = all.filter((v) => v.canvasId === canvasId);
    if (already.length > 0) return already.length;
    const mostRecent = all.sort((a, b) => b.activeAt - a.activeAt)[0];
    if (!mostRecent) return 0;
    mostRecent.send({ type: 'show-canvas', canvasId });
    return 1;
  }
}
