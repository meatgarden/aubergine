import { useEffect, useMemo, useRef, useState } from 'react';
import { sortedCanvases, type Canvas, type SearchHit } from '@aubergine/shared';
import { api } from './api';
import { COMMANDS, commandById, type Command } from './commands';
import { paletteStep, parseQuery, searchCanvases, searchCommands } from './palette';
import { canvasLabel, searchSessions, shortFolder, type SessionMatch } from './search';
import { keysOf } from './shortcuts';
import { useApp } from './store';
import { tourSignal } from './tour/tour-store';

const HISTORY_DELAY_MS = 250;
const HISTORY_MIN_LENGTH = 2;
/** How much of a matching line is used to scroll the terminal to it. */
const REVEAL_LENGTH = 80;

type Row =
  | { kind: 'session'; match: SessionMatch }
  | { kind: 'canvas'; canvas: Canvas; number: number }
  | { kind: 'command'; command: Command; available: boolean }
  | { kind: 'output'; hit: SearchHit };

const SECTION: Record<Row['kind'], string> = { session: 'Sessions', canvas: 'Canvases', command: 'Commands', output: 'Terminal output' };

/**
 * The palette: type to find sessions (names, folders, commands, notes, and
 * what terminals have printed), canvases and commands, across every canvas.
 * Enter goes there or runs it. `>` in front lists commands only; with nothing
 * typed, a digit goes to that canvas.
 */
export function Picker() {
  const open = useApp((s) => s.picker);
  const setPicker = useApp((s) => s.setPicker);
  const sessions = useApp((s) => s.app?.sessions);
  const app = useApp((s) => s.app);
  const canvasId = useApp((s) => s.canvasId);
  const settings = useApp((s) => s.settings);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ query: string; hits: SearchHit[]; truncated: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const { commandsOnly: onlyCommands, conversations, text: wanted } = parseQuery(query);
  // Searching past conversations is a mode of its own: nothing else is listed with it.
  const commandsOnly = onlyCommands || conversations;
  const canvases = useMemo(() => (app ? sortedCanvases(app) : []), [app]);
  const matches = useMemo(() => (commandsOnly ? [] : searchSessions(sessions ?? [], wanted)), [sessions, wanted, commandsOnly]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    setHistory(null);
    input.current?.focus();
  }, [open]);

  // Terminal history is read on demand, a moment after typing stops.
  const searchOutput = open && !commandsOnly && wanted.length >= HISTORY_MIN_LENGTH;
  useEffect(() => {
    if (!searchOutput) {
      setHistory(null);
      setSearching(false);
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .searchHistory(wanted)
        .then((result) => {
          if (!stale) setHistory({ query: wanted, ...result });
        })
        .catch(() => {
          if (!stale) setHistory({ query: wanted, hits: [], truncated: false });
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, HISTORY_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [searchOutput, wanted]);

  const byId = useMemo(() => new Map((sessions ?? []).map((s) => [s.id, s])), [sessions]);
  const hits = searchOutput && history?.query === wanted ? history.hits.filter((hit) => byId.has(hit.sessionId)) : [];

  // Keep the row chosen with the arrow keys in view.
  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }, [index, query]);

  if (!open) return null;

  const state = useApp.getState();
  /** With `@`: one row, which opens the search of past conversations with what was typed. They are read by the server only when asked. */
  const searchPast: Command = {
    id: 'history.open',
    title: wanted.length >= 2 ? `Search past conversations for “${wanted}”` : 'Search past conversations: type at least two letters',
    description: 'Looks in the folders of the terminals on your canvases, by name and by anything said.',
    group: 'Terminals',
    available: () => wanted.length >= 2,
    run: (now) => now.openHistory({ folder: null, query: wanted }),
  };
  const rows: Row[] = conversations
    ? [{ kind: 'command', command: searchPast, available: wanted.length >= 2 }]
    : [
    ...matches.map((match): Row => ({ kind: 'session', match })),
    ...(commandsOnly ? [] : searchCanvases(canvases, wanted)).map((canvas): Row => ({ kind: 'canvas', canvas, number: canvases.indexOf(canvas) + 1 })),
    ...searchCommands(COMMANDS, wanted).map((command): Row => ({ kind: 'command', command, available: command.available(state) })),
    ...hits.map((hit): Row => ({ kind: 'output', hit })),
  ];
  const selected = Math.min(index, Math.max(0, rows.length - 1));

  const go = (row: Row): void => {
    if (row.kind === 'command') {
      if (!row.available) return;
      setPicker(false);
      // Run it against the page as it is once the palette has closed.
      const now = useApp.getState();
      if (row.command.available(now)) row.command.run(now);
      return;
    }
    setPicker(false);
    if (row.kind === 'canvas') {
      useApp.getState().setCanvas(row.canvas.id);
      return;
    }
    const sessionId = row.kind === 'session' ? row.match.session.id : row.hit.sessionId;
    useApp.getState().showSession(sessionId);
    if (row.kind === 'output') {
      // Scroll the terminal back to the line that matched.
      const text = row.hit.text.trim().slice(0, REVEAL_LENGTH);
      if (text) void api.revealInSession(sessionId, text).catch(() => {});
      tourSignal('picker.output');
    }
  };

  const renderRow = (row: Row, i: number): React.ReactNode => {
    const common = {
      role: 'option' as const,
      'aria-selected': i === selected,
      onMouseEnter: () => setIndex(i),
      onClick: () => go(row),
    };
    const chosen = i === selected ? ' selected' : '';
    if (row.kind === 'session') {
      const { session } = row.match;
      const detail = row.match.excerpt ?? [session.command, shortFolder(session.cwd)].filter(Boolean).join(' · ');
      const canvas = canvasLabel(app, session.id, canvasId);
      return (
        <div key={`s:${session.id}`} {...common} className={`picker-row${chosen}`} data-testid="picker-row">
          <span className="picker-name">{session.name}</span>
          {canvas && (
            <span className="picker-tag picker-canvas" data-testid="picker-canvas">
              {canvas}
            </span>
          )}
          <span className="picker-detail">{detail}</span>
          {session.state !== 'open' && <span className="picker-tag">{session.state}</span>}
        </div>
      );
    }
    if (row.kind === 'canvas') {
      return (
        <div key={`c:${row.canvas.id}`} {...common} className={`picker-row${chosen}`} data-testid="picker-canvas-row">
          <span className="picker-name">{row.canvas.name}</span>
          <span className="picker-detail">
            {row.canvas.id === canvasId ? 'this canvas' : `${row.canvas.layout.nodes.length} terminal${row.canvas.layout.nodes.length === 1 ? '' : 's'}`}
          </span>
          {row.number <= 9 && wanted === '' && <kbd title="With nothing typed, this digit goes there">{row.number}</kbd>}
        </div>
      );
    }
    if (row.kind === 'command') {
      return (
        <div
          key={`k:${row.command.id}`}
          {...common}
          aria-disabled={!row.available}
          className={`picker-row command${chosen}${row.available ? '' : ' unavailable'}`}
          data-testid="picker-command-row"
          data-command={row.command.id}
          title={row.command.description}
        >
          <span className="picker-name">{row.command.title}</span>
          <span className="picker-detail">{row.available ? '' : 'not available right now'}</span>
          <span className="picker-keys">
            {keysOf(row.command.id, settings).map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
          </span>
        </div>
      );
    }
    const session = byId.get(row.hit.sessionId);
    const canvas = canvasLabel(app, row.hit.sessionId, canvasId);
    return (
      <div key={`o:${row.hit.sessionId}:${i}`} {...common} className={`picker-row output${chosen}`} data-testid="picker-output-row">
        <span className="picker-name">{session?.name}</span>
        {canvas && <span className="picker-tag picker-canvas">{canvas}</span>}
        <span className="picker-detail picker-line">{row.hit.text.trim()}</span>
        {session?.state === 'parked' && <span className="picker-tag">parked</span>}
      </div>
    );
  };

  const outputNote = searching ? ' · searching…' : hits.length === 0 ? ' · no matches' : history?.truncated ? ' · showing the most recent' : '';

  return (
    <div
      className="dialog-backdrop picker-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPicker(false);
      }}
    >
      <div className="picker" role="dialog" aria-label="Go to a terminal or canvas, or run a command">
        <input
          ref={input}
          className="picker-input"
          placeholder="Search terminals, canvases and commands…   > commands only   @ past conversations   1–9 [ ] canvases"
          aria-label="Search terminals, canvases and commands"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const step = paletteStep(query, e.key);
            if (step) {
              // Never typed into the field, also when there is no such canvas.
              e.preventDefault();
              const command = commandById(step);
              go({ kind: 'command', command, available: command.available(useApp.getState()) });
            } else if (e.key === 'Escape') {
              setPicker(false);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex(Math.min(selected + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex(Math.max(selected - 1, 0));
            } else if (e.key === 'Enter') {
              const row = rows[selected];
              if (row) go(row);
            }
          }}
        />
        <div className="picker-results" role="listbox" ref={list}>
          {rows.length === 0 && !searching && <div className="picker-empty">Nothing matches.</div>}
          {rows.map((row, i) => {
            const first = i === 0 || rows[i - 1]?.kind !== row.kind;
            // The output section has its own heading below, shown even while it is empty.
            return [
              first && row.kind !== 'output' && (
                <div key={`h:${row.kind}`} className="picker-section" data-testid={`picker-section-${row.kind}`}>
                  {SECTION[row.kind]}
                </div>
              ),
              row.kind !== 'output' && renderRow(row, i),
            ];
          })}
          {searchOutput && (
            <div className="picker-section" data-testid="picker-output-section">
              Terminal output{outputNote}
            </div>
          )}
          {rows.map((row, i) => row.kind === 'output' && renderRow(row, i))}
        </div>
      </div>
    </div>
  );
}
