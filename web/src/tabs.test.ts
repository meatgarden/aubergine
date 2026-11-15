import { describe, expect, it } from 'vitest';
import { newCanvas, type Canvas } from '@aubergine/shared';
import { orderBefore } from './TabBar';

const canvas = (name: string, order: number): Canvas => ({ ...newCanvas('p', name, order), id: name });

describe('orderBefore', () => {
  const tabs = [canvas('a', 0), canvas('b', 1), canvas('c', 2)];
  const sorted = (moved: string, order: number): string[] =>
    tabs
      .map((t) => (t.id === moved ? { ...t, order } : t))
      .sort((x, y) => x.order - y.order)
      .map((t) => t.id);

  it('puts a tab between the target and the tab in front of it, changing only that tab', () => {
    expect(sorted('c', orderBefore(tabs, 'b'))).toEqual(['a', 'c', 'b']);
    expect(sorted('a', orderBefore(tabs, 'c'))).toEqual(['b', 'a', 'c']);
  });

  it('puts a tab in front of the first', () => {
    expect(sorted('c', orderBefore(tabs, 'a'))).toEqual(['c', 'a', 'b']);
  });

  it('puts it last when the target is unknown', () => {
    expect(sorted('a', orderBefore(tabs, 'nope'))).toEqual(['b', 'c', 'a']);
  });
});
