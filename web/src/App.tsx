import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './Canvas';
import { CloseDialog } from './CloseDialog';
import { startSync, useApp } from './store';

export function App() {
  const phase = useApp((s) => s.phase);
  const runtime = useApp((s) => s.runtime);

  useEffect(() => startSync(), []);

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
    <ReactFlowProvider>
      <Canvas />
      <CloseDialog />
    </ReactFlowProvider>
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
