import { useEffect, useState } from 'react';
import { bytesWords, countsWords, type Difference, type Ending, type EnvironmentDetail, type SessionEnvironment } from '@aubergine/shared';
import { api } from '../api';
import { useApp } from '../store';

/**
 * One environment: what it is, in its kind's own words, the files that
 * differ from where it started, the difference of each as text, and what
 * can be done with it. It knows no kind and no choice by name: every word
 * and every button comes from what the server says about this one.
 *
 * What a file says is drawn as text, line by line, in text nodes: nothing in
 * it is markup, and nothing in it is a link.
 */

/** The choices for one environment, each with the second question where the server says to ask again. */
export function Endings({ environment, onDone }: { environment: SessionEnvironment; onDone: (removed: boolean, says: string) => void }) {
  const [endings, setEndings] = useState<Ending[] | null>(null);
  const [asking, setAsking] = useState<Ending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stamp = `${environment.id} ${environment.changes?.at ?? ''} ${environment.broken ?? ''}`;
  useEffect(() => {
    let cancelled = false;
    setAsking(null);
    void api.environmentEndings(environment.id).then(
      (found) => !cancelled && setEndings(found.endings as Ending[]),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps -- read again when what changed there was read again

  const act = async (ending: Ending, confirm: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const done = await api.endEnvironment(environment.id, ending.choice, confirm);
      setAsking(null);
      onDone(done.removed, done.says);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!endings) return error ? <p className="dialog-error">{error}</p> : null;
  return (
    <div className="copy-endings" data-testid="copy-endings">
      {asking ? (
        <div className="copy-ask-again" role="alertdialog" aria-label="Are you sure?" data-testid="copy-ask-again">
          <p>{asking.asksAgain}</p>
          <button type="button" className="danger" disabled={busy} onClick={() => void act(asking, true)} data-testid="copy-confirm">
            Yes: {asking.label.toLowerCase()}
          </button>
          <button type="button" onClick={() => setAsking(null)} data-testid="copy-keep">
            No, keep it
          </button>
        </div>
      ) : (
        <ul>
          {endings.map((ending) => (
            <li key={ending.choice}>
              <button type="button" className="quiet" disabled={busy || !ending.available} onClick={() => (ending.asksAgain !== null ? setAsking(ending) : void act(ending, false))} data-testid="copy-ending" data-choice={ending.choice}>
                {ending.label}
              </button>
              <span className="sheet-note">{ending.available ? ending.says : ending.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="dialog-error">{error}</p>}
    </div>
  );
}

/** A difference, one line a row: added lines and removed lines marked by a character as well as a color. */
function DifferenceText({ difference }: { difference: Difference }) {
  if (difference.notDrawn !== null) return <p className="sheet-note" data-testid="difference-not-drawn">{difference.notDrawn}</p>;
  return (
    <>
      <pre className="difference-text" data-testid="difference-text">
        {difference.text.split('\n').map((line, index) => (
          <span key={index} className={line.startsWith('+') ? 'is-added' : line.startsWith('-') ? 'is-removed' : line.startsWith('@@') ? 'is-place' : undefined}>
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
      {difference.cut && <p className="sheet-note" data-testid="difference-cut">This is the beginning: the difference is longer than is shown here.</p>}
    </>
  );
}

export function EnvironmentPanel() {
  const id = useApp((s) => s.viewingEnvironment);
  const environment = useApp((s) => (id ? (s.app?.environments.find((e) => e.id === id) ?? null) : null));
  const session = useApp((s) => (environment?.sessionId ? (s.app?.sessions.find((x) => x.id === environment.sessionId) ?? null) : null));
  const [detail, setDetail] = useState<EnvironmentDetail | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [difference, setDifference] = useState<Difference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bytes, setBytes] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);

  // Read when it opens, when the owner asks, and when the server has read it again by itself (the agent went idle).
  const stamp = `${id ?? ''} ${environment?.changes?.at ?? ''} ${asked}`;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    void api.environment(id).then(
      (found) => !cancelled && setDetail(found as EnvironmentDetail),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [stamp]); // eslint-disable-line react-hooks/exhaustive-deps -- `stamp` holds what it depends on
  useEffect(() => {
    setDetail(null);
    setFile(null);
    setDifference(null);
    setBytes(null);
    setSaid(null);
    if (!id) return;
    let cancelled = false;
    // What it takes on disk is measured once, when the panel opens.
    void api.listEnvironments().then((list) => {
      const found = list.items.find((item) => item.id === id);
      if (!cancelled && found && found.bytes !== null) setBytes(`${found.bytesAtLeast ? 'at least ' : ''}${bytesWords(found.bytes)}`);
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    setDifference(null);
    if (!id || !file) return;
    let cancelled = false;
    void api.environmentDifference(id, file).then(
      (found) => !cancelled && setDifference(found as Difference),
      (e: unknown) => !cancelled && setDifference({ file, state: 'changed', text: '', cut: false, notDrawn: (e as Error).message }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, file, detail]);

  if (!id) return null;
  const close = (): void => useApp.getState().viewEnvironment(null);
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
      <div className="dialog sheet copy-panel" role="dialog" aria-label="What changed" data-testid="copy-panel">
        <header className="sheet-head">
          <h2>
            {environment ? environment.sessionName : 'Gone'}
            {environment && environment.sessionId === null && <span className="copy-gone"> · its terminal is gone</span>}
          </h2>
          <span>
            {session && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  close();
                  useApp.getState().showSession(session.id);
                }}
              >
                Go to “{session.name}”
              </button>
            )}
            <button type="button" className="quiet" onClick={() => setAsked(asked + 1)} data-testid="copy-refresh">
              Read again
            </button>
            <button type="button" className="quiet" onClick={close} data-testid="copy-close">
              Close
            </button>
          </span>
        </header>
        {said && (
          <p className="sheet-note" role="status" data-testid="copy-said">
            {said}
          </p>
        )}
        {!environment ? (
          !said && <p className="sheet-note">This working copy is no longer listed.</p>
        ) : (
          <>
            <p className="copy-words" data-testid="copy-words">
              <strong>{environment.title}.</strong> {environment.words}
            </p>
            <dl className="copy-facts">
              {environment.branch && (
                <>
                  <dt>Branch</dt>
                  <dd data-testid="copy-branch">{environment.branch}</dd>
                </>
              )}
              <dt>Folder</dt>
              <dd>
                {environment.folder}
                {bytes ? ` · ${bytes}` : ''}
              </dd>
              <dt>Made from</dt>
              <dd>
                {environment.projectFolder}
                {environment.startCommit ? ` at commit ${environment.startCommit.slice(0, 12)}` : ''}
              </dd>
            </dl>
            {environment.broken && (
              <p className="run-view-alert" role="alert" data-testid="copy-broken">
                {environment.broken}
              </p>
            )}
            {detail?.note && detail.note !== environment.broken && <p className="run-view-alert">{detail.note}</p>}
            {error && <p className="dialog-error">{error}</p>}
            {!environment.broken && (
              <div className="copy-changes">
                <div className="copy-files">
                  <div className="wf-label" data-testid="copy-counts">
                    {environment.changes ? countsWords(environment.changes) : 'Reading…'}
                    {environment.changes && environment.changes.commits > 0 ? ` · ${environment.changes.commits} commit${environment.changes.commits === 1 ? '' : 's'}` : ''}
                    {environment.changes && environment.changes.uncommitted > 0 ? ` · ${environment.changes.uncommitted} not committed` : ''}
                  </div>
                  <ul>
                    {(detail?.files ?? []).map((entry) => (
                      <li key={entry.path}>
                        <button type="button" className={`copy-file is-${entry.state}${file === entry.path ? ' is-open' : ''}`} aria-pressed={file === entry.path} onClick={() => setFile(entry.path)} title={`${entry.state}${entry.committed ? '' : ', not committed'}`} data-testid="copy-file" data-state={entry.state}>
                          <span className="copy-file-mark">{entry.state === 'added' ? '+' : entry.state === 'removed' ? '−' : '~'}</span>
                          <span className="copy-file-name">{entry.path}</span>
                          {!entry.committed && <span className="copy-file-loose">not committed</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {detail?.filesCut && <p className="sheet-note">There are more files than are listed.</p>}
                  {detail && detail.files.length === 0 && <p className="sheet-note">Nothing differs from where it started.</p>}
                </div>
                <div className="copy-difference">{file === null ? <p className="sheet-note">Choose a file to read its difference from where the working copy started.</p> : difference ? <DifferenceText difference={difference} /> : <p className="sheet-note">Reading…</p>}</div>
              </div>
            )}
            <div className="wf-label">What to do with it</div>
            <p className="sheet-note">Nothing is ever merged, pushed or rebased by Aubergine, and the branch you have checked out is never changed.</p>
            <Endings
              environment={environment}
              onDone={(removed, says) => {
                setSaid(says);
                if (!removed) setAsked(asked + 1);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
