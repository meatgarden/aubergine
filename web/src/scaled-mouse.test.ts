import { describe, expect, it } from 'vitest';
import { unscaled, wheelReports } from './scaled-mouse';

describe('the pointer over a terminal on a zoomed canvas', () => {
  const box = { left: 100, top: 50 };
  it('is where it is at 100%', () => {
    expect(unscaled({ x: 180, y: 90 }, box, 1)).toEqual({ x: 180, y: 90 });
  });
  it('is twice as far into the box at half size', () => {
    expect(unscaled({ x: 180, y: 90 }, box, 0.5)).toEqual({ x: 260, y: 130 });
  });
  it('keeps the corner of the box where it is', () => {
    expect(unscaled({ x: 100, y: 50 }, box, 0.7)).toEqual({ x: 100, y: 50 });
  });
  it('is left alone when the zoom makes no sense', () => {
    expect(unscaled({ x: 180, y: 90 }, box, 0)).toEqual({ x: 180, y: 90 });
  });
});

describe('the wheel over a terminal', () => {
  it('tells one report for every two lines of movement and keeps what is left over', () => {
    expect(wheelReports(34, 17)).toEqual({ reports: 1, left: 0 });
    expect(wheelReports(50, 17)).toEqual({ reports: 1, left: 16 });
    expect(wheelReports(20, 17)).toEqual({ reports: 0, left: 20 });
    expect(wheelReports(-70, 17)).toEqual({ reports: -2, left: -2 });
  });
  it('follows the size of a line as it is drawn on a zoomed canvas', () => {
    expect(wheelReports(34, 8.5)).toEqual({ reports: 2, left: 0 });
  });
  it('tells no more than thirty in a frame and does not save up the rest', () => {
    expect(wheelReports(100_000, 17)).toEqual({ reports: 30, left: 0 });
    expect(wheelReports(-100_000, 17)).toEqual({ reports: -30, left: 0 });
  });
  it('tells nothing when a line has no height yet', () => {
    expect(wheelReports(100, 0)).toEqual({ reports: 0, left: 0 });
  });
});
