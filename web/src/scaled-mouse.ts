/**
 * A terminal works out which cell the pointer is over from the pointer's
 * place on screen and the size of a cell as laid out. On a canvas zoomed to
 * anything but 100% those two disagree by the zoom, and a selection lands in
 * the wrong place. This hands the terminal the place the pointer would have
 * at 100%.
 *
 * It also evens out the wheel. Left alone, a trackpad's movement is slowed to
 * under a third and then answered five lines at a time: sluggish, then jumpy.
 */

/** The place on screen that, at 100%, is over the same spot of the box as `point` is at `zoom`. */
export function unscaled(point: { x: number; y: number }, box: { left: number; top: number }, zoom: number): { x: number; y: number } {
  if (!(zoom > 0)) return point;
  return { x: box.left + (point.x - box.left) / zoom, y: box.top + (point.y - box.top) / zoom };
}

/** How many lines the session's scroll-back view moves for one wheel report (see tmux.conf). */
export const LINES_PER_REPORT = 2;
/** No more reports than this in one frame, however hard the wheel is spun. */
const MAX_REPORTS_PER_FRAME = 30;

/**
 * Wheel movement that has not been told yet, in pixels, and how much of it makes whole reports.
 * What is left over stays for the next movement, so slow scrolling still adds up.
 */
export function wheelReports(pendingPixels: number, pixelsPerLine: number): { reports: number; left: number } {
  const step = pixelsPerLine * LINES_PER_REPORT;
  if (!(step > 0) || !Number.isFinite(pendingPixels)) return { reports: 0, left: 0 };
  const whole = Math.trunc(pendingPixels / step);
  const reports = Math.max(-MAX_REPORTS_PER_FRAME, Math.min(MAX_REPORTS_PER_FRAME, whole));
  // Movement beyond the most that is told in a frame is dropped, not saved up: scrolling stops when the hand does.
  return { reports, left: reports === whole ? pendingPixels - whole * step : 0 };
}

const TYPES = ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel'] as const;

/**
 * For as long as it is installed, mouse events over `element` (and the rest of a drag that began there)
 * reach their listeners with corrected positions. Returns what removes it.
 */
export function correctMouse(element: HTMLElement, zoom: () => number): () => void {
  const ours = new WeakSet<Event>();
  let dragging = false;

  // The wheel: told as one report for every two lines of movement, at most once a frame, so that the
  // scroll-back view follows the hand evenly whether it is a wheel with notches or a trackpad.
  let pending = 0;
  let frame = 0;
  let lastWheel: WheelEvent | null = null;
  const lineHeight = (): number => element.querySelector('.xterm-rows > div')?.getBoundingClientRect().height ?? 17 * zoom();
  const tellWheel = (): void => {
    frame = 0;
    const from = lastWheel;
    if (!from?.target) return;
    const { reports, left } = wheelReports(pending, lineHeight());
    pending = left;
    if (reports === 0) return;
    const box = (element.querySelector('.xterm-screen') ?? element).getBoundingClientRect();
    const at = unscaled({ x: from.clientX, y: from.clientY }, box, zoom());
    for (let i = 0; i < Math.abs(reports); i++) {
      const one = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: from.view,
        clientX: at.x,
        clientY: at.y,
        deltaY: Math.sign(reports),
        deltaMode: WheelEvent.DOM_DELTA_LINE,
      });
      ours.add(one);
      from.target.dispatchEvent(one);
    }
  };
  const onWheel = (event: WheelEvent): boolean => {
    // Pinching and wheel-with-a-modifier are not scrolling; sideways movement is not ours either.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.deltaY === 0) return false;
    const line = lineHeight();
    const rows = element.querySelectorAll('.xterm-rows > div').length || 24;
    pending += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * line : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * line * rows : event.deltaY;
    // A change of direction starts from nothing.
    if (lastWheel && Math.sign(lastWheel.deltaY) !== Math.sign(event.deltaY)) pending = event.deltaY;
    lastWheel = event;
    if (frame === 0) frame = requestAnimationFrame(tellWheel);
    return true;
  };

  const onEvent = (event: Event): void => {
    if (ours.has(event) || !(event instanceof MouseEvent)) return;
    const inside = event.target instanceof Node && element.contains(event.target);
    if (event.type === 'mousedown') dragging = inside;
    const mine = inside || (dragging && (event.type === 'mousemove' || event.type === 'mouseup'));
    if (event.type === 'mouseup') dragging = false;
    if (inside && event instanceof WheelEvent && element.contains(document.activeElement) && onWheel(event)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    const scale = zoom();
    if (!mine || Math.abs(scale - 1) < 0.001 || !event.target) return;

    const box = (element.querySelector('.xterm-screen') ?? element).getBoundingClientRect();
    const at = unscaled({ x: event.clientX, y: event.clientY }, box, scale);
    const init: WheelEventInit = {
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      composed: event.composed,
      view: event.view,
      detail: event.detail,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: at.x,
      clientY: at.y,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      button: event.button,
      buttons: event.buttons,
      relatedTarget: event.relatedTarget,
    };
    let copy: MouseEvent;
    if (event instanceof WheelEvent) {
      copy = new WheelEvent(event.type, { ...init, deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode });
    } else {
      copy = new MouseEvent(event.type, init);
    }
    ours.add(copy);
    // The event as it came goes no further; the corrected one takes its way from the same place.
    event.stopImmediatePropagation();
    if (!event.target.dispatchEvent(copy) && event.cancelable) event.preventDefault();
  };

  for (const type of TYPES) window.addEventListener(type, onEvent, { capture: true, passive: false });
  return () => {
    cancelAnimationFrame(frame);
    for (const type of TYPES) window.removeEventListener(type, onEvent, { capture: true });
  };
}
