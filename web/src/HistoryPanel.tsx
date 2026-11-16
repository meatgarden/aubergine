import { useEffect, useState } from 'react';
import { ago, folded, showControl, type ConversationSummary, type HistoryList, type HistoryNote, type HistorySearch, type Transcript } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * Past conversations of the agent in a folder: the list, a search, and one
 * conversation to read. Everything here is fetched when it is opened and
 * held only while the panel is open; closing it drops it. What is shown is
 * other people's text: plain text, control characters shown, nothing made
 * into a link or drawn as markup.
 */

const WHO: Record<string, string> = { you: 'You', agent: 'Agent', tool: 'Tool', note: 'Note' };

function Notes({ notes }: { notes: readonly HistoryNote[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="history-notes" data-testid="history-notes">
      {notes.map((note) => (
        <li key={note.text} data-level={note.level}>
          {note.text}
        </li>
      ))}
    </ul>
  );
}

/** One piece of a transcript. A long one is folded until asked for. */
function Piece({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const shown = showControl(text);
  const fold = folded(shown);
  if (!fold.long) return <pre className="transcript-text">{shown}</pre>;
  return (
    <>
      <pre className="transcript-text">{open ? shown : fold.head}</pre>
      <button type="button" className="quiet transcript-fold" onClick={() => setOpen(!open)} data-testid="transcript-fold">
        {open ? 'Fold' : fold.rest > 0 ? `Show ${fold.rest} more lines` : 'Show all of it'}
      </button>
    </>
  );
}

function TranscriptView({ folder, id, onBack }: { folder: string; id: string; onBack: () => void }) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTranscript(null);
    setError(null);
    void api.historyTranscript(folder, id).then(
      (found) => !cancelled && setTranscript(found),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [folder, id]);
  return (
    <div className="transcript" data-testid="transcript">
      <div className="history-bar">
        <button type="button" className="quiet" onClick={onBack} data-testid="transcript-back">
          ← Back to the list
        </button>
        <strong>{transcript?.name ? showControl(transcript.name) : 'A conversation'}</strong>
        <span className="sheet-note">Read only. Nothing here is kept by Aubergine, and nothing is changed.</span>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      {!transcript && !error && <p className="sheet-note">Reading…</p>}
      {transcript && <Notes notes={transcript.notes} />}
      {transcript?.entries.map((entry, index) => (
        <div key={index} className={`transcript-entry is-${entry.who}`} data-testid="transcript-entry" data-who={entry.who}>
          <div className="transcript-who">
            {WHO[entry.who]}
            {entry.label && <span className="transcript-label">{showControl(entry.label)}</span>}
            {entry.at && <span className="transcript-when">{new Date(entry.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </div>
          {entry.text !== '' && <Piece text={entry.text} />}
          {entry.cut && <div className="sheet-note">This was very long; the rest is not shown.</div>}
        </div>
      ))}
    </div>
  );
}

export function HistoryPanel() {
  const view = useApp((s) => s.historyView);
  const [typed, setTyped] = useState('');
  const [list, setList] = useState<HistoryList | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<(HistorySearch & { query: string }) | null>(null);
  const [reading, setReading] = useState<{ folder: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** A conversation that a canvas terminal is on already, waiting for the owner to say what to do. */
  const [taken, setTaken] = useState<ConversationSummary | null>(null);
  const open = view !== null;

  const search = (text: string, where: string): void => {
    if (text.trim().length < 2) return;
    setBusy(true);
    setError(null);
    void api
      .searchConversations(text.trim(), where === '' ? undefined : where)
      .then(
        (result) => setFound({ ...result, query: text.trim() }),
        (e: unknown) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  const load = (where: string): void => {
    setList(null);
    setError(null);
    if (where === '') return;
    setBusy(true);
    void api
      .history(where)
      .then(
        (result) => {
          setList(result);
          setTyped(result.folder);
        },
        (e: unknown) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    // Opened afresh, and emptied on closing: nothing of a conversation outlives the panel.
    setList(null);
    setFound(null);
    setReading(null);
    setTaken(null);
    setError(null);
    setQuery(view?.query ?? '');
    setTyped(view?.folder ?? '');
    if (!view) return;
    if (view.folder) load(view.folder);
    if (view.query) search(view.query, '');
  }, [view]);

  if (!open) return null;
  const close = (): void => useApp.getState().openHistory(null);
  const openOnCanvas = (where: string, id: string, how: { copy?: boolean; evenIfOpen?: boolean }): void => {
    setBusy(true);
    setError(null);
    void api
      .openConversation({ folder: where, id, copy: how.copy ?? false, evenIfOpen: how.evenIfOpen ?? false, ...(useApp.getState().canvasId ? { canvasId: useApp.getState().canvasId as string } : {}) })
      .then(
        (made) => {
          close();
          useApp.getState().showSession(made.session.id);
        },
        (e: unknown) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog sheet history-panel" role="dialog" aria-label="Past conversations" data-testid="history-panel">
        <header className="sheet-head">
          <h2>Past conversations</h2>
          <button type="button" className="quiet" onClick={close} data-testid="history-close">
            Close
          </button>
        </header>
        {reading ? (
          <TranscriptView folder={reading.folder} id={reading.id} onBack={() => setReading(null)} />
        ) : (
          <>
            <p className="sheet-note">
              The agent’s earlier conversations in a folder, read from its own records when you ask. Aubergine keeps none of it, and never changes a conversation. What you see is the
              owner’s and the agent’s own words: it may hold anything that was said or pasted.
            </p>
            <form
              className="history-bar"
              onSubmit={(e) => {
                e.preventDefault();
                load(typed.trim());
              }}
            >
              <input value={typed} placeholder="A folder, for example /Users/you/project" aria-label="Folder" onChange={(e) => setTyped(e.target.value)} data-testid="history-folder" />
              <button type="submit" className="quiet" disabled={busy || typed.trim() === ''} data-testid="history-list">
                List
              </button>
            </form>
            <form
              className="history-bar"
              onSubmit={(e) => {
                e.preventDefault();
                search(query, '');
              }}
            >
              <input value={query} placeholder="Search by name or by anything said, in the folders of the terminals on your canvases" aria-label="Search" onChange={(e) => setQuery(e.target.value)} data-testid="history-query" />
              <button type="submit" className="quiet" disabled={busy || query.trim().length < 2} data-testid="history-search">
                Search
              </button>
            </form>
            {error && (
              <p className="dialog-error" role="alert" data-testid="history-error">
                {error}
              </p>
            )}
            {found && (
              <section data-testid="history-found">
                <h3>
                  “{found.query}”: {found.hits.length} match{found.hits.length === 1 ? '' : 'es'} in {found.searched} conversation{found.searched === 1 ? '' : 's'}
                </h3>
                {found.cutShort && (
                  <p className="history-cut" role="status" data-testid="history-cut">
                    {found.why}
                  </p>
                )}
                <Notes notes={found.notes} />
                <ul className="history-list">
                  {found.hits.map((hit, index) => (
                    <li key={`${hit.id} ${index}`} data-testid="history-hit">
                      <button type="button" className="history-row" onClick={() => setReading({ folder: hit.folder, id: hit.id })}>
                        <span className="history-name">{showControl(hit.name ?? 'A conversation')}</span>
                        <span className="history-line">
                          {hit.where === 'name' ? 'its name' : `${WHO[hit.who ?? 'note']}: ${showControl(hit.line)}`}
                        </span>
                        <span className="history-where">{hit.folder}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {list && (
              <section data-testid="history-conversations">
                <h3>
                  {list.agent} in {list.folder}: {list.conversations.length} conversation{list.conversations.length === 1 ? '' : 's'}
                </h3>
                <Notes notes={list.notes} />
                <ul className="history-list">
                  {list.conversations.map((conversation) => (
                    <li key={conversation.id} data-testid="history-item" data-id={conversation.id}>
                      <div className="history-about">
                        <span className="history-name">{showControl(conversation.name ?? conversation.firstPrompt ?? 'Nothing said in it could be read')}</span>
                        <span className="history-when">
                          {conversation.lastActiveAt ? `${ago(conversation.lastActiveAt, new Date())} ago` : 'time not known'} ·{' '}
                          {conversation.turns === null ? 'very long' : `${conversation.turns} turn${conversation.turns === 1 ? '' : 's'}`}
                        </span>
                        {conversation.name && conversation.lastPrompt && <span className="history-line">last: {showControl(conversation.lastPrompt)}</span>}
                        {conversation.onCanvas && (
                          <span className="history-on" data-testid="history-on-canvas">
                            on the canvas now: {conversation.onCanvas.name}
                          </span>
                        )}
                      </div>
                      <div className="history-actions">
                        <button type="button" className="quiet" onClick={() => setReading({ folder: list.folder, id: conversation.id })} data-testid="history-read">
                          Read
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={busy}
                          onClick={() => (conversation.onCanvas ? setTaken(conversation) : openOnCanvas(list.folder, conversation.id, {}))}
                          title="A new terminal in this folder, with the agent resumed in this conversation"
                          data-testid="history-open"
                        >
                          Open on the canvas
                        </button>
                        <button type="button" className="quiet" disabled={busy} onClick={() => openOnCanvas(list.folder, conversation.id, { copy: true })} title="A branch of the conversation: the original stays as it is" data-testid="history-copy">
                          Open a copy
                        </button>
                      </div>
                      {taken?.id === conversation.id && conversation.onCanvas && (
                        <div className="history-taken" role="alert" data-testid="history-taken">
                          <p>
                            “{conversation.onCanvas.name}” is on this conversation already. Two agents in one conversation lose each other’s messages.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const sessionId = conversation.onCanvas?.sessionId;
                              close();
                              if (sessionId) useApp.getState().showSession(sessionId);
                            }}
                            data-testid="history-go"
                          >
                            Go to that terminal
                          </button>
                          <button type="button" className="quiet" onClick={() => openOnCanvas(list.folder, conversation.id, { copy: true })}>
                            Open a copy
                          </button>
                          <button type="button" className="quiet danger-text" onClick={() => openOnCanvas(list.folder, conversation.id, { evenIfOpen: true })} data-testid="history-anyway">
                            Open it here as well
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
