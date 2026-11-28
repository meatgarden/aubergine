import { ANSI_NAMES, THEME_COLORS, baseName, mayBeHardToRead, proposerWords, showControl, themeOf, type ThemeProposal, type UserTheme } from '@aubergine/shared';
import { useEffect, type CSSProperties } from 'react';
import { api } from '../api';
import { useTrying } from '../appearance/trying';
import { useApp } from '../store';
import { terminalColorsOf, type TerminalColors } from '../terminal-themes';
import { chooseColorTheme } from '../theme';
import { Button } from '../ui';
import { registerReviewSource, type ReviewDetail, type ReviewItem } from './registry';

/**
 * Color themes proposed by agents and programs: the fifth thing the review screen shows. What is read is who proposed
 * it and why, the theme drawn beside the one it is laid over, the colors it sets, what was skipped, and the file's
 * whole text, which is what is written if it is accepted. "Try on this page" draws it in this browser alone, until
 * the review shows something else or closes. Accepting writes the file and chooses nothing.
 */

const NONE: ThemeProposal[] = [];
const useProposals = (): ThemeProposal[] => useApp((s) => s.whole?.themeProposals.waiting ?? NONE);
const proposalOf = (id: string): ThemeProposal | undefined => useApp.getState().whole?.themeProposals.waiting.find((one) => one.id === id);

/** Who proposed it, in words. */
function fromWords(proposal: ThemeProposal): string {
  const sessions = useApp.getState().whole?.sessions ?? [];
  return proposerWords(proposal.proposedBy, (id) => sessions.find((s) => s.id === id)?.name ?? null);
}

/** A proposal as the review screen lists it. Pure but for the names of terminals. */
export function itemOfProposal(proposal: ThemeProposal, from: string): ReviewItem {
  return { id: proposal.id, title: proposal.theme.name, what: `A ${proposal.theme.kind} color theme`, from, asked: '', state: 'waiting', comment: null, revision: 1 };
}

/** What the reviewer of a proposed theme reads above and as the text. Pure. */
export function detailOfProposal(proposal: ThemeProposal, fileThere: boolean): ReviewDetail {
  return {
    text: proposal.text,
    textTitle: `The file, exactly as it was sent: accepted, it is written as themes/${proposal.themeId}.json`,
    previousText: null,
    needs: [],
    proposal: { workflow: null, element: null },
    notices: [
      `Accepting writes themes/${proposal.themeId}.json and makes it one of your themes. It chooses nothing: the page stays as it is until you choose it.`,
      ...(fileThere ? [`There is a theme file named ${proposal.themeId}.json already. Accepting is refused while it is there: rename or remove that file first, then press Read themes again in Settings.`] : []),
    ],
  };
}

/** The colors a proposal sets, by name, as they are drawn: the page's, then a terminal's. Pure. */
export function colorsSet(theme: UserTheme): { name: string; hex: string }[] {
  const page = THEME_COLORS.flatMap((name) => (theme.colors[name] ? [{ name, hex: theme.colors[name] as string }] : []));
  const terminal = [
    ...(['foreground', 'cursor', 'selection'] as const).flatMap((key) => (theme.terminal[key] ? [{ name: `terminal ${key}`, hex: theme.terminal[key] as string }] : [])),
    ...(theme.terminal.ansi ?? []).flatMap((hex, at) => (hex ? [{ name: `terminal ${(ANSI_NAMES[at] ?? String(at)).replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}`, hex }] : [])),
  ];
  return [...page, ...terminal];
}

/** A theme's own colors as the values of the page's tokens, on an element that previews its base. */
const tokensOf = (theme: UserTheme | null): CSSProperties | undefined => (theme ? (Object.fromEntries(Object.entries(theme.colors).map(([name, value]) => [`--${name}`, value])) as CSSProperties) : undefined);

const EIGHT = ANSI_NAMES.slice(0, 8);

/** A small page and a terminal, drawn in a theme: its base's tokens with its own colors over them. */
function Sample({ base, theme, label, testid }: { base: string; theme: UserTheme | null; label: string; testid: string }) {
  const colors: TerminalColors = theme ? terminalColorsOf(theme.id, null, [theme]) : terminalColorsOf(base, null, []);
  return (
    <figure className="theme-review-figure">
      <div className="theme-review-sample" data-theme-preview={base} data-theme-id={theme?.id} style={tokensOf(theme)} data-testid={testid}>
        <div className="theme-review-surface">
          <strong>A terminal</strong>
          <span className="theme-review-muted">idle · 2 min</span>
          <span className="theme-review-accent">New terminal</span>
          <span className="ui-theme-preview-dots" aria-hidden="true">
            <span className="is-attention" />
            <span className="is-working" />
            <span className="is-ok" />
            <span className="is-danger" />
          </span>
        </div>
        <pre className="theme-review-terminal" style={{ background: colors.background, color: colors.foreground }} aria-label={`A terminal in ${label}`}>
          {'$ ls\n'}
          {EIGHT.map((name) => {
            const bright = `bright${name.charAt(0).toUpperCase()}${name.slice(1)}` as keyof TerminalColors;
            return (
              <span key={name}>
                <span style={{ color: colors[name] }}>{name.padEnd(8)}</span> <span style={{ color: colors[bright] }}>bright</span>
                {'\n'}
              </span>
            );
          })}
        </pre>
      </div>
      <figcaption className="ui-meta">{label}</figcaption>
    </figure>
  );
}

/** Who and why, the theme drawn, its colors, what was skipped, and trying it on this page. */
function Choices({ id }: { id: string }) {
  const proposal = useApp((s) => s.whole?.themeProposals.waiting.find((one) => one.id === id));
  const tried = useTrying((s) => s.theme !== null && s.theme.id === proposal?.themeId);
  // Leaving the review, or reading another thing in it, puts the page back.
  useEffect(() => () => useTrying.getState().stop(), [id]);
  if (!proposal) return null;
  const { theme } = proposal;
  const set = colorsSet(theme);
  return (
    <div className="review-choices theme-review" data-testid="theme-review">
      <p className="review-asked" data-testid="theme-review-why">
        <span className="wf-label">Why, in the words of {fromWords(proposal)}</span>
        {proposal.why ? `“${showControl(proposal.why)}”` : 'It says nothing about why.'}
      </p>
      <div className="theme-review-previews">
        <Sample base={theme.base} theme={theme} label={`${theme.name}, as proposed`} testid="theme-review-sample" />
        <Sample base={theme.base} theme={null} label={`${baseName(theme.base)}, the theme it is laid over`} testid="theme-review-base" />
      </div>
      <div className="settings-line">
        <Button kind="quiet" className="ui-start" aria-pressed={tried} onClick={() => (tried ? useTrying.getState().stop() : useTrying.getState().start(theme))} data-testid="theme-review-try">
          {tried ? 'Stop trying it' : 'Try on this page'}
        </Button>
      </div>
      <p className="ui-meta" data-testid="theme-review-try-says">
        {tried ? `This page is drawn in ${theme.name} now, in this browser only` : 'Trying draws it on this page, in this browser only'}, until you read something else here or close the review. Nothing is saved or sent.
      </p>
      <h4>The colors it sets</h4>
      {set.length === 0 ? (
        <p data-testid="theme-review-colors">None: it is {baseName(theme.base)} under another name.</p>
      ) : (
        <ul className="theme-review-colors" data-testid="theme-review-colors">
          {set.map((one) => (
            <li key={one.name}>
              <span className="theme-review-swatch" style={{ background: one.hex }} aria-hidden="true" />
              <span>{one.name}</span>
              <code>{one.hex}</code>
            </li>
          ))}
        </ul>
      )}
      {mayBeHardToRead(theme) && (
        <p className="ui-meta" data-testid="theme-review-contrast">
          {theme.name} may be hard to read: its text is less than 4.5 to 1 on its background or its surface.
        </p>
      )}
      {proposal.problems.length > 0 && (
        <div className="appearance-problems" data-testid="theme-review-problems">
          <p>Skipped when it was read, and not part of the theme:</p>
          <ul>
            {proposal.problems.map((problem, i) => (
              <li key={i}>{showControl(problem)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

registerReviewSource({
  id: 'theme-proposals',
  title: 'Color themes proposed',
  useItems: () => {
    const proposals = useProposals();
    const sessions = useApp((s) => s.whole?.sessions);
    return proposals.map((proposal) => itemOfProposal(proposal, proposerWords(proposal.proposedBy, (sessionId) => sessions?.find((s) => s.id === sessionId)?.name ?? null)));
  },
  load: async (id) => {
    const proposal = proposalOf(id);
    if (!proposal) throw new Error('This theme is no longer waiting to be read.');
    const { server, themes } = useApp.getState();
    return detailOfProposal(proposal, server === null && themes.themes.some((theme) => theme.id === proposal.themeId));
  },
  accept: async (id) => {
    const proposal = proposalOf(id);
    if (!proposal) throw new Error('This theme is no longer waiting to be read.');
    // Exactly the text that was shown, by its digest.
    const accepted = await api.acceptThemeProposal(id, proposal.digest);
    useTrying.getState().stop();
    const store = useApp.getState();
    if (store.server === null) {
      store.setThemes({ themes: accepted.themes, problems: accepted.problems });
      store.say(`“${accepted.theme.name}” is one of your themes now, as themes/${accepted.file}. Nothing chose it.`, { label: 'Use it', run: () => themeOf(accepted.theme.id, useApp.getState().themes.themes) && chooseColorTheme(accepted.theme.id) });
    } else store.say(`“${accepted.theme.name}” is a theme file of that server now. This page is drawn in the themes of its own server.`);
  },
  discard: async (id) => {
    await api.declineThemeProposal(id);
    useTrying.getState().stop();
    useApp.getState().say('The theme was declined. Nothing of it is kept.');
  },
  Choices,
  readOnly: true,
});
