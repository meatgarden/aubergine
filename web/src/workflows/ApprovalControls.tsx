import { useState } from 'react';
import { RUN_COMMENT_MAX, type Run } from '@aubergine/shared';
import { decideRun } from './actions';

/**
 * The two things a person can do with a run that waits for them: approve it,
 * or send it back to an earlier element with a comment. The run view and the
 * board both show this; neither decides anything itself.
 */
export function ApprovalControls({ run, elements, compact = false }: { run: Run; elements: readonly { id: string; name: string }[]; compact?: boolean }) {
  const [sending, setSending] = useState(false);
  const [comment, setComment] = useState('');
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const at = elements.findIndex((e) => e.id === run.currentElementId);
  const earlier = at > 0 ? elements.slice(0, at) : [];
  const target = to ?? earlier.at(-1)?.id ?? null;
  // One line of plain text: what a comment may be.
  const clean = comment.replace(/\s+/g, ' ').trim();
  const act = async (decision: Parameters<typeof decideRun>[1]): Promise<void> => {
    setBusy(true);
    const done = await decideRun(run.id, decision);
    setBusy(false);
    if (done) {
      setSending(false);
      setComment('');
    }
  };
  if (run.status !== 'awaiting' || run.currentElementId === null) return null;
  const elementId = run.currentElementId;

  return (
    <div className={`approval-controls${compact ? ' is-compact' : ''}`} data-testid="approval-controls" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {(!compact || sending) && (
        <input
          value={comment}
          maxLength={RUN_COMMENT_MAX}
          placeholder={sending ? 'What should change? The agent is told this.' : 'A comment for whoever does the next step (optional)'}
          aria-label="Comment"
          onChange={(e) => setComment(e.target.value)}
          data-testid="approval-comment"
        />
      )}
      {sending ? (
        <>
          <label className="wf-inline">
            <span>Back to</span>
            <select value={target ?? ''} onChange={(e) => setTo(e.target.value)} data-testid="send-back-to">
              {earlier.map((element, index) => (
                <option key={element.id} value={element.id}>
                  {index + 1}. {element.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || clean === '' || target === null} onClick={() => target && void act({ sendBack: { elementId: target, comment: clean } })} data-testid="send-back-confirm">
            Send back
          </button>
          <button type="button" className="quiet" onClick={() => setSending(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={busy} onClick={() => void act({ approve: { elementId, ...(clean ? { comment: clean } : {}) } })} data-testid="approve">
            Approve
          </button>
          <button type="button" className="quiet" disabled={busy || earlier.length === 0} title={earlier.length === 0 ? 'There is no earlier step to send it back to' : 'Send it back to an earlier step, with a comment the agent is told'} onClick={() => setSending(true)} data-testid="send-back">
            Send back…
          </button>
        </>
      )}
    </div>
  );
}
