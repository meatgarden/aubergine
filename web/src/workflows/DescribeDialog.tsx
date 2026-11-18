import { useEffect, useState } from 'react';
import { BRIEF_LINE } from '@aubergine/shared';
import { api } from '../api';
import { canvasActions } from '../canvas-actions';
import { useApp } from '../store';
import { ScreenHead } from '../ui';

const NEW_AGENT = 'new';

/**
 * "Describe an element…" and "Describe a workflow…": say what is wanted, pick
 * a terminal with an agent, send. The agent is typed one fixed sentence; it
 * reads the description with a command, and what it writes comes back as a
 * draft to review.
 */
export function DescribeDialog() {
  const kind = useApp((s) => s.describing);
  const sessions = useApp((s) => s.app?.sessions);
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState<string>(NEW_AGENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Terminals where an agent is known: the ones that can be asked.
  const withAgent = (sessions ?? []).filter((s) => s.state !== 'exited' && s.agent !== null);
  useEffect(() => {
    if (!kind) return;
    setDescription('');
    setError(null);
    setSent(null);
    setBusy(false);
    const state = useApp.getState();
    const preferred = state.focus?.sessionId ?? state.selected;
    setTarget(withAgent.find((s) => s.id === preferred)?.id ?? withAgent[0]?.id ?? NEW_AGENT);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps -- set once, when the dialog opens

  if (!kind) return null;
  const close = (): void => useApp.getState().describe(null);
  const word = kind === 'element' ? 'a step' : 'a workflow';

  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let sessionId = target;
      let tell = true;
      if (target === NEW_AGENT) {
        // A new agent session is given the fixed sentence as its first prompt; nothing needs typing afterwards.
        const made = await canvasActions.get()?.addTerminal('claude-code', [BRIEF_LINE]);
        if (!made) throw new Error('The terminal could not be started.');
        sessionId = made;
        tell = false;
      }
      const asked = await api.requestDraft({ kind, description: description.trim(), sessionId, tell });
      useApp.getState().apply({ type: 'draft.changed', draft: asked.draft as never });
      setSent(
        target === NEW_AGENT || asked.told
          ? 'Sent. What the agent writes will be in Review, for you to read before it can be used.'
          : `No agent is running in that terminal just now, so nothing was typed. Start one and give it this line: ${asked.line}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="dialog sheet describe-dialog" role="dialog" aria-label={`Describe ${word}`} data-testid="describe-dialog">
        <ScreenHead title={<>Describe {word}</>} onClose={close} />
        <p className="sheet-note">
          Say what you want, and an agent writes it. What it writes is a draft: you read it, exactly as an agent would be told it, before it can be used.
        </p>
        <label className="wf-field">
          <span>What do you want?</span>
          <textarea
            rows={5}
            autoFocus
            value={description}
            maxLength={4000}
            placeholder={kind === 'element' ? 'For example: give me a to-do list from what people asked me in the team chat.' : 'For example: a workflow for upgrading one dependency: read the changelog, upgrade, run the tests, summarise.'}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="describe-text"
          />
        </label>
        <label className="wf-field">
          <span>Who writes it</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="describe-target">
            {withAgent.map((s) => (
              <option key={s.id} value={s.id}>
                The agent in “{s.name}”
              </option>
            ))}
            <option value={NEW_AGENT}>A new Claude Code session</option>
          </select>
        </label>
        <p className="sheet-note">Your description is not typed into the terminal. The agent is told to run a command, and reads it there.</p>
        {error && <p className="dialog-error">{error}</p>}
        {sent && (
          <p className="sheet-note" data-testid="describe-sent">
            {sent}
          </p>
        )}
        <div className="dialog-actions">
          {sent ? (
            <>
              <button type="button" className="quiet" onClick={() => useApp.getState().togglePanel('review')}>
                Open Review
              </button>
              <button type="button" onClick={close}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={close}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={busy || description.trim() === ''} onClick={() => void send()} data-testid="describe-send">
                Send
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
