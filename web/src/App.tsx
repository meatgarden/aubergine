import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppBar } from './AppBar';
import { Canvas } from './Canvas';
import { CloseCanvasDialog } from './CloseCanvasDialog';
import { CloseDialog } from './CloseDialog';
import { startShortcuts } from './shortcuts';
import { startSync, useApp } from './store';
import { TabBar } from './TabBar';
import { SidePanel } from './panel/SidePanel';
import { Away } from './Away';
import { TagDialog } from './TagDialog';
import { Tour } from './tour/Tour';
import { applyTheme, useThemeShown } from './theme';
import { Pages, Screens } from './Screens';

export function App() {
  const phase = useApp((s) => s.phase);
  const runtime = useApp((s) => s.runtime);
  const canvasId = useApp((s) => s.canvasId);
  const page = useApp((s) => s.page);

  useEffect(() => startSync(), []);
  useEffect(() => startShortcuts(), []);

  // The theme that was chosen, or the system's for "match the system": put on the page as soon as either changes.
  const setting = useApp((s) => s.settings.theme);
  const settled = useApp((s) => s.phase === 'ready');
  const shown = useThemeShown();
  useEffect(() => {
    // Until the settings have been read the page keeps what it was drawn with before first paint.
    if (settled) applyTheme(setting, shown);
  }, [setting, shown, settled]);

  if (phase === 'loading') return <Message title="Loading…" />;

  if (phase === 'unreachable') {
    return (
      <Message title="Cannot reach the Aubergine server">
        <p>It may have stopped. Start it again and this page will reconnect by itself.</p>
      </Message>
    );
  }

  if (phase === 'unauthorized') {
    return (
      <Message title="This browser is not signed in yet">
        <p>
          When the Aubergine server starts, it prints a sign-in link that ends in{' '}
          <code>/auth?token=…</code>. Open that link once in this browser. After that, this
          address works on its own.
        </p>
      </Message>
    );
  }

  if (runtime && runtime.status !== 'ok') {
    return (
      <Message
        title={
          runtime.status === 'missing'
            ? 'tmux is not installed'
            : `tmux ${runtime.version ?? ''} is too old`
        }
      >
        <p>
          Aubergine keeps every terminal running inside tmux, and needs version{' '}
          {runtime.minVersion} or newer
          {runtime.status === 'too_old' ? `; this machine has ${runtime.version}.` : '.'}
        </p>
        <p>
          Install or update it with your package manager, for example <code>brew install tmux</code>{' '}
          or <code>apt install tmux</code>. This page continues by itself once tmux is found.
        </p>
      </Message>
    );
  }

  return (
    <div className="app">
      <AppBar />
      <div className="app-under">
        {/* The canvas page stays as it is while a page is shown in its place: not drawn, not reachable, its terminals running. */}
        <div className="app-canvas" inert={page !== null} data-testid="app-canvas">
          <TabBar />
          <div className="workspace">
            <SidePanel />
            {/* Keyed by canvas: each canvas gets a fresh view, with its own pan, zoom and live terminals. */}
            <ReactFlowProvider key={canvasId ?? 'none'}>
              <Canvas />
              <CloseDialog />
            </ReactFlowProvider>
          </div>
        </div>
        <Pages />
      </div>
      <Screens />
      <CloseCanvasDialog />
      <TagDialog />
      <Tour />
      <Away />
    </div>
  );
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="message" data-testid="message">
      <div className="message-card">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
