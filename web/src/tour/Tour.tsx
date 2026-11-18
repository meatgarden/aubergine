import { useEffect, useMemo, useRef, useState } from 'react';
import { demoOf } from '@aubergine/shared';
import { useApp } from '../store';
import { removeDemo } from './actions';
import { bestCorner, type Corner, type Obstacle } from './placement';
import { tourSteps, type TourContext, type TourStep } from './registry';
import './steps';
import { neverShown, remembered, resumeAt, useTour } from './tour-store';

/** Where something is on the page, looked at again every so often: things move as the canvas pans and panels open. */
function useRectOf(find: (() => Element | null) | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!find) {
      setRect(null);
      return;
    }
    const measure = (): void => {
      const next = find()?.getBoundingClientRect() ?? null;
      setRect((before) => (before && next && before.x === next.x && before.y === next.y && before.width === next.width && before.height === next.height ? before : next && next.width > 0 ? next : null));
    };
    measure();
    // A timer, not animation frames: those stop in a tab that is not showing.
    const timer = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [find]);
  return rect;
}

/** Whether a rectangle is that of something a dialog holds: it lies within the dialog's own box. */
function isInside(rect: DOMRect, backdrop: Element): boolean {
  const box = backdrop.querySelector('.dialog, .picker')?.getBoundingClientRect();
  return !!box && rect.x >= box.x - 1 && rect.y >= box.y - 1 && rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1;
}

/** A ring round what is being pointed at. It takes no clicks: what is under it stays usable. */
function Ring({ rect }: { rect: DOMRect | null }) {
  if (!rect) return null;
  // While a dialog is open and what is pointed at is behind it, no ring is drawn over the dialog.
  const middle = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  const dialog = middle?.closest('.dialog-backdrop');
  if (dialog && !isInside(rect, dialog)) return null;
  const pad = 6;
  return <div className="tour-ring" aria-hidden="true" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} data-testid="tour-ring" />;
}

/**
 * The corner the card sits in: wherever it covers least of what is needed just now. Looked at again as things
 * open and move, on the same kind of timer as the ring.
 */
function useCorner(card: React.RefObject<HTMLElement | null>, target: DOMRect | null, up: boolean): Corner {
  const [corner, setCorner] = useState<Corner>('bottom-right');
  useEffect(() => {
    if (!up) return;
    const place = (): void => {
      const size = card.current?.getBoundingClientRect();
      if (!size) return;
      const obstacles: Obstacle[] = [];
      if (target) obstacles.push({ box: target, weight: 3 });
      for (const dialog of document.querySelectorAll('.dialog, .picker')) {
        obstacles.push({ box: dialog.getBoundingClientRect(), weight: 1 });
        // What can be pressed in a dialog must stay in reach.
        for (const control of dialog.querySelectorAll('button, input, select, textarea')) obstacles.push({ box: control.getBoundingClientRect(), weight: 12 });
      }
      setCorner((now) => bestCorner({ width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, obstacles, now));
    };
    place();
    const timer = setInterval(place, 250);
    return () => clearInterval(timer);
  }, [card, target, up]);
  return corner;
}

function contextNow(signals: ReadonlySet<string>): TourContext | null {
  const state = useApp.getState();
  if (!state.app) return null;
  return { app: state.app, state, demo: demoOf(state.app), signals };
}

/**
 * The tour: a small card that says what to try next and a ring round the
 * thing itself. It never covers the page and never takes the keyboard by
 * itself; everything stays usable while it is up. What each step is comes
 * from the registry.
 */
export function Tour() {
  const step = useTour((s) => s.step);
  const signals = useTour((s) => s.signals);
  const pointing = useTour((s) => s.pointing);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const viewingRun = useApp((s) => s.viewingRun);
  const filters = useApp((s) => s.listView.filters);
  const steps = tourSteps();
  const current: TourStep | null = step === null ? null : (steps[step] ?? null);
  const demo = useMemo(() => (app ? demoOf(app) : null), [app]);
  const [doneStep, setDoneStep] = useState<string | null>(null);

  // It begins by itself once: on the demo's canvas, in a browser that has never been shown it. Left half-way, it is taken up again there.
  useEffect(() => {
    if (step !== null || !demo || canvasId !== demo.canvasId) return;
    const before = remembered();
    if (!neverShown(before) && before?.status !== 'active') return;
    const at = resumeAt(before, steps.map((s) => s.id));
    const first = steps[at];
    if (first) useTour.getState().start(at, first.id);
  }, [step, demo, canvasId, steps]);

  // Without the demo there is nothing to point at: the tour steps aside.
  useEffect(() => {
    if (step !== null && app && !demo) useTour.getState().end('paused', current?.id ?? null);
  }, [step, app, demo, current]);

  // Reaching a step may bring its thing into view.
  useEffect(() => {
    if (!current) return;
    const context = contextNow(new Set());
    if (context) current.arrive?.(context);
    setDoneStep(null);
  }, [current]);

  // Has the person done it? Looked at whenever something changes.
  useEffect(() => {
    if (!current?.done || doneStep === current.id) return;
    const context = contextNow(signals);
    if (context && current.done(context)) setDoneStep(current.id);
  }, [current, doneStep, signals, app, viewingRun, filters]);

  // Done: say so for a moment, then move on.
  useEffect(() => {
    if (!current || step === null || doneStep !== current.id) return;
    const next = steps[step + 1];
    if (!next) return;
    const timer = setTimeout(() => useTour.getState().go(step + 1, next.id), 1400);
    return () => clearTimeout(timer);
  }, [current, doneStep, step, steps]);

  // Pointing from the help panel lasts a few seconds.
  useEffect(() => {
    if (!pointing) return;
    const timer = setTimeout(() => useTour.getState().point(null), Math.max(0, pointing.until - Date.now()));
    return () => clearTimeout(timer);
  }, [pointing]);

  const pointed = pointing ? (steps.find((s) => s.id === pointing.stepId) ?? null) : null;
  const shown = current ?? pointed;
  const find = useMemo(() => {
    if (!shown) return null;
    return (): Element | null => {
      const context = contextNow(useTour.getState().signals);
      return context ? shown.target(context) : null;
    };
  }, [shown]);
  const rect = useRectOf(find);
  const cardRef = useRef<HTMLElement | null>(null);
  const corner = useCorner(cardRef, rect, current !== null);

  if (!current || step === null) return <Ring rect={rect} />;
  const last = step === steps.length - 1;
  const done = doneStep === current.id;
  const go = (to: number): void => {
    const target = steps[to];
    if (target) useTour.getState().go(to, target.id);
  };

  return (
    <>
      <Ring rect={rect} />
      <section ref={cardRef} className={`tour-card at-${corner}`} role="region" aria-label="Tour" data-testid="tour-card" data-step={current.id} data-corner={corner} data-done={done ? 'true' : undefined}>
        <div className="tour-count" data-testid="tour-count">
          {step + 1} of {steps.length}
        </div>
        <h2>{current.title}</h2>
        <p aria-live="polite">{current.text}</p>
        {done && (
          <p className="tour-done" data-testid="tour-done">
            ✓ That is it.
          </p>
        )}
        {!rect && !done && <p className="tour-hint">It is not on screen just now: it is on the “Demo” canvas.</p>}
        <div className="tour-actions">
          {step > 0 && (
            <button type="button" className="quiet" onClick={() => go(step - 1)} data-testid="tour-back">
              Back
            </button>
          )}
          {!last && (
            <button type="button" className={done ? '' : 'quiet'} onClick={() => go(step + 1)} data-testid="tour-next">
              {done ? 'Next' : 'Skip this'}
            </button>
          )}
          {last && demo && (
            <button type="button" className="quiet" onClick={() => void removeDemo()} data-testid="tour-remove-demo">
              Remove the demo
            </button>
          )}
          {last && (
            <button type="button" onClick={() => useTour.getState().end('finished', null)} data-testid="tour-finish">
              Finish
            </button>
          )}
          <span className="tour-spacer" />
          <button type="button" className="quiet" onClick={() => useTour.getState().end('paused', current.id)} title="Put the tour away. “Take the tour” in the palette, or under ?, brings it back where you left it." data-testid="tour-later">
            Not now
          </button>
          {!last && (
            <button type="button" className="quiet" onClick={() => useTour.getState().end('dismissed', null)} title="Put the tour away for good in this browser." data-testid="tour-dismiss">
              Don’t show again
            </button>
          )}
        </div>
      </section>
    </>
  );
}
