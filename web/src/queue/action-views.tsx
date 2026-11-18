import type { ComponentType } from 'react';
import type { RuleAction } from '@aubergine/shared';
import { useApp } from '../store';

/**
 * The fields a kind of action needs when a rule is written. Registered, so
 * that the rules form knows no kind by name: it shows the fields of whatever
 * kind was chosen, and a kind with none shows none.
 */
export interface ActionView {
  kind: string;
  /** The action as it starts out when this kind is chosen. */
  blank: () => RuleAction;
  Fields: ComponentType<{ action: RuleAction; onChange: (action: RuleAction) => void }>;
}
const views = new Map<string, ActionView>();
export function registerActionView(view: ActionView): void {
  views.set(view.kind, view);
}
export const actionView = (kind: string): ActionView | undefined => views.get(kind);

registerActionView({ kind: 'notify', blank: () => ({ kind: 'notify' }), Fields: () => null });

registerActionView({
  kind: 'run-element',
  blank: () => ({ kind: 'run-element', elementId: '', on: { kind: 'session', sessionId: '' } }),
  Fields: ({ action, onChange }) => {
    const shelf = useApp((s) => s.app?.shelf);
    const sessions = useApp((s) => s.app?.sessions);
    const canvases = useApp((s) => s.app?.canvases);
    const on = (action.on ?? { kind: 'session', sessionId: '' }) as { kind: 'session'; sessionId: string } | { kind: 'new'; canvasId: string };
    return (
      <>
        <select aria-label="Element" value={String(action.elementId ?? '')} onChange={(e) => onChange({ ...action, elementId: e.target.value })} data-testid="rule-element">
          <option value="">Which saved step…</option>
          {[...(shelf ?? [])].filter((item) => item.state !== 'retired').map((item) => (
            <option key={item.id} value={item.id}>
              {item.element.name}
            </option>
          ))}
        </select>
        <select aria-label="On" value={on.kind === 'session' ? `s:${on.sessionId}` : `c:${on.canvasId}`} onChange={(e) => onChange({ ...action, on: e.target.value.startsWith('c:') ? { kind: 'new', canvasId: e.target.value.slice(2) } : { kind: 'session', sessionId: e.target.value.slice(2) } })} data-testid="rule-on">
          <option value="s:">On which terminal…</option>
          {(sessions ?? []).filter((s) => s.state === 'open').map((s) => (
            <option key={s.id} value={`s:${s.id}`}>
              on “{s.name}”
            </option>
          ))}
          {(canvases ?? []).map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              on a new terminal on “{c.name}”
            </option>
          ))}
        </select>
      </>
    );
  },
});
