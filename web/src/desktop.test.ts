import { describe, expect, it } from 'vitest';
import { DESKTOP_SIZE_HINT, afterOpening, shouldSayDesktopSize } from './desktop';

function storage(): Pick<Storage, 'getItem' | 'setItem'> & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return { kept, getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}

describe('the note about size', () => {
  it('is said once in a browser, and not at all where that cannot be remembered', () => {
    const here = storage();
    expect(shouldSayDesktopSize(here)).toBe(true);
    expect(shouldSayDesktopSize(here)).toBe(false);
    expect(shouldSayDesktopSize(null)).toBe(false);
    expect(
      shouldSayDesktopSize({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
      }),
    ).toBe(false);
  });

  it('says what happens with size, and that closing the window ends nothing', () => {
    expect(DESKTOP_SIZE_HINT).toContain('share one size');
    expect(DESKTOP_SIZE_HINT).toContain('the view you used last sets it');
    expect(DESKTOP_SIZE_HINT).toContain('Closing the window ends nothing');
  });
});

describe('after a window was asked for', () => {
  it('says why it could not be opened, every time; and the note about size the first time it could', () => {
    expect(afterOpening({ opened: false, says: 'Terminal could not be asked to open it. Is it installed?' }, () => true)).toBe('Not opened on the desktop: Terminal could not be asked to open it. Is it installed?');
    expect(afterOpening({ opened: true, says: 'Asked Terminal to open it.' }, () => true)).toBe(`Opened on the desktop. ${DESKTOP_SIZE_HINT}`);
    expect(afterOpening({ opened: true, says: 'Asked Terminal to open it.' }, () => false)).toBeNull();
  });
});
