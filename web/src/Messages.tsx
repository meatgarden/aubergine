import { useEffect, useState } from 'react';
import { ago, partyKey, showControl, type Message, type Party, type Session, type ThreadDetail, type ThreadSummary } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/**
 * Messages between terminals, as the owner sees them: every thread, every
 * message with who sent it and whether it was read, and what the owner can
 * do about a thread. Fetched when shown and again when a count changes; the
 * state itself holds only counts. What a message says is other people's
 * text: plain text, control characters shown, nothing made into a link.
 */

const who = (party: Party): string => (party.kind === 'owner' ? (party.via === 'command' ? 'You, from a command line' : 'You') : party.kind === 'session' ? party.name : `${party.name} (a program)`);

/** What to say about a session's messages in a few words, or null when there is nothing to say. */
export function messageMark(session: Session): { text: string; title: string } | null {
  const m = session.messages;
  if (m.paused > 0) return { text: 'thread paused', title: 'A thread of this terminal is paused until you have looked at it. Click to look.' };
  if (m.forOwner > 0) return { text: `${m.forOwner} for you`, title: `${m.forOwner} message${m.forOwner === 1 ? '' : 's'} from this terminal for you. Click to read.` };
  if (m.unread > 0) return { text: `${m.unread} from ${m.from ?? 'someone'}`, title: `${m.unread} message${m.unread === 1 ? '' : 's'} this terminal has not read yet, the newest from ${m.from ?? 'someone'}. Click to see.` };
  return null;
}

/** The mark on a node or a row. Clicking it opens that terminal's drawer, where its threads are. */
export function MessageMark({ session }: { session: Session }) {
  const mark = messageMark(session);
  if (!mark) return null;
  return (
    <button
      type="button"
      className={`message-mark${session.messages.paused > 0 || session.messages.forOwner > 0 ? ' wants-you' : ''}`}
      title={mark.title}
      onClick={(event) => {
        event.stopPropagation();
        // The messages are what was asked for: the details open on them.
        useApp.getState().openDrawer({ section: 'terminals', kind: 'notes', id: session.id, part: 'messages' });
      }}
      data-testid="message-mark"
    >
      ✉ {mark.text}
    </button>
  );
}

/** A number that changes whenever any count about messages does: what the lists watch to fetch again. */
function useChanged(): string {
  return useApp((s) => (s.app?.sessions ?? []).reduce((latest, session) => (session.messages.at !== null && session.messages.at > latest ? session.messages.at : latest), ''));
}

function useThreads(sessionId: string | undefined, also: number): { threads: ThreadSummary[] | null; error: string | null } {
  const changed = useChanged();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api.messageThreads(sessionId).then(
      (found) => !cancelled && (setThreads(found.threads), setError(null)),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId, changed, also]);
  return { threads, error };
}

const STATE_WORD: Record<ThreadSummary['state'], string> = { open: '', paused: 'paused', stopped: 'stopped' };

function threadTitle(thread: ThreadSummary): string {
  return thread.parties.map(who).join(' and ');
}

/** One thread: its messages, and what the owner can do about it. Opening it tells the server the owner has looked. */
export function ThreadView({ threadId, onChanged }: { threadId: string; onChanged?: () => void }) {
  const changed = useChanged();
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void api.messageThread(threadId).then(
      (found) => !cancelled && setDetail(found),
      (e: unknown) => !cancelled && setError((e as Error).message),
    );
    return () => {
      cancelled = true;
    };
  }, [threadId, changed]);
  if (error) return <p className="dialog-error">{error}</p>;
  if (!detail) return <p className="sheet-note">Reading…</p>;
  const { thread, messages } = detail;
  const act = (action: 'look' | 'read' | 'pause' | 'continue' | 'stop'): void => {
    setBusy(true);
    void api
      .threadAct(threadId, action)
      .then(setDetail, (e: unknown) => setError((e as Error).message))
      .finally(() => {
        setBusy(false);
        onChanged?.();
      });
  };
  const sessions = thread.parties.filter((party): party is Extract<Party, { kind: 'session' }> => party.kind === 'session');
  const withOwner = thread.parties.some((party) => party.kind === 'owner');
  const send = (sessionId: string): void => {
    if (text.trim() === '') return;
    setBusy(true);
    void api
      .sendMessage(sessionId, text.trim())
      .then(
        () => setText(''),
        (e: unknown) => setError((e as Error).message),
      )
      .finally(() => {
        setBusy(false);
        onChanged?.();
      });
  };
  const blocked = (sessionId: string, sender: string): boolean => thread.blocks.some((block) => block.sessionId === sessionId && block.sender === sender);
  return (
    <div className="thread" data-testid="thread" data-state={thread.state}>
      {thread.state === 'paused' && (
        <p className="thread-paused" role="status" data-testid="thread-paused">
          Paused: these two have exchanged {thread.turns} message{thread.turns === 1 ? '' : 's'} without you looking. Nothing more passes between them until you say so. Continue?
        </p>
      )}
      {thread.state === 'stopped' && <p className="thread-paused">Stopped: nothing more passes between these two.</p>}
      <ol className="thread-messages">
        {messages.map((message: Message) => (
          <li key={message.id} className={`thread-message from-${message.from.kind}`} data-testid="thread-message">
            <div className="thread-who">
              <strong>{showControl(who(message.from))}</strong> to {showControl(who(message.to))} · {ago(message.sentAt, new Date())} ago ·{' '}
              <span data-testid="thread-read">{message.readAt ? 'read' : 'not read yet'}</span>
            </div>
            <pre className="transcript-text">{showControl(message.text)}</pre>
          </li>
        ))}
      </ol>
      <div className="thread-actions">
        {thread.state !== 'open' && (
          <button type="button" disabled={busy} onClick={() => act('continue')} data-testid="thread-continue">
            Continue
          </button>
        )}
        {thread.state === 'open' && !withOwner && (
          <button type="button" className="quiet" disabled={busy} onClick={() => act('pause')} data-testid="thread-pause">
            Pause
          </button>
        )}
        {thread.state !== 'stopped' && !withOwner && (
          <button type="button" className="quiet danger-text" disabled={busy} onClick={() => act('stop')} data-testid="thread-stop">
            Stop this thread
          </button>
        )}
        {thread.forOwner > 0 && (
          <button type="button" className="quiet" disabled={busy} onClick={() => act('read')} data-testid="thread-mark-read">
            Mark read
          </button>
        )}
        {sessions.flatMap((receiver) =>
          thread.parties
            .filter((sender) => sender.kind !== 'owner' && partyKey(sender) !== partyKey(receiver))
            .map((sender) => {
              const is = blocked(receiver.sessionId, partyKey(sender));
              return (
                <button
                  key={`${receiver.sessionId}${partyKey(sender)}`}
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void api
                      .blockSender(receiver.sessionId, partyKey(sender), !is)
                      .then(() => api.messageThread(threadId))
                      .then(setDetail, (e: unknown) => setError((e as Error).message))
                      .finally(() => setBusy(false));
                  }}
                  data-testid="thread-block"
                >
                  {is ? `Let ${who(sender)} message ${receiver.name} again` : `Block ${who(sender)} from messaging ${receiver.name}`}
                </button>
              );
            }),
        )}
      </div>
      {withOwner && sessions[0] && (
        <form
          className="thread-reply"
          onSubmit={(event) => {
            event.preventDefault();
            send((sessions[0] as { sessionId: string }).sessionId);
          }}
        >
          <textarea value={text} maxLength={4000} rows={2} placeholder={`Message ${sessions[0].name}`} aria-label="Your message" onChange={(event) => setText(event.target.value)} data-testid="thread-text" />
          <button type="submit" disabled={busy || text.trim() === ''} data-testid="thread-send">
            Send
          </button>
        </form>
      )}
    </div>
  );
}

/** The threads, each opening in place. Opening one tells the server the owner has looked at it. */
export function ThreadList({ sessionId }: { sessionId?: string }) {
  const [again, setAgain] = useState(0);
  const { threads, error } = useThreads(sessionId, again);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="dialog-error">{error}</p>;
  if (!threads) return <p className="sheet-note">Reading…</p>;
  if (threads.length === 0) return <p className="list-empty">No messages yet.</p>;
  return (
    <ul className="thread-list" data-testid="thread-list">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            type="button"
            className={`thread-row${thread.state === 'paused' || thread.forOwner > 0 ? ' wants-you' : ''}`}
            aria-expanded={open === thread.id}
            onClick={() => {
              const opening = open !== thread.id;
              setOpen(opening ? thread.id : null);
              // Seen by the owner: a count of turns starts again, and what was for the owner is read.
              if (opening) void api.threadAct(thread.id, 'look').then(() => setAgain((n) => n + 1), () => undefined);
            }}
            data-testid="thread-row"
            data-state={thread.state}
          >
            <span className="thread-title">{showControl(threadTitle(thread))}</span>
            <span className="thread-about">
              {thread.total} message{thread.total === 1 ? '' : 's'}
              {thread.forOwner > 0 ? ` · ${thread.forOwner} for you` : ''}
              {thread.unread > 0 ? ` · ${thread.unread} not read yet` : ''}
              {STATE_WORD[thread.state] ? ` · ${STATE_WORD[thread.state]}` : ''}
            </span>
          </button>
          {open === thread.id && <ThreadView threadId={thread.id} onChanged={() => setAgain((n) => n + 1)} />}
        </li>
      ))}
    </ul>
  );
}

/** In a terminal's drawer: a message from the owner to it, and its threads. */
export function SessionMessages({ sessionId, reading = false, onTyping }: { sessionId: string; /** Another text box of the details is in use: this one gives way. */ reading?: boolean; onTyping?: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peopleOnly = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.peopleOnly ?? false);
  const takesMessages = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.takesMessages ?? false);
  return (
    <div className="drawer-section session-messages" data-testid="session-messages">
      <ThreadList sessionId={sessionId} />
      {/* The details have one text box in view: while another part is typed into, this one waits behind a button. */}
      {reading ? (
        <p>
          <button type="button" className="quiet" onClick={() => onTyping?.()} data-testid="message-resume">
            Write a message
          </button>
        </p>
      ) : (
      <form
        className="thread-reply"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() === '') return;
          setBusy(true);
          setError(null);
          void api
            .sendMessage(sessionId, text.trim())
            .then(
              () => setText(''),
              (e: unknown) => setError((e as Error).message),
            )
            .finally(() => setBusy(false));
        }}
      >
        <textarea
          value={text}
          maxLength={4000}
          rows={2}
          placeholder="A message for the agent in this terminal"
          aria-label="Message this terminal"
          onChange={(event) => setText(event.target.value)}
          data-testid="message-text"
        />
        <button type="submit" disabled={busy || text.trim() === ''} data-testid="message-send">
          Send
        </button>
      </form>
      )}
      <p className="ui-meta" data-testid="message-help">The agent reads this when it next checks; nothing is typed into the terminal.</p>
      {peopleOnly && (
        <label className="sheet-note takes-messages" data-testid="takes-messages">
          <input
            type="checkbox"
            checked={takesMessages}
            onChange={(event) => void api.setTakesMessages(sessionId, event.target.checked).catch((e: unknown) => setError((e as Error).message))}
          />{' '}
          {takesMessages
            ? 'People only, and it still takes messages from terminals on a canvas where you let terminals message each other. It stays closed to reading and typing, and to every program with a token.'
            : 'People only: this terminal takes messages from you alone. Tick to let terminals message it where you switched that on for its canvas; it stays closed to reading and typing.'}
        </label>
      )}
      {error && <p className="dialog-error">{error}</p>}
    </div>
  );
}
