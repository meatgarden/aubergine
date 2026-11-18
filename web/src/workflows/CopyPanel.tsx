import { useEffect, useState } from 'react';
import { COPY_MARK, copyStatus, copyWords, decideUpdate, elementLines, elementReference, fromWords, threeTexts, type Element, type ShelfElement } from '@aubergine/shared';
import { DiffText } from '../review/DiffText';
import { useApp } from '../store';

/** The small mark on an element that is a copy of a shelf element: what can be told about it. */
export function CopyMark({ element, shelf }: { element: Element; shelf: readonly ShelfElement[] }) {
  const status = copyStatus(element, shelf);
  if (status.state === 'none') return null;
  const wants = status.state === 'behind' || status.state === 'both';
  return (
    <span className={`copy-mark is-${status.state}${wants ? ' wants-you' : ''}`} title={copyWords(status)} data-testid="copy-mark" data-state={status.state}>
      {COPY_MARK[status.state]}
      {status.retired ? ' · retired' : ''}
    </span>
  );
}

const text = (lines: string[]): string => lines.join('\n');

/**
 * What a copy of a shelf element says about itself, and, when the shelf has
 * a newer version, the comparison and the two things its owner can do: take
 * the shelf's version or keep their own. With changes on both sides the
 * three texts are shown, and nothing is merged for anyone.
 */
export function CopyPanel({ element, shelf, onDecide }: { element: Element; shelf: readonly ShelfElement[]; onDecide: (next: Element, said: string) => void }) {
  const [open, setOpen] = useState(false);
  const status = copyStatus(element, shelf);
  const item = status.shelf;
  const shelfVersion = item?.version ?? null;
  // Through its shelf element, where that came from: an element installed from the library says which source, item and version.
  const fromLibrary = useApp((s) => (item ? (s.app?.library.installed.find((entry) => entry.target.shelfId === item.id) ?? null) : null));
  // A comparison that was open is put away when what it compared has changed: another element, a decision, a newer version.
  useEffect(() => setOpen(false), [element.id, status.state, shelfVersion]);
  if (status.state === 'none') return null;
  const newer = item !== null && (status.state === 'behind' || status.state === 'both');
  const texts = item ? threeTexts(element, item) : null;
  return (
    <div className={`copy-panel is-${status.state}`} data-testid="copy-panel" data-state={status.state}>
      <p className="copy-words" data-testid="copy-words">
        {copyWords(status)}
      </p>
      {fromLibrary && (
        <p className="sheet-note" data-testid="copy-library">
          The saved step was installed from the library: {fromWords(fromLibrary.from)}.
          {fromLibrary.atSource === 'retired' ? ` Its publisher has retired it${fromLibrary.useInstead ? `: use “${fromLibrary.useInstead}” in its place` : ''}.` : fromLibrary.atSource === 'gone' ? ' Its source no longer lists it.' : ''}
        </p>
      )}
      {newer && item && texts && (
        <>
          <button type="button" className="quiet" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="copy-compare">
            {open ? 'Hide the comparison' : status.state === 'both' ? 'Compare the three texts…' : 'See what the newer version changes…'}
          </button>
          {open && status.state === 'behind' && (
            <div className="copy-compare">
              <div className="wf-label">
                From yours to version {item.version} on the shelf
                {item.versions.at(-1)?.note ? <span className="sheet-note"> “{item.versions.at(-1)?.note}”</span> : null}
              </div>
              <DiffText before={text(elementLines(texts.mine))} after={text(elementLines(texts.shelf))} testId="copy-diff" />
            </div>
          )}
          {open && status.state === 'both' && (
            <div className="copy-compare">
              <p className="sheet-note">It was changed here and on the shelf. Pick one of the two; nothing is merged for you. To keep parts of both, take one and then edit it.</p>
              <div className="copy-three">
                <div>
                  <div className="wf-label">As it was copied{status.copiedVersion ? ` (version ${status.copiedVersion})` : ''}</div>
                  <pre className="review-text" data-testid="copy-text-copied">
                    {texts.copied ? text(elementLines(texts.copied)) : 'That version is no longer kept.'}
                  </pre>
                </div>
                <div>
                  <div className="wf-label">Yours now</div>
                  {texts.copied ? <DiffText before={text(elementLines(texts.copied))} after={text(elementLines(texts.mine))} testId="copy-text-mine" /> : <pre className="review-text" data-testid="copy-text-mine">{text(elementLines(texts.mine))}</pre>}
                </div>
                <div>
                  <div className="wf-label">On the shelf now (version {item.version})</div>
                  {texts.copied ? <DiffText before={text(elementLines(texts.copied))} after={text(elementLines(texts.shelf))} testId="copy-text-shelf" /> : <pre className="review-text" data-testid="copy-text-shelf">{text(elementLines(texts.shelf))}</pre>}
                </div>
              </div>
            </div>
          )}
          <div className="editor-row">
            <button type="button" onClick={() => onDecide(decideUpdate(element, item, 'take'), `Took version ${item.version} of “${item.element.name}” from the shelf. Save to keep it: that makes a new version of this workflow.`)} data-testid="copy-take">
              Take the shelf’s version
            </button>
            <button type="button" className="quiet" onClick={() => onDecide(decideUpdate(element, item, 'keep'), `Kept yours. It is now a copy of version ${item.version} that was changed here. Save to keep that.`)} data-testid="copy-keep">
              Keep mine
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Every field of an element and what it is for: the same words the generated page has, read from the schemas. */
export function ElementReference() {
  const { element, shelf } = elementReference();
  return (
    <details className="element-reference" data-testid="element-reference">
      <summary>What goes in a step</summary>
      <p className="sheet-note">A step is one piece of work for an agent: text it reads and follows. Nothing in it is run by a computer.</p>
      <dl>
        {element.map((field) => (
          <div key={field.field} data-testid="reference-field" data-field={field.field}>
            <dt>
              <code>{field.field}</code> <span className="sheet-note">{field.written === 'by you' ? 'you write it' : 'kept for you'}</span>
            </dt>
            <dd>{field.what}</dd>
          </div>
        ))}
      </dl>
      <p className="sheet-note">A saved step also has:</p>
      <dl>
        {shelf.map((field) => (
          <div key={field.field} data-testid="reference-field" data-field={field.field}>
            <dt>
              <code>{field.field}</code>
            </dt>
            <dd>{field.what}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
