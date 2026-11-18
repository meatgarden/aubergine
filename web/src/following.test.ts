import { describe, expect, it } from 'vitest';
import { applyEvent, createInitialState, type AppState, type ChangeEvent } from '@aubergine/shared';
import { NOT_FOLLOWING, takeChange, takeWhole } from './following';

/** A state, and three changes to it in order: each renames the one canvas. */
const start = createInitialState(new Date('2026-06-01T09:00:00.000Z'));
const canvasId = start.canvases[0]!.id;
const rename = (name: string): ChangeEvent => ({ type: 'canvas.updated', canvasId, changes: { name } });
const [one, two, three] = [rename('One'), rename('Two'), rename('Three')];
const after = (...events: ChangeEvent[]): AppState => events.reduce(applyEvent, start);
const nameOf = (state: AppState | null): string | undefined => state?.canvases[0]?.name;
const EPOCH = 'this run of the server';

describe('following the server without losing a change', () => {
  it('a whole state asked for before a change and arriving after it does not replace the newer state', () => {
    // The page has the state at 0. It asks again (the socket became ready); the server answers with the state at 0.
    let page = takeWhole(NOT_FOLLOWING, start, EPOCH, 0);
    // Before that answer is here, changes 1 and 2 arrive on the stream.
    page = takeChange(page, one, 1);
    page = takeChange(page, two, 2);
    expect(nameOf(page.whole)).toBe('Two');
    // Now the old answer arrives. It is older than what the page has: it is not taken.
    page = takeWhole(page, start, EPOCH, 0);
    expect(nameOf(page.whole)).toBe('Two');
    expect(page.revision).toBe(2);
    // And an answer from between the two is not taken either.
    page = takeWhole(page, after(one), EPOCH, 1);
    expect(nameOf(page.whole)).toBe('Two');
  });

  it('a change that arrives before the whole state it belongs after is kept, and applied after it', () => {
    // The stream is quicker than the first answer: changes 2 and 3 arrive while nothing is known yet.
    let page = takeChange(NOT_FOLLOWING, two, 2);
    page = takeChange(page, three, 3);
    expect(page.whole).toBeNull();
    expect(page.waiting).toHaveLength(2);
    // The whole state arrives, as it was after change 1: the two that waited are applied to it, in order.
    page = takeWhole(page, after(one), EPOCH, 1);
    expect(nameOf(page.whole)).toBe('Three');
    expect(page.revision).toBe(3);
    expect(page.waiting).toEqual([]);
  });

  it('a change the whole state already holds is not applied a second time', () => {
    // The whole state is from after change 2; changes 1 and 2 were still on their way on the stream.
    let page = takeChange(NOT_FOLLOWING, one, 1);
    page = takeWhole(page, after(one, two), EPOCH, 2);
    expect(nameOf(page.whole)).toBe('Two');
    const same = takeChange(page, two, 2);
    expect(same).toBe(page);
    // Applying an older rename again would have put the old name back.
    expect(nameOf(takeChange(page, one, 1).whole)).toBe('Two');
    expect(nameOf(takeChange(page, three, 3).whole)).toBe('Three');
  });

  it('a newer whole state is taken, and the changes after it still apply', () => {
    let page = takeWhole(NOT_FOLLOWING, start, EPOCH, 0);
    page = takeChange(page, one, 1);
    page = takeWhole(page, after(one, two), EPOCH, 2);
    expect([nameOf(page.whole), page.revision]).toEqual(['Two', 2]);
    page = takeChange(page, three, 3);
    expect([nameOf(page.whole), page.revision]).toEqual(['Three', 3]);
  });

  it('after the server started again its numbers start again: its state is taken, whatever its number', () => {
    let page = takeWhole(NOT_FOLLOWING, after(one, two), EPOCH, 40);
    // A change that was waiting from the old run does not belong to the new one.
    const waiting = takeChange({ ...page, whole: null }, three, 41);
    page = takeWhole(page, after(one), 'another run of the server', 0);
    expect([nameOf(page.whole), page.revision, page.epoch]).toEqual(['One', 0, 'another run of the server']);
    expect(nameOf(takeWhole(waiting, start, 'another run of the server', 0).whole)).toBe(start.canvases[0]!.name);
  });

  it('what the page applies itself, from the answer to its own request, is applied at once and moves no number', () => {
    let page = takeWhole(NOT_FOLLOWING, start, EPOCH, 0);
    page = takeChange(page, one);
    expect([nameOf(page.whole), page.revision]).toEqual(['One', 0]);
    // The same change then comes on the stream with its number, and the number moves.
    page = takeChange(page, one, 1);
    expect([nameOf(page.whole), page.revision]).toEqual(['One', 1]);
    // Before anything is known there is nothing to apply it to.
    expect(takeChange(NOT_FOLLOWING, one)).toBe(NOT_FOLLOWING);
  });
});
