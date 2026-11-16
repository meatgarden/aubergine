import { useCallback, useEffect, useState } from 'react';
import { GRANTABLE_SCOPES, RESERVED_SCOPES, SCOPE_MEANING, tokenStatus, type ActivityEntry, type Scope, type TokenView } from '@aubergine/shared';
import { api } from './api';
import { runCommand } from './commands';
import { useApp } from './store';

const EXPIRY: [label: string, days: number | null][] = [
  ['Never', null],
  ['In 7 days', 7],
  ['In 30 days', 30],
  ['In 90 days', 90],
  ['In a year', 365],
];

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/**
 * API tokens: the credentials programs of the owner's use to call the API.
 * Listing, creating and revoking them is for the signed-in browser only; no
 * token can do any of it.
 */
export function TokenScreen() {
  const open = useApp((s) => s.panel === 'tokens');
  const tokens = useApp((s) => s.app?.tokens);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The secret of the token just made. It lives here and nowhere else, until the screen is closed. */
  const [made, setMade] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    // Closing the screen forgets the secret: it cannot be shown again.
    setMade(null);
    setCopied(false);
    setRevoking(null);
    setError(null);
  }, [open]);

  if (!open) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const list = [...(tokens ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createToken({ name, scopes, ...(days === null ? {} : { expiresInDays: days }) });
      useApp.getState().apply({ type: 'token.created', token: { ...created.token, hash: '' } });
      setMade({ name: created.token.name, secret: created.secret });
      setCopied(false);
      setName('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: TokenView): Promise<void> => {
    setError(null);
    try {
      const revoked = await api.revokeToken(token.id);
      if (revoked.revokedAt) useApp.getState().apply({ type: 'token.revoked', tokenId: token.id, at: revoked.revokedAt });
      setRevoking(null);
    } catch (e) {
      setError((e as Error).message);
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
      <div className="dialog sheet token-screen" role="dialog" aria-label="API tokens" data-testid="token-screen">
        <header className="sheet-head">
          <h2>API tokens</h2>
          <span>
            <button type="button" className="quiet" onClick={() => runCommand('activity.show')}>
              Activity…
            </button>
            <button type="button" className="quiet" onClick={close}>
              Close
            </button>
          </span>
        </header>
        <p className="sheet-note">
          A token lets a program of yours call the API on this computer, with the scopes you give it and nothing more. No token can create or
          revoke tokens, change settings, or reach terminals outside Aubergine: those stay with you, here.
        </p>

        {made && (
          <div className="token-made" role="alert" data-testid="token-made">
            <strong>The secret of “{made.name}”. Copy it now: it is shown this once and cannot be shown again.</strong>
            <div className="token-secret">
              <code data-testid="token-secret">{made.secret}</code>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(made.secret).then(
                    () => setCopied(true),
                    () => setError('Could not copy. Select the secret and copy it by hand.'),
                  )
                }
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p>
              Anyone who has it can do what the token may do. Keep it out of files you share and out of your shell history. If it gets out,
              revoke the token below.
            </p>
          </div>
        )}

        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h3>New token</h3>
          <label className="token-field">
            <span>Name</span>
            <input value={name} maxLength={80} placeholder="What will use it, for example: build script" aria-label="Token name" onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="token-scopes">
            <legend>Scopes</legend>
            {GRANTABLE_SCOPES.map((scope) => (
              <label key={scope}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(e) => setScopes(e.target.checked ? GRANTABLE_SCOPES.filter((s) => s === scope || scopes.includes(s)) : scopes.filter((s) => s !== scope))}
                />
                <code>{scope}</code> <span>{SCOPE_MEANING[scope]}</span>
              </label>
            ))}
            {RESERVED_SCOPES.map((scope) => (
              <label key={scope} className="token-reserved">
                <input type="checkbox" disabled />
                <code>{scope}</code> <span>{SCOPE_MEANING[scope]}</span>
              </label>
            ))}
          </fieldset>
          <label className="token-field">
            <span>Expires</span>
            <select aria-label="Expires" value={days ?? ''} onChange={(e) => setDays(e.target.value === '' ? null : Number(e.target.value))}>
              {EXPIRY.map(([label, value]) => (
                <option key={label} value={value ?? ''}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button type="submit" disabled={busy || name.trim() === '' || scopes.length === 0} data-testid="token-create">
              Create token
            </button>
          </div>
          {error && <p className="dialog-error">{error}</p>}
        </form>

        <h3>Tokens</h3>
        {list.length === 0 && <p className="sheet-note">No tokens yet.</p>}
        <table className="token-table">
          <tbody>
            {list.map((token) => {
              const status = tokenStatus(token);
              return (
                <tr key={token.id} data-testid="token-row" data-status={status}>
                  <td>
                    <strong>{token.name}</strong>
                    <div className="sheet-note">{token.scopes.join(', ')}</div>
                  </td>
                  <td className="sheet-note">
                    {status === 'active' ? (token.expiresAt ? `expires ${when(token.expiresAt)}` : 'does not expire') : status === 'revoked' ? `revoked ${when(token.revokedAt)}` : `expired ${when(token.expiresAt)}`}
                    <div>last used: {when(token.lastUsedAt)}</div>
                  </td>
                  <td className="token-actions">
                    {status !== 'active' ? (
                      <span className="token-off">{status}</span>
                    ) : revoking === token.id ? (
                      <>
                        <span>Stops working at once.</span>
                        <button type="button" className="danger" onClick={() => void revoke(token)} data-testid="token-revoke-confirm">
                          Revoke
                        </button>
                        <button type="button" className="quiet" onClick={() => setRevoking(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="quiet" onClick={() => setRevoking(token.id)} aria-label={`Revoke ${token.name}`}>
                        Revoke…
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const OUTCOME: Record<ActivityEntry['outcome'], string> = { ok: 'done', denied: 'not allowed', refused: 'token revoked or expired', limited: 'too many calls', error: 'failed' };

/** What each token did, newest first: read from the server a page at a time. */
export function ActivityScreen() {
  const open = useApp((s) => s.panel === 'activity');
  const tokens = useApp((s) => s.app?.tokens);
  const [tokenId, setTokenId] = useState('');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (filter: string, after: string | null): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getActivity({ tokenId: filter || undefined, cursor: after ?? undefined });
      setEntries((before) => (after ? [...before, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Read when the screen opens and when the filter changes; nothing is read while it is closed.
  useEffect(() => {
    if (open) void load(tokenId, null);
  }, [open, tokenId, load]);

  if (!open) return null;
  const close = (): void => useApp.getState().togglePanel(null);

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
      <div className="dialog sheet token-screen" role="dialog" aria-label="API activity" data-testid="activity-screen">
        <header className="sheet-head">
          <h2>API activity</h2>
          <span>
            <button type="button" className="quiet" onClick={() => runCommand('tokens.manage')}>
              Tokens…
            </button>
            <button type="button" className="quiet" onClick={close}>
              Close
            </button>
          </span>
        </header>
        <p className="sheet-note">
          Every call made with an API token: when, which token, what it asked for and how it ended. What was sent is not kept. The file is{' '}
          <code>activity.log</code> in the data folder.
        </p>
        <div className="token-field">
          <select aria-label="Token" value={tokenId} onChange={(e) => setTokenId(e.target.value)} data-testid="activity-filter">
            <option value="">Every token</option>
            {(tokens ?? []).map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </select>
          <button type="button" className="quiet" onClick={() => void load(tokenId, null)} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && <p className="dialog-error">{error}</p>}
        {entries.length === 0 && !loading && <p className="sheet-note">Nothing yet.</p>}
        <table className="token-table activity-table">
          <tbody>
            {entries.map((entry, i) => (
              <tr key={`${entry.at}:${i}`} data-testid="activity-row" data-outcome={entry.outcome}>
                <td className="sheet-note">{when(entry.at)}</td>
                <td>{entry.tokenName}</td>
                <td>
                  <code>
                    {entry.method} {entry.route}
                  </code>
                  {entry.action && <div className="sheet-note">{entry.action}</div>}
                </td>
                <td className={`activity-outcome is-${entry.outcome}`}>
                  {OUTCOME[entry.outcome]} <span className="sheet-note">{entry.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cursor && (
          <div className="dialog-actions">
            <button type="button" onClick={() => void load(tokenId, cursor)} disabled={loading}>
              Older
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
