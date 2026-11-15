import { useEffect, useState } from 'react';
import { sortedCanvases } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * Closing a canvas that still has terminals: they are never ended with it.
 * The user chooses between moving them to another canvas and parking them.
 */
export function CloseCanvasDialog() {
  const canvasId = useApp((s) => s.closingCanvas);
  const app = useApp((s) => s.app);
  const askToCloseCanvas = useApp((s) => s.askToCloseCanvas);
  const canvas = app?.canvases.find((c) => c.id === canvasId);
  const others = app ? sortedCanvases(app).filter((c) => c.id !== canvasId) : [];
  const [choice, setChoice] = useState<'move' | 'park'>('move');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChoice('move');
    setTarget('');
    setError(null);
    setBusy(false);
  }, [canvasId]);

  if (!canvasId || !canvas) return null;
  const to = target || others[0]?.id || '';
  const count = canvas.layout.nodes.length;

  const cancel = (): void => askToCloseCanvas(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.closeCanvas(canvasId, choice === 'move' ? to : null);
      askToCloseCanvas(null);
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
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-canvas-title">
        <h2 id="close-canvas-title">Close “{canvas.name}”?</h2>
        <p>
          It has {count} terminal{count === 1 ? '' : 's'}. Closing a canvas never ends a shell: say what should happen to{' '}
          {count === 1 ? 'it' : 'them'}.
        </p>
        <label className="dialog-choice">
          <input type="radio" name="close-canvas" checked={choice === 'move'} onChange={() => setChoice('move')} />
          <span>Move to</span>
          <select aria-label="Canvas to move to" value={to} onChange={(e) => setTarget(e.target.value)} onFocus={() => setChoice('move')}>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-choice">
          <input type="radio" name="close-canvas" checked={choice === 'park'} onChange={() => setChoice('park')} />
          <span>Park {count === 1 ? 'it' : 'them'}: off every canvas, still running, in the Parked list</span>
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" disabled={busy || (choice === 'move' && !to)} onClick={() => void confirm()}>
            Close canvas
          </button>
        </div>
      </div>
    </div>
  );
}
