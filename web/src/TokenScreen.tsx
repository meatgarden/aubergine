import { openProjects, type Project } from '@aubergine/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GRANTABLE_SCOPES, RESERVED_SCOPES, SCOPE_MEANING, REACH_SCOPES, tokenStatus, type ActivityEntry, type Reach, type Scope, type TokenView } from '@aubergine/shared';
import { api } from './api';
import { runCommand } from './commands';
import { useApp } from './store';

const NO_PROJECTS: Project[] = [];

/** The scopes that reach into terminals: shown with their warnings, and they need a reach. */
const TERMINAL: readonly string[] = REACH_SCOPES;

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
  const allSessions = useApp((s) => s.app?.sessions);
  const tokens = useApp((s) => s.app?.tokens);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [days, setDays] = useState<number | null>(null);
  const [review, setReview] = useState(true);
  /** Which terminals: nothing is chosen for the owner. */
  const [reachKind, setReachKind] = useState<'all' | 'canvases' | 'tag' | null>(null);
  const [reachCanvases, setReachCanvases] = useState<string[]>([]);
  const [reachTag, setReachTag] = useState('');
  /** The projects it reaches; empty: every project. */
  const [onlyProjects, setOnlyProjects] = useState<string[]>([]);
  const allProjects = useApp((s) => s.whole?.projects ?? NO_PROJECTS);
  const projects = useMemo(() => openProjects({ projects: allProjects }), [allProjects]);
  const canvasList = useApp((s) => s.app?.canvases);
  const canvases = [...(canvasList ?? [])].sort((a, b) => a.order - b.order);
  const terminal = scopes.some((scope) => TERMINAL.includes(scope));
  const reach: Reach | null =
    reachKind === 'all' ? { kind: 'all' } : reachKind === 'canvases' && reachCanvases.length > 0 ? { kind: 'canvases', canvasIds: reachCanvases } : reachKind === 'tag' && reachTag.trim() ? { kind: 'tag', tag: reachTag.trim() } : null;
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
  const sessionName = (sessionId: string): string => {
    const session = allSessions?.find((s) => s.id === sessionId);
    return session ? `“${session.name}”` : 'a terminal that has ended';
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createToken({ name, scopes, reviewWorkflowChanges: review, ...(terminal && reach ? { reach } : {}), ...(onlyProjects.length > 0 ? { projects: { kind: 'projects' as const, projectIds: onlyProjects } } : {}), ...(days === null ? {} : { expiresInDays: days }) });
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
                <code>{scope}</code> <span className={TERMINAL.includes(scope) ? 'token-warning' : undefined}>{SCOPE_MEANING[scope]}</span>
              </label>
            ))}
            {RESERVED_SCOPES.map((scope) => (
              <label key={scope} className="token-reserved">
                <input type="checkbox" disabled />
                <code>{scope}</code> <span>{SCOPE_MEANING[scope]}</span>
              </label>
            ))}
          </fieldset>
          {terminal && (
            <fieldset className="token-scopes token-reach" data-testid="token-reach">
              <legend>Which terminals it may reach</legend>
              <p className="sheet-note">
                A token with a terminal scope must be told. Terminals marked “people only” are closed to every token, whatever is chosen here; new Claude Code terminals are
                marked so from the start unless you changed that in the settings.
              </p>
              <label>
                <input type="radio" name="reach" checked={reachKind === 'canvases'} onChange={() => setReachKind('canvases')} data-testid="reach-canvases" />
                <span>Only terminals on these canvases:</span>
              </label>
              {reachKind === 'canvases' &&
                canvases.map((canvas) => (
                  <label key={canvas.id} className="token-reach-item">
                    <input type="checkbox" checked={reachCanvases.includes(canvas.id)} onChange={(e) => setReachCanvases(e.target.checked ? [...reachCanvases, canvas.id] : reachCanvases.filter((id) => id !== canvas.id))} />
                    <span>{canvas.name}</span>
                  </label>
                ))}
              <label>
                <input type="radio" name="reach" checked={reachKind === 'tag'} onChange={() => setReachKind('tag')} data-testid="reach-tag" />
                <span>Only terminals with the tag</span>
                <input value={reachTag} maxLength={32} placeholder="for example: ci" aria-label="Tag" onFocus={() => setReachKind('tag')} onChange={(e) => setReachTag(e.target.value)} />
              </label>
              <label>
                <input type="radio" name="reach" checked={reachKind === 'all'} onChange={() => setReachKind('all')} data-testid="reach-all" />
                <span className="token-warning">Every terminal, on every canvas, also ones started later</span>
              </label>
            </fieldset>
          )}
          {projects.length > 1 && (
            <fieldset className="token-reach" data-testid="token-projects">
              <legend>Which projects it reaches</legend>
              <label>
                <input type="radio" name="token-projects" checked={onlyProjects.length === 0} onChange={() => setOnlyProjects([])} data-testid="token-projects-all" />
                <span>Every project, also ones made later</span>
              </label>
              {projects.map((project) => (
                <label key={project.id}>
                  <input type="checkbox" checked={onlyProjects.includes(project.id)} onChange={(e) => setOnlyProjects(e.target.checked ? [...onlyProjects, project.id] : onlyProjects.filter((id) => id !== project.id))} data-testid="token-project" />
                  <span>Only: {project.name}</span>
                </label>
              ))}
              <p className="sheet-note">A token limited to some projects sees and hears nothing of the others, whatever its scopes. What is shared with every project it sees. This cannot be widened afterwards.</p>
            </fieldset>
          )}
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
          {scopes.includes('workflows:write') && (
            <label className="wf-check token-review">
              <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} data-testid="token-review" />
              <span>Changes to workflows need my review: this token proposes drafts, and I read them before they can be used.</span>
            </label>
          )}
          <div className="dialog-actions">
            <button type="submit" disabled={busy || name.trim() === '' || scopes.length === 0 || (terminal && reach === null)} title={terminal && reach === null ? 'Say which terminals it may reach first' : undefined} data-testid="token-create">
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
                    {token.projects.kind === 'projects' && (
                      <div className="sheet-note" data-testid="token-only-projects">
                        Only in: {token.projects.projectIds.map((id) => allProjects.find((p) => p.id === id)?.name ?? 'a project that is gone').join(', ')}
                      </div>
                    )}
                    {token.sessionId && (
                      <div className="sheet-note" data-testid="token-for-session">
                        Made for the agent in {sessionName(token.sessionId)}. Revoked when that terminal is ended for good.
                      </div>
                    )}
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
  const [sessionFilter, setSessionFilter] = useState('');
  const sessions = useApp((s) => s.app?.sessions);
  const sessionNames = new Map((sessions ?? []).map((s) => [s.id, s.name]));
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (filter: string, after: string | null): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getActivity({ tokenId: filter || undefined, sessionId: sessionFilter || undefined, cursor: after ?? undefined });
      setEntries((before) => (after ? [...before, ...page.items] : page.items) as ActivityEntry[]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionFilter]);

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
          Every call made with an API token: when, which token, what it asked for and how it ended. Also the few things only you may do (deciding about a draft or a
          repository workflow, making or revoking a token) when they were done as you from outside this browser, such as from the command line. What was sent is not
          kept. The file is <code>activity.log</code> in the data folder.
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
          <select aria-label="Terminal" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} data-testid="activity-session">
            <option value="">Every terminal</option>
            {(sessions ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
                <td data-caller={entry.caller ?? 'token'}>
                  {entry.caller === 'owner-cli'
                    ? `you, from the command line${entry.fromSessionId ? ` (it says: inside “${sessionNames.get(entry.fromSessionId) ?? 'a terminal that is gone'}”)` : ''}`
                    : entry.tokenName}
                </td>
                <td>
                  <code>
                    {entry.method} {entry.route}
                  </code>
                  {entry.action && (
                    <div className="sheet-note">
                      {entry.action}
                      {entry.resource.sessionId ? ` · ${sessionNames.get(entry.resource.sessionId) ?? 'a terminal that is gone'}` : ''}
                      {typeof entry.chars === 'number' ? ` · ${entry.chars} characters` : ''}
                      {entry.fingerprint ? ` · ${entry.fingerprint}` : ''}
                    </div>
                  )}
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
