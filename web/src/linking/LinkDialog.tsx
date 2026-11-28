import { useEffect, useRef, useState, type ReactNode } from 'react';
import { findServer, hostOf, loadServers, storageUsable } from '../servers';
import { useApp } from '../store';
import { Button, Row, ScreenHead, SectionTitle } from '../ui';
import { checkDirectory, directoryHost, directoryRows, fetchDirectory, loadDirectories, removeDirectory, saveDirectories, type DirectoryKnown, type KeptDirectory } from './directories';
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
  const codeField = useRef<HTMLInputElement>(null);
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
        <>
          <Directories
            pick={(server) => {
              setAddress(server.address);
              setLabel(server.label);
              setSaid(null);
              codeField.current?.focus();
            }}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void go();
            }}
          >
            <p>Shows the projects of another Aubergine in this page, beside this server’s. Two things are done on that other server first.</p>
            <p>
              Write this page’s address under <code>access.pages</code> in its <code>config.json</code>, and start it again: <code data-testid="link-server-origin">{origin}</code>
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
              <input className="ui-field" ref={codeField} value={code} autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" spellCheck={false} maxLength={20} onChange={(e) => setCode(e.target.value)} data-testid="link-server-code" />
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
        </>
      )}
    </Dialog>
  );
}

/**
 * The directories of this browser, over the fields: each a list of servers by organization, read when the dialog
 * opens and when one is added, and held only while the dialog is open. Pressing a server writes its address and its
 * name into the fields and nothing more: it is linked, as any server is, with a code made there.
 */
function Directories({ pick }: { pick: (server: { address: string; label: string }) => void }) {
  const [kept, setKept] = useState<KeptDirectory[]>(loadDirectories);
  const [known, setKnown] = useState<Record<string, DirectoryKnown>>({});
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const alive = useRef(true);
  const servers = loadServers();

  const read = (address: string): void => {
    setKnown((now) => ({ ...now, [address]: { state: 'reading' } }));
    void fetchDirectory(address).then((answer) => {
      if (alive.current) setKnown((now) => ({ ...now, [address]: answer }));
    });
  };
  useEffect(() => {
    alive.current = true;
    for (const directory of loadDirectories()) read(directory.address);
    return () => {
      alive.current = false;
    };
  }, []);

  const add = async (): Promise<void> => {
    const checked = checkDirectory(typed, kept);
    if (!checked.ok) return setSaid(checked.problem);
    setBusy(true);
    setSaid(null);
    // Read first: an address that gives no directory is not kept.
    const answer = await fetchDirectory(checked.address);
    if (!alive.current) return;
    setBusy(false);
    if (answer.state !== 'read') return setSaid(answer.state === 'failed' ? answer.words : null);
    const next = [...loadDirectories().filter((d) => d.address !== checked.address), { address: checked.address, addedAt: new Date().toISOString() }];
    if (!saveDirectories(next)) return setSaid('This browser could not keep the directory.');
    setKept(next);
    setKnown((now) => ({ ...now, [checked.address]: answer }));
    setTyped('');
    setAdding(false);
  };

  const remove = (address: string): void => {
    const next = removeDirectory(loadDirectories(), address);
    saveDirectories(next);
    setKept(next);
  };

  return (
    <section className="link-directories" aria-label="Directories" data-testid="link-directories">
      {kept.map((directory) => {
        const state = known[directory.address] ?? { state: 'reading' };
        const host = directoryHost(directory.address);
        return (
          <div key={directory.address} className="link-directory" data-testid="link-directory">
            <div className="link-directory-head">
              <SectionTitle>{state.state === 'read' ? state.directory.name : host}</SectionTitle>
              <span className="ui-meta">{state.state === 'read' ? `a directory at ${host}` : state.state === 'reading' ? 'Reading…' : 'a directory'}</span>
              {state.state === 'failed' && (
                <Button kind="quiet" onClick={() => read(directory.address)} data-testid="link-directory-again">
                  Read again
                </Button>
              )}
              <Button kind="quiet" onClick={() => remove(directory.address)} data-testid="link-directory-remove">
                Remove
              </Button>
            </div>
            {state.state === 'failed' && (
              <p className="dialog-error" role="alert" data-testid="link-directory-failed">
                {state.words}
              </p>
            )}
            {state.state === 'read' && state.directory.servers.length === 0 && <p className="ui-meta">It lists no servers.</p>}
            {state.state === 'read' &&
              directoryRows(state.directory, servers, location.origin).map((group) => (
                <div key={group.organization ?? ''} className="link-directory-group" role="group" aria-label={group.organization ?? 'No organization'}>
                  <h4 className="ui-meta link-directory-organization">{group.organization ?? 'No organization'}</h4>
                  {group.rows.map((row) => (
                    <Row key={row.server.address} className="link-directory-row" disabled={row.own || row.linkedAs !== null} title={row.server.note ?? undefined} onClick={() => pick(row.server)} data-testid="link-directory-server">
                      <span className="link-directory-name">{row.server.label}</span>
                      <span className="ui-meta">{row.host}</span>
                      {row.own ? <span className="ui-meta link-directory-known">this server</span> : row.linkedAs !== null ? <span className="ui-meta link-directory-known">linked as “{row.linkedAs}”</span> : null}
                    </Row>
                  ))}
                </div>
              ))}
          </div>
        );
      })}
      {adding ? (
        <div className="link-directory-adding">
          <label className="wf-field">
            <span>Address of a directory file</span>
            <input
              className="ui-field"
              autoFocus
              value={typed}
              placeholder="https://example.net/aubergine-directory.json"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={500}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) {
                  e.preventDefault();
                  void add();
                }
              }}
              data-testid="link-directory-address"
            />
          </label>
          <p className="ui-meta">A directory is a list of servers that someone you trust keeps, by organization. It is asked for from this browser, and told nothing. It links nothing: each server still needs a code made there.</p>
          {said && (
            <p className="dialog-error" role="alert" data-testid="link-directory-said">
              {said}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              kind="quiet"
              onClick={() => {
                setAdding(false);
                setSaid(null);
              }}
            >
              Cancel
            </Button>
            <Button busy={busy} onClick={() => void add()} data-testid="link-directory-add-go">
              Add directory
            </Button>
          </div>
        </div>
      ) : (
        <div className="link-directory-head">
          {kept.length === 0 && <span className="ui-meta">Or pick it from a list your organization keeps.</span>}
          <Button kind="quiet" onClick={() => setAdding(true)} data-testid="link-directory-add">
            Add a directory…
          </Button>
        </div>
      )}
    </section>
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
      <p>This browser forgets the server at {hostOf(server)}, and asks it to revoke this page’s device there. Its projects, terminals and everything else stay on it as they are.</p>
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
