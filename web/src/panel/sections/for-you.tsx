import { useMemo } from 'react';
import { forYou } from '@aubergine/shared';
import { runCommand } from '../../commands';
import { goTo } from '../../queue/QueueScreen';
import { useApp } from '../../store';
import { useEndedRuns } from '../../workflows/ended-runs';
import { registerSection } from '../registry';

const SHOWN = 4;

/** The first few things that wait on the owner, with the way to all of them. */
function ForYouSection() {
  const app = useApp((s) => s.app);
  const ended = useEndedRuns((e) => e.items);
  const list = useMemo(() => (app ? forYou(app, Date.now(), ended) : null), [app, ended]);
  const items = list?.items ?? [];
  return (
    <div className="runs-section" data-testid="foryou-section">
      {items.length === 0 ? (
        <p className="list-empty">Nothing waits for you.</p>
      ) : (
        <ul className="runs-list">
          {items.slice(0, SHOWN).map((item) => (
            <li key={item.id}>
              <button type="button" className="runs-row" title={`${item.title}, from ${item.from}`} onClick={() => goTo(item.act)} data-testid="foryou-section-row" data-kind={item.kind}>
                <span className="runs-name">{item.title}</span>
                <span className="runs-where">{item.sentence}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="runs-foot">
        <button type="button" className="quiet" onClick={() => runCommand('queue.open')} data-testid="open-queue">
          {items.length > SHOWN ? `All ${items.length}, and the queue…` : 'For you, and the queue…'}
        </button>
      </div>
    </div>
  );
}

registerSection({
  id: 'for-you',
  title: 'For you',
  order: 15,
  icon: '☑',
  useCount: () => {
    const app = useApp((s) => s.app);
    const ended = useEndedRuns((e) => e.items);
    return (app ? forYou(app, Date.now(), ended).items.length : 0) || null;
  },
  Component: ForYouSection,
});
