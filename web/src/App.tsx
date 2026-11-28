import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppBar } from './AppBar';
import { Canvas } from './Canvas';
import { CloseCanvasDialog } from './CloseCanvasDialog';
import { CloseDialog } from './CloseDialog';
import { startShortcuts } from './shortcuts';
import { startSync, terminalPage, useApp } from './store';
import { TerminalPage } from './TerminalPage';
import { TabBar } from './TabBar';
import { useCanvasView } from './canvas-view';
import { SidePanel } from './panel/SidePanel';
import { Away } from './Away';
import { TagDialog } from './TagDialog';
import { Tour } from './tour/Tour';
import { Toast } from './Toast';
import { applyTheme, useAppearanceShown, useProjectLook, useThemeShown, useUserThemes } from './theme';
import { useTrying } from './appearance/trying';
import { Pages, Screens } from './Screens';
import { SignIn } from './devices/SignIn';

export function App() {
  const phase = useApp((s) => s.phase);
  const runtime = useApp((s) => s.runtime);
  const canvasId = useApp((s) => s.canvasId);
  const page = useApp((s) => s.page);
  const canvasView = useCanvasView();
  // Everything drawn is of the server shown: drawn afresh for another, so that nothing of the one before is left.
  const server = useApp((s) => s.server);

  useEffect(() => startSync(), []);
  // A tab that shows one terminal by itself has no canvas for the keys of the canvas to act on.
  useEffect(() => (terminalPage === null ? startShortcuts() : undefined), []);

  // The theme that was chosen, or the system's for "match the system", and its color theme: put on the page as soon as any of them changes.
  const setting = useApp((s) => s.settings.theme);
  const settled = useApp((s) => s.phase === 'ready');
  const shown = useThemeShown();
  // While a proposed theme is tried on the page, it is what is drawn, and nothing of it is remembered.
  const appearance = useAppearanceShown();
  const userThemes = useUserThemes();
  const trying = useTrying((s) => s.theme !== null);
  // The project looked at may have a theme of its own of each kind: drawn while it is looked at.
  const project = useProjectLook();
  useEffect(() => {
    // Until the settings have been read the page keeps what it was drawn with before first paint.
    if (settled) applyTheme(setting, shown, appearance, userThemes, !trying, project);
  }, [setting, shown, appearance, userThemes, settled, trying, project]);

  if (phase === 'loading') return <Message title="Loading…" />;

  if (phase === 'unreachable') {
    return (
      <Message title="Cannot reach the Aubergine server">
        <p>It may have stopped. Start it again and this page will reconnect by itself.</p>
      </Message>
    );
  }

  // One field for a code made where Aubergine runs, and the command that signs in a browser at that computer.
  if (phase === 'unauthorized') return <SignIn />;

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

  if (terminalPage !== null) {
    return (
      <>
        <TerminalPage key={server ?? 'own'} sessionId={terminalPage} />
        <Toast />
      </>
    );
  }

  return (
    <div className="app" key={server ?? 'own'}>
      <AppBar />
      <div className="app-under">
        {/* The canvas page stays as it is while a page is shown in its place: not drawn, not reachable, its terminals running. */}
        <div className="app-canvas" inert={page !== null} data-testid="app-canvas">
          <div className="workspace">
            {/* Shown as a column, the canvases come first, at the left of the window, as a browser's vertical tabs do. */}
            {canvasView === 'column' && <TabBar />}
            {/* The panel and its drawer are one group of columns, from under the top bar down. */}
            <SidePanel />
            {/* The bar of tabs belongs to the canvas: it begins where the canvas does. */}
            <div className="canvas-column" data-testid="canvas-column">
              {canvasView !== 'column' && <TabBar />}
              {/* Keyed by canvas: each canvas gets a fresh view, with its own pan, zoom and live terminals. */}
              <ReactFlowProvider key={canvasId ?? 'none'}>
                <Canvas />
                <CloseDialog />
              </ReactFlowProvider>
            </div>
          </div>
        </div>
        <Pages />
      </div>
      <Screens />
      <CloseCanvasDialog />
      <TagDialog />
      <Tour />
      <Toast />
      <Away />
    </div>
  );
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="message" data-testid="message">
      <div className="message-card" data-testid="message-card">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
