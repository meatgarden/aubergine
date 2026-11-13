import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutsideTerminal } from '@aubergine/shared';
import { api } from './api';
import { shortFolder } from './search';
import { useApp } from './store';

type RowState = { busy: boolean; message: string | null; error: string | null; confirming: boolean };
const idleRow: RowState = { busy: false, message: null, error: null, confirming: false };

function describe(terminal: OutsideTerminal): string {
  switch (terminal.kind) {
    case 'shell':
      return 'at its prompt';
    case 'command':
      return terminal.running ?? 'running a command';
    case 'view':
      return 'already a view of a canvas session';
    case 'agent': {
      const state = terminal.agent?.status ?? 'state unknown';
      const name = terminal.agent?.known ? (terminal.agent.name ?? 'unnamed conversation') : 'conversation not readable';
      return `Claude Code · ${state} · ${name}`;
    }
  }
}

/** Why "Stop and resume here" is not offered right now, or null when it is. */
function stopBlocked(terminal: OutsideTerminal): string | null {
  if (!terminal.agent?.known) return 'Its conversation could not be read, so it cannot be stopped and resumed safely. Fork it instead.';
  if (terminal.agent.status !== 'idle') return `The agent is ${terminal.agent.status ?? 'in an unknown state'}. Wait until it has finished its turn.`;
  return null;
}

/**
 * Terminals the user has open outside the canvas, each with its own action,
 * so they are brought over one at a time. Nothing is looked up while the
 * panel is closed.
 */
export function OutsidePanel({ onGo }: { onGo: (nodeId: string, sessionId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [terminals, setTerminals] = useState<OutsideTerminal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      setTerminals((await api.getOutside()).terminals);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Look once when the page opens (for the count) and each time the panel opens. No polling.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const patch = (tty: string, change: Partial<RowState>): void =>
    setRows((current) => ({ ...current, [tty]: { ...(current[tty] ?? idleRow), ...change } }));

  const act = async (terminal: OutsideTerminal, action: 'add' | 'fork' | 'stop'): Promise<void> => {
    patch(terminal.tty, { busy: true, error: null, confirming: false });
    try {
      const result =
        action === 'add'
          ? await api.outsideAdd({ tty: terminal.tty, pid: terminal.pid })
          : await api.outsideMove({ tty: terminal.tty, pid: terminal.runningPid ?? 0, mode: action });
      patch(terminal.tty, { busy: false, message: result.message });
      if (result.session && result.node) {
        useApp.getState().apply({ type: 'session.created', session: result.session, node: result.node });
        onGo(result.node.id, result.session.id);
      }
      void refresh();
    } catch (e) {
      patch(terminal.tty, { busy: false, error: (e as Error).message });
    }
  };

  const actionable = (terminals ?? []).filter((t) => t.kind !== 'view');

  return (
    <div className="outside" ref={root}>
      <button
        type="button"
        className="quiet"
        aria-expanded={open}
        title="Terminals you have open outside the canvas"
        onClick={() => {
          if (!open) void refresh();
          setOpen((v) => !v);
        }}
      >
        Outside terminals{terminals ? ` (${actionable.length})` : ''}
      </button>
      {open && (
        <div className="outside-panel nowheel" role="dialog" aria-label="Outside terminals" data-testid="outside-panel">
          <header>
            <span>Terminals open outside the canvas</span>
            <button type="button" className="quiet" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Looking…' : 'Refresh'}
            </button>
          </header>
          <p className="outside-note">
            A program that is already running cannot be moved. What can be done is shown per terminal; the original tab
            is never changed unless you choose “Stop and resume here”.
          </p>
          {failure && <p className="dialog-error">{failure}</p>}
          {terminals && terminals.length === 0 && <p className="outside-note">None found.</p>}
          {(terminals ?? []).map((terminal) => {
            const row = rows[terminal.tty] ?? idleRow;
            const blocked = terminal.kind === 'agent' ? stopBlocked(terminal) : null;
            return (
              <div className="outside-row" key={terminal.tty} data-testid="outside-row" data-tty={terminal.tty}>
                <div className="outside-info">
                  <div>
                    <strong>{terminal.tty}</strong> <span title={terminal.cwd ?? undefined}>{shortFolder(terminal.cwd) || '(folder unknown)'}</span>
                  </div>
                  <div className="outside-detail">{describe(terminal)}</div>
                  {terminal.kind === 'command' && !row.message && (
                    <div className="outside-detail">The running command itself cannot be moved; this adds a shell in the same folder.</div>
                  )}
                  {row.message && <div className="outside-message">{row.message}</div>}
                  {row.error && <div className="dialog-error">{row.error}</div>}
                  {terminal.kind === 'agent' && blocked && <div className="outside-detail">{blocked}</div>}
                </div>
                <div className="outside-actions">
                  {(terminal.kind === 'shell' || terminal.kind === 'command') && (
                    <button type="button" disabled={row.busy} onClick={() => void act(terminal, 'add')}>
                      Add to canvas
                    </button>
                  )}
                  {terminal.kind === 'agent' && !row.confirming && (
                    <>
                      <button type="button" disabled={row.busy} onClick={() => void act(terminal, 'fork')}>
                        Fork to canvas
                      </button>
                      <button
                        type="button"
                        disabled={row.busy || blocked !== null}
                        title={blocked ?? 'Ask the agent in that tab to exit, then carry on the same conversation here'}
                        onClick={() => patch(terminal.tty, { confirming: true })}
                      >
                        Stop and resume here
                      </button>
                    </>
                  )}
                  {terminal.kind === 'agent' && row.confirming && (
                    <>
                      <span className="outside-detail">Ask the agent in {terminal.tty} to exit?</span>
                      <button type="button" className="danger" onClick={() => void act(terminal, 'stop')}>
                        Yes, stop it
                      </button>
                      <button type="button" onClick={() => patch(terminal.tty, { confirming: false })}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
