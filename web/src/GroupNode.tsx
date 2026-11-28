import { memo, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { GROUP_NAME_MAX, GroupName } from '@aubergine/shared';
import { colorClass } from './color';
import { runCommand } from './commands';
import { gatherGroup, renameGroup, toggleGroupFold, ungroup } from './group-actions';
import { elsewhereOf, groupColor } from './groups';
import { useApp } from './store';
import { MenuButton } from './ui';

export type GroupFlowNode = Node<{ name: string; folded: boolean; here: number }, 'terminal-group'>;

/**
 * A group on the canvas: an outline round its terminals that are on this canvas, with its name in its color. The
 * outline is worked out from where those terminals are; it is not stored and has no size of its own. Its label is
 * pressed to fold the terminals away or bring them back, and dragged to move them together. Only the label takes the
 * pointer. It also says how many of the group's terminals are somewhere else, and leads to them.
 */
export const GroupNode = memo(function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  const { name, folded, here } = data;
  const canvasId = useApp((s) => s.canvasId);
  const sessions = useApp((s) => s.app?.sessions);
  const canvases = useApp((s) => s.app?.canvases);
  const [draft, setDraft] = useState<string | null>(null);
  const elsewhere = useMemo(
    () => elsewhereOf((sessions ?? []).filter((session) => session.group === name), canvases ?? [], canvasId),
    [sessions, canvases, canvasId, name],
  );
  const away = elsewhere.canvases.reduce((sum, canvas) => sum + canvas.sessionIds.length, 0) + elsewhere.parked.length;

  const commit = (): void => {
    const next = GroupName.safeParse(draft ?? '');
    setDraft(null);
    if (next.success) renameGroup(name, next.data);
  };
  const words = `${here} ${here === 1 ? 'terminal' : 'terminals'}`;

  return (
    <div className={`group-outline ${colorClass(groupColor(name))}${folded ? ' is-folded' : ''}`} data-testid="group-outline" data-group={name}>
      <header className="group-title">
        <button
          type="button"
          className="quiet ui-icon-button nodrag"
          aria-expanded={!folded}
          aria-label={`${folded ? 'Show' : 'Hide'} the terminals of the group ${name}`}
          title={folded ? 'Show its terminals again' : 'Fold its terminals away: they keep running'}
          onClick={() => toggleGroupFold(name)}
          data-testid="group-fold"
        >
          <span aria-hidden="true">{folded ? '▸' : '▾'}</span>
        </button>
        {draft === null ? (
          <span className="group-name" title="Drag to move its terminals together" onDoubleClick={() => setDraft(name)} data-testid="group-label">
            {name}
          </span>
        ) : (
          <input
            className="node-name-input nodrag"
            aria-label="The group’s name"
            value={draft}
            maxLength={GROUP_NAME_MAX}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setDraft(null);
            }}
            data-testid="group-rename"
          />
        )}
        <span className="group-count" data-testid="group-count">
          {folded ? words : here}
          {away > 0 ? ` · ${away} elsewhere` : ''}
        </span>
        <MenuButton label={`What can be done with the group ${name}`} more className="nodrag" testid="group-menu" menuTestid="group-menu-lines">
          <button type="button" role="menuitem" onClick={() => toggleGroupFold(name)}>
            {folded ? 'Show its terminals' : 'Fold its terminals away'}
          </button>
          <button type="button" role="menuitem" onClick={() => setDraft(name)} data-testid="group-menu-rename">
            Rename the group
          </button>
          {elsewhere.canvases.map((canvas) => (
            <button key={canvas.id} type="button" role="menuitem" onClick={() => useApp.getState().showSession(canvas.sessionIds[0] as string)} data-testid="group-menu-go">
              Go to {canvas.name}
              <small>
                {canvas.sessionIds.length} of this group {canvas.sessionIds.length === 1 ? 'is' : 'are'} there.
              </small>
            </button>
          ))}
          {away > 0 && canvasId && (
            <button type="button" role="menuitem" onClick={() => gatherGroup(name, canvasId)} data-testid="group-menu-gather">
              Bring them all here
              <small>Moves the {away} that {away === 1 ? 'is' : 'are'} elsewhere onto this canvas. Nothing is ended.</small>
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => runCommand('list.byGroup')} data-testid="group-menu-list">
            List by group
            <small>Every group whole in the list, whatever canvas its terminals are on.</small>
          </button>
          <button type="button" role="menuitem" onClick={() => ungroup(name)} data-testid="group-menu-ungroup">
            Ungroup
            <small>The terminals stay where they are.</small>
          </button>
        </MenuButton>
      </header>
    </div>
  );
});
