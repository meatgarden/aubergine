import { useApp } from '../store';
import { useEndedRuns } from './ended-runs';
import { handedInBy, handedInWords } from './run-model';

/**
 * A small mark on a terminal whose agent handed in a list: how many of its
 * items are ticked, and a click that opens it. For the run the terminal is
 * on, or one of its runs that ended lately. Nothing when there is no list.
 */
export function ListMark({ sessionId, variant }: { sessionId: string; variant: 'node' | 'row' }) {
  const ended = useEndedRuns((e) => e.items);
  // Taken from the state as one piece of text, so that a change that does not concern this list redraws nothing.
  const key = useApp((s) => {
    const found = s.app ? handedInBy(s.app, sessionId, ended) : null;
    return found ? `${found.runId} ${found.ticked} ${found.total}` : '';
  });
  if (key === '') return null;
  const [runId, ticked, total] = key.split(' ') as [string, string, string];
  const list = { runId, elementId: '', ticked: Number(ticked), total: Number(total) };
  return (
    <button
      type="button"
      className={`list-mark nodrag is-${variant}`}
      title="A list this terminal's agent handed in. Click to open it and tick what is done."
      data-testid={variant === 'node' ? 'list-mark' : 'row-list-mark'}
      data-key={key}
      data-ticked={list.ticked}
      data-total={list.total}
      onClick={(event) => {
        event.stopPropagation();
        useApp.getState().viewRun(list.runId);
      }}
    >
      ☑ {handedInWords(list)}
    </button>
  );
}
