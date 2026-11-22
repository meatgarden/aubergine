import { useEffect, useRef, useState, type ReactNode } from 'react';
import { findServer, hostOf, loadServers, storageUsable } from '../servers';
import { useApp } from '../store';
import { Button, ScreenHead } from '../ui';
import { linkServer, unlinkServer } from './linking';

/** A question over the page or the canvas: closed by its button, by Escape, or by pressing beside it. */
function Dialog({ label, testid, close, children }: { label: string; testid: string; close: () => void; children: ReactNode }) {
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
      <div className="dialog sheet link-server" role="dialog" aria-label={label} data-testid={testid}>
        {children}
      </div>
    </div>
  );
}

/**
 * Link a server…: the address of another Aubergine, a name for it here, and a code made there for this page. What is
 * typed is sent to that server alone; the code is used once and kept nowhere, the credential it is answered with is
 * kept in this browser only.
 */
export function LinkServerDialog() {
  const open = useApp((s) => s.linking);
  if (!open) return null;
  return <LinkServer close={() => useApp.getState().linkServer(false)} />;
}

function LinkServer({ close }: { close: () => void }) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const usable = storageUsable();
  const origin = location.origin;
  useEffect(() => first.current?.focus(), []);

  const go = async (): Promise<void> => {
    setBusy(true);
    setSaid(null);
    try {
      const problem = await linkServer({ address, label: label.trim() || hostFromTyped(address), code });
      if (problem !== null) setSaid(problem);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog label="Link a server" testid="link-server-dialog" close={close}>
      <ScreenHead title="Link a server" onClose={close} closeTestid="link-server-close" />
      {!usable ? (
        <p data-testid="link-server-no-storage">This browser keeps nothing for this page, so a server cannot be linked here: it would be forgotten at once.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void go();
          }}
        >
          <p>Shows the projects of another Aubergine in this page, beside this server’s. Two things are done on that other server first.</p>
          <p>
            Write this page’s address under <code>access.pages</code> in its <code>config.json</code>, and start it again:{' '}
            <code data-testid="link-server-origin">{origin}</code>
          </p>
          <p>
            Then run <code data-testid="link-server-command">aubergine device add --page {origin}</code> there, and type the code it prints below.
          </p>
          <label className="wf-field">
            <span>Address of the other Aubergine</span>
            <input className="ui-field" ref={first} value={address} placeholder="https://aubergine.example.net" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={300} onChange={(e) => setAddress(e.target.value)} data-testid="link-server-address" />
          </label>
          <label className="wf-field">
            <span>What it is called here</span>
            <input className="ui-field" value={label} placeholder={hostFromTyped(address) || 'Cloud'} maxLength={80} onChange={(e) => setLabel(e.target.value)} data-testid="link-server-label" />
          </label>
          <label className="wf-field">
            <span>Code</span>
            <input className="ui-field" value={code} autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" spellCheck={false} maxLength={20} onChange={(e) => setCode(e.target.value)} data-testid="link-server-code" />
          </label>
          {said && (
            <p className="dialog-error" role="alert" data-testid="link-server-said">
              {said}
            </p>
          )}
          <p className="ui-meta">Whoever is the owner on this computer is then the owner there too: the server’s credential is kept in this browser for this page.</p>
          <div className="dialog-actions">
            <Button kind="primary" type="submit" busy={busy} data-testid="link-server-go">
              Link
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** The host of what was typed as an address, for a name where none was given; empty where it is not one yet. */
function hostFromTyped(typed: string): string {
  try {
    return new URL(typed.trim()).host;
  } catch {
    return '';
  }
}

/** Unlink: asked first, since this browser then forgets the server and that server is asked to revoke this page's device. */
export function UnlinkServerDialog() {
  const id = useApp((s) => s.unlinking);
  const [busy, setBusy] = useState(false);
  if (id === null) return null;
  const server = findServer(loadServers(), id);
  const close = (): void => useApp.getState().askToUnlink(null);
  if (!server) return null;
  return (
    <Dialog label="Unlink a server" testid="unlink-server-dialog" close={close}>
      <ScreenHead title={`Unlink “${server.label}”`} onClose={close} closeTestid="unlink-server-close" />
      <p>
        This browser forgets the server at {hostOf(server)}, and asks it to revoke this page’s device there. Its projects, terminals and everything else stay on it as they are.
      </p>
      <div className="dialog-actions">
        <Button
          kind="danger"
          busy={busy}
          onClick={() => {
            setBusy(true);
            void unlinkServer(server.id).finally(() => setBusy(false));
          }}
          data-testid="unlink-server-go"
        >
          Unlink
        </Button>
        <Button kind="quiet" onClick={close} data-testid="unlink-server-keep">
          Keep it
        </Button>
      </div>
    </Dialog>
  );
}
