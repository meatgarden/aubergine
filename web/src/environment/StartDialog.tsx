import { DesktopBox } from '../desktop';
import { useState } from 'react';
import { canvasActions } from '../canvas-actions';
import { useApp } from '../store';
import { WhereFields, proposedFolder, type Where } from './WhereFields';

/** A new terminal where the owner says: in a folder of their choosing, there or in a working copy of its own, as a plain shell or with an agent. */
export function StartDialog() {
  const open = useApp((s) => s.startingTerminal);
  // Mounted when it opens, so that what it proposes is there from the first drawing and never replaces what was typed since.
  return open ? <StartFields /> : null;
}

function StartFields() {
  const choose = useApp((s) => s.chooseStart);
  const [where, setWhere] = useState<Where>(() => ({ folder: proposedFolder(), kind: null }));
  const [name, setName] = useState('');
  const [agent, setAgent] = useState(false);
  // Ticked or not by the setting; changed here, it is for this one terminal.
  const [desktop, setDesktop] = useState(() => useApp.getState().settings.desktop.openNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = (): void => choose(false);
  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const folder = where.folder.trim();
    const made = await canvasActions.get()?.addTerminal(agent ? 'claude-code' : undefined, undefined, undefined, { ...(folder ? { cwd: folder } : {}), ...(where.kind ? { environment: where.kind } : {}), ...(name.trim() ? { name: name.trim() } : {}), desktop });
    if (made) choose(false);
    else {
      // Why it did not start is in the notice the canvas shows; it is said here too, where the eyes are.
      setError(useApp.getState().notice ?? 'The terminal could not be started.');
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
      <div className="dialog agent-tools" role="dialog" data-part="dialog" aria-modal="true" aria-labelledby="start-title" data-testid="start-dialog">
        <h2 id="start-title">New terminal</h2>
        <label className="wf-field">
          <span>Name (optional)</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus data-testid="start-name" />
        </label>
        <WhereFields where={where} onChange={setWhere} />
        <label className="wf-inline">
          <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} data-testid="start-agent" />
          <span>Start Claude Code in it</span>
        </label>
        <DesktopBox checked={desktop} onChange={setDesktop} />
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={cancel}>
            Cancel
          </button>
          <button type="button" onClick={() => void start()} disabled={busy} data-testid="start-go">
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
