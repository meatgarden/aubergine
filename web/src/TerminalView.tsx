import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import {
  TerminalServerMessage,
  colorTheme,
  paths,
  resolveColors,
  type Appearance,
  type ColorThemeId,
  type TerminalClientMessage,
} from '@aubergine/shared';
import { isRefusal, isSuperseded, openSocket, socketIsCurrent } from './api';
import { decodeOsc52 } from './clipboard';
import { isMac, isPasteChord } from './keys';
import { activeShortcuts, pickBinding } from './shortcuts';
import { Outbox } from './outbox';
import { correctMouse } from './scaled-mouse';
import { useApp } from './store';
import { terminalTheme } from './terminal-themes';
import { useColorThemeShown } from './theme';

interface Props {
  /** The canvas's zoom now, so that the pointer lands on the right cell at any size. */
  zoom?: () => number;
  sessionId: string;
  /** False while the terminal only shows output and takes no input. */
  interactive: boolean;
  /**
   * False where no canvas is around it (a terminal by itself in its own tab): no chord is kept back for the canvas,
   * and every key but the paste chord goes to the program.
   */
  chords?: boolean;
}

/** The color theme the page is drawn in now, as the page's root says it: before the settings are read, too. */
function themeOnPage(): ColorThemeId {
  const root = document.documentElement;
  return colorTheme(root.dataset.colorTheme ?? '')?.id ?? (root.dataset.theme === 'light' ? 'light' : 'dark');
}

/** A terminal's colors in that theme, with its ground set by hand (`terminal-bg`) where the settings file sets it. */
function colorsOf(id: ColorThemeId, appearance: Appearance) {
  const ground = resolveColors(appearance.colors, id).colors['terminal-bg'];
  const theme = terminalTheme(id);
  return ground ? { ...theme, background: ground } : theme;
}

type Link = 'connecting' | 'open' | 'reconnecting' | 'ended';

/**
 * One terminal and its own WebSocket: opened when this mounts, closed when
 * it unmounts. The shell lives on in the daemon's runtime either way.
 */
export function TerminalView({ sessionId, interactive, zoom, chords = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const interactiveRef = useRef(interactive);
  const chordsRef = useRef(chords);
  chordsRef.current = chords;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [link, setLink] = useState<Link>('connecting');
  const focus = useApp((s) => (s.focus?.sessionId === sessionId ? s.focus.tick : 0));

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const settings = useApp.getState().settings;
    const term = new Terminal({
      fontFamily: settings.font.family,
      fontSize: settings.font.size,
      cursorStyle: settings.appearance.cursor,
      cursorBlink: settings.appearance.cursorBlink,
      // History lives in the session runtime, not in the browser.
      scrollback: 0,
      macOptionClickForcesSelection: true,
      disableStdin: !interactiveRef.current,
      theme: colorsOf(themeOnPage(), settings.appearance),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    terminal.current = term;

    // On a zoomed canvas the pointer is told to the terminal as it would be at 100%.
    const uncorrect = correctMouse(element, () => zoomRef.current?.() ?? 1);

    const mac = isMac();
    // Returning false hands the key back to the browser and the canvas.
    // Chords that belong to the canvas, and the paste chord, are never passed to the program.
    term.attachCustomKeyEventHandler(
      (event) => !(chordsRef.current && pickBinding(event, activeShortcuts().bindings, 'terminal')) && !isPasteChord(event, mac),
    );
    // The wheel scrolls this terminal's history only while it has focus;
    // otherwise it belongs to the canvas.
    term.attachCustomWheelEventHandler(() => element.contains(document.activeElement));
    // Text selected in the terminal is handed over by the runtime as an
    // OSC 52 sequence; put it on the system clipboard.
    const onClipboard = term.parser.registerOscHandler(52, (payload) => {
      const text = decodeOsc52(payload);
      if (text !== null) void navigator.clipboard?.writeText(text).catch(() => {});
      return true;
    });

    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let attempts = 0;
    let disposed = false;
    let ended = false;

    const outbox = new Outbox((message) => socket?.send(JSON.stringify(message)));
    const send = (message: TerminalClientMessage): void =>
      outbox.send(message, socket?.readyState === WebSocket.OPEN);

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
      // At a linked server a socket is opened with a fresh ticket each time: asked for here, on every (re)connection.
      void openSocket(paths.terminal(sessionId) + query).then(
        (ws) => {
          if (disposed) return ws.close();
          ws.binaryType = 'arraybuffer';
          socket = ws;

          ws.onopen = () => {
            attempts = 0;
            // Start from a clean screen: the daemon redraws the whole terminal on attach.
            term.reset();
            setLink('open');
            send({ t: 'resize', cols: term.cols, rows: term.rows });
            outbox.opened();
          };
          ws.onmessage = (message) => {
            // Opened for a server that is no longer shown: nothing it sends is drawn.
            if (!socketIsCurrent(ws)) return ws.close();
            if (typeof message.data !== 'string') {
              term.write(new Uint8Array(message.data as ArrayBuffer));
              return;
            }
            let data: unknown;
            try {
              data = JSON.parse(message.data);
            } catch {
              return;
            }
            const control = TerminalServerMessage.safeParse(data);
            if (control.success && control.data.reason === 'session_ended') ended = true;
          };
          ws.onclose = () => {
            if (disposed || !socketIsCurrent(ws)) return;
            if (ended) return setLink('ended');
            again();
          };
        },
        (error: unknown) => {
          if (disposed || isSuperseded(error)) return;
          // The linked server no longer takes this page's credential: the store has been told, and asking again would not help.
          if (isRefusal(error)) return setLink('ended');
          again();
        },
      );
    };
    const again = (): void => {
      setLink('reconnecting');
      attempts += 1;
      retry = window.setTimeout(connect, Math.min(250 * attempts, 2000));
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
      uncorrect();
      window.clearTimeout(retry);
      cancelAnimationFrame(frame);
      observer.disconnect();
      onData.dispose();
      onClipboard.dispose();
      onResize.dispose();
      socket?.close();
      term.dispose();
      terminal.current = null;
    };
  }, [sessionId]);

  // Follow changes to the settings file.
  const font = useApp((s) => s.settings.font);
  const appearance = useApp((s) => s.settings.appearance);
  // The color theme that is drawn now: a terminal's colors are its own, and follow it at once.
  const theme = useColorThemeShown();
  useEffect(() => {
    const term = terminal.current;
    if (!term) return;
    term.options.fontFamily = font.family;
    term.options.fontSize = font.size;
    term.options.cursorStyle = appearance.cursor;
    term.options.cursorBlink = appearance.cursorBlink;
    term.options.theme = colorsOf(theme, appearance);
  }, [font, theme, appearance]);

  // Input is accepted while the terminal is the live one.
  useEffect(() => {
    interactiveRef.current = interactive;
    const term = terminal.current;
    if (!term) return;
    term.options.disableStdin = !interactive;
    if (!interactive) term.blur();
  }, [interactive]);

  // Take keyboard focus when asked to, as soon as the terminal is usable.
  // A request that arrives after something else began to be typed into (a note, a field) is out of date: going to a
  // terminal asks for its keyboard when the glide ends, and the person may already be typing in its note by then.
  // The keyboard stays where it is and the request is dropped.
  useEffect(() => {
    if (!(focus > 0 && interactive)) return;
    const active = document.activeElement;
    // A terminal's own text box (xterm's hidden textarea) is not a field being typed in: moving from one terminal to
    // another goes on as it did.
    const typingElsewhere =
      active instanceof HTMLElement && !host.current?.contains(active) && !active.closest('.xterm') && active.matches('input, textarea, select, [contenteditable="true"]');
    if (typingElsewhere) {
      if (useApp.getState().focus?.sessionId === sessionId) useApp.getState().focusSession(null);
      return;
    }
    terminal.current?.focus();
  }, [focus, interactive, sessionId]);

  return (
    <div className="term-view" data-testid="terminal" data-link={link}>
      <div className="term-host" ref={host} />
      {link === 'reconnecting' && <div className="term-note">Reconnecting…</div>}
      {link === 'ended' && <div className="term-note">This shell has ended.</div>}
    </div>
  );
}
