import { describe, expect, it } from 'vitest';
import { SHOW_PARAM, newId } from '@aubergine/shared';
import { canvasAddress, openCommand } from './open-browser';

describe('opening the browser', () => {
  it('uses the system opener for the platform', () => {
    expect(openCommand('darwin', 'http://x/')).toEqual({ file: 'open', args: ['http://x/'] });
    expect(openCommand('linux', 'http://x/')).toEqual({ file: 'xdg-open', args: ['http://x/'] });
    expect(openCommand('win32', 'http://x/')).toBeNull();
  });

  it('builds an address that lands on the session and carries no token', () => {
    const id = newId();
    const address = canvasAddress(4600, id, SHOW_PARAM);
    expect(address).toBe(`http://127.0.0.1:4600/?session=${id}`);
    expect(address).not.toMatch(/token|auth/);
  });
});
