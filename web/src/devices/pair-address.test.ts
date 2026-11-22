import { describe, expect, it } from 'vitest';
import { codeFromFragment, fragmentIsPairing, takeCodeFromAddress, takeWaitingCode } from './pair-address';

describe('a code in the address', () => {
  it('is read after #pair=, in either case, with or without its dash', () => {
    expect(codeFromFragment('#pair=ABCDE-FGHJK')).toBe('ABCDEFGHJK');
    expect(codeFromFragment('#pair=abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(codeFromFragment('#pair=ABCDEFGHJK')).toBe('ABCDEFGHJK');
  });

  it('is nothing in any other fragment, over-long, with markup or with letters a code never has', () => {
    for (const fragment of [
      '',
      '#',
      '#pair=',
      '#other=ABCDE-FGHJK',
      '#PAIR=ABCDE-FGHJK',
      '#x#pair=ABCDE-FGHJK',
      '#pair=ABCDE-FGHJK&next=/',
      '#pair=ABCDE-FGHJKA',
      `#pair=${'A'.repeat(5000)}`,
      '#pair=<img src=x>',
      '#pair=%3Cscript%3E',
      '#pair=ABCDE-FGHJI',
      '#pair=ILOUA-BCDEF',
      '#pair=ABCD--FGHJK',
    ]) {
      expect(codeFromFragment(fragment), fragment.slice(0, 40)).toBeNull();
    }
  });

  it('is taken out of the address before anything else, and handed over once', () => {
    const replaced: string[] = [];
    const where = { hash: '#pair=abcde-fghjk', pathname: '/c/x', search: '?s=1' } as Location;
    takeCodeFromAddress(where, { state: null, replaceState: (_state, _unused, url) => void replaced.push(String(url)) });
    expect(replaced).toEqual(['/c/x?s=1']);
    expect(takeWaitingCode()).toBe('ABCDEFGHJK');
    expect(takeWaitingCode()).toBeNull();
  });

  it('is taken out of the address even when it is not a code, and nothing is kept', () => {
    const replaced: string[] = [];
    takeCodeFromAddress({ hash: '#pair=<b>', pathname: '/', search: '' } as Location, { state: null, replaceState: (_s, _u, url) => void replaced.push(String(url)) });
    expect(replaced).toEqual(['/']);
    expect(takeWaitingCode()).toBeNull();
    // Another fragment is the page's own business, and is left as it is.
    takeCodeFromAddress({ hash: '#notes', pathname: '/', search: '' } as Location, { state: null, replaceState: () => void replaced.push('again') });
    expect(replaced).toEqual(['/']);
    expect(fragmentIsPairing('#notes')).toBe(false);
  });
});
