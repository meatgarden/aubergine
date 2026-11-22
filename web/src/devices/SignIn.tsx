import { readPairingCode } from '@aubergine/shared';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { signedIn } from '../store';
import { Button } from '../ui';
import { takeWaitingCode } from './pair-address';

/** What to say after a code was refused: the server's sentence, or how long to wait. */
export function refusedWords(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return error.retryAfterSeconds !== null ? `Too many tries at a code. Wait ${error.retryAfterSeconds} s, then try again.` : 'Too many tries at a code. Wait a minute, then try again.';
  }
  if (error instanceof ApiError && error.code !== 'network') return error.message;
  return 'The server did not answer. Try again in a moment.';
}

/**
 * What a browser that is not signed in sees: one sentence, one field for a code and one button. A code that came in
 * the address was taken out of it before the page asked anything (`takeCodeFromAddress`); it is put in the field and
 * tried once. The code is held here and nowhere else: never logged, never stored, never in an address.
 */
export function SignIn() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const attempt = async (typed: string): Promise<void> => {
    setSaid(null);
    setBusy(true);
    try {
      // A code that cannot be one is still sent: the server's answer is the one answer for every failure.
      await api.pair(readPairingCode(typed) ?? typed.trim());
      setCode('');
      signedIn();
    } catch (error) {
      setSaid(refusedWords(error));
      field.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const waiting = takeWaitingCode();
    if (waiting === null) {
      field.current?.focus();
      return;
    }
    setCode(waiting);
    void attempt(waiting);
  }, []);

  return (
    <main className="message" data-testid="message">
      <form
        className="message-card sign-in"
        data-testid="message-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void attempt(code);
        }}
      >
        <h1>This browser is not signed in yet</h1>
        <p>
          It is not signed in to this Aubergine. Type a code made where Aubergine runs, with <code>aubergine device add</code> or under Settings → Devices in a browser
          that is signed in; at that computer itself, <code data-testid="sign-in-command">aubergine open --print</code> prints the link that signs this browser in.
        </p>
        <label className="sign-in-field">
          <span>Code</span>
          <input
            className="ui-field"
            ref={field}
            value={code}
            maxLength={16}
            placeholder="XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            inputMode="text"
            spellCheck={false}
            aria-describedby={said ? 'sign-in-said' : undefined}
            aria-invalid={said ? true : undefined}
            onChange={(event) => setCode(event.target.value)}
            data-testid="sign-in-code"
          />
        </label>
        {said && (
          <p className="dialog-error" id="sign-in-said" role="alert" data-testid="sign-in-said">
            {said}
          </p>
        )}
        <div className="dialog-actions">
          <Button kind="primary" type="submit" busy={busy} disabled={code.trim() === ''} data-testid="sign-in-go">
            Sign in
          </Button>
        </div>
      </form>
    </main>
  );
}
