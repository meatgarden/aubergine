import { useEffect, useMemo, useState } from 'react';
import { FLAG_WORDS, sourceLabel, ago, fromWords, historyWords, needWords, showControl, type InstalledItem, type LibraryItemDetail, type LibrarySource, type ListedItem } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';
import { Badge, HowThisWorks, Page } from '../ui';
import { PageFlow } from '../page-flow';
import { tourSignal } from '../tour/tour-store';

/**
 * The library: sources of workflows and elements that others published, what
 * they list, and what of it is installed. It knows no kind of item and no
 * kind of source by name: it draws what the server says about each.
 *
 * Nothing here installs. "Install…" asks for an install, which then waits in
 * Review, where the whole text is read before anything is accepted.
 */

const STANDING: Record<ListedItem['standing'], string> = { available: '', installed: 'installed', update: 'update available' };

function standingWords(item: ListedItem): string {
  if (item.standing === 'update') return `Installed at version ${item.installedVersion}; its source has version ${item.version}${item.installedVersion === item.version ? ' with other content' : ''}.`;
  if (item.standing === 'installed') return `Installed, version ${item.installedVersion}.`;
  return item.requested ? 'Waits for you in Review.' : 'Not installed.';
}

function sourceAbout(source: LibrarySource): string {
  const where = source.kind === 'builtin' ? 'comes with Aubergine; needs no network' : `${source.kind}: ${source.address}`;
  const read = source.refreshedAt ? `last read ${ago(source.refreshedAt, new Date())} ago` : 'not read yet';
  return `${where} · ${read}${source.commit ? ` · commit ${source.commit.slice(0, 12)}` : ''}`;
}

function ItemDetail({ item, onAsk, busy, working }: { item: ListedItem; onAsk: (item: ListedItem) => void; busy: boolean; working: boolean }) {
  const [detail, setDetail] = useState<LibraryItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void api.libraryItem(item.sourceId, item.id).then(
      (found) => !cancelled && setDetail(found as LibraryItemDetail),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [item.sourceId, item.id, item.digest]);
  return (
    <div className="library-detail" data-testid="library-detail">
      <h3>{showControl(item.name)}</h3>
      <p className="sheet-note" data-testid="library-from">
        {item.kindTitle}, from {detail ? showControl(detail.from) : showControl(item.sourceName)}. {standingWords(item)}
      </p>
      {item.description && <p>{showControl(item.description)}</p>}
      {error && <p className="dialog-error">{error}</p>}
      {(detail?.warnings ?? []).map((warning) => (
        <p key={warning} className="library-warning" role="note" data-testid="library-warning">
          {showControl(warning)}
        </p>
      ))}
      {detail && detail.needs.length > 0 && (
        <p className="review-needs">
          <span className="wf-label">It needs</span>
          {detail.needs.map(needWords).join('; ')}
        </p>
      )}
      <div className="editor-row">
        <button
          type="button"
          className="primary"
          disabled={busy || item.problem !== null || item.standing === 'installed' || item.requested}
          title={item.problem ?? 'Asks for it to be installed. It then waits in Review, where you read all of it before anything is installed.'}
          onClick={() => onAsk(item)}
          aria-busy={working || undefined}
          data-testid="library-install"
        >
          {item.requested ? 'Waits in Review' : item.standing === 'update' ? 'Read the update…' : item.standing === 'installed' ? 'Installed' : 'Read and install…'}
        </button>
      </div>
      <div className="wf-label">What an agent would be told by it</div>
      {/* Somebody else's text: plain text, control characters shown, nothing made into a link or drawn as markup. */}
      <pre className="review-text" data-testid="library-text">
        {detail ? (detail.text !== null ? showControl(detail.text) : 'It could not be read.') : 'Reading…'}
      </pre>
    </div>
  );
}

export function LibraryScreen() {
  const open = useApp((s) => s.page === 'library');
  const library = useApp((s) => s.app?.library);
  const [items, setItems] = useState<ListedItem[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  // Which button started what is going on, so that it alone shows it.
  const [busyOn, setBusyOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; uses: string[]; liveRuns: number } | null>(null);

  // What the sources list, with what is installed: asked again whenever anything about the library changes.
  const changed = JSON.stringify([library?.sources.map((s) => [s.id, s.refreshedAt, s.problem]), library?.installed.map((i) => [i.id, i.from.version, i.from.digest, i.atSource]), library?.requests.map((r) => r.id)]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.libraryItems().then(
      (found) => !cancelled && setItems(found.items as ListedItem[]),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [open, changed]);

  const sources = useMemo(() => [...(library?.sources ?? [])].sort((a, b) => (a.kind === 'builtin' ? -1 : b.kind === 'builtin' ? 1 : sourceLabel(a).localeCompare(sourceLabel(b)))), [library?.sources]);
  const shownItems = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return wanted === '' ? items : items.filter((item) => `${item.name} ${item.description} ${item.id} ${item.sourceName} ${item.kindTitle}`.toLowerCase().includes(wanted));
  }, [items, query]);
  const current = items.find((item) => `${item.sourceId} ${item.id}` === selected) ?? null;

  if (!open) return null;
  const close = (): void => useApp.getState().showPage(null);
  const act = async (what: () => Promise<unknown>, on: string | null = null): Promise<void> => {
    setBusy(true);
    setBusyOn(on);
    setError(null);
    try {
      await what();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setBusyOn(null);
    }
  };
  const apply = useApp.getState().apply;
  const looksLikeFolder = (text: string): boolean => text.startsWith('/') || text.startsWith('~');

  return (
    <Page
      name="library"
      title="Library"
      line="Workflows and steps that others published. Read one, install it, and it is yours under Workflows."
      flow={<PageFlow here="library" />}
      label="Library"
      testid="library-screen"
      className="library-screen"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
        {error && (
          <p className="dialog-error" role="alert" data-testid="library-error">
            {error}
          </p>
        )}

        <details className="ui-fold library-sources-fold" data-testid="library-sources-fold">
          <summary>
            <span className="ui-meta">
              {(library?.sources ?? []).length} {(library?.sources ?? []).length === 1 ? 'source' : 'sources'}
            </span>{' '}
            <span className="ui-how-more">Manage</span>
          </summary>
        <ul className="library-sources" data-testid="library-sources">
          {sources.map((source) => (
            <li key={source.id} data-testid="library-source" data-kind={source.kind}>
              <div>
                <strong data-testid="library-source-name">{showControl(sourceLabel(source))}</strong> <span className="sheet-note">{showControl(sourceAbout(source))}</span>
                <div className="sheet-note">
                  {source.items.length} item{source.items.length === 1 ? '' : 's'}
                  {source.skipped.length > 0 ? ` · ${source.skipped.length} entr${source.skipped.length === 1 ? 'y' : 'ies'} of its index could not be read: ${source.skipped.map((s) => `${s.id} (${s.reason})`).join('; ')}` : ''}
                </div>
                {source.problem && (
                  <div className="library-warning" role="note" data-testid="source-problem">
                    It could not be read at the last try: {showControl(source.problem)} What was read before is still shown, and everything installed works without it.
                  </div>
                )}
                {historyWords(source.history) && (
                  <div className="library-warning" role="note" data-testid="source-history">
                    {historyWords(source.history)}
                  </div>
                )}
              </div>
              <span className="workflow-actions">
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  title={source.kind === 'git' ? 'Fetch it again from its address. This is the only thing that reaches the network for it.' : 'Read it again'}
                  onClick={() => void act(async () => apply({ type: 'library.source.changed', source: (await api.refreshLibrarySource(source.id)) as never }), `refresh ${source.id}`)}
                  aria-busy={busyOn === `refresh ${source.id}` || undefined}
                  data-testid="source-refresh"
                >
                  Refresh
                </button>
                {source.kind !== 'builtin' && (
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    title="Remove this source. What was installed from it stays as it is."
                    onClick={() =>
                      void act(async () => {
                        await api.removeLibrarySource(source.id);
                        apply({ type: 'library.source.removed', sourceId: source.id });
                      })
                    }
                    data-testid="source-remove"
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="history-bar"
          onSubmit={(e) => {
            e.preventDefault();
            const text = address.trim();
            if (text === '') return;
            void act(async () => {
              apply({ type: 'library.source.changed', source: (await api.addLibrarySource(looksLikeFolder(text) ? 'folder' : 'git', text)) as never });
              setAddress('');
            });
          }}
        >
          <input
            value={address}
            placeholder="A folder (/path/to/folder), or a Git address (https://…, ssh://…, user@host:path)"
            aria-label="A folder or a Git address"
            onChange={(e) => setAddress(e.target.value)}
            data-testid="source-address"
          />
          <button type="submit" className="quiet" disabled={busy || address.trim() === ''} title="Adds it and reads it once. A Git address is fetched now with the Git access you already have; no password is asked for or kept." data-testid="source-add">
            Add source
          </button>
        </form>
        </details>

        <HowThisWorks line="You choose what is fetched and what is installed.">
          What a source lists was written by whoever published it. Nothing is fetched unless you press Refresh or add a source, and nothing is installed until you have read all of it in Review and accepted it.
        </HowThisWorks>

        <div className="library-browse">
          <div className="library-list">
            <input value={query} placeholder="Search by name, description or source" aria-label="Search the library" onChange={(e) => setQuery(e.target.value)} data-testid="library-search" />
            <ul data-testid="library-items">
              {shownItems.map((item) => {
                const key = `${item.sourceId} ${item.id}`;
                const marks = [STANDING[item.standing], item.requested ? 'waits in Review' : '', item.retired ? 'retired by its publisher' : '', ...item.flags.filter((flag) => flag === 'changed-without-version' || flag === 'gone').map((flag) => (flag === 'gone' ? 'no longer listed' : 'changed without a new version')), item.problem ? 'cannot be installed' : ''].filter(Boolean);
                return (
                  <li key={key}>
                    <button type="button" className={`library-row${selected === key ? ' is-selected' : ''}`} aria-pressed={selected === key} onClick={() => {
                        setSelected(key);
                        tourSignal('library.read');
                      }} title={[item.problem, ...item.flags.map((flag) => FLAG_WORDS[flag])].filter(Boolean).join(' ')} data-testid="library-item" data-item={item.id} data-standing={item.standing}>
                      <span className="library-row-head">
                        <Badge className="library-kind">{item.kindTitle.replace(/^An? /, '').replace(/^./, (c) => c.toUpperCase())}</Badge>
                        <span className="library-name">{showControl(item.name)}</span>
                      </span>
                      <span className="ui-meta">
                        {showControl(item.sourceName)} · version {showControl(item.version)}
                      </span>
                      {marks.length > 0 && (
                        <span className={`library-marks${item.standing === 'update' || item.flags.length > 0 ? ' wants-you' : ''}`} data-testid="library-marks">
                          {marks.join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {shownItems.length === 0 && <p className="list-empty">{items.length === 0 ? 'What your sources publish will be listed here.' : 'Nothing matches your search.'}</p>}
          </div>
          <div className="library-main">
            {current ? (
              <ItemDetail
                item={current}
                busy={busy}
                working={busyOn === 'install'}
                onAsk={(item) =>
                  void act(async () => {
                    apply({ type: 'library.request.changed', request: (await api.requestLibraryInstall(item.sourceId, item.id)) as never });
                    // Straight to where it is read: nothing is installed until it is accepted there.
                    useApp.getState().togglePanel('review');
                  }, 'install')
                }
              />
            ) : (
              <p className="ui-empty" data-testid="library-none-picked">Pick one to read what it would tell an agent.</p>
            )}
          </div>
        </div>

        <h3>Installed from the library</h3>
        {(library?.installed.length ?? 0) === 0 ? (
          <p className="sheet-note">Nothing yet.</p>
        ) : (
          <ul className="library-sources" data-testid="library-installed">
            {[...(library?.installed ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((installed: InstalledItem) => (
                <li key={installed.id} data-testid="library-installed-item">
                  <div>
                    <strong>{showControl(installed.name)}</strong> <span className="sheet-note">from {showControl(fromWords(installed.from))}</span>
                    {installed.atSource !== 'current' && (
                      <div className="library-warning" role="note" data-testid="installed-at-source">
                        {installed.atSource === 'retired' ? `Its publisher has retired it${installed.useInstead ? `: use “${showControl(installed.useInstead)}” in its place` : ''}. It still works here.` : 'Its source no longer lists it. It still works here.'}
                      </div>
                    )}
                    {removing?.id === installed.id && (
                      <div className="sheet-note" data-testid="installed-remove-used">
                        {removing.uses.length > 0 ? `It is used in ${removing.uses.join(', ')}. Copies stay as they are and will say that their source was removed.` : 'Nothing uses it.'}
                        {removing.liveRuns > 0 ? ` ${removing.liveRuns} run${removing.liveRuns === 1 ? ' of it is' : 's of it are'} going: stop ${removing.liveRuns === 1 ? 'it' : 'them'} first.` : ''}
                      </div>
                    )}
                  </div>
                  <span className="workflow-actions">
                    {removing?.id === installed.id ? (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || removing.liveRuns > 0}
                        onClick={() =>
                          void act(async () => {
                            await api.removeLibraryInstalled(installed.id);
                            apply({ type: 'library.installed.removed', installedId: installed.id });
                            setRemoving(null);
                          })
                        }
                        data-testid="installed-remove-confirm"
                      >
                        Remove for good
                      </button>
                    ) : (
                      <button type="button" className="quiet" disabled={busy} onClick={() => void act(async () => setRemoving({ id: installed.id, ...(await api.libraryInstalledUsage(installed.id)) }))} data-testid="installed-remove">
                        Remove…
                      </button>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        )}
    </Page>
  );
}
