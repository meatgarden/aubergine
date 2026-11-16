// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
