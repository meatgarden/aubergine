import { describe, expect, it } from 'vitest';
import { BadCursorError, IdempotencyStore, paginate } from './public-api';

const items = Array.from({ length: 7 }, (_, i) => ({ id: `item-${i}` }));
const idOf = (item: { id: string }) => item.id;

describe('paginate', () => {
  it('walks a list page by page, ending with a null cursor', () => {
    const first = paginate(items, idOf, { limit: 3 });
    expect(first.items.map(idOf)).toEqual(['item-0', 'item-1', 'item-2']);
    expect(first.nextCursor).not.toBeNull();
    const second = paginate(items, idOf, { limit: 3, cursor: first.nextCursor! });
    expect(second.items.map(idOf)).toEqual(['item-3', 'item-4', 'item-5']);
    const third = paginate(items, idOf, { limit: 3, cursor: second.nextCursor! });
    expect(third).toEqual({ items: [{ id: 'item-6' }], nextCursor: null });
  });

  it('returns everything with a null cursor when it fits', () => {
    expect(paginate(items, idOf, { limit: 100 })).toEqual({ items, nextCursor: null });
    expect(paginate([], idOf, { limit: 100 })).toEqual({ items: [], nextCursor: null });
    expect(paginate(items, idOf, { limit: 7 }).nextCursor).toBeNull();
  });

  it('stays correct when items are added or removed between pages', () => {
    const first = paginate(items, idOf, { limit: 3 });
    const changed = [{ id: 'new-first' }, ...items.filter((i) => i.id !== 'item-1')];
    expect(paginate(changed, idOf, { limit: 3, cursor: first.nextCursor! }).items.map(idOf)).toEqual(['item-3', 'item-4', 'item-5']);
  });

  it('refuses a cursor it did not give out', () => {
    expect(() => paginate(items, idOf, { limit: 3, cursor: 'not-a-cursor' })).toThrow(BadCursorError);
    const forged = Buffer.from(JSON.stringify({ after: 42 })).toString('base64url');
    expect(() => paginate(items, idOf, { limit: 3, cursor: forged })).toThrow(BadCursorError);
  });
});

describe('IdempotencyStore', () => {
  it('runs a create once per key and replays its answer', async () => {
    const store = new IdempotencyStore();
    let made = 0;
    const create = async () => ({ status: 201, body: { n: ++made } });
    expect(await store.run('k1', create)).toEqual({ status: 201, body: { n: 1 }, replayed: false });
    expect(await store.run('k1', create)).toEqual({ status: 201, body: { n: 1 }, replayed: true });
    expect(await store.run('k2', create)).toEqual({ status: 201, body: { n: 2 }, replayed: false });
    expect(made).toBe(2);
  });

  it('runs every time when no key was sent', async () => {
    const store = new IdempotencyStore();
    let made = 0;
    const create = async () => ({ status: 201, body: ++made });
    await store.run(null, create);
    await store.run(null, create);
    expect(made).toBe(2);
  });

  it('creates once when the same key arrives twice at the same moment', async () => {
    const store = new IdempotencyStore();
    let made = 0;
    const create = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { status: 201, body: ++made };
    };
    const [a, b] = await Promise.all([store.run('k', create), store.run('k', create)]);
    expect(made).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
  });

  it('does not remember a create that failed, so it can be tried again', async () => {
    const store = new IdempotencyStore();
    let attempts = 0;
    const create = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('no');
      return { status: 201, body: 'ok' };
    };
    await expect(store.run('k', create)).rejects.toThrow('no');
    expect(await store.run('k', create)).toEqual({ status: 201, body: 'ok', replayed: false });
  });
});
