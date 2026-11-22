import { describe, expect, it } from 'vitest';
import { linkedAddress, isLinkName, canvasAddress, projectCanvasAddress, terminalAddress, pageAddress } from '@aubergine/shared';
import { canvasHref, canvasIdFromPath, chooseCanvas, linkFromPath, ofItsServer, sessionFromAddress, pageFromPath, shownAddress, terminalFromPath, terminalHref, terminalOnCanvasHref, writeAddressesFor } from './address';

describe('canvas addresses', () => {
  it('reads the canvas from /c/<id>', () => {
    expect(canvasIdFromPath('/c/0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee')).toBe('0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee');
    expect(canvasIdFromPath('/c/abc/')).toBe('abc');
    expect(canvasIdFromPath('/')).toBeNull();
    expect(canvasIdFromPath('/c/')).toBeNull();
    expect(canvasIdFromPath('/c/a/b')).toBeNull();
  });

  it('reads the page that is shown over a canvas, and the canvas under it', () => {
    expect(pageFromPath('/c/abc/queue')).toBe('queue');
    expect(pageFromPath('/p/proj/c/abc/library/')).toBe('library');
    expect(canvasIdFromPath('/c/abc/queue')).toBe('abc');
    expect(canvasIdFromPath('/p/proj/c/abc/board')).toBe('abc');
    // The canvas itself, and a name that is no page's.
    expect(pageFromPath('/c/abc')).toBeNull();
    expect(pageFromPath('/c/abc/settings')).toBeNull();
    expect(canvasIdFromPath('/c/abc/settings')).toBeNull();
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

describe('the address of one terminal', () => {
  it('names the terminal, and only at /t/<id>', () => {
    expect(terminalFromPath('/t/0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee')).toBe('0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee');
    expect(terminalFromPath('/t/abc/')).toBe('abc');
    expect(terminalFromPath('/t/')).toBeNull();
    expect(terminalFromPath('/t/abc/more')).toBeNull();
    expect(terminalFromPath('/c/abc')).toBeNull();
  });

  it('is not the address of a canvas', () => {
    expect(canvasIdFromPath('/t/abc')).toBeNull();
    expect(pageFromPath('/t/abc')).toBeNull();
  });

  it('goes back to the canvas through the address that shows a session', () => {
    expect(sessionFromAddress(new URL(terminalOnCanvasHref('abc'), 'http://x').search)).toBe('abc');
  });

  it('links a canvas with its project where it has one', () => {
    expect(canvasHref('c1', 'p1')).toBe('/p/p1/c/c1');
    expect(canvasHref('c1', null)).toBe('/c/c1');
  });
});

describe('the addresses of a linked server', () => {
  const link = 'abcd1234';
  const canvas = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
  const project = '0190aaaa-bbbb-7ccc-8ddd-ffffffffffff';

  it('are its own addresses after /s/<link>, and read back the same', () => {
    for (const address of [canvasAddress(canvas), projectCanvasAddress(project, canvas), pageAddress(projectCanvasAddress(project, canvas), 'runs'), terminalAddress(canvas)]) {
      const shown = linkedAddress(link, address);
      expect(shown).toBe(`/s/${link}${address}`);
      expect(linkFromPath(shown)).toBe(link);
      expect(ofItsServer(shown)).toBe(address);
    }
    expect(canvasIdFromPath(linkedAddress(link, projectCanvasAddress(project, canvas)))).toBe(canvas);
    expect(pageFromPath(linkedAddress(link, pageAddress(canvasAddress(canvas), 'library')))).toBe('library');
    expect(terminalFromPath(linkedAddress(link, terminalAddress(canvas)))).toBe(canvas);
    expect(canvasIdFromPath(linkedAddress(link, terminalAddress(canvas)))).toBeNull();
    expect(linkFromPath(`/s/${link}`)).toBe(link);
    expect(ofItsServer(`/s/${link}`)).toBe('/');
  });

  it('are not of a linked server without /s/ first', () => {
    for (const path of ['/', canvasAddress(canvas), terminalAddress(canvas), '/sx/abcd1234/c/x', '/s', `/c/${canvas}/s/${link}`]) expect(linkFromPath(path)).toBeNull();
  });

  it('give a hostile name as it is, for the store to refuse, and never a canvas of the own server', () => {
    for (const name of ['', '..', '%2e%2e', 'ABCD1234', 'abcd123', 'abcd12345', '%3Cb%3Ex', 'abcd%2F12']) {
      const path = `/s/${name}/c/${canvas}`;
      expect(linkFromPath(path)).toBe(name);
      expect(isLinkName(linkFromPath(path))).toBe(false);
    }
    expect(isLinkName(link)).toBe(true);
  });

  it('are written while it is shown, and the own addresses again after', () => {
    expect(shownAddress('/c/x', link)).toBe(`/s/${link}/c/x`);
    expect(shownAddress('/', link)).toBe(`/s/${link}`);
    writeAddressesFor(link);
    try {
      expect(canvasHref(canvas, project)).toBe(`/s/${link}/p/${project}/c/${canvas}`);
      expect(terminalHref(canvas)).toBe(`/s/${link}/t/${canvas}`);
      expect(terminalOnCanvasHref(canvas)).toBe(`/s/${link}?session=${canvas}`);
    } finally {
      writeAddressesFor(null);
    }
    expect(canvasHref(canvas)).toBe(`/c/${canvas}`);
    expect(terminalHref(canvas)).toBe(`/t/${canvas}`);
  });
});
