import { DesktopBox } from './desktop';
import { useEffect, useState } from 'react';
import { GRANTABLE_SCOPES, SCOPE_MEANING, REACH_SCOPES, sortedCanvases, type AgentToolsChoice, type Reach, type Scope } from '@aubergine/shared';
import { canvasActions } from './canvas-actions';
import { useApp } from './store';
import { WhereFields, proposedFolder, type Where } from './environment/WhereFields';

const TERMINAL: readonly string[] = REACH_SCOPES;

type Kind = 'none' | 'own' | 'token';

/**
 * Starting a Claude Code session with the Aubergine tools: none, the tools
 * for its own work, or more, where the owner picks what a token made for
 * this one session may do. Nothing is made until the button is pressed.
 */
export function AgentToolsDialog() {
  const open = useApp((s) => s.choosingAgentTools);
  const choose = useApp((s) => s.chooseAgentTools);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const [kind, setKind] = useState<Kind>('none');
  const [scopes, setScopes] = useState<Scope[]>(['read']);
  const [reachKind, setReachKind] = useState<'canvas' | 'tag' | 'all'>('canvas');
  const [reachTag, setReachTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ticked or not by the setting; changed here, it is for this one terminal.
  const [desktop, setDesktop] = useState(() => useApp.getState().settings.desktop.openNew);
  const [where, setWhere] = useState<Where>({ folder: '', kind: null });

  useEffect(() => {
    if (!open) return;
    setKind('none');
    setScopes(['read']);
    setReachKind('canvas');
    setReachTag('');
    setError(null);
    setBusy(false);
    setWhere({ folder: proposedFolder(), kind: null });
    setDesktop(useApp.getState().settings.desktop.openNew);
  }, [open]);

  if (!open || !app) return null;
  const canvas = sortedCanvases(app).find((c) => c.id === canvasId);
  const terminal = scopes.some((scope) => TERMINAL.includes(scope));
  const cancel = (): void => choose(false);

  const chosen = (): AgentToolsChoice | undefined | string => {
    if (kind === 'none') return undefined;
    if (kind === 'own') return { kind: 'own' };
    if (scopes.length === 0) return 'Choose at least one scope, or one of the other two.';
    if (!terminal) return { kind: 'token', scopes };
    let reach: Reach;
    if (reachKind === 'all') reach = { kind: 'all' };
    else if (reachKind === 'tag') {
      if (reachTag.trim() === '') return 'Say which tag.';
      reach = { kind: 'tag', tag: reachTag.trim() };
    } else {
      if (!canvas) return 'There is no canvas to limit it to.';
      reach = { kind: 'canvases', canvasIds: [canvas.id] };
    }
    return { kind: 'token', scopes, reach };
  };

  const start = async (): Promise<void> => {
    const tools = chosen();
    if (typeof tools === 'string') {
      setError(tools);
      return;
    }
    setBusy(true);
    setError(null);
    const folder = where.folder.trim();
    const made = await canvasActions.get()?.addTerminal('claude-code', undefined, tools, { ...(folder ? { cwd: folder } : {}), ...(where.kind ? { environment: where.kind } : {}), desktop });
    if (made) choose(false);
    else {
      setError('The terminal could not be started.');
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
      <div className="dialog agent-tools" role="dialog" aria-modal="true" aria-labelledby="agent-tools-title" data-testid="agent-tools-dialog">
        <h2 id="agent-tools-title">New Claude Code session</h2>
        <WhereFields where={where} onChange={setWhere} />
        <fieldset className="token-scopes">
          <legend>Aubergine tools for this agent</legend>
          <label>
            <input type="radio" name="agent-tools" checked={kind === 'none'} onChange={() => setKind('none')} data-testid="agent-tools-none" autoFocus />
            <span>None. It has the <code>aubergine</code> command in its terminal, as every terminal does.</span>
          </label>
          <label>
            <input type="radio" name="agent-tools" checked={kind === 'own'} onChange={() => setKind('own')} data-testid="agent-tools-own" />
            <span>
              Its own work only: its workflow, its notes, saying when it needs you, and handing in drafts for you to review. It uses the terminal’s own credential; no token is
              made, and it reaches no other terminal.
            </span>
          </label>
          <label>
            <input type="radio" name="agent-tools" checked={kind === 'token'} onChange={() => setKind('token')} data-testid="agent-tools-more" />
            <span>More… An API token is made for this one terminal, with what you choose here.</span>
          </label>
        </fieldset>

        {kind === 'token' && (
          <>
            <fieldset className="token-scopes" data-testid="agent-tools-scopes">
              <legend>What the token may do</legend>
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
            </fieldset>
            {terminal && (
              <fieldset className="token-scopes token-reach" data-testid="agent-tools-reach">
                <legend>Which terminals it may reach</legend>
                <label>
                  <input type="radio" name="agent-reach" checked={reachKind === 'canvas'} onChange={() => setReachKind('canvas')} />
                  <span>Only terminals on this canvas{canvas ? ` (“${canvas.name}”)` : ''}</span>
                </label>
                <label>
                  <input type="radio" name="agent-reach" checked={reachKind === 'tag'} onChange={() => setReachKind('tag')} />
                  <span>Only terminals with the tag</span>
                  <input value={reachTag} maxLength={32} placeholder="for example: ci" aria-label="Tag" onFocus={() => setReachKind('tag')} onChange={(e) => setReachTag(e.target.value)} />
                </label>
                <label>
                  <input type="radio" name="agent-reach" checked={reachKind === 'all'} onChange={() => setReachKind('all')} />
                  <span className="token-warning">Every terminal, on every canvas, also ones started later</span>
                </label>
              </fieldset>
            )}
            <p className="sheet-note">
              The token is named after the terminal and listed with your other tokens, where you can revoke it. It is revoked when the terminal is ended for good. What it writes
              about workflows comes to you as drafts to review. Terminals marked “people only” stay closed to it whatever you choose here, and other Claude Code terminals are
              marked so from the start unless you changed that in the settings. Its secret is kept in one file in Aubergine’s data folder, readable by you only.
            </p>
          </>
        )}

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
          <button type="button" onClick={() => void start()} disabled={busy} data-testid="agent-tools-start">
            {kind === 'token' ? 'Make the token and start' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
