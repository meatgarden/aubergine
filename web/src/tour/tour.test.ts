// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bestCorner, cornerBox, overlap } from './placement';
import { tourSteps } from './registry';
import './steps';
import { neverShown, parseRemembered, resumeAt } from './tour-store';

describe('the steps of the tour', () => {
  const steps = tourSteps();

  it('are at most eight, in order, each with a different name', () => {
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(8);
    expect(steps.map((s) => s.id)).toEqual(['terminal', 'waiting', 'find', 'list', 'workflow', 'checklist', 'review', 'your-own']);
    expect(new Set(steps.map((s) => s.order)).size).toBe(steps.length);
  });

  it('say what to do in at most two short sentences, and have a one-line reminder', () => {
    for (const step of steps) {
      // A sentence ends with a full stop, a question mark or an exclamation mark followed by a space or the end.
      const sentences = step.text.split(/(?<=[.!?])\s+/).filter((part) => part.trim() !== '');
      expect(sentences.length, step.id).toBeLessThanOrEqual(2);
      expect(step.text.length, step.id).toBeLessThanOrEqual(140);
      expect(step.title.length, step.id).toBeLessThanOrEqual(40);
      expect(step.reminder.includes('\n')).toBe(false);
      expect(step.reminder.length, step.id).toBeLessThanOrEqual(100);
    }
  });

  it('wait for the person to do something, all but the last', () => {
    expect(steps.slice(0, -1).every((step) => step.done !== undefined)).toBe(true);
    expect(steps.at(-1)?.done).toBeUndefined();
  });

  it('do not ask for a key a browser may keep: no step names a key combination', () => {
    for (const step of steps) expect(`${step.text} ${step.reminder}`).not.toMatch(/⌘|Ctrl\s*\+|Cmd|Alt\s*\+|F\d/);
  });
});

describe('what is remembered of the tour', () => {
  const ids = ['terminal', 'waiting', 'find'];

  it('begins by itself only in a browser that was never shown it', () => {
    expect(neverShown(parseRemembered(null))).toBe(true);
    expect(neverShown(parseRemembered('not json'))).toBe(true);
    expect(neverShown(parseRemembered('{"status":"nonsense"}'))).toBe(true);
    for (const status of ['active', 'paused', 'finished', 'dismissed']) expect(neverShown(parseRemembered(JSON.stringify({ status, step: null })))).toBe(false);
  });

  it('is taken up where it was left, and from the start once finished or put away', () => {
    expect(resumeAt(parseRemembered('{"status":"paused","step":"find"}'), ids)).toBe(2);
    expect(resumeAt(parseRemembered('{"status":"active","step":"waiting"}'), ids)).toBe(1);
    expect(resumeAt(parseRemembered('{"status":"finished","step":null}'), ids)).toBe(0);
    expect(resumeAt(parseRemembered('{"status":"dismissed","step":null}'), ids)).toBe(0);
    // A step that no longer exists: from the start.
    expect(resumeAt(parseRemembered('{"status":"paused","step":"gone"}'), ids)).toBe(0);
    expect(resumeAt(null, ids)).toBe(0);
  });
});

describe('where the card goes', () => {
  const card = { width: 380, height: 190 };
  const window = { width: 1400, height: 860 };

  it('stays in the bottom right while nothing it would cover matters', () => {
    expect(bestCorner(card, window, [])).toBe('bottom-right');
    expect(bestCorner(card, window, [{ box: { x: 100, y: 100, width: 300, height: 200 }, weight: 3 }])).toBe('bottom-right');
  });

  it('moves off the buttons of a dialog, and off the thing being pointed at', () => {
    // A wide dialog whose buttons are at its bottom right, under where the card would be.
    const dialog = { box: { x: 130, y: 115, width: 1140, height: 640 }, weight: 1 };
    const accept = { box: { x: 1150, y: 700, width: 100, height: 32 }, weight: 12 };
    const corner = bestCorner(card, window, [dialog, accept]);
    expect(corner).not.toBe('bottom-right');
    expect(overlap(cornerBox(corner, card, window), accept.box)).toBe(0);
    // The thing pointed at is in the bottom right: go elsewhere.
    expect(bestCorner(card, window, [{ box: { x: 1000, y: 600, width: 380, height: 240 }, weight: 3 }])).not.toBe('bottom-right');
  });

  it('does not jump about for a sliver: it moves only when another corner is clearly better', () => {
    const sliver = { box: { x: 1004, y: 654, width: 30, height: 30 }, weight: 1 };
    expect(bestCorner(card, window, [sliver], 'bottom-right')).toBe('bottom-right');
    expect(bestCorner(card, window, [], 'top-left')).toBe('top-left');
  });
});
