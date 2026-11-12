import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import {
  TerminalServerMessage,
  paths,
  type TerminalClientMessage,
} from '@aubergine/shared';
import { socketUrl } from './api';
import { useApp } from './store';

interface Props {
  sessionId: string;
  /** False when the canvas is not at 100% zoom: the terminal shows output but takes no input. */
  interactive: boolean;
}

type Link = 'connecting' | 'open' | 'reconnecting' | 'ended';

/**
 * One terminal and its own WebSocket: opened when this mounts, closed when
 * it unmounts. The shell lives on in the daemon's runtime either way.
 */
export function TerminalView({ sessionId, interactive }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const interactiveRef = useRef(interactive);
  const [link, setLink] = useState<Link>('connecting');
  const focus = useApp((s) => (s.focus?.sessionId === sessionId ? s.focus.tick : 0));

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "DejaVu Sans Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      // History lives in the session runtime, not in the browser.
      scrollback: 0,
      macOptionClickForcesSelection: true,
      disableStdin: !interactiveRef.current,
      theme: { background: '#101114', foreground: '#d7dae0', cursor: '#d7dae0' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    terminal.current = term;

    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let attempts = 0;
    let disposed = false;
    let ended = false;

    const send = (message: TerminalClientMessage): void => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    const fitNow = (): void => {
      // Measuring only works while the element is laid out.
      if (element.clientWidth < 20 || element.clientHeight < 20) return;
      try {
        fit.fit();
      } catch {
        // The renderer is not ready yet; the next resize tries again.
      }
    };
    fitNow();

    const connect = (): void => {
      const query = `?cols=${term.cols}&rows=${term.rows}`;
      const ws = new WebSocket(socketUrl(paths.terminal(sessionId) + query));
      ws.binaryType = 'arraybuffer';
      socket = ws;

      ws.onopen = () => {
        attempts = 0;
        // Start from a clean screen: the daemon redraws the whole terminal on attach.
        term.reset();
        setLink('open');
        send({ t: 'resize', cols: term.cols, rows: term.rows });
      };
      ws.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          term.write(new Uint8Array(message.data as ArrayBuffer));
          return;
        }
        const control = TerminalServerMessage.safeParse(JSON.parse(message.data));
        if (control.success && control.data.reason === 'session_ended') ended = true;
      };
      ws.onclose = () => {
        if (disposed) return;
        if (ended) return setLink('ended');
        setLink('reconnecting');
        attempts += 1;
        retry = window.setTimeout(connect, Math.min(250 * attempts, 2000));
      };
    };
    connect();

    const onData = term.onData((data) => send({ t: 'input', data }));
    const onResize = term.onResize(({ cols, rows }) => send({ t: 'resize', cols, rows }));

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitNow);
    });
    observer.observe(element);

    return () => {
      disposed = true;
      window.clearTimeout(retry);
      cancelAnimationFrame(frame);
      observer.disconnect();
      onData.dispose();
      onResize.dispose();
      socket?.close();
      term.dispose();
      terminal.current = null;
    };
  }, [sessionId]);

  // Input is accepted only at 100% zoom.
  useEffect(() => {
    interactiveRef.current = interactive;
    const term = terminal.current;
    if (!term) return;
    term.options.disableStdin = !interactive;
    if (!interactive) term.blur();
  }, [interactive]);

  // Take keyboard focus when asked to, as soon as the terminal is usable.
  useEffect(() => {
    if (focus > 0 && interactive) terminal.current?.focus();
  }, [focus, interactive]);

  return (
    <div className="term-view" data-testid="terminal" data-link={link}>
      <div className="term-host" ref={host} />
      {link === 'reconnecting' && <div className="term-note">Reconnecting…</div>}
      {link === 'ended' && <div className="term-note">This shell has ended.</div>}
    </div>
  );
}
