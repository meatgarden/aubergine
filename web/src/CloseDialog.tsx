import { useEffect, useRef, useState } from 'react';
import type { Ending } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/** Ending a session kills its shell, so it always asks first. */
export function CloseDialog() {
  const sessionId = useApp((s) => s.closing);
  const session = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId));
  const askToClose = useApp((s) => s.askToClose);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** What was prepared for this session to work in, if anything, and what the owner wants done with it. */
  const environment = useApp((s) => s.app?.environments.find((e) => e.sessionId === sessionId));
  const [endings, setEndings] = useState<Ending[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setError(null);
    setBusy(false);
    if (sessionId) cancelButton.current?.focus();
    setEndings([]);
    setChoice(null);
    setSure(false);
    if (!sessionId || !environment) return;
    let cancelled = false;
    void api.environmentEndings(environment.id).then(
      (found) => !cancelled && setEndings(found.endings as Ending[]),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, environment?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- asked once when the dialog opens

  if (!sessionId || !session) return null;

  const cancel = (): void => askToClose(null);
  const chosen = endings.find((ending) => ending.choice === choice) ?? null;
  // A choice that would lose work that exists nowhere else needs a second yes.
  const held = chosen !== null && chosen.asksAgain !== null && !sure;
  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.closeSession(sessionId);
      askToClose(null);
      // The session is ended. What becomes of its working copy is a second step, and only what the owner chose here.
      if (environment && chosen) {
        try {
          await api.endEnvironment(environment.id, chosen.choice, chosen.asksAgain !== null);
        } catch (e) {
          // Still there, then: its panel says what can be done.
          useApp.getState().setNotice(`The terminal is ended. Its working copy is as it was: ${(e as Error).message}`);
          useApp.getState().viewEnvironment(environment.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
      }}
    >
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-title">
        <h2 id="close-title">End “{session.name}”?</h2>
        <p>This ends the shell and anything still running in it. It cannot be undone.</p>
        {environment && (
          <fieldset className="token-scopes close-copy" data-testid="close-copy">
            <legend>Its working copy</legend>
            <p className="sheet-note">
              {environment.title}
              {environment.branch ? `, on the branch ${environment.branch}` : ''}. Ending the terminal removes nothing of it.
            </p>
            <label>
              <input type="radio" name="close-copy" checked={choice === null} onChange={() => setChoice(null)} data-testid="close-copy-later" />
              <span>Decide later. It stays in the list of working copies.</span>
            </label>
            {endings.map((ending) => (
              <label key={ending.choice} className={ending.available ? undefined : 'is-unavailable'}>
                <input
                  type="radio"
                  name="close-copy"
                  checked={choice === ending.choice}
                  disabled={!ending.available}
                  onChange={() => {
                    setChoice(ending.choice);
                    setSure(false);
                  }}
                  data-testid="close-copy-choice"
                  data-choice={ending.choice}
                />
                <span>
                  <strong>{ending.label}.</strong> {ending.available ? ending.says : ending.reason}
                </span>
              </label>
            ))}
            {chosen?.asksAgain && (
              <label className="close-copy-again" data-testid="close-copy-again">
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="close-copy-sure" />
                <span>{chosen.asksAgain} Yes.</span>
              </label>
            )}
          </fieldset>
        )}
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button ref={cancelButton} type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="danger" disabled={busy || held} onClick={() => void confirm()} data-testid="close-confirm">
            End session
          </button>
        </div>
      </div>
    </div>
  );
}
