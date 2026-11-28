import { z } from 'zod';
import { OwnerCaller, Proposer } from './drafts';
import { Id } from './ids';
import { THEME_FILE_MAX_BYTES } from './theme-files';
import { COLOR_THEMES, ColorThemeId, ThemeId, UserTheme, type ThemeOf } from './themes';
import { PLAIN_LINE } from './workflows';

/**
 * A color theme proposed by someone other than the owner: an agent in a terminal, or a program with a token. It is
 * read by `readThemeFile` when it arrives and kept with its exact text and the digest of that text. It is drawn
 * nowhere and written nowhere until the owner has looked at it and accepted that digest (`themes.manage`); accepting
 * writes `themes/<id>.json` with the text that was kept, and chooses nothing. Themes are the page's own, of no project:
 * a proposal is shared, as a draft from no terminal is.
 */

const Timestamp = z.iso.datetime();

/** How many proposals may wait at once, and how many decisions are kept for whoever proposed to read. */
export const THEME_PROPOSALS_MAX = 20;
export const THEME_DECISIONS_KEPT = 50;
export const THEME_WHY_MAX = 300;

/** Why a theme is proposed: one line of plain text, in the proposer's words. */
export const ThemeWhy = z.string().trim().max(THEME_WHY_MAX).regex(PLAIN_LINE, 'Why a theme is proposed is one line of plain text, without control characters');

/** A theme that waits for the owner. */
export const ThemeProposal = z.object({
  id: Id,
  /** The ID the theme would have: the name of its file, without `.json`. */
  themeId: ThemeId,
  /** What the text came to, read by `readThemeFile` when it arrived. */
  theme: UserTheme,
  /** The file's text, exactly as it was sent: what is written if it is accepted. */
  text: z.string().max(THEME_FILE_MAX_BYTES),
  /** Names exactly that text. Accepting names it again. */
  digest: z.string().max(200),
  /** What in the file was skipped, one sentence each. */
  problems: z.array(z.string().max(1000)).max(500).default([]),
  /** Why it is proposed, in the proposer's words. */
  why: z.string().max(THEME_WHY_MAX).default(''),
  /** Set by the server, never taken from a request. */
  proposedBy: Proposer,
  at: Timestamp,
});
export type ThemeProposal = z.infer<typeof ThemeProposal>;

/** What became of a proposal: a record of the decision, never the text. */
export const ThemeDecision = z.object({
  proposalId: Id,
  themeId: ThemeId,
  name: z.string().max(120),
  proposedBy: Proposer,
  outcome: z.enum(['accepted', 'declined']),
  at: Timestamp,
  by: OwnerCaller,
});
export type ThemeDecision = z.infer<typeof ThemeDecision>;

/** In the state: the proposals that wait, and the latest decisions, newest last. */
export const ThemeProposals = z.object({
  waiting: z.array(ThemeProposal).max(THEME_PROPOSALS_MAX * 2).default([]),
  decided: z.array(ThemeDecision).max(THEME_DECISIONS_KEPT * 2).default([]),
});
export type ThemeProposals = z.infer<typeof ThemeProposals>;

/** Whether two proposers are the same one: the same terminal, the same token, or the owner. Pure. */
export function sameProposer(a: Proposer, b: Proposer): boolean {
  if (a.kind === 'session' && b.kind === 'session') return a.sessionId === b.sessionId;
  if (a.kind === 'token' && b.kind === 'token') return a.tokenId === b.tokenId;
  return a.kind === 'person' && b.kind === 'person';
}

/** The proposals after one more arrives: the proposer's older one for the same theme ID goes. Pure. */
export function withProposal(state: ThemeProposals, proposal: ThemeProposal): ThemeProposals {
  return { ...state, waiting: [...state.waiting.filter((one) => one.id !== proposal.id && !(one.themeId === proposal.themeId && sameProposer(one.proposedBy, proposal.proposedBy))), proposal] };
}

/** The proposals after one was decided: it leaves, and the decision is kept, the latest `THEME_DECISIONS_KEPT`. Pure. */
export function withDecision(state: ThemeProposals, decision: ThemeDecision): ThemeProposals {
  return { waiting: state.waiting.filter((one) => one.id !== decision.proposalId), decided: [...state.decided.filter((one) => one.proposalId !== decision.proposalId), decision].slice(-THEME_DECISIONS_KEPT) };
}

/* ---------- Over the wire ---------- */

/** One theme there is, as a program is told of it: no colors, only what it is. */
export const ThemeRow = z.object({
  id: ThemeId.describe('What a setting, a menu and a request call it.'),
  name: z.string().max(120).describe('What Settings calls it.'),
  kind: z.enum(['light', 'dark']).describe('Whether it is drawn as the light page or the dark one.'),
  base: ColorThemeId.describe('The built-in theme it is laid over: itself, for a built-in one.'),
  own: z.boolean().describe('True for a theme file of the owner’s; false for one that comes with Aubergine.'),
});
export type ThemeRow = z.infer<typeof ThemeRow>;

export const ThemeRowList = z.object({ items: z.array(ThemeRow), nextCursor: z.string().nullable() });
export type ThemeRowList = z.infer<typeof ThemeRowList>;

/** A theme as a list says it. Pure. */
export const themeRow = (theme: ThemeOf): ThemeRow => ({ id: theme.id, name: theme.name, kind: theme.kind, base: theme.base, own: theme.own });

/** Body of proposing a theme. */
export const ProposeThemeRequest = z.object({
  id: ThemeId.describe('The ID it would have: the name of its file without `.json`. Not the ID of a theme that comes with Aubergine.'),
  text: z.string().max(THEME_FILE_MAX_BYTES).describe('The theme file, as text: the same form as a file in `themes/` (docs/themes.md). It is read as it arrives; one that cannot be read is refused whole and nothing is kept.'),
  why: ThemeWhy.optional().describe('Why it is proposed, in one line, for the owner to read.'),
});
export type ProposeThemeRequest = z.infer<typeof ProposeThemeRequest>;

/** A proposal as a list says it: never the text. */
export const ThemeProposalRow = z.object({
  id: Id,
  themeId: ThemeId,
  name: z.string().max(120).describe('What the theme would be called.'),
  kind: z.enum(['light', 'dark']).nullable().describe('Light or dark; null for one that was decided.'),
  base: ColorThemeId.nullable().describe('The built-in theme it is laid over; null for one that was decided.'),
  colors: z.number().int().min(0).describe('How many of its colors are its own (0 for one that was decided).'),
  problems: z.array(z.string().max(1000)).max(500).describe('What in the file was skipped. Empty for one that was decided.'),
  why: z.string().max(THEME_WHY_MAX).describe('Why it was proposed, in the words of whoever proposed it.'),
  proposedBy: Proposer,
  state: z.enum(['waiting', 'accepted', 'declined']).describe('`waiting` for the owner; `accepted`: it is a theme file now; `declined`: it was not taken, and nothing of it is kept.'),
  at: Timestamp.describe('When it was proposed, or when it was decided.'),
});
export type ThemeProposalRow = z.infer<typeof ThemeProposalRow>;

export const ThemeProposalList = z.object({ items: z.array(ThemeProposalRow), nextCursor: z.string().nullable() });
export type ThemeProposalList = z.infer<typeof ThemeProposalList>;

/** The proposals, and what became of them, as rows: the waiting ones first, oldest first; then decisions, newest first. Pure. */
export function proposalRows(state: ThemeProposals, keep: (proposedBy: Proposer) => boolean = () => true): ThemeProposalRow[] {
  const waiting = state.waiting
    .filter((one) => keep(one.proposedBy))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((one): ThemeProposalRow => ({ id: one.id, themeId: one.themeId, name: one.theme.name, kind: one.theme.kind, base: one.theme.base, colors: Object.keys(one.theme.colors).length, problems: one.problems, why: one.why, proposedBy: one.proposedBy, state: 'waiting', at: one.at }));
  const decided = [...state.decided]
    .filter((one) => keep(one.proposedBy))
    .reverse()
    .map((one): ThemeProposalRow => ({ id: one.proposalId, themeId: one.themeId, name: one.name, kind: null, base: null, colors: 0, problems: [], why: '', proposedBy: one.proposedBy, state: one.outcome, at: one.at }));
  return [...waiting, ...decided];
}

/** Body of accepting a proposal: the digest of the text that was shown. */
export const AcceptThemeRequest = z.object({
  digest: z.string().min(1).max(200).describe('The digest of the proposal as it was shown. A proposal whose text is not that one is refused with 409.'),
});
export type AcceptThemeRequest = z.infer<typeof AcceptThemeRequest>;

/** What accepting answers: the theme as it is now a file, and the themes there are now. */
export const AcceptedTheme = z.object({
  theme: UserTheme,
  file: z.string().max(200).describe('The name of the file that was written, in `themes/`.'),
  themes: z.array(UserTheme).max(60).describe('The themes of the owner’s own there are now.'),
  problems: z.array(z.string().max(1000)).max(500).describe('What in the theme files is not read now, or skipped.'),
});
export type AcceptedTheme = z.infer<typeof AcceptedTheme>;

/** Who proposed, in words for the owner. `name` names a terminal, where one did. Pure. */
export function proposerWords(by: Proposer, sessionName: (id: string) => string | null): string {
  if (by.kind === 'session') return `the agent in “${sessionName(by.sessionId) ?? 'a terminal that is gone'}”`;
  if (by.kind === 'token') return `a program, with the token “${by.name}”`;
  return 'you';
}

/** The built-in theme a proposal is laid over, by name. Pure. */
export const baseName = (base: string): string => COLOR_THEMES.find((theme) => theme.id === base)?.name ?? base;
