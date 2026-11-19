import { z } from 'zod';
import { LinkKind, LinkLabel, LinkUrl, SessionLink, Found } from './links';

/** Bodies and answers of the routes about what a terminal says about itself. */

export const AddLinkRequest = z.object({
  url: LinkUrl,
  label: LinkLabel.optional().describe('A few plain words for it. Left out: told from the address.'),
  kind: LinkKind.optional().describe('What it is. Left out: told from the address.'),
});
export type AddLinkRequest = z.infer<typeof AddLinkRequest>;

export const ChangeLinkRequest = z.object({
  label: LinkLabel.optional().describe('Its new label. Left out: as it was.'),
  kind: LinkKind.optional().describe('Its new kind. Left out: as it was.'),
});
export type ChangeLinkRequest = z.infer<typeof ChangeLinkRequest>;

export const LinkAnswer = z.object({
  link: SessionLink,
  kept: z.boolean().describe('False where the owner had set this link in their own words: what was sent is kept beside it as a suggestion, and the link is as it was.'),
});
export type LinkAnswer = z.infer<typeof LinkAnswer>;

export const LinksAnswer = z.object({ links: z.array(SessionLink).describe('The links of the terminal, in the order they are drawn.') });
export type LinksAnswer = z.infer<typeof LinksAnswer>;

export const SeenLink = z.object({ url: LinkUrl, kind: LinkKind, label: LinkLabel });
export type SeenLink = z.infer<typeof SeenLink>;
export const SeenLinksAnswer = z.object({ seen: z.array(SeenLink).describe('Addresses seen in what the terminal showed and not kept as links: the last twenty, newest last. Held in memory only.') });
export type SeenLinksAnswer = z.infer<typeof SeenLinksAnswer>;

export const KeepSeenRequest = z.object({ url: LinkUrl.describe('An address from the list of those seen in this terminal.') });
export type KeepSeenRequest = z.infer<typeof KeepSeenRequest>;

/** What a session says about itself. A field left out is left as it was. */
export const DescribeRequest = z.object({
  name: z.string().trim().min(1).max(80).optional().describe('A name for the terminal, after the work.'),
  summary: z.string().max(20_000).optional().describe('What is being done here, in a few lines. It replaces the summary of the note.'),
});
export type DescribeRequest = z.infer<typeof DescribeRequest>;

export const DescribedAnswer = z.object({
  name: z.string().describe('The name the terminal has now.'),
  summary: z.string().describe('The summary it has now.'),
  kept: z.object({ name: z.boolean(), summary: z.boolean() }).describe('For each that was sent: whether it was put in place. False where the owner wrote their own: what was sent is kept as a suggestion.'),
  missing: z.array(z.enum(['name', 'summary'])).describe('What is still missing from the terminal\u2019s description of itself.'),
});
export type DescribedAnswer = z.infer<typeof DescribedAnswer>;

/** A moment in an agent's work that its hooks report: it began, it is about to stop, or it ran a command. */
export const DescribeCheckRequest = z.object({
  event: z.enum(['start', 'stop', 'tool']),
  again: z.boolean().optional().describe('For `stop`: the agent is stopping after having been told once already in this turn.'),
});
export type DescribeCheckRequest = z.infer<typeof DescribeCheckRequest>;

export const DescribeCheckAnswer = z.object({
  say: z.string().nullable().describe('What the agent is to be told, or null for nothing. Fixed sentences: nothing stored is in them.'),
  hold: z.boolean().describe('For `stop`: whether the agent is asked to go on for one more turn and set what is missing. Never twice in a turn.'),
});
export type DescribeCheckAnswer = z.infer<typeof DescribeCheckAnswer>;

export const UseSuggestionRequest = z.object({
  what: z.enum(['name', 'summary', 'link']),
  linkId: z.string().max(64).optional().describe('For `link`: which one.'),
});
export type UseSuggestionRequest = z.infer<typeof UseSuggestionRequest>;

export const FoundAnswer = z.object({ found: Found.nullable().describe('What was found about the terminal\u2019s folder, or null where nothing is known.') });
export type FoundAnswer = z.infer<typeof FoundAnswer>;

export const DescribingSettings = z.object({ remind: z.boolean().describe('Whether agents are reminded to describe their terminal.') });
export type DescribingSettings = z.infer<typeof DescribingSettings>;
