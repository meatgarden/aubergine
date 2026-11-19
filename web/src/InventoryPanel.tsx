import { useEffect, useMemo, useState } from 'react';
import { INVENTORY_KINDS, STATE_WORD, inventoryText, searchInventory, sourceWord, type Inventory } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';
import { ScreenHead } from './ui';

/**
 * What is switched on for the agent in one terminal: read from its
 * configuration when the panel opens, and not kept. It shows names only,
 * and says at the top what it is and is not: what the files say, not what
 * the running agent has loaded.
 */
export function InventoryPanel() {
  const sessionId = useApp((s) => s.inventoryFor);
  const name = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.name ?? '');
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    setInventory(null);
    setError(null);
    setQuery('');
    setCopied(false);
    if (!sessionId) return;
    let cancelled = false;
    void api.inventory(sessionId).then(
      (found) => !cancelled && setInventory(found),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, again]);

  const shown = useMemo(() => (inventory ? searchInventory(inventory.items, query) : []), [inventory, query]);
  if (!sessionId) return null;
  const close = (): void => useApp.getState().showInventory(null);
  const problems = inventory?.notes.filter((note) => note.level !== 'gap') ?? [];
  const gaps = inventory?.notes.filter((note) => note.level === 'gap') ?? [];

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
      <div className="dialog sheet inventory-panel" role="dialog" aria-label="How this agent is set up" data-testid="inventory-panel">
        <ScreenHead title={<>How “{name}” is set up</>} onClose={close} closeTestid="inventory-close" />
        <p data-testid="inventory-what">
          This is what the agent’s configuration files say, read just now. It is not a list of what the running agent has loaded, and no server was contacted: “configured” does
          not mean “working”. Only names are shown, never the values in those files.
        </p>
        {error && (
          <p className="dialog-error" role="alert" data-testid="inventory-error">
            {error}
          </p>
        )}
        {!inventory && !error && <p className="sheet-note">Reading…</p>}
        {inventory && (
          <>
            <section className="inventory-aubergine" data-testid="inventory-aubergine">
              <h3>What Aubergine added</h3>
              <ul>
                {inventory.aubergine.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            {problems.length > 0 && (
              <section className="inventory-problems" role="alert" data-testid="inventory-problems">
                <h3>Could not be read: the list below is incomplete</h3>
                <ul>
                  {problems.map((note) => (
                    <li key={`${note.where} ${note.text}`}>
                      <code>{note.where}</code> {note.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="inventory-tools">
              <input value={query} placeholder="Find by name, kind or source…" aria-label="Find" onChange={(e) => setQuery(e.target.value)} autoFocus data-testid="inventory-search" />
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  void navigator.clipboard.writeText(inventoryText(inventory, name)).then(
                    () => {
                      setCopied(true);
                      useApp.getState().say('Copied as text.');
                    },
                    () => setError('Could not copy.'),
                  )
                }
                title="The whole list as plain text, for a bug report. It holds names only, like the list."
                data-testid="inventory-copy"
              >
                {copied ? 'Copied' : 'Copy as text'}
              </button>
              <button type="button" className="quiet" onClick={() => setAgain(again + 1)} title="Read the files again" data-testid="inventory-reread">
                Read again
              </button>
            </div>
            {INVENTORY_KINDS.map(({ kind, title }) => {
              const all = inventory.items.filter((item) => item.kind === kind).length;
              const items = shown.filter((item) => item.kind === kind);
              if (all === 0 || (query.trim() !== '' && items.length === 0)) return null;
              return (
                <section key={kind} className="inventory-group" data-testid="inventory-group" data-kind={kind}>
                  <h3>
                    {title} <span className="list-count">{query.trim() === '' ? all : `${items.length} of ${all}`}</span>
                  </h3>
                  <ul>
                    {items.map((item, index) => (
                      <li key={`${item.name} ${item.source.kind} ${index}`} className={`inventory-item is-${item.state}`} data-testid="inventory-item" data-state={item.state} data-source={item.source.kind}>
                        <span className="inventory-state">{STATE_WORD[item.state]}</span>
                        <span className="inventory-name">{item.name}</span>
                        <span className="inventory-source">{sourceWord(item.source)}</span>
                        {item.detail && <span className="inventory-detail">{item.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {query.trim() !== '' && shown.length === 0 && <p className="sheet-note" data-testid="inventory-none">Nothing matches.</p>}
            <section className="inventory-gaps" data-testid="inventory-gaps">
              <h3>What this list cannot say</h3>
              <ul>
                {gaps.map((note) => (
                  <li key={note.where}>
                    <strong>{note.where}.</strong> {note.text}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
