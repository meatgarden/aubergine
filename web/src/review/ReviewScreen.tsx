import { useEffect, useMemo, useState } from 'react';
import { REVIEW_LINES_SHOWN, lineDiff, needWords, needsShowAll, type Element, type WorkflowContent } from '@aubergine/shared';
import { useApp } from '../store';
import { ElementFields } from '../workflows/ElementFields';
import { reviewSources, type ReviewDetail, type ReviewItem, type ReviewSource } from './registry';

/** The items of one source. A component of its own, because each source brings a hook. */
function SourceItems({ source, selected, onSelect, onItems }: { source: ReviewSource; selected: string | null; onSelect: (key: string) => void; onItems: (source: string, items: ReviewItem[]) => void }) {
  const items = source.useItems();
  useEffect(() => onItems(source.id, items), [source.id, items, onItems]);
  if (items.length === 0) return null;
  return (
    <>
      <h3>{source.title}</h3>
      <ul className="review-list">
        {items.map((item) => {
          const key = `${source.id}:${item.id}`;
          return (
            <li key={key}>
              <button type="button" className={`review-row state-${item.state}`} aria-pressed={selected === key} onClick={() => onSelect(key)} data-testid="review-row" data-state={item.state}>
                <strong>{item.title}</strong>
                <span className="sheet-note">
                  {item.what} from {item.from}
                  {item.state === 'requested' ? ' · asked for, not handed in yet' : item.state === 'returned' ? ' · sent back, not revised yet' : item.revision > 1 ? ` · version ${item.revision}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * The one place where something not written by the owner is read before it
 * can be used. It shows the whole text an agent would be told. Nothing here
 * is accepted without all of it having been on screen.
 */
export function ReviewScreen() {
  const open = useApp((s) => s.panel === 'review');
  const [bySource, setBySource] = useState<Record<string, ReviewItem[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [shownAll, setShownAll] = useState(false);
  const [changes, setChanges] = useState(false);
  const [editing, setEditing] = useState<{ workflow: WorkflowContent | null; element: Element | null } | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sources = reviewSources();
  const onItems = useMemo(() => (source: string, items: ReviewItem[]) => setBySource((before) => (before[source] === items ? before : { ...before, [source]: items })), []);
  const all = sources.flatMap((source) => (bySource[source.id] ?? []).map((item) => ({ key: `${source.id}:${item.id}`, source, item })));
  const current = all.find((entry) => entry.key === selected) ?? null;
  const firstWaiting = all.find((entry) => entry.item.state === 'waiting')?.key ?? all[0]?.key ?? null;

  // Something to read is chosen when the screen opens, and when what was chosen is gone.
  useEffect(() => {
    if (open && !current && firstWaiting) setSelected(firstWaiting);
  }, [open, current, firstWaiting]);

  const currentKey = current?.key ?? null;
  const currentRevision = current?.item.revision ?? 0;
  const currentState = current?.item.state ?? null;
  useEffect(() => {
    setDetail(null);
    setShownAll(false);
    setChanges(false);
    setEditing(null);
    setComment(null);
    setError(null);
    if (!open || !current || current.item.state === 'requested') return;
    let cancelled = false;
    void current.source
      .load(current.item.id)
      .then((loaded) => !cancelled && setDetail(loaded))
      .catch((e: unknown) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [open, currentKey, currentRevision, currentState]); // eslint-disable-line react-hooks/exhaustive-deps -- reloaded when another is chosen or this one is revised

  if (!open) return null;
  const close = (): void => useApp.getState().togglePanel(null);
  const lines = detail?.text.split('\n') ?? [];
  const long = detail ? needsShowAll(detail.text) : false;
  const waiting = current?.item.state === 'waiting';
  // Accepting waits until the whole text has been on screen.
  const mayAccept = waiting && detail !== null && (!long || shownAll) && !busy;

  const act = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
      <div className="dialog sheet review-screen" role="dialog" aria-label="Review" data-testid="review-screen">
        <header className="sheet-head">
          <h2>Review</h2>
          <button type="button" className="quiet" onClick={close} data-testid="review-close">
            Close
          </button>
        </header>
        <p className="sheet-note">
          What an agent or a program wrote is read here before it can be used. Until you accept it, it cannot be run and no agent is told any of it.
        </p>
        <div className="review-grid">
          <div className="review-side">
            {sources.map((source) => (
              <SourceItems key={source.id} source={source} selected={selected} onSelect={setSelected} onItems={onItems} />
            ))}
            {all.length === 0 && <p className="sheet-note" data-testid="review-empty">Nothing is waiting to be read.</p>}
          </div>
          <div className="review-main">
            {current && (
              <>
                <h3 data-testid="review-title">{current.item.title}</h3>
                <p className="sheet-note" data-testid="review-origin">
                  {current.item.what}, from {current.item.from}
                  {current.item.revision > 1 ? `, version ${current.item.revision}` : ''}.
                </p>
                {current.item.asked && (
                  <p className="review-asked">
                    <span className="wf-label">What was asked for</span>
                    {current.item.asked}
                  </p>
                )}
                {current.item.state === 'requested' && <p className="sheet-note">Nothing has been handed in yet. The agent reads the request with <code>aubergine workflow brief</code>.</p>}
                {current.item.state === 'returned' && <p className="sheet-note">Sent back with: “{current.item.comment}”. Waiting for a new version.</p>}
                {detail && (
                  <>
                    <p className="review-needs" data-testid="review-needs">
                      <span className="wf-label">It needs</span>
                      {detail.needs.length > 0 ? detail.needs.map(needWords).join('; ') : 'nothing that was named'}
                    </p>
                    {editing ? (
                      <div className="review-edit" data-testid="review-edit">
                        {editing.workflow && (
                          <label className="wf-field">
                            <span>Name of the workflow</span>
                            <input value={editing.workflow.name} maxLength={120} onChange={(e) => editing.workflow && setEditing({ ...editing, workflow: { ...editing.workflow, name: e.target.value } })} />
                          </label>
                        )}
                        {(editing.workflow?.elements ?? (editing.element ? [editing.element] : [])).map((element, index) => (
                          <fieldset key={element.id}>
                            <legend>
                              {index + 1}. {element.name}
                            </legend>
                            <ElementFields
                              element={element}
                              onChange={(next) =>
                                setEditing(editing.workflow ? { ...editing, workflow: { ...editing.workflow, elements: editing.workflow.elements.map((e) => (e.id === element.id ? next : e)) } } : { ...editing, element: next })
                              }
                            />
                          </fieldset>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="wf-label">
                          What an agent would be told
                          {detail.previousText !== null && (
                            <button type="button" className="quiet" aria-pressed={changes} onClick={() => setChanges(!changes)} data-testid="review-changes">
                              {changes ? 'Show the text' : 'Show what changed'}
                            </button>
                          )}
                        </div>
                        {changes && detail.previousText !== null ? (
                          <pre className="review-text" data-testid="review-diff">
                            {lineDiff(detail.previousText, detail.text).map((line, index) => (
                              <span key={index} className={`diff-${line.kind}`}>
                                {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
                                {line.text}
                                {'\n'}
                              </span>
                            ))}
                          </pre>
                        ) : (
                          <pre className="review-text" data-testid="review-text">
                            {(long && !shownAll ? lines.slice(0, REVIEW_LINES_SHOWN) : lines).join('\n')}
                          </pre>
                        )}
                        {long && !shownAll && (
                          <p className="review-more">
                            This is {REVIEW_LINES_SHOWN} of {lines.length} lines.{' '}
                            <button type="button" onClick={() => setShownAll(true)} data-testid="review-show-all">
                              Show all {lines.length} lines
                            </button>{' '}
                            It can be accepted once all of it has been shown.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
                {error && <p className="dialog-error">{error}</p>}
                {comment !== null ? (
                  <div className="dialog-actions review-comment">
                    <input autoFocus value={comment} maxLength={2000} placeholder="What should change?" aria-label="Comment" onChange={(e) => setComment(e.target.value)} data-testid="review-comment" />
                    <button type="button" className="quiet" onClick={() => setComment(null)}>
                      Cancel
                    </button>
                    <button type="button" disabled={busy || comment.trim() === ''} onClick={() => void act(() => current.source.sendBack?.(current.item.id, comment.trim()) ?? Promise.resolve())} data-testid="review-send-back-confirm">
                      Send back
                    </button>
                  </div>
                ) : (
                  <div className="dialog-actions">
                    <button type="button" className="quiet danger-text" disabled={busy} onClick={() => void act(() => current.source.discard(current.item.id))} data-testid="review-discard">
                      Discard
                    </button>
                    {waiting && current.source.sendBack && (
                      <button type="button" className="quiet" disabled={busy} onClick={() => setComment('')} data-testid="review-send-back">
                        Send back with a comment…
                      </button>
                    )}
                    {waiting && detail && !editing && (
                      <button type="button" className="quiet" disabled={!mayAccept} onClick={() => setEditing(detail.proposal)} data-testid="review-edit-button">
                        Edit, then accept…
                      </button>
                    )}
                    {editing && (
                      <button type="button" className="quiet" onClick={() => setEditing(null)}>
                        Back to the text
                      </button>
                    )}
                    {waiting && (
                      <button
                        type="button"
                        disabled={!mayAccept}
                        title={long && !shownAll ? 'Show all of the text first' : undefined}
                        onClick={() => void act(() => current.source.accept(current.item.id, editing ? { ...(editing.workflow ? { workflow: editing.workflow } : {}), ...(editing.element ? { element: editing.element } : {}) } : undefined))}
                        data-testid="review-accept"
                      >
                        {editing ? 'Accept as edited' : 'Accept'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
