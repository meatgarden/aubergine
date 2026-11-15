import { describe, expect, it } from 'vitest';
import { canvasIdFromPath, chooseCanvas, sessionFromAddress } from './address';

describe('canvas addresses', () => {
  it('reads the canvas from /c/<id>', () => {
    expect(canvasIdFromPath('/c/0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee')).toBe('0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee');
    expect(canvasIdFromPath('/c/abc/')).toBe('abc');
    expect(canvasIdFromPath('/')).toBeNull();
    expect(canvasIdFromPath('/c/')).toBeNull();
    expect(canvasIdFromPath('/c/a/b')).toBeNull();
  });

  it('prefers the address, then what this browser looked at last, then the default', () => {
    const exists = (id: string) => ['a', 'b', 'c'].includes(id);
    expect(chooseCanvas({ fromAddress: 'b', remembered: 'c', fallback: 'a', exists })).toBe('b');
    expect(chooseCanvas({ fromAddress: null, remembered: 'c', fallback: 'a', exists })).toBe('c');
    expect(chooseCanvas({ fromAddress: null, remembered: null, fallback: 'a', exists })).toBe('a');
  });

  it('skips canvases that no longer exist', () => {
    const exists = (id: string) => id === 'a';
    expect(chooseCanvas({ fromAddress: 'gone', remembered: 'also-gone', fallback: 'a', exists })).toBe('a');
  });

  it('reads the session an older address asks for', () => {
    expect(sessionFromAddress('?session=abc')).toBe('abc');
    expect(sessionFromAddress('')).toBeNull();
  });
});
