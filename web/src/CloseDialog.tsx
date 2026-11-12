import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useApp } from './store';

/** Ending a session kills its shell, so it always asks first. */
export function CloseDialog() {
  const sessionId = useApp((s) => s.closing);
  const session = useApp((s) => s.canvas?.sessions.find((x) => x.id === sessionId));
  const askToClose = useApp((s) => s.askToClose);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setError(null);
    setBusy(false);
    if (sessionId) cancelButton.current?.focus();
  }, [sessionId]);

  if (!sessionId || !session) return null;

  const cancel = (): void => askToClose(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.closeSession(sessionId);
      askToClose(null);
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
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button ref={cancelButton} type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>
            End session
          </button>
        </div>
      </div>
    </div>
  );
}
