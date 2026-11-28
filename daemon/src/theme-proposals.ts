import {
  THEME_PROPOSALS_MAX,
  newId,
  proposalRows,
  readThemeFile,
  sameProposer,
  themeChoices,
  themeRow,
  type AcceptedTheme,
  type OwnerCaller,
  type Proposer,
  type ProposeThemeRequest,
  type ThemeProposal,
  type ThemeProposalRow,
  type ThemeRow,
} from '@aubergine/shared';
import { digestOf } from './project-files';
import { BadInputError, ConflictError, NotFoundError } from './sessions';
import type { StateHub } from './state-hub';
import { ThemeWriteError, type Themes } from './theme-files';

/**
 * Color themes proposed by agents and programs.
 *
 * A proposal is read by `readThemeFile` the moment it arrives, and kept with its exact text and the digest of that
 * text. Nothing here draws it, chooses it, or writes it anywhere: the only way out of here into a theme file is
 * `accept`, which only the owner may call, with the digest of what they were shown. Accepting writes the text that was
 * kept, never over a file that is there, and chooses nothing. Nothing is typed into a terminal: whoever proposed asks.
 */
export class ThemeProposals {
  constructor(
    private readonly hub: StateHub,
    private readonly themes: Themes,
  ) {}

  /** Every theme there is now, built-in first, as a program is told of them. */
  async list(): Promise<ThemeRow[]> {
    await this.themes.reload();
    return themeChoices(this.themes.value.themes).map(themeRow);
  }

  /** The proposals and the latest decisions; for a session, only its own. */
  rows(only?: Proposer): ThemeProposalRow[] {
    return proposalRows(this.hub.state.themeProposals, only ? (by) => sameProposer(by, only) : undefined);
  }

  get(proposalId: string): ThemeProposal {
    const proposal = this.hub.state.themeProposals.waiting.find((one) => one.id === proposalId);
    if (!proposal) throw new NotFoundError(`No color theme ${proposalId} waits to be read`);
    return proposal;
  }

  /** Keeps a proposal. A file that cannot be read is refused whole, and nothing of it is kept. */
  propose(body: ProposeThemeRequest, by: Proposer): ThemeProposalRow {
    const reading = readThemeFile(body.id, body.text);
    if ('problem' in reading) throw new BadInputError(reading.problem);
    const waiting = this.hub.state.themeProposals.waiting;
    const replaces = waiting.find((one) => one.themeId === body.id && sameProposer(one.proposedBy, by));
    if (!replaces && waiting.length >= THEME_PROPOSALS_MAX) throw new ConflictError(`${THEME_PROPOSALS_MAX} color themes are waiting to be read. No more can be proposed until the owner has accepted or declined some.`);
    const proposal: ThemeProposal = { id: newId(), themeId: body.id, theme: reading.theme, text: body.text, digest: digestOf(body.text), problems: reading.problems, why: body.why ?? '', proposedBy: by, at: new Date().toISOString() };
    this.hub.emit({ type: 'theme.proposed', proposal });
    return this.rows().find((row) => row.id === proposal.id) as ThemeProposalRow;
  }

  /**
   * Writes the proposal's text as `themes/<id>.json`: only for the digest that was shown, never over a file that is
   * there, never through a link. Chooses nothing. The owner's alone.
   */
  async accept(proposalId: string, digest: string, by: OwnerCaller): Promise<AcceptedTheme> {
    const proposal = this.get(proposalId);
    if (digest !== proposal.digest) throw new ConflictError('This is not the theme that was shown: its text has another digest. Read it again before you accept it.');
    // Read once more, as the folder will read it: what is written is a file the server reads.
    const reading = readThemeFile(proposal.themeId, proposal.text);
    if ('problem' in reading) throw new ConflictError(reading.problem);
    try {
      await this.themes.write(proposal.themeId, proposal.text);
    } catch (error) {
      if (error instanceof ThemeWriteError) throw new ConflictError(error.message);
      throw error;
    }
    this.decide(proposal, 'accepted', by);
    const now = await this.themes.reload();
    return { theme: now.themes.find((theme) => theme.id === proposal.themeId) ?? reading.theme, file: `${proposal.themeId}.json`, themes: now.themes, problems: now.problems };
  }

  /** Declines a proposal: nothing of it is kept but that it was declined. The owner's alone. */
  decline(proposalId: string, by: OwnerCaller): void {
    this.decide(this.get(proposalId), 'declined', by);
  }

  private decide(proposal: ThemeProposal, outcome: 'accepted' | 'declined', by: OwnerCaller): void {
    this.hub.emit({ type: 'theme.decided', decision: { proposalId: proposal.id, themeId: proposal.themeId, name: proposal.theme.name, proposedBy: proposal.proposedBy, outcome, at: new Date().toISOString(), by } });
  }
}
