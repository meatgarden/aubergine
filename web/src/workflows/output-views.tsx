import { Checklist } from '@aubergine/shared';
import { actorWord } from './run-model';
import { registerOutputView } from './registries';

/** A checklist: its items in order, each with a box the owner can tick. A tick says who and when on hover. */
registerOutputView({
  kind: 'checklist',
  View: ({ value, ticks, onTick }) => {
    const parsed = Checklist.safeParse(value);
    if (!parsed.success) return null;
    return (
      <ul className="checklist" data-testid="checklist">
        {parsed.data.items.map((item, index) => {
          const tick = ticks.find((t) => t.item === index);
          return (
            <li key={index} className={tick ? 'is-ticked' : ''} data-testid="checklist-item" data-ticked={tick ? 'true' : 'false'}>
              <label title={tick ? `Ticked by ${actorWord(tick.by)}, ${new Date(tick.at).toLocaleString()}` : undefined}>
                <input type="checkbox" checked={tick !== undefined} disabled={!onTick} onChange={(e) => onTick?.(index, e.target.checked)} />
                <span>
                  {item.text}
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  },
});
