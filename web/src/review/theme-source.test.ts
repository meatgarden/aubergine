import { newId, readThemeFile, ThemeProposal, type UserTheme } from '@aubergine/shared';
import { describe, expect, it } from 'vitest';
import { proposedWords } from '../appearance/AppearancePart';
import { appearanceTried, useTrying, withTried } from '../appearance/trying';

/** A proposed theme, as the review shows it, and trying one on the page: what is pure of both. */

const TEXT = JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3', bg: '#0e1a24' }, terminal: { foreground: '#d8dee9', ansi: [null, '#cf8a90', null, null, null, null, null, null, '#939db2'] } }, null, 2);
const reading = readThemeFile('harbor', TEXT);
if ('problem' in reading) throw new Error(reading.problem);
const theme: UserTheme = reading.theme;
const proposal = ThemeProposal.parse({ id: newId(), themeId: 'harbor', theme, text: TEXT, digest: 'sha256:x', why: 'night', proposedBy: { kind: 'token', tokenId: newId(), name: 'designer' }, at: new Date().toISOString() });

describe('a proposed theme in the review', () => {
  it('is listed as a theme of its kind, from whoever proposed it', async () => {
    const { itemOfProposal } = await import('./theme-source');
    expect(itemOfProposal(proposal, 'a program, with the token “designer”')).toEqual({ id: proposal.id, title: 'Harbor', what: 'A dark color theme', from: 'a program, with the token “designer”', asked: '', state: 'waiting', comment: null, revision: 1 });
  });

  it('is read as its whole text, exactly as it was sent, with what accepting does and a file in the way said', async () => {
    const { detailOfProposal } = await import('./theme-source');
    const detail = detailOfProposal(proposal, false);
    expect(detail.text).toBe(TEXT);
    expect(detail.textTitle).toContain('themes/harbor.json');
    expect(detail.notices).toEqual(['Accepting writes themes/harbor.json and makes it one of your themes. It chooses nothing: the page stays as it is until you choose it.']);
    expect(detailOfProposal(proposal, true).notices?.[1]).toMatch(/^There is a theme file named harbor\.json already\. Accepting is refused while it is there/);
  });

  it('lists the colors it sets: the page\'s, then a terminal\'s', async () => {
    const { colorsSet } = await import('./theme-source');
    expect(colorsSet(theme)).toEqual([
      { name: 'bg', hex: '#0e1a24' },
      { name: 'accent', hex: '#5fb3b3' },
      { name: 'terminal foreground', hex: '#d8dee9' },
      { name: 'terminal red', hex: '#cf8a90' },
      { name: 'terminal bright black', hex: '#939db2' },
    ]);
  });

  it('is said in Settings while one waits', () => {
    expect(proposedWords(1)).toBe('One color theme was proposed by an agent or a program, to read before it can be chosen.');
    expect(proposedWords(3)).toBe('3 color themes were proposed by an agent or a program, to read before they can be chosen.');
  });
});

describe('trying a theme on the page', () => {
  it('draws it as the theme of its kind, among the owner\'s, in place of one of the same ID, and stops', () => {
    const own: UserTheme = { ...theme, name: 'Older harbor' };
    expect(withTried([own], null)).toEqual([own]);
    expect(withTried([own], theme)).toEqual([theme]);
    expect(appearanceTried({ light: 'light', dark: 'dark' }, theme)).toEqual({ light: 'light', dark: 'harbor' });
    expect(appearanceTried({ light: 'light', dark: 'nord' }, null)).toEqual({ light: 'light', dark: 'nord' });
    useTrying.getState().start(theme);
    expect(useTrying.getState().theme).toBe(theme);
    useTrying.getState().stop();
    expect(useTrying.getState().theme).toBeNull();
  });
});
