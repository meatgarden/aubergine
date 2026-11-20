import { useRef, useState } from 'react';
import { inputProblem, type NamedKey } from '@aubergine/shared';
import { api } from './api';
import { useApp } from './store';

/** The keys offered beside the box: the ones an agent or a program most often waits for. All are from `NAMED_KEYS`. */
const KEYS: readonly { key: NamedKey; label: string; title: string }[] = [
  { key: 'Enter', label: 'Enter', title: 'Press Enter' },
  { key: 'Escape', label: 'Esc', title: 'Press Escape: stops an agent that is working' },
  { key: 'Ctrl+C', label: 'Ctrl+C', title: 'Press Ctrl+C: stops the command that is running' },
  { key: 'Up', label: '↑', title: 'Press the up arrow' },
  { key: 'Down', label: '↓', title: 'Press the down arrow' },
  { key: 'Tab', label: 'Tab', title: 'Press Tab' },
];

/** How many sent lines are kept for the up arrow, in this tab of the browser only. */
const KEPT = 20;

/**
 * Typing into a terminal from its details, without going to it. What is written is typed exactly as it is, by the same
 * route a program uses (`POST /v1/sessions/<id>/input`): a line break makes it a paste, and Enter is pressed after it
 * unless that is unticked. The text is checked here by the same rule the server uses, so a refusal is said before
 * anything is sent; nothing of a refused call is typed.
 */
export function TerminalInput({ sessionId, reading = false, onTyping }: { sessionId: string; /** Another text box of the details is in use: this one gives way. */ reading?: boolean; onTyping?: () => void }) {
  const ended = useApp((s) => s.app?.sessions.find((x) => x.id === sessionId)?.state === 'exited');
  const [text, setText] = useState('');
  const [enter, setEnter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sent = useRef<string[]>([]);
  const back = useRef(-1);
  const box = useRef<HTMLTextAreaElement>(null);

  const send = (body: Parameters<typeof api.sendInput>[1], said: string, after?: () => void): void => {
    setBusy(true);
    setError(null);
    setDone(null);
    void api
      .sendInput(sessionId, body)
      .then(
        () => {
          after?.();
          setDone(said);
        },
        (e: unknown) => setError((e as Error).message),
      )
      .finally(() => {
        setBusy(false);
        box.current?.focus();
      });
  };

  const sendText = (): void => {
    if (text === '' || busy) return;
    const paste = text.includes('\n') || text.includes('\t');
    const problem = inputProblem(text, paste);
    if (problem) {
      setError(problem.replace(/`(enter|paste|keys)`/g, '$1'));
      return;
    }
    const typed = text;
    send({ text: typed, paste, enter }, enter ? 'Typed, and pressed Enter.' : 'Typed. Enter was not pressed.', () => {
      sent.current = [typed, ...sent.current.filter((line) => line !== typed)].slice(0, KEPT);
      back.current = -1;
      setText('');
    });
  };

  if (ended) {
    return (
      <div className="drawer-section terminal-input" data-testid="terminal-input">
        <p className="ui-meta" data-testid="terminal-input-ended">
          This shell has ended: nothing can be typed into it.
        </p>
      </div>
    );
  }

  // The details have one text box in view: while a link is added or changed, this one waits behind a button.
  if (reading) {
    return (
      <div className="drawer-section terminal-input" data-testid="terminal-input">
        <button type="button" className="quiet" onClick={() => onTyping?.()} data-testid="terminal-input-resume">
          Type into this terminal
        </button>
      </div>
    );
  }

  return (
    <div className="drawer-section terminal-input" data-testid="terminal-input">
      <form
        className="thread-reply"
        onSubmit={(event) => {
          event.preventDefault();
          sendText();
        }}
      >
        <textarea
          ref={box}
          value={text}
          rows={3}
          placeholder="Type here; it goes to whatever has the keyboard in this terminal"
          aria-label="Text to type into this terminal"
          onChange={(event) => {
            setText(event.target.value);
            back.current = -1;
          }}
          onKeyDown={(event) => {
            // Enter sends, as in the terminal; Shift+Enter is a new line.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendText();
              return;
            }
            // The up and down arrows walk what was sent before, while the box is empty or shows one of those.
            const recalling = text === '' || (back.current >= 0 && sent.current[back.current] === text);
            if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && recalling && sent.current.length > 0) {
              const next = event.key === 'ArrowUp' ? Math.min(back.current + 1, sent.current.length - 1) : back.current - 1;
              event.preventDefault();
              back.current = next;
              setText(next >= 0 ? (sent.current[next] ?? '') : '');
            }
          }}
          data-testid="terminal-input-text"
        />
        <button type="submit" disabled={busy || text === ''} aria-busy={busy} data-testid="terminal-input-send">
          Send
        </button>
      </form>
      <label className="ui-check terminal-input-enter">
        <input type="checkbox" checked={enter} onChange={(event) => setEnter(event.target.checked)} data-testid="terminal-input-enter" />
        Press Enter after it
      </label>
      <div className="terminal-input-keys" role="group" aria-label="Press a key in this terminal">
        {KEYS.map(({ key, label, title }) => (
          <button key={key} type="button" className="quiet" title={title} disabled={busy} onClick={() => send({ keys: [key] }, `Pressed ${label}.`)} data-testid={`terminal-input-key-${key}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="ui-meta" data-testid="terminal-input-help">
        Typed as you, exactly as written. A shell runs it; an agent takes it as your prompt. Enter sends, Shift+Enter starts a new line.
      </p>
      {done && !error && (
        <p className="ui-meta" role="status" data-testid="terminal-input-done">
          {done}
        </p>
      )}
      {error && (
        <p className="dialog-error" data-testid="terminal-input-error">
          {error}
        </p>
      )}
    </div>
  );
}
