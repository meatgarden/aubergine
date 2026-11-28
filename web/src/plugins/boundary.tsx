import { Component, type ReactNode } from 'react';

/**
 * What a plugin draws, kept from taking the page down with it: a component of a plugin's that throws while it is drawn
 * is reported (`onFailure`) and drawn as one sentence, and the rest of the page carries on. Everything a plugin adds
 * through the API is drawn inside one, inside an element that says whose it is (`data-plugin`).
 */
export class PluginBoundary extends Component<{ plugin: string; name: string; onFailure: (error: unknown) => void; inline?: boolean; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onFailure(error);
  }

  override render(): ReactNode {
    const { plugin, name, inline, children } = this.props;
    if (this.state.failed) {
      const said = `${name} failed here. Settings → Plugins says what it said.`;
      return inline ? (
        <span className="ui-meta" data-plugin={plugin} data-testid="plugin-failed">
          {said}
        </span>
      ) : (
        <p className="ui-meta" data-plugin={plugin} data-testid="plugin-failed">
          {said}
        </p>
      );
    }
    return inline ? <span data-plugin={plugin}>{children}</span> : <div data-plugin={plugin}>{children}</div>;
  }
}
