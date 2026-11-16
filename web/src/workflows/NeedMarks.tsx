import { useEffect, useState } from 'react';
import { matchNeed, needWords, type Inventory, type Need } from '@aubergine/shared';
import { api } from '../api';

/**
 * What an element needs, each with a mark that says whether something of
 * that name is configured for the agent it would run on. Advice: a match of
 * names, never a check that the thing works, and it never stops a run.
 */
export function NeedMarks({ needs, sessionId, isAgent }: { needs: readonly Need[]; sessionId: string | null; isAgent: boolean }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    setInventory(null);
    setAsked(false);
    if (!sessionId || !isAgent) return;
    let cancelled = false;
    void api
      .inventory(sessionId)
      .then((found) => !cancelled && setInventory(found))
      .catch(() => {})
      .finally(() => !cancelled && setAsked(true));
    return () => {
      cancelled = true;
    };
  }, [sessionId, isAgent]);

  // Where there is no agent to look at yet (a new session, a plain shell), nothing is claimed.
  const looked = sessionId !== null && isAgent && asked;
  const MARK = { found: '✓ found', 'not-found': '✗ not found', 'cannot-tell': '? cannot tell' } as const;
  return (
    <>
      {needs.map((need, index) => {
        const lookedFor = need.kind === 'mcp' || need.kind === 'command';
        const match = looked && lookedFor ? matchNeed(need, inventory) : null;
        return (
          <span key={`${need.kind} ${need.name}`} className="need" data-testid="need" data-match={match?.state ?? 'not-looked'}>
            {index > 0 ? '; ' : ''}
            {needWords(need)}
            {match && (
              <span className={`need-mark is-${match.state}`} title={match.words} data-testid="need-mark">
                {MARK[match.state]}
              </span>
            )}
          </span>
        );
      })}
      {looked && needs.some((need) => need.kind === 'mcp' || need.kind === 'command') && (
        <span className="need-note">Marks compare names with what is configured for this terminal’s agent. They do not check that anything works, and do not stop a run.</span>
      )}
    </>
  );
}
