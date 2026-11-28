import { describe, expect, it } from 'vitest';
import { AppState, createInitialState } from './entities';
import { ChangeEvent, applyEvent } from './events';
import { actWords, forYou } from './for-you';
import { newId } from './ids';
import { readThemeFile } from './theme-files';
import { ProposeThemeRequest, THEME_DECISIONS_KEPT, ThemeProposal, proposalRows, proposerWords, sameProposer, withDecision, withProposal, type ThemeDecision } from './theme-proposals';

const TEXT = JSON.stringify({ name: 'Harbor', kind: 'dark', base: 'nord', colors: { accent: '#5fb3b3', bg: 'red' } });

function proposal(themeId: string, proposedBy: ThemeProposal['proposedBy'], at = new Date().toISOString()): ThemeProposal {
  const reading = readThemeFile(themeId, TEXT);
  if ('problem' in reading) throw new Error(reading.problem);
  return ThemeProposal.parse({ id: newId(), themeId, theme: reading.theme, text: TEXT, digest: 'sha256:x', problems: reading.problems, why: 'For the night', proposedBy, at });
}
const decision = (p: ThemeProposal, outcome: 'accepted' | 'declined'): ThemeDecision => ({ proposalId: p.id, themeId: p.themeId, name: p.theme.name, proposedBy: p.proposedBy, outcome, at: new Date().toISOString(), by: { kind: 'owner', sessionId: null } });

const terminal = { kind: 'session', sessionId: newId() } as const;
const program = { kind: 'token', tokenId: newId(), name: 'designer' } as const;

describe('proposed themes', () => {
  it('are none in a fresh state and in a state written before them', () => {
    expect(createInitialState().themeProposals).toEqual({ waiting: [], decided: [] });
    const { themeProposals: _gone, ...older } = createInitialState();
    expect(AppState.parse(older).themeProposals).toEqual({ waiting: [], decided: [] });
  });

  it('keep one per proposer and theme ID: a newer one takes the place of the older, and another proposer\'s stays', () => {
    const first = proposal('harbor', terminal);
    const other = proposal('harbor', program);
    const newer = proposal('harbor', terminal);
    const state = withProposal(withProposal(withProposal({ waiting: [], decided: [] }, first), other), newer);
    expect(state.waiting.map((one) => one.id)).toEqual([other.id, newer.id]);
    expect(sameProposer(terminal, { kind: 'session', sessionId: terminal.sessionId })).toBe(true);
    expect(sameProposer(terminal, program)).toBe(false);
    expect(sameProposer({ kind: 'person' }, { kind: 'person' })).toBe(true);
  });

  it('leave when decided, and only the latest decisions are kept', () => {
    let state = { waiting: [] as ThemeProposal[], decided: [] as ThemeDecision[] };
    const kept = proposal('kept', terminal);
    state = withProposal(state, kept);
    for (let i = 0; i < THEME_DECISIONS_KEPT + 5; i += 1) {
      const one = proposal(`t${i}`, program);
      state = withDecision(withProposal(state, one), decision(one, i % 2 === 0 ? 'accepted' : 'declined'));
    }
    expect(state.waiting.map((one) => one.id)).toEqual([kept.id]);
    expect(state.decided).toHaveLength(THEME_DECISIONS_KEPT);
    expect(state.decided.at(-1)?.themeId).toBe(`t${THEME_DECISIONS_KEPT + 4}`);
  });

  it('are changed by the reducer through their two events', () => {
    const one = proposal('harbor', terminal);
    let state = applyEvent(createInitialState(), ChangeEvent.parse({ type: 'theme.proposed', proposal: one }));
    expect(state.themeProposals.waiting).toHaveLength(1);
    state = applyEvent(state, ChangeEvent.parse({ type: 'theme.decided', decision: decision(one, 'declined') }));
    expect(state.themeProposals.waiting).toEqual([]);
    expect(state.themeProposals.decided.map((d) => [d.proposalId, d.outcome])).toEqual([[one.id, 'declined']]);
  });

  it('are listed as rows that never hold the text: waiting first, then decisions newest first, and a proposer\'s own alone', () => {
    const mine = proposal('mine', terminal, '2026-01-01T00:00:00.000Z');
    const theirs = proposal('theirs', program, '2026-01-02T00:00:00.000Z');
    const gone = proposal('gone', terminal);
    const state = withDecision(withProposal(withProposal(withProposal({ waiting: [], decided: [] }, mine), theirs), gone), decision(gone, 'accepted'));
    const rows = proposalRows(state);
    expect(rows.map((row) => [row.themeId, row.state])).toEqual([
      ['mine', 'waiting'],
      ['theirs', 'waiting'],
      ['gone', 'accepted'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('#5fb3b3');
    expect(rows[0]).toMatchObject({ name: 'Harbor', kind: 'dark', base: 'nord', colors: 1, why: 'For the night' });
    expect(rows[0]?.problems).toEqual(['themes/mine.json, colors: "bg" is not a color written as #rrggbb. It is skipped.']);
    expect(proposalRows(state, (by) => sameProposer(by, terminal)).map((row) => row.themeId)).toEqual(['mine', 'gone']);
  });

  it('take a why of one plain line, and an ID of a theme', () => {
    expect(ProposeThemeRequest.safeParse({ id: 'harbor', text: TEXT, why: '  easier at night ' }).data?.why).toBe('easier at night');
    for (const why of ['two\nlines', 'a \u001b[31m red', 'turned ‮ round', 'x'.repeat(301)]) expect(ProposeThemeRequest.safeParse({ id: 'harbor', text: TEXT, why }).success, why).toBe(false);
    for (const id of ['Harbor', '../x', '', 'a'.repeat(41)]) expect(ProposeThemeRequest.safeParse({ id, text: TEXT }).success, id).toBe(false);
    expect(ProposeThemeRequest.safeParse({ id: 'big', text: 'x'.repeat(64 * 1024 + 1) }).success).toBe(false);
  });

  it('wait on the owner\'s list, each as a theme to read that opens its review', () => {
    const one = proposal('harbor', program);
    const state = applyEvent(createInitialState(), { type: 'theme.proposed', proposal: one });
    const items = forYou(state, Date.now()).items.filter((item) => item.kind === 'theme');
    expect(items).toEqual([expect.objectContaining({ id: `theme:${one.id}`, title: 'Theme to read', action: 'Read', tone: 'neutral', who: 'The token “designer”', what: 'A color theme: Harbor', act: `review:theme-proposals:${one.id}`, projectId: null, waits: false })]);
    expect(actWords(items[0] as never)).toBe('in the browser: Review');
    expect(forYou(applyEvent(state, { type: 'theme.decided', decision: decision(one, 'accepted') }), Date.now()).items.filter((item) => item.kind === 'theme')).toEqual([]);
  });

  it('say who proposed in words', () => {
    expect(proposerWords(terminal, () => 'api server')).toBe('the agent in “api server”');
    expect(proposerWords(terminal, () => null)).toBe('the agent in “a terminal that is gone”');
    expect(proposerWords(program, () => null)).toBe('a program, with the token “designer”');
  });
});
